/**
 * AI Chat 服务
 * 负责调用 /api/chat 端点与 AI 进行对话
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
 * 发送聊天请求到 AI
 */
export async function sendChatMessage(
  userMessage: string,
  stage: ProjectStage,
  history: Message[] = [],
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const {
    model = 'gpt-5-nano',
    temperature = 1, // Replicate Claude API
    maxRetries = 3,
    contextData,
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
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: ChatCompletionResponse = await response.json();
      const assistantContent = data.choices[0]?.message?.content || '';

      // 创建助手消息
      const assistantMessage: Message = {
        id: data.id || crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
        stage,
      };

      // 如果需要校验 JSON 输出
      if (needsValidation && schema) {
        console.log('[chatService] 尝试提取 JSON，内容长度:', assistantContent.length);
        const extractedJSON = extractJSON(assistantContent);
        console.log('[chatService] 提取结果:', extractedJSON ? '成功' : '失败', extractedJSON);
        
        if (extractedJSON) {
          const validationResult = validateJSON(extractedJSON, schema);
          console.log('[chatService] 校验结果:', validationResult.valid, validationResult.errors);
          
          if (validationResult.valid) {
            console.log('[chatService] 返回带数据的响应');
            return {
              success: true,
              message: assistantMessage,
              data: validationResult.data,
              validationResult,
            };
          } else {
            // 校验失败，但仍然返回数据（宽松模式）
            console.log('[chatService] 校验失败但仍返回数据（宽松模式）');
            lastError = `JSON 校验失败: ${validationResult.errors?.map(e => e.message).join(', ')}`;
            
            // 返回带有数据的响应，即使校验不完全通过
            return {
              success: true,
              message: assistantMessage,
              data: extractedJSON, // 返回提取的 JSON，即使校验不完全通过
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
      console.log('[chatService] 返回不带数据的响应');
      return {
        success: true,
        message: assistantMessage,
      };

    } catch (error) {
      lastError = error instanceof Error ? error.message : '未知错误';
      
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `请求失败 (尝试 ${attempt}/${maxRetries}): ${lastError}`,
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
 * 流式聊天（未来支持）
 */
export async function* streamChatMessage(
  userMessage: string,
  stage: ProjectStage,
  history: Message[] = [],
  options: ChatOptions = {}
): AsyncGenerator<string, void, unknown> {
  // 暂时使用非流式实现
  const response = await sendChatMessage(userMessage, stage, history, options);
  if (response.success && response.message) {
    yield response.message.content;
  } else {
    throw new Error(response.error || '聊天请求失败');
  }
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
