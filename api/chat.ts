import type { VercelRequest, VercelResponse } from '@vercel/node';
import { debugLog, enforceAllowedOrigins, requireServerEnv } from './_lib/security';

// Pollinations API 配置
const POLLINATIONS_API_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

// 默认模型
const DEFAULT_MODEL = 'openai';

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
    debugLog('[后端] 从代码块提取 JSON');
    return codeBlockMatch[1].trim();
  }

  // 查找第一个 { 或 [ 和最后一个 } 或 ]
  const firstBrace = text.search(/[\{\[]/);
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = text.slice(firstBrace, lastBrace + 1);
    debugLog('[后端] 提取 JSON, 从位置', firstBrace, '到', lastBrace);
    return extracted;
  }

  return text;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!enforceAllowedOrigins(req, res)) {
    return;
  }

  if (!requireServerEnv(res, 'POLLINATIONS_API_KEY', POLLINATIONS_API_KEY)) {
    return;
  }

  const {
    messages,
    model = DEFAULT_MODEL,
    max_tokens = 8192,
    temperature = 1,
    stream = false,
    response_format,
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '缺少必要参数: messages 数组' });
  }

  if (messages.length > 50) {
    return res.status(400).json({ error: 'messages 数量不能超过 50' });
  }

  const totalChars = messages.reduce((sum, msg) => {
    const content = typeof msg?.content === 'string' ? msg.content : '';
    return sum + content.length;
  }, 0);

  if (totalChars > 200_000) {
    return res.status(400).json({ error: 'messages 内容过长' });
  }

  const parsedMaxTokens = Number(max_tokens);
  const parsedTemperature = Number(temperature);
  const safeMaxTokens = Number.isFinite(parsedMaxTokens)
    ? Math.max(1, Math.min(24_000, parsedMaxTokens))
    : 8_192;
  const safeTemperature = Number.isFinite(parsedTemperature)
    ? Math.max(0, Math.min(2, parsedTemperature))
    : 1;

  debugLog('Chat 请求:', { messageCount: messages.length, model, stream });

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (POLLINATIONS_API_KEY) {
    headers['Authorization'] = `Bearer ${POLLINATIONS_API_KEY}`;
  }

  // 构建请求体 (OpenAI 兼容格式)
  const requestBody = {
    model,
    messages,
    max_tokens: safeMaxTokens,
    temperature: safeTemperature,
    stream,
    ...(response_format ? { response_format } : {}),
  };

  try {
    debugLog('Pollinations 请求:', {
      model,
      messageCount: messages.length,
      max_tokens: safeMaxTokens,
      stream,
    });

    const response = await fetch(POLLINATIONS_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      debugLog('Pollinations API 错误:', response.status, errorText.slice(0, 500));
      return res.status(response.status).json({
        error: 'Pollinations API 请求失败',
        upstreamStatus: response.status,
      });
    }

    // 流式响应模式
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = response.body?.getReader();
      if (!reader) {
        return res.status(500).json({ error: '无法读取响应流' });
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              // 直接转发 SSE 数据
              res.write(line + '\n');
            }
          }
        }

        // 处理剩余 buffer
        if (buffer.trim()) {
          res.write(buffer + '\n');
        }

        debugLog('[chat] 流式响应完成');
      } catch (streamError) {
        console.error('[chat] 流式传输错误');
        const errorData = JSON.stringify({
          id: `pollinations-${Date.now()}`,
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
        reader.releaseLock();
        res.end();
      }
      return;
    }

    // 非流式响应模式
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    debugLog('Pollinations 响应成功，原始内容长度:', content.length);

    // 尝试提取纯 JSON（如果 AI 在 JSON 前后添加了文字）
    content = extractPureJSON(content);

    // 返回 OpenAI 兼容格式的响应
    const responseData = {
      id: data.id || `pollinations-${Date.now()}`,
      object: 'chat.completion',
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model || model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: data.choices?.[0]?.finish_reason || 'stop',
        },
      ],
      usage: data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    res.json(responseData);

  } catch (error) {
    console.error('Pollinations API 请求失败');
    res.status(500).json({
      error: 'Pollinations API 请求失败',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
