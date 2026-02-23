import type { VercelRequest, VercelResponse } from '@vercel/node';
import { debugLog, enforceAllowedOrigins, requireServerEnv } from '../_lib/security';

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';
const MAX_BASE64_LENGTH = 45_000_000; // ~32MB 二进制

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!enforceAllowedOrigins(req, res)) {
    return;
  }

  if (!requireServerEnv(res, 'IMGBB_API_KEY', IMGBB_API_KEY)) {
    return;
  }

  try {
    // 支持 JSON 和 urlencoded 格式
    let image = req.body?.image;

    // 如果是字符串格式的 body（可能是原始 urlencoded）
    if (!image && typeof req.body === 'string') {
      const params = new URLSearchParams(req.body);
      image = params.get('image');
    }

    if (!image) {
      console.error('缺少图片数据, body 类型:', typeof req.body);
      return res.status(400).json({ error: '缺少图片数据' });
    }

    // 确保 image 是字符串
    if (typeof image !== 'string') {
      return res.status(400).json({ error: '图片数据格式错误，需要字符串' });
    }

    // 如果仍然包含 data URL 前缀，移除它
    if (image.startsWith('data:')) {
      const base64Match = image.match(/^data:[^;]+;base64,(.+)$/);
      if (base64Match) {
        image = base64Match[1];
      } else {
        return res.status(400).json({ error: '无法解析 data URL 格式' });
      }
    }

    // 移除可能的空白字符
    image = image.replace(/\s/g, '');

    // 基本验证：检查是否有足够的数据
    if (image.length < 100) {
      debugLog('图片数据太小，长度:', image.length);
      return res.status(400).json({ error: '图片数据太小' });
    }

    if (image.length > MAX_BASE64_LENGTH) {
      return res.status(413).json({ error: '图片数据过大，超过 imgbb 限制' });
    }

    debugLog('imgbb 上传请求，base64 长度:', image.length);

    const formData = new URLSearchParams();
    formData.append('image', image);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    if (!result.success) {
      debugLog('imgbb 上传失败:', result);
      return res.status(500).json({ error: 'imgbb 上传失败' });
    }

    debugLog('imgbb 上传成功');
    res.json(result);

  } catch (error) {
    console.error('imgbb 上传失败');
    res.status(500).json({ 
      error: '上传失败', 
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
