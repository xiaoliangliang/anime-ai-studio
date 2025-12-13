/**
 * AI短剧一站式工作平台 - Express 代理服务器
 * 
 * 功能：
 * - /api/chat      - 文生文代理（Chat Completions）
 * - /api/txt2img   - 文生图代理
 * - /api/img2img   - 图生图代理（多图输入支持）
 * - /api/img2video - 图生视频代理（seedance 模型）
 * - /api/imgbb/upload - 图片云托管上传
 * - /api/health    - 健康检查
 * 
 * 环境变量：
 * - PORT                 - 服务器端口（默认 3001）
 * - POLLINATIONS_API_KEY - Pollinations API 密钥
 * - IMGBB_API_KEY        - imgbb API 密钥
 */

import express from 'express';
import cors from 'cors';

const app = express();

// 从环境变量读取配置（支持 demo fallback）
const PORT = process.env.PORT || 3001;
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || 'plln_pk_7Tqtux7EhEq450ERY8M8QEDVfaqjO6Lo';
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '416bd0e1247069324458a42ccd408ae4';

// API 端点配置
const POLLINATIONS_TEXT_API = 'https://text.pollinations.ai';
const POLLINATIONS_GEN_API = 'https://gen.pollinations.ai';

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================
// /api/chat - 文生文代理（Chat Completions）
// ============================================
app.post('/api/chat', async (req, res) => {
  const {
    model = 'openai',
    messages,
    temperature = 0.7,
    max_tokens,
    stream = false,
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '缺少必要参数: messages 数组' });
  }

  const apiUrl = `${POLLINATIONS_TEXT_API}/v1/chat/completions`;

  console.log('Chat 请求:', { model, messageCount: messages.length, stream });

  try {
    const requestBody = {
      model,
      messages,
      temperature,
      stream,
    };
    
    if (max_tokens) {
      requestBody.max_tokens = max_tokens;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POLLINATIONS_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Pollinations Chat 响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pollinations Chat API 错误:', errorText);
      return res.status(response.status).json({
        error: 'Pollinations Chat API 请求失败',
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Chat 代理请求失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

// ============================================
// /api/txt2img - 文生图代理
// ============================================
app.get('/api/txt2img', async (req, res) => {
  const {
    prompt,
    width = 1024,
    height = 1024,
    seed,
    model = 'flux',
    enhance = 'true',
    nologo = 'true',
  } = req.query;

  if (!prompt) {
    return res.status(400).json({ error: '缺少必要参数: prompt' });
  }

  const params = new URLSearchParams({
    model,
    width: width.toString(),
    height: height.toString(),
    seed: seed || Math.floor(Math.random() * 1000000).toString(),
    enhance,
    nologo,
  });

  const apiUrl = `${POLLINATIONS_GEN_API}/image/${encodeURIComponent(prompt)}?${params.toString()}`;

  console.log('文生图请求:', apiUrl.substring(0, 200));

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

    res.set('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('代理请求失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

// ============================================
// /api/img2img - 图生图代理（支持多图输入）
// ============================================
app.get('/api/img2img', async (req, res) => {
  const {
    prompt,
    imageUrl,        // 单图: 一个URL; 多图: 逗号分隔的多个URL
    width = 1024,
    height = 1024,
    seed,
    model = 'kontext',  // 支持: kontext, seedream, seedream-pro, gptimage
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
    model: model,
    image: imageUrl,
    width: width.toString(),
    height: height.toString(),
    seed: seed || Math.floor(Math.random() * 1000000).toString(),
    enhance: enhance,
    nologo: nologo,
    quality: quality,
    safe: safe,
    transparent: transparent,
  });

  if (negativePrompt) {
    params.set('negative_prompt', negativePrompt);
  }
  if (guidanceScale) {
    params.set('guidance_scale', guidanceScale);
  }

  const apiUrl = `${POLLINATIONS_GEN_API}/image/${encodeURIComponent(prompt)}?${params.toString()}`;

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

    res.set('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('代理请求失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

// ============================================
// /api/img2video - 图生视频代理（seedance 模型）
// ============================================
app.get('/api/img2video', async (req, res) => {
  const {
    prompt,
    imageUrl,
    duration = '5',
    aspectRatio = '16:9',
    seed,
    model = 'seedance',
    nologo = 'true',
  } = req.query;

  if (!prompt || !imageUrl) {
    return res.status(400).json({ error: '缺少必要参数: prompt 和 imageUrl' });
  }

  const params = new URLSearchParams({
    model: model,
    image: imageUrl,
    duration: duration.toString(),
    aspectRatio: aspectRatio,
    seed: seed || Math.floor(Math.random() * 1000000).toString(),
    nologo: nologo,
  });

  const apiUrl = `${POLLINATIONS_GEN_API}/image/${encodeURIComponent(prompt)}?${params.toString()}`;

  console.log('图生视频请求:', apiUrl.substring(0, 200));

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
    console.log('响应 Content-Type:', contentType);

    if (!contentType.startsWith('video/')) {
      const errorText = await response.text();
      console.error('返回非视频内容:', errorText.substring(0, 500));
      return res.status(500).json({
        error: '返回非视频内容',
        contentType,
        details: errorText.substring(0, 500)
      });
    }

    res.set('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    console.log('视频大小:', buffer.byteLength, 'bytes');
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('图生视频代理请求失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

// ============================================
// /api/imgbb/upload - 图片云托管上传
// ============================================
app.post('/api/imgbb/upload', express.urlencoded({ extended: true, limit: '50mb' }), async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: '缺少图片数据' });
    }

    const formData = new URLSearchParams();
    formData.append('image', image);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (!result.success) {
      console.error('imgbb 上传失败:', result);
      return res.status(500).json({ error: 'imgbb 上传失败', details: result });
    }

    console.log('imgbb 上传成功:', result.data?.url);
    res.json(result);

  } catch (error) {
    console.error('imgbb 上传失败:', error);
    res.status(500).json({ error: '上传失败', details: error.message });
  }
});

// ============================================
// /api/health - 健康检查
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: [
      'POST /api/chat',
      'GET  /api/txt2img',
      'GET  /api/img2img',
      'GET  /api/img2video',
      'POST /api/imgbb/upload',
      'GET  /api/health',
    ],
  });
});

// ============================================
// 启动服务器
// ============================================
app.listen(PORT, () => {
  console.log(`\n🚀 AI短剧工坊代理服务器运行在 http://localhost:${PORT}\n`);
  console.log('可用端点:');
  console.log('  POST /api/chat                         - Chat Completions (文生文)');
  console.log('  GET  /api/txt2img?prompt=xxx           - 文生图');
  console.log('  GET  /api/img2img?prompt=xxx&imageUrl=xxx - 图生图');
  console.log('  GET  /api/img2video?prompt=xxx&imageUrl=xxx - 图生视频');
  console.log('  POST /api/imgbb/upload                 - 图床上传');
  console.log('  GET  /api/health                       - 健康检查');
  console.log('\n环境变量配置:');
  console.log(`  PORT: ${PORT}`);
  console.log(`  POLLINATIONS_API_KEY: ${POLLINATIONS_API_KEY ? '已配置' : '未配置（使用 demo key）'}`);
  console.log(`  IMGBB_API_KEY: ${IMGBB_API_KEY ? '已配置' : '未配置（使用 demo key）'}`);
  console.log('');
});
