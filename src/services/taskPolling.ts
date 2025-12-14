/**
 * 任务轮询工具
 * 
 * 用于轮询 RunComfy 异步任务的状态
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/** 任务类型 */
export type TaskType = 'txt2img' | 'img2img' | 'ref2video';

/** 任务状态 */
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/** 任务提交参数 */
export interface SubmitTaskParams {
  type: TaskType;
  [key: string]: unknown;
}

/** 任务提交响应 */
export interface SubmitTaskResponse {
  success: boolean;
  requestId: string;
  type: TaskType;
  status: string;
}

/** 任务状态响应 */
export interface TaskStatusResponse {
  requestId: string;
  status: TaskStatus;
  rawStatus: string;
  result?: {
    imageUrl?: string;
    videoUrl?: string;
    output?: unknown;
  };
  error?: string;
}

/** 轮询选项 */
export interface PollOptions {
  /** 最大轮询次数，默认 180（约3分钟） */
  maxAttempts?: number;
  /** 轮询间隔（毫秒），默认 1000 */
  interval?: number;
  /** 进度回调 */
  onProgress?: (status: TaskStatus, attempt: number, maxAttempts: number) => void;
  /** 取消信号 */
  abortSignal?: AbortSignal;
}

/** 轮询结果 */
export interface PollResult {
  success: boolean;
  status: TaskStatus;
  result?: TaskStatusResponse['result'];
  error?: string;
}

/**
 * 提交任务到 RunComfy
 */
export async function submitTask(params: SubmitTaskParams): Promise<SubmitTaskResponse> {
  const response = await fetch(`${API_BASE}/api/runcomfy/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error || '提交任务失败');
  }

  return response.json();
}

/**
 * 查询任务状态
 */
export async function queryTaskStatus(
  requestId: string,
  type?: TaskType
): Promise<TaskStatusResponse> {
  const params = new URLSearchParams({ requestId });
  if (type) {
    params.set('type', type);
  }

  const response = await fetch(`${API_BASE}/api/runcomfy/status?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error || '查询任务状态失败');
  }

  return response.json();
}

/**
 * 轮询任务直到完成
 */
export async function pollTaskUntilComplete(
  requestId: string,
  type: TaskType,
  options: PollOptions = {}
): Promise<PollResult> {
  const {
    maxAttempts = 180,
    interval = 1000,
    onProgress,
    abortSignal,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 检查是否取消
    if (abortSignal?.aborted) {
      return {
        success: false,
        status: 'cancelled',
        error: '用户取消',
      };
    }

    try {
      const statusResponse = await queryTaskStatus(requestId, type);
      const { status, result, error } = statusResponse;

      // 触发进度回调
      onProgress?.(status, attempt, maxAttempts);

      // 检查最终状态
      if (status === 'completed') {
        return {
          success: true,
          status,
          result,
        };
      }

      if (status === 'failed') {
        return {
          success: false,
          status,
          error: error || '任务执行失败',
        };
      }

      if (status === 'cancelled') {
        return {
          success: false,
          status,
          error: '任务已取消',
        };
      }

      // 继续轮询
      await new Promise(resolve => setTimeout(resolve, interval));

    } catch (err) {
      console.error(`[pollTaskUntilComplete] 轮询出错 (${attempt}/${maxAttempts}):`, err);
      
      // 网络错误时继续重试
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, interval * 2));
        continue;
      }

      return {
        success: false,
        status: 'failed',
        error: err instanceof Error ? err.message : '轮询失败',
      };
    }
  }

  // 超过最大轮询次数
  return {
    success: false,
    status: 'failed',
    error: '任务超时',
  };
}

/**
 * 提交任务并等待完成（便捷方法）
 */
export async function submitAndWait(
  params: SubmitTaskParams,
  options: PollOptions = {}
): Promise<PollResult & { requestId?: string }> {
  try {
    // 1. 提交任务
    const submitResponse = await submitTask(params);
    
    if (!submitResponse.success || !submitResponse.requestId) {
      return {
        success: false,
        status: 'failed',
        error: '提交任务失败',
      };
    }

    const { requestId, type } = submitResponse;

    // 2. 轮询等待完成
    const result = await pollTaskUntilComplete(requestId, type, options);

    return {
      ...result,
      requestId,
    };

  } catch (err) {
    return {
      success: false,
      status: 'failed',
      error: err instanceof Error ? err.message : '提交任务失败',
    };
  }
}
