import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Pollinations API 配置
const POLLINATIONS_API_KEY = 'plln_pk_7Tqtux7EhEq450ERY8M8QEDVfaqjO6Lo';
const POLLINATIONS_API_BASE = 'https://gen.pollinations.ai';

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 图生图 API 代理 (支持多图输入)
app.get('/api/img2img', async (req, res) => {
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

  console.log('图生图请求:', apiUrl);

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

  console.log('文生图请求:', apiUrl);

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

  console.log('图生视频请求:', apiUrl);

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
  const IMGBB_API_KEY = '416bd0e1247069324458a42ccd408ae4';

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

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API 代理服务器运行在 http://localhost:${PORT}`);
  console.log('可用端点:');
  console.log('  GET  /api/img2img?prompt=xxx&imageUrl=xxx   - 图生图 (kontext)');
  console.log('  GET  /api/img2video?prompt=xxx&imageUrl=xxx - 图生视频 (seedance)');
  console.log('  GET  /api/txt2img?prompt=xxx                - 文生图');
  console.log('  POST /api/imgbb/upload                      - 图床上传');
  console.log('  GET  /api/health                            - 健康检查');
});
