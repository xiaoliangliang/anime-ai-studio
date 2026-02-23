// 简单的代理服务器,用于解决图生图的CORS问题
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

// 服务端 API 密钥
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || process.env.VITE_POLLINATIONS_API_KEY || '';

const app = express();
app.use(cors());
app.use(express.json());

// 代理图生图请求
app.get('/api/img2img', async (req, res) => {
  try {
    if (!POLLINATIONS_API_KEY) {
      return res.status(500).json({ error: '服务端未配置 POLLINATIONS_API_KEY' });
    }

    const { prompt, imageUrl } = req.query;

    if (!prompt || !imageUrl) {
      return res.status(400).json({ error: '缺少必要参数: prompt 和 imageUrl' });
    }

    // 根据最新官方文档 (https://enter.pollinations.ai/api/docs)
    // 使用 gen.pollinations.ai 端点和 image 参数进行图生图
    // 使用 nanobanana-pro 模型: Gemini 3 Pro Image (4K + Thinking, 比 kontext 便宜 330 倍)
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=nanobanana-pro&image=${imageUrl}`;

    console.log('图生图代理请求已接收');

    // 设置5分钟超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${POLLINATIONS_API_KEY}`,
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('响应状态:', response.status, response.statusText);
    console.log('响应 Content-Type:', response.headers.get('content-type'));

    if (!response.ok) {
      const errorText = await response.text().catch(() => '无法获取错误详情');
      console.error('API 错误:', errorText.substring(0, 500));
      return res.status(response.status).json({
        error: `API 请求失败: ${response.status} ${response.statusText}`,
        details: errorText
      });
    }

    // 检查响应是否为图片
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      const errorText = await response.text();
      console.error('API 返回了非图片内容:', errorText.substring(0, 500));
      return res.status(500).json({
        error: 'API 返回了非图片内容',
        contentType: contentType,
        details: errorText.substring(0, 500)
      });
    }

    // 返回图片数据
    const buffer = await response.buffer();
    console.log('成功获取图片,大小:', buffer.length, 'bytes');
    res.set('Content-Type', contentType);
    res.send(buffer);

  } catch (error) {
    console.error('代理请求失败:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`代理服务器运行在 http://localhost:${PORT}`);
  console.log(`图生图端点: http://localhost:${PORT}/api/img2img?prompt=YOUR_PROMPT&imageUrl=IMAGE_URL`);
});
