import type { VercelRequest, VercelResponse } from '@vercel/node';
import Replicate from 'replicate';

// Replicate API Token (通过 Vercel 环境变量配置)
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

if (!REPLICATE_API_TOKEN) {
  console.error('REPLICATE_API_TOKEN 环境变量未设置');
}

// 初始化 Replicate 客户端
const replicate = new Replicate({
  auth: REPLICATE_API_TOKEN,
});

/**
 * 从文本中提取纯 JSON（处理 AI 在 JSON 前后添加的文字）
 */
function extractPureJSON(text: string): string {
  // 如果已经是纯 JSON，直接返回
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return trimmed;
  }

  // 尝试从 markdown 代码块提取
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    console.log('[后端] 从代码块提取 JSON');
    return codeBlockMatch[1].trim();
  }

  // 查找第一个 { 或 [ 和最后一个 } 或 ]
  const firstBrace = text.search(/[\{\[]/);
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = text.slice(firstBrace, lastBrace + 1);
    console.log('[后端] 提取 JSON, 从位置', firstBrace, '到', lastBrace);
    return extracted;
  }

  return text;
}

/**
 * 将 OpenAI 格式的 messages 转换为 Replicate Claude 格式
 */
function convertMessagesToPrompt(messages: Array<{ role: string; content: string }>): {
  systemPrompt: string;
  prompt: string;
} {
  let systemPrompt = '';
  const conversationParts: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // 合并所有系统消息
      systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
    } else if (msg.role === 'user') {
      conversationParts.push(`Human: ${msg.content}`);
    } else if (msg.role === 'assistant') {
      conversationParts.push(`Assistant: ${msg.content}`);
    }
  }

  // 构建对话提示
  const prompt = conversationParts.join('\n\n');

  return { systemPrompt, prompt };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    messages,
    max_tokens = 8192,
    stream = false, // 新增：支持流式参数
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '缺少必要参数: messages 数组' });
  }

  console.log('Chat 请求:', { messageCount: messages.length, stream });

  try {
    // 转换消息格式
    const { systemPrompt, prompt } = convertMessagesToPrompt(messages);

    console.log('Replicate 请求:', {
      promptLength: prompt.length,
      systemPromptLength: systemPrompt.length,
      max_tokens,
      stream
    });

    const input = {
      prompt,
      system_prompt: systemPrompt,
      max_tokens: Math.min(max_tokens, 64000),
    };

    // 流式响应模式
    if (stream) {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // 禁用代理缓冲

      let fullContent = '';

      try {
        // 使用 Replicate 流式 API
        for await (const event of replicate.stream('openai/gpt-5-nano', { input })) {
          const chunk = String(event);
          fullContent += chunk;
          
          // 发送 SSE 格式数据
          const sseData = JSON.stringify({
            id: `replicate-${Date.now()}`,
            object: 'chat.completion.chunk',
            choices: [{
              index: 0,
              delta: { content: chunk },
              finish_reason: null,
            }],
          });
          res.write(`data: ${sseData}\n\n`);
        }

        console.log('[chat] 流式响应完成，内容长度:', fullContent.length);

        // 发送结束标记
        const endData = JSON.stringify({
          id: `replicate-${Date.now()}`,
          object: 'chat.completion.chunk',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
        });
        res.write(`data: ${endData}\n\n`);
        res.write('data: [DONE]\n\n');
      } catch (streamError) {
        console.error('[chat] 流式传输错误:', streamError);
        // 尝试发送错误信息给客户端
        const errorData = JSON.stringify({
          id: `replicate-${Date.now()}`,
          object: 'chat.completion.chunk',
          choices: [{
            index: 0,
            delta: { content: '\n[ERROR: 流式响应中断]' },
            finish_reason: 'error',
          }],
        });
        res.write(`data: ${errorData}\n\n`);
        res.write('data: [DONE]\n\n');
      } finally {
        res.end();
      }
      return;
    }

    // 非流式响应模式（原逻辑）
    const output = await replicate.run('openai/gpt-5-nano', { input });

    // Replicate 返回的是字符串数组，需要合并
    let content = Array.isArray(output) ? output.join('') : String(output);

    console.log('Replicate 响应成功，原始内容长度:', content.length);
    console.log('Replicate 原始内容前300字符:', content.substring(0, 300));

    // 尝试提取纯 JSON（如果 AI 在 JSON 前后添加了文字）
    content = extractPureJSON(content);

    // 返回 OpenAI 兼容格式的响应
    const responseData = {
      id: `replicate-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5-nano',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    res.json(responseData);

  } catch (error) {
    console.error('Replicate API 请求失败:', error);
    res.status(500).json({
      error: 'Replicate API 请求失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
