/**
 * 视频生成供应商配置
 * 
 * 支持的供应商:
 * - runcomfy: RunComfy API (异步模式，通过 /api/runcomfy/* 代理)
 * - pollinations: Pollinations API (同步直连模式，前端直接请求)
 * 
 * 设计说明:
 * - runcomfy（默认）: 前端调用 /api/runcomfy/submit + /api/runcomfy/status（异步轮询），
 *   服务端使用 RUNCOMFY_API_TOKEN 鉴权，前端无需密钥
 * - pollinations: 前端直连 https://gen.pollinations.ai/image/{prompt}，
 *   必须通过 query param key=... 传递 VITE_POLLINATIONS_API_KEY（pk_ 开头）
 */

export type VideoProvider = 'runcomfy' | 'pollinations';

export interface VideoProviderConfig {
  /** 供应商标识 */
  id: VideoProvider;
  /** 供应商名称 */
  name: string;
  /** 描述 */
  description: string;
  /** API 基础 URL */
  apiBaseUrl: string;
  /** 默认模型 */
  defaultModel: string;
  /** 支持的模型列表 */
  supportedModels: string[];
  /** 默认时长（秒） */
  defaultDuration: number;
  /** 最小时长（秒） */
  minDuration: number;
  /** 最大时长（秒） */
  maxDuration: number;
  /** 支持的宽高比 */
  supportedAspectRatios: string[];
  /** 默认宽高比 */
  defaultAspectRatio: string;
  /** 请求间隔（毫秒） */
  requestInterval: number;
  /** 失败重试次数 */
  maxRetries: number;
  /** 是否默认去水印（nologo=true） */
  defaultNologo?: boolean;
  /** 是否默认不进入公共 feed（private=true, nofeed=true） */
  defaultNoFeed?: boolean;
  /** 客户端密钥（pollinations 必需，pk_ 开头） */
  clientKey?: string;
}

/**
 * RunComfy 供应商配置（现有默认实现）
 * 走后端代理 /api/runcomfy/*，服务端鉴权
 */
export const RUNCOMFY_VIDEO_CONFIG: VideoProviderConfig = {
  id: 'runcomfy',
  name: 'RunComfy',
  description: '现有用户侧视频生成：前端调用 /api/runcomfy/submit + /api/runcomfy/status（异步轮询）',
  apiBaseUrl: '', // 使用 VITE_API_BASE_URL
  defaultModel: 'seedance-1.0-lite',
  supportedModels: ['seedance-1.0-lite'],
  defaultDuration: 5,
  minDuration: 2,
  maxDuration: 12,
  supportedAspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
  defaultAspectRatio: '16:9',
  requestInterval: 500, // 成功后等待 500ms
  maxRetries: 1,
};

/**
 * Pollinations 供应商配置（新增）
 * 前端直连 https://gen.pollinations.ai，使用 Seedance Lite（model=seedance）
 */
export const POLLINATIONS_VIDEO_CONFIG: VideoProviderConfig = {
  id: 'pollinations',
  name: 'Pollinations (Seedance)',
  description: '新增：前端直连 Pollinations /image/{prompt}，使用 Seedance Lite（model=seedance）',
  apiBaseUrl: 'https://gen.pollinations.ai',
  defaultModel: 'seedance',
  supportedModels: ['seedance'],
  defaultDuration: 5,
  minDuration: 2,
  maxDuration: 10,
  supportedAspectRatios: ['16:9', '9:16'],
  defaultAspectRatio: '16:9',
  // pk_ key 限流严格：默认 10min 间隔（可配置）
  requestInterval: 600000,
  maxRetries: 2,
  defaultNologo: true,
  defaultNoFeed: true,
  clientKey: import.meta.env.VITE_POLLINATIONS_API_KEY || '',
};

/** 所有视频供应商配置 */
export const VIDEO_PROVIDERS: Record<VideoProvider, VideoProviderConfig> = {
  runcomfy: RUNCOMFY_VIDEO_CONFIG,
  pollinations: POLLINATIONS_VIDEO_CONFIG,
};

/**
 * 当前激活的视频供应商
 * 可通过环境变量 VITE_VIDEO_PROVIDER 配置
 * 默认使用 runcomfy
 */
export const CURRENT_VIDEO_PROVIDER: VideoProvider = 
  (import.meta.env.VITE_VIDEO_PROVIDER as VideoProvider) || 'runcomfy';

/**
 * 获取当前视频供应商配置
 */
export function getCurrentVideoProviderConfig(): VideoProviderConfig {
  return VIDEO_PROVIDERS[CURRENT_VIDEO_PROVIDER];
}

/**
 * 获取指定视频供应商配置
 */
export function getVideoProviderConfig(provider: VideoProvider): VideoProviderConfig {
  return VIDEO_PROVIDERS[provider];
}

/**
 * 验证 Pollinations 客户端密钥是否已配置
 * 当供应商为 pollinations 时，必须配置 VITE_POLLINATIONS_API_KEY
 */
export function validatePollinationsKey(): { valid: boolean; error?: string } {
  const config = POLLINATIONS_VIDEO_CONFIG;
  if (!config.clientKey || config.clientKey.trim() === '') {
    return {
      valid: false,
      error: '未配置 VITE_POLLINATIONS_API_KEY，无法使用 Pollinations 视频生成',
    };
  }
  return { valid: true };
}

/**
 * 检查当前供应商是否可用
 * - runcomfy: 始终可用（服务端鉴权）
 * - pollinations: 需要配置 clientKey
 */
export function isCurrentProviderAvailable(): { available: boolean; error?: string } {
  const provider = CURRENT_VIDEO_PROVIDER;
  
  if (provider === 'pollinations') {
    const keyValidation = validatePollinationsKey();
    if (!keyValidation.valid) {
      return { available: false, error: keyValidation.error };
    }
  }
  
  return { available: true };
}
