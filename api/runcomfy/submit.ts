import type { VercelRequest, VercelResponse } from '@vercel/node';

const RUNCOMFY_API_TOKEN = process.env.RUNCOMFY_API_TOKEN || '';
const RUNCOMFY_API_BASE = 'https://model-api.runcomfy.net/v1';

/**
 * RunComfy 任务提交 API
 * 
 * 支持的任务类型:
 * - txt2img: 文生图 (Seedream 4.5)
 * - img2img: 图生图 (Seedream 4.5 Edit)
 * - ref2video: 多图参考视频 (Seedance 1.0 Lite)
 * 
 * 返回 requestId，前端通过 /api/runcomfy/status 轮询结果
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, ...params } = req.body;

  if (!type) {
    return res.status(400).json({ error: '缺少必要参数: type' });
  }

  console.log(`[RunComfy Submit] 任务类型: ${type}`, params);

  try {
    let apiEndpoint: string;
    let requestBody: Record<string, unknown>;

    switch (type) {
      case 'txt2img': {
        // 文生图 - Seedream 4.5
        const { prompt, resolution = '2048x2048 (1:1)' } = params;
        if (!prompt) {
          return res.status(400).json({ error: '缺少必要参数: prompt' });
        }
        apiEndpoint = `${RUNCOMFY_API_BASE}/models/bytedance/seedream-4-5/text-to-image`;
        requestBody = { prompt, resolution };
        break;
      }

      case 'img2img': {
        // 图生图 - Seedream 4.5 Edit
        const { prompt: editPrompt, images, resolution: editResolution = '2048x2048 (1:1)' } = params;
        if (!editPrompt || !images || !Array.isArray(images) || images.length === 0) {
          return res.status(400).json({ error: '缺少必要参数: prompt 和 images 数组' });
        }
        apiEndpoint = `${RUNCOMFY_API_BASE}/models/bytedance/seedream-4-5/edit`;
        requestBody = { prompt: editPrompt, images, resolution: editResolution };
        break;
      }

      case 'ref2video': {
        // 多图参考视频 - Seedance 1.0 Lite
        const {
          images: videoImages,
          text,
          resolution: videoResolution = '480p',
          ratio = '16:9',
          duration = 5,
          seed,
        } = params;
        if (!videoImages || !Array.isArray(videoImages) || videoImages.length === 0 || videoImages.length > 4) {
          return res.status(400).json({ error: '缺少必要参数: images 数组（1-4张图片）' });
        }
        if (!text) {
          return res.status(400).json({ error: '缺少必要参数: text (提示词)' });
        }
        apiEndpoint = `${RUNCOMFY_API_BASE}/models/bytedance/seedance-1-0/lite/reference-to-video`;
        requestBody = {
          images: videoImages,
          text,
          resolution: videoResolution,
          ratio,
          duration: parseInt(String(duration)),
        };
        if (seed) {
          requestBody.seed = parseInt(String(seed));
        }
        break;
      }

      default:
        return res.status(400).json({ error: `不支持的任务类型: ${type}` });
    }

    console.log(`[RunComfy Submit] 请求端点: ${apiEndpoint}`);

    // 提交任务到 RunComfy
    const submitResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error('[RunComfy Submit] 提交失败:', errorText);
      return res.status(submitResponse.status).json({
        error: 'RunComfy API 提交任务失败',
        details: errorText
      });
    }

    const submitResult = await submitResponse.json();
    const requestId = submitResult.request_id;

    if (!requestId) {
      console.error('[RunComfy Submit] 未返回 request_id:', submitResult);
      return res.status(500).json({ error: '未获取到任务ID', details: submitResult });
    }

    console.log(`[RunComfy Submit] 任务提交成功, requestId: ${requestId}`);

    // 立即返回 requestId，不等待任务完成
    res.json({
      success: true,
      requestId,
      type,
      status: 'submitted',
    });

  } catch (error) {
    console.error('[RunComfy Submit] 请求失败:', error);
    res.status(500).json({
      error: '提交任务失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
