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
const RUNCOMFY_API_TOKEN = process.env.RUNCOMFY_API_TOKEN || '5037e506-cae6-446e-81e0-a49c501a34ea';

// API 端点配置
const POLLINATIONS_TEXT_API = 'https://text.pollinations.ai';
const POLLINATIONS_GEN_API = 'https://gen.pollinations.ai';
const RUNCOMFY_API_BASE = 'https://model-api.runcomfy.net/v1';

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
// /api/runcomfy/txt2img - RunComfy 文生图 (Seedream 4.5)
// ============================================
app.post('/api/runcomfy/txt2img', async (req, res) => {
  const {
    prompt,
    resolution = '2048x2048 (1:1)',
  } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: '缺少必要参数: prompt' });
  }

  console.log('RunComfy 文生图请求:', { prompt: prompt.substring(0, 100), resolution });

  try {
    // 1. 提交生成任务
    const submitResponse = await fetch(`${RUNCOMFY_API_BASE}/models/bytedance/seedream-4-5/text-to-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
      },
      body: JSON.stringify({ prompt, resolution }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error('RunComfy 提交任务失败:', errorText);
      return res.status(submitResponse.status).json({
        error: 'RunComfy API 提交任务失败',
        details: errorText
      });
    }

    const submitResult = await submitResponse.json();
    const requestId = submitResult.request_id;

    if (!requestId) {
      console.error('RunComfy 未返回 request_id:', submitResult);
      return res.status(500).json({ error: '未获取到任务ID', details: submitResult });
    }

    console.log('RunComfy 任务已提交, request_id:', requestId);

    // 2. 轮询等待结果
    const maxAttempts = 120; // 最大等待 120 次 (约 2 分钟)
    const pollInterval = 1000; // 每秒轮询一次
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;

      const statusResponse = await fetch(`${RUNCOMFY_API_BASE}/requests/${requestId}/result`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
        },
      });

      if (!statusResponse.ok) {
        console.error('RunComfy 查询状态失败:', await statusResponse.text());
        continue;
      }

      const statusResult = await statusResponse.json();
      console.log(`RunComfy 轮询 ${attempts}/${maxAttempts}:`, statusResult.status);

      if (statusResult.status === 'completed') {
        // 获取生成的图片URL
        const output = statusResult.output;
        const imageUrl = output?.image || (output?.images && output.images[0]);

        if (!imageUrl) {
          console.error('RunComfy 未返回图片URL:', statusResult);
          return res.status(500).json({ error: '未获取到图片URL', details: statusResult });
        }

        console.log('RunComfy 图片生成成功:', imageUrl);

        // 3. 下载图片并返回
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          return res.status(500).json({ error: '下载图片失败' });
        }

        const contentType = imageResponse.headers.get('content-type') || 'image/png';
        res.set('Content-Type', contentType);
        const buffer = await imageResponse.arrayBuffer();
        return res.send(Buffer.from(buffer));
      }

      if (statusResult.status === 'cancelled' || statusResult.status === 'failed') {
        console.error('RunComfy 任务失败:', statusResult);
        return res.status(500).json({ error: '图片生成任务失败', details: statusResult });
      }

      // in_queue 或 in_progress 状态，继续轮询
    }

    // 超时
    return res.status(504).json({ error: '图片生成超时' });

  } catch (error) {
    console.error('RunComfy 文生图请求失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

// ============================================
// /api/runcomfy/img2img - RunComfy 图生图 (Seedream 4.5 Edit)
// ============================================
app.post('/api/runcomfy/img2img', async (req, res) => {
  const {
    prompt,
    images,  // 图片URL数组
    resolution = '2048x2048 (1:1)',
  } = req.body;

  if (!prompt || !images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: '缺少必要参数: prompt 和 images 数组' });
  }

  console.log('RunComfy 图生图请求:', { prompt: prompt.substring(0, 100), imageCount: images.length, resolution });

  try {
    // 1. 提交生成任务
    const submitResponse = await fetch(`${RUNCOMFY_API_BASE}/models/bytedance/seedream-4-5/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
      },
      body: JSON.stringify({ prompt, images, resolution }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error('RunComfy 提交图生图任务失败:', errorText);
      return res.status(submitResponse.status).json({
        error: 'RunComfy API 提交任务失败',
        details: errorText
      });
    }

    const submitResult = await submitResponse.json();
    const requestId = submitResult.request_id;

    if (!requestId) {
      console.error('RunComfy 未返回 request_id:', submitResult);
      return res.status(500).json({ error: '未获取到任务ID', details: submitResult });
    }

    console.log('RunComfy 图生图任务已提交, request_id:', requestId);

    // 2. 轮询等待结果
    const maxAttempts = 120;
    const pollInterval = 1000;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;

      const statusResponse = await fetch(`${RUNCOMFY_API_BASE}/requests/${requestId}/result`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
        },
      });

      if (!statusResponse.ok) {
        console.error('RunComfy 查询图生图状态失败:', await statusResponse.text());
        continue;
      }

      const statusResult = await statusResponse.json();
      console.log(`RunComfy 图生图轮询 ${attempts}/${maxAttempts}:`, statusResult.status);

      if (statusResult.status === 'completed') {
        const output = statusResult.output;
        const imageUrl = output?.image || (output?.images && output.images[0]);

        if (!imageUrl) {
          console.error('RunComfy 图生图未返回图片URL:', statusResult);
          return res.status(500).json({ error: '未获取到图片URL', details: statusResult });
        }

        console.log('RunComfy 图生图成功:', imageUrl);

        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          return res.status(500).json({ error: '下载图片失败' });
        }

        const contentType = imageResponse.headers.get('content-type') || 'image/png';
        res.set('Content-Type', contentType);
        const buffer = await imageResponse.arrayBuffer();
        return res.send(Buffer.from(buffer));
      }

      if (statusResult.status === 'cancelled' || statusResult.status === 'failed') {
        console.error('RunComfy 图生图任务失败:', statusResult);
        return res.status(500).json({ error: '图生图任务失败', details: statusResult });
      }
    }

    return res.status(504).json({ error: '图生图生成超时' });

  } catch (error) {
    console.error('RunComfy 图生图请求失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

// ============================================
// /api/runcomfy/ref2video - RunComfy 多图参考视频生成 (Seedance 1.0 Lite)
// 支持1-4张参考图片输入
// ============================================
app.post('/api/runcomfy/ref2video', async (req, res) => {
  const {
    images,       // 图片URL数组（1-4张）
    text,         // 提示词
    resolution = '480p',
    ratio = '16:9',
    duration = 5,
    seed,
  } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0 || images.length > 4) {
    return res.status(400).json({ error: '缺少必要参数: images 数组（1-4张图片）' });
  }
  if (!text) {
    return res.status(400).json({ error: '缺少必要参数: text (提示词)' });
  }

  console.log('RunComfy 多图参考视频请求:', { 
    imageCount: images.length, 
    textPreview: text.substring(0, 100),
    resolution, 
    ratio, 
    duration 
  });

  try {
    // 1. 提交生成任务（带重试）
    const requestBody = {
      images,
      text,
      resolution,
      ratio,
      duration: parseInt(duration),
    };
    
    if (seed) {
      requestBody.seed = parseInt(seed);
    }

    const submitUrl = `${RUNCOMFY_API_BASE}/models/bytedance/seedance-1-0/lite/reference-to-video`;
    const maxSubmitRetries = 5;
    const baseDelayMs = 800;
    let submitResponse;
    let lastErrorText = '';

    for (let attempt = 1; attempt <= maxSubmitRetries; attempt++) {
      try {
        submitResponse = await fetch(submitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (submitResponse.ok) break;

        // 非 2xx，读取错误信息
        lastErrorText = await submitResponse.text();
        const isRedisLock = lastErrorText.includes('Redis lock timeout');
        const isTooManyRequests = submitResponse.status === 429;
        const isServerError = submitResponse.status >= 500;

        if (isRedisLock || isServerError || isTooManyRequests) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
          console.warn(`RunComfy 提交失败(第${attempt}/${maxSubmitRetries}次): ${lastErrorText}，${delay}ms后重试...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // 其他错误直接返回
        console.error('RunComfy 提交视频任务失败:', lastErrorText);
        return res.status(submitResponse.status).json({
          error: 'RunComfy API 提交任务失败',
          details: lastErrorText
        });

      } catch (e) {
        lastErrorText = e instanceof Error ? e.message : String(e);
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
        console.warn(`RunComfy 提交异常(第${attempt}/${maxSubmitRetries}次): ${lastErrorText}，${delay}ms后重试...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    if (!submitResponse || !submitResponse.ok) {
      console.error('RunComfy 提交视频任务失败(重试已用尽):', lastErrorText);
      return res.status(502).json({
        error: 'RunComfy API 暂时不可用(提交失败)',
        details: lastErrorText
      });
    }

    const submitResult = await submitResponse.json();
    const requestId = submitResult.request_id;

    if (!requestId) {
      console.error('RunComfy 未返回 request_id:', submitResult);
      return res.status(500).json({ error: '未获取到任务ID', details: submitResult });
    }

    console.log('RunComfy 视频任务已提交, request_id:', requestId);

    // 2. 轮询等待结果（视频生成可能需要较长时间）
    const maxAttempts = 180; // 最大等待 180 次 (约 3 分钟)
    const pollInterval = 1000; // 每秒轮询一次
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;

      const statusResponse = await fetch(`${RUNCOMFY_API_BASE}/requests/${requestId}/result`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
        },
      });

      if (!statusResponse.ok) {
        console.error('RunComfy 查询视频状态失败:', await statusResponse.text());
        continue;
      }

      const statusResult = await statusResponse.json();
      
      // 每10次打印一次日志
      if (attempts % 10 === 0) {
        console.log(`RunComfy 视频轮询 ${attempts}/${maxAttempts}:`, statusResult.status);
      }

      if (statusResult.status === 'completed') {
        // 获取生成的视频URL
        const output = statusResult.output;
        const videoUrl = output?.video || (output?.videos && output.videos[0]);

        if (!videoUrl) {
          console.error('RunComfy 未返回视频URL:', statusResult);
          return res.status(500).json({ error: '未获取到视频URL', details: statusResult });
        }

        console.log('RunComfy 视频生成成功:', videoUrl);

        // 返回JSON结果（包含视频URL）
        return res.json({
          success: true,
          requestId,
          videoUrl,
          output,
        });
      }

      if (statusResult.status === 'cancelled' || statusResult.status === 'failed') {
        console.error('RunComfy 视频任务失败:', statusResult);
        return res.status(500).json({ error: '视频生成任务失败', details: statusResult });
      }

      // in_queue 或 in_progress 状态，继续轮询
    }

    // 超时
    return res.status(504).json({ error: '视频生成超时', requestId });

  } catch (error) {
    console.error('RunComfy 多图参考视频请求失败:', error);
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
    version: '1.2.0',
    endpoints: [
      'POST /api/chat',
      'POST /api/runcomfy/txt2img (Seedream 4.5)',
      'POST /api/runcomfy/img2img (Seedream 4.5 Edit)',
      'POST /api/runcomfy/ref2video (Seedance 1.0 Lite 多图参考)',
      'GET  /api/txt2img (Pollinations - 已弃用)',
      'GET  /api/img2img (Pollinations - 已弃用)',
      'GET  /api/img2video (Pollinations - 已弃用)',
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
  console.log('  POST /api/chat                               - Chat Completions (文生文)');
  console.log('  POST /api/runcomfy/txt2img                   - 文生图 (Seedream 4.5)');
  console.log('  POST /api/runcomfy/img2img                   - 图生图 (Seedream 4.5 Edit)');
  console.log('  POST /api/runcomfy/ref2video                 - 多图参考视频 (Seedance 1.0 Lite)');
  console.log('  GET  /api/txt2img?prompt=xxx                 - 文生图 (Pollinations - 已弃用)');
  console.log('  GET  /api/img2img?prompt=xxx&imageUrl=xxx    - 图生图 (Pollinations - 已弃用)');
  console.log('  GET  /api/img2video?prompt=xxx&imageUrl=xxx  - 图生视频 (Pollinations - 已弃用)');
  console.log('  POST /api/imgbb/upload                       - 图床上传');
  console.log('  GET  /api/health                             - 健康检查');
  console.log('\n环境变量配置:');
  console.log(`  PORT: ${PORT}`);
  console.log(`  RUNCOMFY_API_TOKEN: ${RUNCOMFY_API_TOKEN ? '已配置' : '未配置'}`);
  console.log(`  POLLINATIONS_API_KEY: ${POLLINATIONS_API_KEY ? '已配置' : '未配置'} (已弃用，作为备用)`);
  console.log(`  IMGBB_API_KEY: ${IMGBB_API_KEY ? '已配置' : '未配置'}`);
  console.log('');
});
