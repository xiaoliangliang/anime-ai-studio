/**
 * 图片生成服务
 * 
 * 支持两种供应商:
 * - Pollinations: 前端直连模式，绕过 Vercel 超时限制
 * - RunComfy: 异步模式，需要轮询任务状态
 * 
 * 通过 VITE_IMAGE_PROVIDER 环境变量切换供应商
 */

import { saveAsset, updateAssetCloudUrl } from './storageService';
import { submitAndWait } from './taskPolling';
import { CURRENT_IMAGE_PROVIDER, getCurrentProviderConfig, getProviderConfig, type ImageProvider } from '@/config/imageProviders';
import type { Asset } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/** Pollinations API 配置 */
const POLLINATIONS_API_BASE = 'https://gen.pollinations.ai';
const POLLINATIONS_API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY || '';

export interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  enhance?: boolean;
  referenceImageUrl?: string;  // 用于 img2img
  /** 指定供应商，不传则使用默认配置 */
  provider?: ImageProvider;
}

export interface GenerateImageResult {
  success: boolean;
  asset?: Asset;
  cloudUrl?: string;
  error?: string;
}

/**
 * 文生图 - 根据供应商自动选择实现
 */
export async function generateImageFromText(
  projectId: string,
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const provider = options.provider || CURRENT_IMAGE_PROVIDER;
  
  if (provider === 'pollinations') {
    return generateImageFromTextPollinations(projectId, options);
  } else {
    return generateImageFromTextRunComfy(projectId, options);
  }
}

/**
 * 图生图 - 根据供应商自动选择实现
 */
export async function generateImageFromImage(
  projectId: string,
  options: GenerateImageOptions & { referenceImageUrl: string }
): Promise<GenerateImageResult> {
  const provider = options.provider || CURRENT_IMAGE_PROVIDER;
  
  if (provider === 'pollinations') {
    return generateImageFromImagePollinations(projectId, options);
  } else {
    return generateImageFromImageRunComfy(projectId, options);
  }
}

// ============== Pollinations 实现 (前端直连) ==============

/**
 * 文生图 - Pollinations API (前端直连，绕过 Vercel 超时)
 */
