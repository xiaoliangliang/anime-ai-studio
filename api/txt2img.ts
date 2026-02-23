import type { VercelRequest, VercelResponse } from '@vercel/node';
import { debugLog, enforceAllowedOrigins, requireServerEnv } from './_lib/security';

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || '';
const POLLINATIONS_GEN_API = 'https://gen.pollinations.ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!enforceAllowedOrigins(req, res)) {
    return;
  }

  if (!requireServerEnv(res, 'POLLINATIONS_API_KEY', POLLINATIONS_API_KEY)) {
    return;
  }

  const {
    prompt,
    width = '1024',
    height = '1024',
    seed,
    model = 'seedream',
    enhance = 'true',
    nologo = 'true',
  } = req.query;

  if (!prompt) {
    return res.status(400).json({ error: '缺少必要参数: prompt' });
  }

  const promptText = String(prompt).trim();
  if (promptText.length === 0 || promptText.length > 2_000) {
    return res.status(400).json({ error: 'prompt 长度必须在 1-2000 字符之间' });
  }

  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  if (
    !Number.isFinite(parsedWidth) ||
    !Number.isFinite(parsedHeight) ||
    parsedWidth < 256 ||
    parsedWidth > 4096 ||
    parsedHeight < 256 ||
    parsedHeight > 4096
  ) {
    return res.status(400).json({ error: 'width/height 必须在 256-4096 范围内' });
  }

  const params = new URLSearchParams({
    model: String(model),
    width: String(Math.floor(parsedWidth)),
    height: String(Math.floor(parsedHeight)),
    seed: seed ? String(seed) : Math.floor(Math.random() * 1000000).toString(),
    enhance: String(enhance),
    nologo: String(nologo),
  });

  const apiUrl = `${POLLINATIONS_GEN_API}/image/${encodeURIComponent(promptText)}?${params.toString()}`;

  debugLog('文生图请求参数:', {
    model: String(model),
    width: Math.floor(parsedWidth),
    height: Math.floor(parsedHeight),
  });

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${POLLINATIONS_API_KEY}`,
      },
    });

    debugLog('Pollinations 响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      debugLog('Pollinations API 错误:', errorText.slice(0, 500));
      return res.status(response.status).json({
        error: 'Pollinations API 请求失败',
        upstreamStatus: response.status,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      const errorText = await response.text();
      debugLog('返回非图片内容:', errorText.slice(0, 500));
      return res.status(500).json({
        error: '返回非图片内容',
        contentType,
      });
    }

    res.setHeader('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('代理请求失败');
    res.status(500).json({ 
      error: '代理请求失败', 
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
