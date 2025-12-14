/**
 * AI Chat 服务
 * 负责调用 /api/chat 端点与 AI 进行对话
 * 使用流式响应避免 Vercel 超时问题
 */

import type { Message, ChatOptions, AIValidationResult, ProjectStage } from '@/types';
import { getSystemPrompt, getOutputSchema, stageRequiresValidation } from '@/prompts';
import { validateJSON, extractJSON } from './validationService';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface ChatResponse {
  success: boolean;
  message?: Message;
  data?: unknown;
  validationResult?: AIValidationResult;
  error?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 解析 SSE 流式数据，返回完整内容
 */
async function parseSSEStream(
  response: Response,
  onChunk?: (chunk: string, accumulated: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices?.[0]?.delta?.content || '';
            if (chunk) {
              fullContent += chunk;
              onChunk?.(chunk, fullContent);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * 发送聊天请求到 AI（流式模式）
 */
export async function sendChatMessage(
  userMessage: string,
  stage: ProjectStage,
  history: Message[] = [],
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const {
    model = 'gpt-5-nano',
    temperature = 1,
    maxRetries = 3,
    contextData,
    onProgress, // 新增：进度回调
  } = options;

  // 构建消息数组
  const systemPrompt = getSystemPrompt(stage);
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];

  // 如果有上下文数据（如剧本、分镜等），添加到系统消息中
  if (contextData) {
    messages.push({
      role: 'system',
      content: `当前项目数据：\n${JSON.stringify(contextData, null, 2)}`
    });
  }

  // 添加历史消息
  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content
    });
  }

  // 添加用户消息
  messages.push({ role: 'user', content: userMessage });

  // 是否需要 JSON 校验
  const needsValidation = stageRequiresValidation(stage);
  const schema = getOutputSchema(stage);

  // 重试逻辑
  let lastError: string | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[chatService] 发送流式请求 (尝试 ${attempt}/${maxRetries})`);
      
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream: true, // 使用流式模式
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // 检查是否为流式响应
      const contentType = response.headers.get('content-type') || '';
      let assistantContent: string;

      if (contentType.includes('text/event-stream')) {
        // 流式响应：解析 SSE
        console.log('[chatService] 接收流式响应...');
        assistantContent = await parseSSEStream(response, (chunk, accumulated) => {
          onProgress?.(accumulated);
        });
        console.log('[chatService] 流式响应完成，内容长度:', assistantContent.length);
      } else {
        // 非流式响应：直接解析 JSON
        const data: ChatCompletionResponse = await response.json();
        assistantContent = data.choices[0]?.message?.content || '';
      }

      // 创建助手消息
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
        stage,
      };

      // 如果需要校验 JSON 输出
      if (needsValidation && schema) {
        console.log('[chatService] 尝试提取 JSON，内容长度:', assistantContent.length);
        const extractedJSON = extractJSON(assistantContent);
        console.log('[chatService] 提取结果:', extractedJSON ? '成功' : '失败');
        
        if (extractedJSON) {
          const validationResult = validateJSON(extractedJSON, schema);
          console.log('[chatService] 校验结果:', validationResult.valid);
          
          if (validationResult.valid) {
            return {
              success: true,
              message: assistantMessage,
              data: validationResult.data,
              validationResult,
            };
          } else {
            // 校验失败，但仍然返回数据（宽松模式）
            console.log('[chatService] 校验失败但仍返回数据（宽松模式）');
            return {
              success: true,
              message: assistantMessage,
              data: extractedJSON,
              validationResult,
            };
          }
        } else {
          // 没有找到 JSON
          console.log('[chatService] 未找到 JSON');
          lastError = '未能从回复中提取有效的 JSON 数据';
          
          if (attempt < maxRetries) {
            messages.push({ role: 'assistant', content: assistantContent });
            messages.push({
              role: 'user',
              content: '你的回复中没有包含 JSON 数据。请确保以 JSON 格式输出结果。'
            });
            continue;
          }
        }
      }

      // 不需要校验或校验通过
      return {
        success: true,
        message: assistantMessage,
      };

    } catch (error) {
      lastError = error instanceof Error ? error.message : '未知错误';
      console.error(`[chatService] 请求失败 (尝试 ${attempt}/${maxRetries}):`, lastError);
      
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `请求失败: ${lastError}`,
        };
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  return {
    success: false,
    error: lastError || '未知错误',
  };
}

/**
 * 流式聊天生成器
 * 实时返回内容片段
 */
export async function* streamChatMessage(
  userMessage: string,
  stage: ProjectStage,
  history: Message[] = [],
  options: ChatOptions = {}
): AsyncGenerator<string, ChatResponse, unknown> {
  const {
    model = 'gpt-5-nano',
    temperature = 1,
    contextData,
  } = options;

  // 构建消息数组
  const systemPrompt = getSystemPrompt(stage);
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];

  if (contextData) {
    messages.push({
      role: 'system',
      content: `当前项目数据：\n${JSON.stringify(contextData, null, 2)}`
    });
  }

  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: userMessage });

  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, stream: true }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices?.[0]?.delta?.content || '';
            if (chunk) {
              fullContent += chunk;
              yield chunk;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 返回最终结果
  const needsValidation = stageRequiresValidation(stage);
  const schema = getOutputSchema(stage);
  
  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: fullContent,
    timestamp: Date.now(),
    stage,
  };

  if (needsValidation && schema) {
    const extractedJSON = extractJSON(fullContent);
    if (extractedJSON) {
      const validationResult = validateJSON(extractedJSON, schema);
      return {
        success: true,
        message: assistantMessage,
        data: extractedJSON,
        validationResult,
      };
    }
  }

  return {
    success: true,
    message: assistantMessage,
  };
}

/**
 * 健康检查
 */
export async function checkAPIHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}
