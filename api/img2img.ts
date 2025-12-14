import type { VercelRequest, VercelResponse } from '@vercel/node';

const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || '';
const POLLINATIONS_GEN_API = 'https://gen.pollinations.ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    prompt,
    imageUrl,
    width = '1024',
    height = '1024',
    seed,
    model = 'kontext',
    enhance = 'false',
    nologo = 'true',
    negativePrompt,
    quality = 'medium',
    guidanceScale,
    safe = 'false',
    transparent = 'false',
  } = req.query;

  if (!prompt || !imageUrl) {
    return res.status(400).json({ error: '缺少必要参数: prompt 和 imageUrl' });
  }

  const params = new URLSearchParams({
    model: String(model),
    image: String(imageUrl),
    width: String(width),
    height: String(height),
    seed: seed ? String(seed) : Math.floor(Math.random() * 1000000).toString(),
    enhance: String(enhance),
    nologo: String(nologo),
    quality: String(quality),
    safe: String(safe),
    transparent: String(transparent),
  });

  if (negativePrompt) {
    params.set('negative_prompt', String(negativePrompt));
  }
  if (guidanceScale) {
    params.set('guidance_scale', String(guidanceScale));
  }

  const apiUrl = `${POLLINATIONS_GEN_API}/image/${encodeURIComponent(String(prompt))}?${params.toString()}`;

  console.log('图生图请求:', apiUrl.substring(0, 200));

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${POLLINATIONS_API_KEY}`,
      },
    });

    console.log('Pollinations 响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pollinations API 错误:', errorText);
      return res.status(response.status).json({
        error: 'Pollinations API 请求失败',
        details: errorText
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      const errorText = await response.text();
      console.error('返回非图片内容:', errorText);
      return res.status(500).json({
        error: '返回非图片内容',
        contentType,
        details: errorText.substring(0, 500)
      });
    }

    res.setHeader('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('代理请求失败:', error);
    res.status(500).json({ 
      error: '代理请求失败', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
