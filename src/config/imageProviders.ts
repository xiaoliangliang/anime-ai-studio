/**
 * 图片生成供应商配置
 * 
 * 支持的供应商:
 * - pollinations: Pollinations API (同步模式，直接返回图片)
 * - runcomfy: RunComfy API (异步模式，需要轮询)
 */

export type ImageProvider = 'pollinations' | 'runcomfy';

export interface ImageProviderConfig {
  /** 供应商标识 */
  id: ImageProvider;
  /** 供应商名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 是否异步模式 */
  isAsync: boolean;
  /** 默认文生图模型 */
  defaultTxt2ImgModel: string;
  /** 默认图生图模型 */
  defaultImg2ImgModel: string;
  /** 支持的文生图模型 */
  txt2ImgModels: string[];
  /** 支持的图生图模型 */
  img2ImgModels: string[];
  /** 批量生成并发数 */
  batchConcurrency: number;
  /** 请求间隔（毫秒） */
  requestInterval: number;
  /** 失败重试次数 */
  maxRetries: number;
  /** 重试间隔（毫秒） */
  retryInterval: number;
}

/** Pollinations 供应商配置 */
export const POLLINATIONS_CONFIG: ImageProviderConfig = {
  id: 'pollinations',
  name: 'Pollinations',
  description: 'Pollinations API - 前端直连模式，绕过 Vercel 超时限制',
  isAsync: false,
  defaultTxt2ImgModel: 'zimage',
  defaultImg2ImgModel: 'seedream',
  txt2ImgModels: ['flux', 'turbo', 'gptimage', 'seedream', 'seedream-pro', 'nanobanana', 'nanobanana-pro', 'zimage'],
  img2ImgModels: ['kontext', 'gptimage', 'seedream', 'seedream-pro', 'nanobanana', 'nanobanana-pro'],
  /** 批量生成并发数（Publishable Key 限流严格，建议 1-2） */
  batchConcurrency: 1,
  /** 请求间隔（毫秒），避免触发限流 */
  requestInterval: 120000,
  /** 失败重试次数 */
  maxRetries: 2,
  /** 重试间隔（毫秒） */
  retryInterval: 5000,
};

/** RunComfy 供应商配置 */
export const RUNCOMFY_CONFIG: ImageProviderConfig = {
  id: 'runcomfy',
  name: 'RunComfy',
  description: 'RunComfy API - 异步模式，高质量 Seedream 4.5',
  isAsync: true,
  defaultTxt2ImgModel: 'seedream-4.5',
  defaultImg2ImgModel: 'seedream-4.5-edit',
  txt2ImgModels: ['seedream-4.5'],
  img2ImgModels: ['seedream-4.5-edit'],
  /** 批量生成并发数（RunComfy 支持较高并发） */
  batchConcurrency: 5,
  /** 请求间隔（毫秒） */
  requestInterval: 0,
  /** 失败重试次数 */
  maxRetries: 1,
  /** 重试间隔（毫秒） */
  retryInterval: 2000,
};

/** 所有供应商配置 */
export const IMAGE_PROVIDERS: Record<ImageProvider, ImageProviderConfig> = {
  pollinations: POLLINATIONS_CONFIG,
  runcomfy: RUNCOMFY_CONFIG,
};

/**
 * 当前激活的图片供应商
 * 可通过环境变量 VITE_IMAGE_PROVIDER 配置
 * 默认使用 pollinations
 */
export const CURRENT_IMAGE_PROVIDER: ImageProvider = 
  (import.meta.env.VITE_IMAGE_PROVIDER as ImageProvider) || 'pollinations';

/**
 * 获取当前供应商配置
 */
export function getCurrentProviderConfig(): ImageProviderConfig {
  return IMAGE_PROVIDERS[CURRENT_IMAGE_PROVIDER];
}

/**
 * 获取指定供应商配置
 */
export function getProviderConfig(provider: ImageProvider): ImageProviderConfig {
  return IMAGE_PROVIDERS[provider];
}
