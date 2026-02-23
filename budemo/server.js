import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Pollinations API 配置
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || process.env.VITE_POLLINATIONS_API_KEY || '';
const POLLINATIONS_API_BASE = 'https://gen.pollinations.ai';

// RunComfy API 配置 (Seedance 1.0 图生视频)
const RUNCOMFY_API_KEY = process.env.RUNCOMFY_API_TOKEN || '';
const RUNCOMFY_API_BASE = 'https://model-api.runcomfy.net/v1';
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';

function requireServerSecret(res, value, envName) {
  if (value) return true;
  res.status(500).json({ error: `服务端未配置 ${envName}` });
  return false;
}

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 图生图 API 代理 (支持多图输入)
app.get('/api/img2img', async (req, res) => {
  if (!requireServerSecret(res, POLLINATIONS_API_KEY, 'POLLINATIONS_API_KEY')) return;

  const {
    prompt,
    imageUrl,      // 单图: 一个URL; 多图: 逗号分隔的多个URL
    width = 1024,
    height = 1024,
    seed,
    model = 'kontext',  // 支持的模型: kontext, seedream, seedream-pro, gptimage, nanobanana, nanobanana-pro
    enhance = 'false',
    nologo = 'true',
    // 新增参数
    negativePrompt,
    quality = 'medium',
    guidanceScale,
    safe = 'false',
    transparent = 'false',
  } = req.query;

  if (!prompt || !imageUrl) {
    return res.status(400).json({ error: '缺少必要参数: prompt 和 imageUrl' });
  }

  // 构建 Pollinations API URL
  // 多图输入: imageUrl 可以是逗号分隔的多个URL，API会自动识别
  const params = new URLSearchParams({
    model: model,
    image: imageUrl,  // 支持多图: "url1,url2" 或 "url1|url2"
    width: width.toString(),
    height: height.toString(),
    seed: seed || Math.floor(Math.random() * 1000000).toString(),
    enhance: enhance,
    nologo: nologo,
    quality: quality,
    safe: safe,
    transparent: transparent,
  });

  // 可选参数 - 只有设置了才传递
  if (negativePrompt) {
    params.set('negative_prompt', negativePrompt);
  }
  if (guidanceScale) {
    params.set('guidance_scale', guidanceScale);
  }

  const apiUrl = `${POLLINATIONS_API_BASE}/image/${encodeURIComponent(prompt)}?${params.toString()}`;

  console.log('图生图请求已接收');

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

    // 检查响应类型
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

    // 设置响应头并转发图片
    res.set('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('代理请求失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

// 文生图 API 代理
app.get('/api/txt2img', async (req, res) => {
  if (!requireServerSecret(res, POLLINATIONS_API_KEY, 'POLLINATIONS_API_KEY')) return;

  const { prompt, width = 1024, height = 1024, seed, model = 'flux', enhance = 'true', nologo = 'true' } = req.query;

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

  const apiUrl = `${POLLINATIONS_API_BASE}/image/${encodeURIComponent(prompt)}?${params.toString()}`;

  console.log('文生图请求已接收');

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

// 图生视频 API 代理 (使用 seedance 模型)
app.get('/api/img2video', async (req, res) => {
  if (!requireServerSecret(res, POLLINATIONS_API_KEY, 'POLLINATIONS_API_KEY')) return;

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

  // 构建 Pollinations API URL
  const params = new URLSearchParams({
    model: model, // seedance 或 seedance-pro
    image: imageUrl,
    duration: duration.toString(),
    aspectRatio: aspectRatio,
    seed: seed || Math.floor(Math.random() * 1000000).toString(),
    nologo: nologo,
  });

  const apiUrl = `${POLLINATIONS_API_BASE}/image/${encodeURIComponent(prompt)}?${params.toString()}`;

  console.log('图生视频请求已接收');

  try {
    // 视频生成可能需要很长时间，不设置超时
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

    // 检查响应类型
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

    // 设置响应头并转发视频
    res.set('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    console.log('视频大小:', buffer.byteLength, 'bytes');
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('图生视频代理请求失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

// imgbb 图床上传代理
app.post('/api/imgbb/upload', express.urlencoded({ extended: true, limit: '50mb' }), async (req, res) => {
  if (!requireServerSecret(res, IMGBB_API_KEY, 'IMGBB_API_KEY')) return;

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
    res.json(result);

  } catch (error) {
    console.error('imgbb 上传失败:', error);
    res.status(500).json({ error: '上传失败', details: error.message });
  }
});

// ========== RunComfy Seedance 1.0 图生视频 API ==========

/**
 * RunComfy 图生视频 API 代理
 * 使用 ByteDance Seedance 1.0 模型
 * API 文档: https://www.runcomfy.com/playground/bytedance/seedance-1-0/api
 */
app.post('/api/runcomfy/img2video', async (req, res) => {
  if (!requireServerSecret(res, RUNCOMFY_API_KEY, 'RUNCOMFY_API_TOKEN')) return;

  const {
    prompt,
    imageUrl,
    duration = 5,
    resolution = '480p',
    ratio = 'adaptive',
  } = req.body;

  if (!prompt || !imageUrl) {
    return res.status(400).json({ error: '缺少必要参数: prompt 和 imageUrl' });
  }

  console.log('RunComfy 图生视频请求:', { prompt: prompt.substring(0, 100), imageUrl: imageUrl.substring(0, 100), duration, resolution, ratio });

  try {
    // 1. 提交异步任务
    const submitResponse = await fetch(`${RUNCOMFY_API_BASE}/models/bytedance/seedance-1-0/pro/image-to-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNCOMFY_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: prompt,
        first_frame_image_url: imageUrl,
        duration: duration,
        resolution: resolution,
        ratio: ratio,
      }),
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
    console.log('RunComfy 任务已提交, request_id:', requestId);

    // 2. 轮询任务状态直到完成
    const maxAttempts = 120; // 最多等待10分钟 (每5秒轮询一次)
    let attempts = 0;
    let status = 'in_queue';
    let result = null;

    while (attempts < maxAttempts && (status === 'in_queue' || status === 'in_progress')) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒
      attempts++;

      const statusResponse = await fetch(`${RUNCOMFY_API_BASE}/requests/${requestId}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${RUNCOMFY_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        console.error('RunComfy 查询状态失败');
        continue;
      }

      const statusResult = await statusResponse.json();
      status = statusResult.status;
      console.log(`RunComfy 任务状态 (${attempts}/${maxAttempts}):`, status);

      if (status === 'completed') {
        // 3. 获取结果
        const resultResponse = await fetch(`${RUNCOMFY_API_BASE}/requests/${requestId}/result`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${RUNCOMFY_API_KEY}`,
          },
        });

        if (resultResponse.ok) {
          result = await resultResponse.json();
          console.log('RunComfy 任务完成, 结果:', result);
        }
        break;
      } else if (status === 'cancelled' || status === 'failed') {
        console.error('RunComfy 任务失败或被取消:', status);
        return res.status(500).json({ error: `RunComfy 任务${status === 'cancelled' ? '被取消' : '失败'}` });
      }
    }

    if (status !== 'completed' || !result) {
      return res.status(500).json({ error: 'RunComfy 任务超时或未完成', status });
    }

    // 4. 返回视频URL
    const videoUrl = result.output?.video || result.output?.videos?.[0];
    if (!videoUrl) {
      return res.status(500).json({ error: 'RunComfy 返回结果中没有视频URL', result });
    }

    res.json({
      success: true,
      videoUrl: videoUrl,
      requestId: requestId,
      output: result.output,
    });

  } catch (error) {
    console.error('RunComfy 图生视频失败:', error);
    res.status(500).json({ error: '代理请求失败', details: error.message });
  }
});

/**
 * RunComfy 任务状态查询 (供前端主动查询)
 */
app.get('/api/runcomfy/status/:requestId', async (req, res) => {
  if (!requireServerSecret(res, RUNCOMFY_API_KEY, 'RUNCOMFY_API_TOKEN')) return;

  const { requestId } = req.params;

  try {
    const statusResponse = await fetch(`${RUNCOMFY_API_BASE}/requests/${requestId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RUNCOMFY_API_KEY}`,
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      return res.status(statusResponse.status).json({ error: '查询状态失败', details: errorText });
    }

    const statusResult = await statusResponse.json();
    res.json(statusResult);

  } catch (error) {
    console.error('RunComfy 状态查询失败:', error);
    res.status(500).json({ error: '查询失败', details: error.message });
  }
});

/**
 * RunComfy 任务结果获取
 */
app.get('/api/runcomfy/result/:requestId', async (req, res) => {
  if (!requireServerSecret(res, RUNCOMFY_API_KEY, 'RUNCOMFY_API_TOKEN')) return;

  const { requestId } = req.params;

  try {
    const resultResponse = await fetch(`${RUNCOMFY_API_BASE}/requests/${requestId}/result`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RUNCOMFY_API_KEY}`,
      },
    });

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      return res.status(resultResponse.status).json({ error: '获取结果失败', details: errorText });
    }

    const result = await resultResponse.json();
    res.json(result);

  } catch (error) {
    console.error('RunComfy 结果获取失败:', error);
    res.status(500).json({ error: '获取失败', details: error.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API 代理服务器运行在 http://localhost:${PORT}`);
  console.log('可用端点:');
  console.log('  GET  /api/img2img?prompt=xxx&imageUrl=xxx      - 图生图 (Pollinations)');
  console.log('  GET  /api/img2video?prompt=xxx&imageUrl=xxx    - 图生视频 (Pollinations seedance)');
  console.log('  POST /api/runcomfy/img2video                   - 图生视频 (RunComfy Seedance 1.0)');
  console.log('  GET  /api/runcomfy/status/:requestId           - RunComfy 任务状态查询');
  console.log('  GET  /api/runcomfy/result/:requestId           - RunComfy 任务结果获取');
  console.log('  GET  /api/txt2img?prompt=xxx                   - 文生图');
  console.log('  POST /api/imgbb/upload                         - 图床上传');
  console.log('  GET  /api/health                               - 健康检查');
});
