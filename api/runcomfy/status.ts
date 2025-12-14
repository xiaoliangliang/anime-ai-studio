import type { VercelRequest, VercelResponse } from '@vercel/node';

const RUNCOMFY_API_TOKEN = process.env.RUNCOMFY_API_TOKEN || '';
const RUNCOMFY_API_BASE = 'https://model-api.runcomfy.net/v1';

/**
 * RunComfy 任务状态查询 API
 * 
 * 查询参数:
 * - requestId: 任务ID (必需)
 * - type: 任务类型 (可选，用于解析输出)
 * 
 * 返回状态:
 * - in_queue: 排队中
 * - in_progress: 处理中
 * - completed: 已完成
 * - failed: 失败
 * - cancelled: 已取消
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { requestId, type } = req.query;

  if (!requestId) {
    return res.status(400).json({ error: '缺少必要参数: requestId' });
  }

  try {
    // 第一步：查询任务状态
    const statusResponse = await fetch(
      `${RUNCOMFY_API_BASE}/requests/${requestId}/status`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
        },
      }
    );

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('[RunComfy Status] 查询状态失败:', errorText);
      return res.status(statusResponse.status).json({
        error: '查询任务状态失败',
        details: errorText
      });
    }

    const statusResult = await statusResponse.json();

    // 映射状态
    let taskStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    switch (statusResult.status) {
      case 'in_queue':
        taskStatus = 'pending';
        break;
      case 'in_progress':
        taskStatus = 'processing';
        break;
      case 'completed':
        taskStatus = 'completed';
        break;
      case 'failed':
        taskStatus = 'failed';
        break;
      case 'cancelled':
        taskStatus = 'cancelled';
        break;
      default:
        taskStatus = 'pending';
    }

    // 构建响应
    const response: Record<string, unknown> = {
      requestId,
      status: taskStatus,
      rawStatus: statusResult.status,
    };

    // 第二步：只有任务完成时才查询结果
    if (taskStatus === 'completed') {
      const resultResponse = await fetch(
        `${RUNCOMFY_API_BASE}/requests/${requestId}/result`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${RUNCOMFY_API_TOKEN}`,
          },
        }
      );

      if (resultResponse.ok) {
        const resultData = await resultResponse.json();
        const output = resultData.output;

        if (type === 'txt2img' || type === 'img2img') {
          // 图片任务
          const imageUrl = output?.image || (output?.images && output.images[0]);
          response.result = {
            imageUrl,
            output,
          };
        } else if (type === 'ref2video') {
          // 视频任务
          const videoUrl = output?.video || (output?.videos && output.videos[0]);
          response.result = {
            videoUrl,
            output,
          };
        } else {
          // 未知类型，返回原始输出
          response.result = { output };
        }
      } else {
        console.error('[RunComfy Status] 获取结果失败');
      }
    }

    // 如果任务失败，返回错误信息
    if (taskStatus === 'failed') {
      response.error = statusResult.error || '任务执行失败';
    }

    res.json(response);

  } catch (error) {
    console.error('[RunComfy Status] 请求失败:', error);
    res.status(500).json({
      error: '查询状态失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
