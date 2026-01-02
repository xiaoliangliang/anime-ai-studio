import type { VercelRequest, VercelResponse } from '@vercel/node';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    messages,
    model = DEFAULT_MODEL,
    max_tokens = 8192,
    temperature = 1,
    stream = false,
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '缺少必要参数: messages 数组' });
  }

  console.log('Chat 请求:', { messageCount: messages.length, model, stream });

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
    max_tokens,
    temperature,
    stream,
  };

  try {
    console.log('Pollinations 请求:', {
      model,
      messageCount: messages.length,
      max_tokens,
      stream,
    });

    const response = await fetch(POLLINATIONS_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pollinations API 错误:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Pollinations API 请求失败',
        details: errorText,
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

        console.log('[chat] 流式响应完成');
      } catch (streamError) {
        console.error('[chat] 流式传输错误:', streamError);
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

    console.log('Pollinations 响应成功，原始内容长度:', content.length);
    console.log('Pollinations 原始内容前300字符:', content.substring(0, 300));

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
    console.error('Pollinations API 请求失败:', error);
    res.status(500).json({
      error: 'Pollinations API 请求失败',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
