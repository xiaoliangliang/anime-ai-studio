/**
 * 图片生成服务
 * 调用 /api/txt2img 和 /api/img2img 端点
 */

import { saveAsset, updateAssetCloudUrl } from './storageService';
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
 * 文生图
 */
export async function generateImageFromText(
  projectId: string,
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const {
    prompt,
    width = 1024,
    height = 1024,
    seed,
    model = 'flux',
    enhance = true,
  } = options;

  try {
    // 构建请求 URL
    const params = new URLSearchParams({
      prompt,
      width: String(width),
      height: String(height),
      model,
      enhance: String(enhance),
      nologo: 'true',
    });
    
    if (seed) {
      params.set('seed', String(seed));
    }

    const response = await fetch(`${API_BASE}/api/txt2img?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error('返回非图片内容');
    }

    // 获取图片 blob
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
 * 图生图
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
    seed,
    model = 'kontext',
    enhance = false,
  } = options;

  try {
    const params = new URLSearchParams({
      prompt,
      imageUrl: referenceImageUrl,
      width: String(width),
      height: String(height),
      model,
      enhance: String(enhance),
      nologo: 'true',
    });
    
    if (seed) {
      params.set('seed', String(seed));
    }

    const response = await fetch(`${API_BASE}/api/img2img?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
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
    console.error('图生图失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

/**
 * 批量生成图片
 */
export async function batchGenerateImages(
  projectId: string,
  prompts: Array<{ id: string; prompt: string; referenceUrl?: string }>
): Promise<Map<string, GenerateImageResult>> {
  const results = new Map<string, GenerateImageResult>();

  // 串行生成（MVP 不做并行）
  for (const item of prompts) {
    const result = item.referenceUrl
      ? await generateImageFromImage(projectId, {
          prompt: item.prompt,
          referenceImageUrl: item.referenceUrl,
        })
      : await generateImageFromText(projectId, {
          prompt: item.prompt,
        });

    results.set(item.id, result);

    // 简单的延迟，避免过快请求
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * 上传图片到 imgbb
 */
async function uploadToImgbb(base64Data: string): Promise<string | null> {
  try {
    // 移除 data:image/xxx;base64, 前缀
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

    const formData = new URLSearchParams();
    formData.append('image', cleanBase64);

    const response = await fetch(`${API_BASE}/api/imgbb/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
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