async function generateImageFromTextPollinations(
  projectId: string,
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const {
    prompt,
    width = 1024,
    height = 1024,
    seed,
    model,
    enhance = true,
  } = options;

  const config = getCurrentProviderConfig();
  const actualModel = model || config.defaultTxt2ImgModel;

  try {
    // 构建 Pollinations API URL（前端直连）
    const params = new URLSearchParams({
      model: actualModel,
      width: String(width),
      height: String(height),
      enhance: String(enhance),
      nologo: 'true',
      safe: 'false',
    });
    
    if (seed !== undefined) {
      params.set('seed', String(seed));
    } else {
      params.set('seed', String(Math.floor(Math.random() * 1000000)));
    }

    // 如果有 API Key，添加到参数中（Publishable Key 可以暴露在前端）
    if (POLLINATIONS_API_KEY) {
      params.set('key', POLLINATIONS_API_KEY);
    }

    const apiUrl = `${POLLINATIONS_API_BASE}/image/${encodeURIComponent(prompt)}?${params.toString()}`;
    
    console.log('[Pollinations] 文生图请求:', apiUrl.substring(0, 150) + '...');

    // 前端直接请求 Pollinations API
    const response = await fetch(apiUrl, {
      method: 'GET',
      // 不设置 Authorization header，使用 query param 的 key
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Pollinations] API 错误:', errorText);
      throw new Error(`Pollinations API 错误: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      const errorText = await response.text();
      console.error('[Pollinations] 返回非图片内容:', errorText);
      throw new Error('返回非图片内容');
    }

    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    // 保存到 IndexedDB
    const asset = await saveAsset({
      projectId,
      type: 'image',
      mimeType: contentType,
      size: blob.size,
      localData: base64,
      uploadStatus: 'pending',
    });

    // 上传到 imgbb（用于后续 AI 引用）
    const cloudUrl = await uploadToImgbb(base64);
    if (cloudUrl) {
      await updateAssetCloudUrl(asset.id, cloudUrl);
      asset.cloudUrl = cloudUrl;
      asset.uploadStatus = 'uploaded';
    }

    return {
      success: true,
      asset,
      cloudUrl: cloudUrl || undefined,
    };

  } catch (error) {
    console.error('[Pollinations] 文生图失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

/**
 * 图生图 - Pollinations API (前端直连，绕过 Vercel 超时)
 */
async function generateImageFromImagePollinations(
  projectId: string,
  options: GenerateImageOptions & { referenceImageUrl: string }
): Promise<GenerateImageResult> {
  const {
    prompt,
    referenceImageUrl,
    width = 1024,
    height = 1024,
    seed,
    model,
    enhance = false,
  } = options;

  const config = getCurrentProviderConfig();
  const actualModel = model || config.defaultImg2ImgModel;

  try {
    // 构建 Pollinations API URL（前端直连）
    const params = new URLSearchParams({
      model: actualModel,
      image: referenceImageUrl,
      width: String(width),
      height: String(height),
      enhance: String(enhance),
      nologo: 'true',
      safe: 'false',
      quality: 'medium',
    });
    
    if (seed !== undefined) {
      params.set('seed', String(seed));
    } else {
      params.set('seed', String(Math.floor(Math.random() * 1000000)));
    }

    // 如果有 API Key，添加到参数中
    if (POLLINATIONS_API_KEY) {
      params.set('key', POLLINATIONS_API_KEY);
    }

    const apiUrl = `${POLLINATIONS_API_BASE}/image/${encodeURIComponent(prompt)}?${params.toString()}`;
    
    console.log('[Pollinations] 图生图请求:', apiUrl.substring(0, 150) + '...');

    const response = await fetch(apiUrl, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Pollinations] API 错误:', errorText);
      throw new Error(`Pollinations API 错误: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      const errorText = await response.text();
      console.error('[Pollinations] 返回非图片内容:', errorText);
      throw new Error('返回非图片内容');
    }

    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    const asset = await saveAsset({
      projectId,
      type: 'image',
      mimeType: contentType,
      size: blob.size,
      localData: base64,
      uploadStatus: 'pending',
    });

    const cloudUrl = await uploadToImgbb(base64);
    if (cloudUrl) {
      await updateAssetCloudUrl(asset.id, cloudUrl);
      asset.cloudUrl = cloudUrl;
      asset.uploadStatus = 'uploaded';
    }

    return {
      success: true,
      asset,
      cloudUrl: cloudUrl || undefined,
    };

  } catch (error) {
    console.error('[Pollinations] 图生图失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

// ============== RunComfy 实现 ==============

/**
 * 文生图 - RunComfy API (异步模式)
 */
async function generateImageFromTextRunComfy(
  projectId: string,
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const {
    prompt,
    width = 1024,
    height = 1024,
  } = options;

  const resolution = getRunComfyResolution(width, height);

  try {
    const pollResult = await submitAndWait(
      {
        type: 'txt2img',
        prompt,
        resolution,
      },
      {
        maxAttempts: 120,
        interval: 1000,
      }
    );

    if (!pollResult.success || !pollResult.result?.imageUrl) {
      throw new Error(pollResult.error || '图片生成失败');
    }

    const imageUrl = pollResult.result.imageUrl;

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('下载图片失败');
    }

    const blob = await imageResponse.blob();
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    const base64 = await blobToBase64(blob);

    const asset = await saveAsset({
      projectId,
      type: 'image',
      mimeType: contentType,
      size: blob.size,
      localData: base64,
      uploadStatus: 'pending',
    });

    const cloudUrl = await uploadToImgbb(base64);
    if (cloudUrl) {
      await updateAssetCloudUrl(asset.id, cloudUrl);
      asset.cloudUrl = cloudUrl;
      asset.uploadStatus = 'uploaded';
    }

    return {
      success: true,
      asset,
      cloudUrl: cloudUrl || undefined,
    };

  } catch (error) {
    console.error('[RunComfy] 文生图失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

/**
 * 图生图 - RunComfy API (异步模式)
 */
async function generateImageFromImageRunComfy(
  projectId: string,
  options: GenerateImageOptions & { referenceImageUrl: string }
): Promise<GenerateImageResult> {
  const {
    prompt,
    referenceImageUrl,
    width = 1024,
    height = 1024,
  } = options;

  const resolution = getRunComfyResolution(width, height);

  try {
    const pollResult = await submitAndWait(
      {
        type: 'img2img',
        prompt,
        images: [referenceImageUrl],
        resolution,
      },
      {
        maxAttempts: 120,
        interval: 1000,
      }
    );

    if (!pollResult.success || !pollResult.result?.imageUrl) {
      throw new Error(pollResult.error || '图片生成失败');
    }

    const imageUrl = pollResult.result.imageUrl;

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('下载图片失败');
    }

    const blob = await imageResponse.blob();
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    const base64 = await blobToBase64(blob);

    const asset = await saveAsset({
      projectId,
      type: 'image',
      mimeType: contentType,
      size: blob.size,
      localData: base64,
      uploadStatus: 'pending',
    });

    const cloudUrl = await uploadToImgbb(base64);
    if (cloudUrl) {
      await updateAssetCloudUrl(asset.id, cloudUrl);
      asset.cloudUrl = cloudUrl;
      asset.uploadStatus = 'uploaded';
    }

    return {
      success: true,
      asset,
      cloudUrl: cloudUrl || undefined,
    };

  } catch (error) {
    console.error('[RunComfy] 图生图失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

// ============== 批量生成 ==============

/** 批量生成项的进度回调 */
export interface BatchProgressCallback {
  (progress: {
    completed: number;
    total: number;
    currentId: string;
    success: boolean;
    error?: string;
  }): void;
}

/** 延迟函数 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 带重试的单张图片生成
 */
async function generateWithRetry(
  projectId: string,
  options: GenerateImageOptions,
  config: ReturnType<typeof getCurrentProviderConfig>
): Promise<GenerateImageResult> {
  const { maxRetries, retryInterval } = config;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await generateImageFromText(projectId, options);
    
    if (result.success) {
      return result;
    }
    
    // 如果是 429 限流错误，等待更长时间
    const isRateLimited = result.error?.includes('429') || result.error?.includes('Rate limit');
    const isConnectionError = result.error?.includes('Failed to fetch') || result.error?.includes('CONNECTION');
    
    if (attempt < maxRetries && (isRateLimited || isConnectionError)) {
      const waitTime = isRateLimited ? retryInterval * 2 : retryInterval;
      console.log(`[Retry] 第 ${attempt + 1} 次重试，等待 ${waitTime}ms...`);
      await delay(waitTime);
      continue;
    }
    
    return result;
  }
  
  return { success: false, error: '重试次数已用尽' };
}

/**
 * 批量并行生成图片（文生图）
 * 根据供应商配置自动调整并发和间隔
 */
export async function batchGenerateImagesFromText(
  projectId: string,
  prompts: Array<{ id: string; prompt: string; name?: string }>,
  options: {
    concurrency?: number;
    width?: number;
    height?: number;
    provider?: ImageProvider;
    onProgress?: BatchProgressCallback;
  } = {}
): Promise<Map<string, GenerateImageResult>> {
  const provider = options.provider || CURRENT_IMAGE_PROVIDER;
  const config = getProviderConfig(provider);
  
  // 使用配置的并发数，除非明确指定
  const concurrency = options.concurrency ?? config.batchConcurrency;
  const { width, height, onProgress } = options;
  const { requestInterval } = config;
  
  const results = new Map<string, GenerateImageResult>();
  let completed = 0;
  const total = prompts.length;

  console.log(`[Batch] 开始批量生成，供应商: ${provider}, 并发: ${concurrency}, 间隔: ${requestInterval}ms`);

  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (item, index) => {
      // 批次内添加间隔，避免同时发起请求
      if (index > 0 && requestInterval > 0) {
        await delay(index * requestInterval);
      }
      
      try {
        const result = await generateWithRetry(
          projectId,
          { prompt: item.prompt, width, height, provider },
          config
        );
        results.set(item.id, result);
        completed++;
        onProgress?.({
          completed,
          total,
          currentId: item.id,
          success: result.success,
          error: result.error,
        });
        return result;
      } catch (error) {
        const errorResult: GenerateImageResult = {
          success: false,
          error: error instanceof Error ? error.message : '生成失败',
        };
        results.set(item.id, errorResult);
        completed++;
        onProgress?.({
          completed,
          total,
          currentId: item.id,
          success: false,
          error: errorResult.error,
        });
        return errorResult;
      }
    });

    await Promise.all(batchPromises);
    
    // 批次之间添加间隔
    if (i + concurrency < prompts.length && requestInterval > 0) {
      await delay(requestInterval);
    }
  }

  return results;
}

/**
 * 批量并行生成图片（图生图）
 * 根据供应商配置自动调整并发和间隔
 */
export async function batchGenerateImagesFromImage(
  projectId: string,
  prompts: Array<{ id: string; prompt: string; referenceUrl: string; name?: string }>,
  options: {
    concurrency?: number;
    width?: number;
    height?: number;
    provider?: ImageProvider;
    onProgress?: BatchProgressCallback;
  } = {}
): Promise<Map<string, GenerateImageResult>> {
  const provider = options.provider || CURRENT_IMAGE_PROVIDER;
  const config = getProviderConfig(provider);
  
  const concurrency = options.concurrency ?? config.batchConcurrency;
  const { width, height, onProgress } = options;
  const { requestInterval } = config;
  
  const results = new Map<string, GenerateImageResult>();
  let completed = 0;
  const total = prompts.length;

  console.log(`[Batch] 开始批量图生图，供应商: ${provider}, 并发: ${concurrency}, 间隔: ${requestInterval}ms`);

  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (item, index) => {
      if (index > 0 && requestInterval > 0) {
        await delay(index * requestInterval);
      }
      
      try {
        const result = await generateImageFromImage(projectId, {
          prompt: item.prompt,
          referenceImageUrl: item.referenceUrl,
          width,
          height,
          provider,
        });
        results.set(item.id, result);
        completed++;
        onProgress?.({
          completed,
          total,
          currentId: item.id,
          success: result.success,
          error: result.error,
        });
        return result;
      } catch (error) {
        const errorResult: GenerateImageResult = {
          success: false,
          error: error instanceof Error ? error.message : '生成失败',
        };
        results.set(item.id, errorResult);
        completed++;
        onProgress?.({
          completed,
          total,
          currentId: item.id,
          success: false,
          error: errorResult.error,
        });
        return errorResult;
      }
    });

    await Promise.all(batchPromises);
    
    if (i + concurrency < prompts.length && requestInterval > 0) {
      await delay(requestInterval);
    }
  }

  return results;
}

// ============== 工具函数 ==============

/**
 * 根据宽高获取 RunComfy 支持的分辨率
 */
function getRunComfyResolution(width: number, height: number): string {
  const ratio = width / height;
  
  if (ratio > 2.2) return '3024x1296 (21:9)';
  if (ratio > 1.6) return '2560x1440 (16:9)';
  if (ratio > 1.4) return '2496x1664 (3:2)';
  if (ratio > 1.2) return '2304x1728 (4:3)';
  if (ratio > 0.85) return '2048x2048 (1:1)';
  if (ratio > 0.7) return '1728x2304 (3:4)';
  if (ratio > 0.6) return '1664x2496 (2:3)';
  return '1440x2560 (9:16)';
}

/**
 * 上传图片到 imgbb
 */
async function uploadToImgbb(base64Data: string): Promise<string | null> {
  try {
    const base64Match = base64Data.match(/^data:image\/[^;]+;base64,(.+)$/);
    const cleanBase64 = base64Match ? base64Match[1] : base64Data;

    const response = await fetch(`${API_BASE}/api/imgbb/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `image=${encodeURIComponent(cleanBase64)}`,
    });

    const result = await response.json();

    if (result.success && result.data?.url) {
      return result.data.url;
    }

    console.warn('imgbb 上传失败:', result);
    return null;

  } catch (error) {
    console.error('上传到 imgbb 失败:', error);
    return null;
  }
}

/**
 * Blob 转 Base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 获取图片 URL（优先云端，回退本地）
 */
export function getImageUrl(asset: Asset): string {
  if (asset.cloudUrl) {
    return asset.cloudUrl;
  }
  if (asset.imgbbUrl) {
    return asset.imgbbUrl;
  }
  if (asset.localData) {
    return asset.localData;
  }
  return '';
}

/**
 * 获取当前图片供应商
 */
export function getCurrentImageProvider(): ImageProvider {
  return CURRENT_IMAGE_PROVIDER;
}

/**
 * 获取当前供应商配置
 */
export { getCurrentProviderConfig } from '@/config/imageProviders';
