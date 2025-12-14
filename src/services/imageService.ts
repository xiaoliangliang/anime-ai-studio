/**
 * 图片生成服务
 * 使用 RunComfy 异步任务模式
 */

import { saveAsset, updateAssetCloudUrl } from './storageService';
import { submitAndWait } from './taskPolling';
import type { Asset } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  enhance?: boolean;
  referenceImageUrl?: string;  // 用于 img2img
}

export interface GenerateImageResult {
  success: boolean;
  asset?: Asset;
  cloudUrl?: string;
  error?: string;
}

/**
 * 文生图 - 使用 RunComfy Seedream 4.5 API（异步模式）
 */
export async function generateImageFromText(
  projectId: string,
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const {
    prompt,
    width = 1024,
    height = 1024,
  } = options;

  // 根据宽高选择合适的分辨率
  const resolution = getRunComfyResolution(width, height);

  try {
    // 使用异步模式：提交任务 + 轮询等待
    const pollResult = await submitAndWait(
      {
        type: 'txt2img',
        prompt,
        resolution,
      },
      {
        maxAttempts: 120, // 约2分钟
        interval: 1000,
      }
    );

    if (!pollResult.success || !pollResult.result?.imageUrl) {
      throw new Error(pollResult.error || '图片生成失败');
    }

    const imageUrl = pollResult.result.imageUrl;

    // 下载图片并保存
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('下载图片失败');
    }

    const blob = await imageResponse.blob();
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
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

    // 上传到 imgbb
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
    console.error('文生图失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

/**
 * 图生图 - 使用 RunComfy Seedream 4.5 Edit API（异步模式）
 */
export async function generateImageFromImage(
  projectId: string,
  options: GenerateImageOptions & { referenceImageUrl: string }
): Promise<GenerateImageResult> {
  const {
    prompt,
    referenceImageUrl,
    width = 1024,
    height = 1024,
  } = options;

  // 根据宽高选择合适的分辨率
  const resolution = getRunComfyResolution(width, height);

  try {
    // 使用异步模式：提交任务 + 轮询等待
    const pollResult = await submitAndWait(
      {
        type: 'img2img',
        prompt,
        images: [referenceImageUrl],
        resolution,
      },
      {
        maxAttempts: 120, // 约2分钟
        interval: 1000,
      }
    );

    if (!pollResult.success || !pollResult.result?.imageUrl) {
      throw new Error(pollResult.error || '图片生成失败');
    }

    const imageUrl = pollResult.result.imageUrl;

    // 下载图片并保存
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
    console.error('图生图失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

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

/**
 * 批量并行生成图片（文生图）
 * 支持并发控制和进度回调
 */
export async function batchGenerateImagesFromText(
  projectId: string,
  prompts: Array<{ id: string; prompt: string; name?: string }>,
  options: {
    concurrency?: number;
    width?: number;
    height?: number;
    onProgress?: BatchProgressCallback;
  } = {}
): Promise<Map<string, GenerateImageResult>> {
  const { concurrency = 5, width, height, onProgress } = options;
  const results = new Map<string, GenerateImageResult>();
  let completed = 0;
  const total = prompts.length;

  // 分批并行生成
  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const result = await generateImageFromText(projectId, {
          prompt: item.prompt,
          width,
          height,
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
  }

  return results;
}

/**
 * 批量并行生成图片（图生图）
 * 支持并发控制和进度回调
 */
export async function batchGenerateImagesFromImage(
  projectId: string,
  prompts: Array<{ id: string; prompt: string; referenceUrl: string; name?: string }>,
  options: {
    concurrency?: number;
    width?: number;
    height?: number;
    onProgress?: BatchProgressCallback;
  } = {}
): Promise<Map<string, GenerateImageResult>> {
  const { concurrency = 5, width, height, onProgress } = options;
  const results = new Map<string, GenerateImageResult>();
  let completed = 0;
  const total = prompts.length;

  // 分批并行生成
  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const result = await generateImageFromImage(projectId, {
          prompt: item.prompt,
          referenceImageUrl: item.referenceUrl,
          width,
          height,
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
  }

  return results;
}

/**
 * 根据宽高获取 RunComfy 支持的分辨率
 */
function getRunComfyResolution(width: number, height: number): string {
  const ratio = width / height;
  
  // 根据宽高比选择最接近的分辨率
  if (ratio > 2.2) return '3024x1296 (21:9)';  // 21:9 超宽屏
  if (ratio > 1.6) return '2560x1440 (16:9)';  // 16:9 宽屏
  if (ratio > 1.4) return '2496x1664 (3:2)';   // 3:2
  if (ratio > 1.2) return '2304x1728 (4:3)';   // 4:3
  if (ratio > 0.85) return '2048x2048 (1:1)';  // 1:1 方形
  if (ratio > 0.7) return '1728x2304 (3:4)';   // 3:4 竖屏
  if (ratio > 0.6) return '1664x2496 (2:3)';   // 2:3
  return '1440x2560 (9:16)';                    // 9:16 竖屏
}

/**
 * 上传图片到 imgbb
 */
async function uploadToImgbb(base64Data: string): Promise<string | null> {
  try {
    // 移除 data:image/xxx;base64, 前缀
    const base64Match = base64Data.match(/^data:image\/[^;]+;base64,(.+)$/);
    const cleanBase64 = base64Match ? base64Match[1] : base64Data;

    // 使用 urlencoded 格式发送，与 budemo 保持一致
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
