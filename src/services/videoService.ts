/**
 * 视频生成服务
 * 调用 /api/img2video 端点（seedance 模型）
 */

import { saveAsset } from './storageService';
import type { Asset } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const BATCH_VIDEO_INTERVAL_MS = 180_000;

export interface GenerateVideoOptions {
  prompt: string;
  imageUrl: string;          // 关键帧图片 URL
  duration?: number;         // 视频时长（秒），默认 5
  aspectRatio?: string;      // 宽高比，默认 16:9
  seed?: number;
}

export interface GenerateVideoResult {
  success: boolean;
  asset?: Asset;
  error?: string;
}

/**
 * 图生视频
 */
export async function generateVideoFromImage(
  projectId: string,
  options: GenerateVideoOptions
): Promise<GenerateVideoResult> {
  const {
    prompt,
    imageUrl,
    duration = 5,
    aspectRatio = '16:9',
    seed,
  } = options;

  try {
    // 构建请求 URL
    const params = new URLSearchParams({
      prompt,
      imageUrl,
      duration: String(duration),
      aspectRatio,
      model: 'seedance',
      nologo: 'true',
    });
    
    if (seed) {
      params.set('seed', String(seed));
    }

    console.log('开始生成视频:', { prompt: prompt.slice(0, 50), imageUrl });

    const response = await fetch(`${API_BASE}/api/img2video?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('video/')) {
      const errorText = await response.text();
      console.error('返回非视频内容:', errorText.slice(0, 200));
      throw new Error('返回非视频内容');
    }

    // 获取视频 blob
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    console.log('视频生成成功, 大小:', blob.size, 'bytes');

    // 保存到 IndexedDB（视频仅本地存储，不上传云端）
    const asset = await saveAsset({
      projectId,
      type: 'video',
      mimeType: contentType,
      size: blob.size,
      localData: base64,
      uploadStatus: 'local_only',
      duration,
    });

    return {
      success: true,
      asset,
    };

  } catch (error) {
    console.error('图生视频失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

/**
 * 批量生成视频（逐个生成）
 */
export async function batchGenerateVideos(
  projectId: string,
  shots: Array<{
    id: string;
    prompt: string;
    keyframeUrl: string;
    duration?: number;
  }>
): Promise<Map<string, GenerateVideoResult>> {
  const results = new Map<string, GenerateVideoResult>();

  // 串行生成（MVP 不做并行，视频生成较慢）
  for (const shot of shots) {
    console.log(`生成视频 ${shot.id}...`);
    
    const result = await generateVideoFromImage(projectId, {
      prompt: shot.prompt,
      imageUrl: shot.keyframeUrl,
      duration: shot.duration || 5,
    });

    results.set(shot.id, result);

    // 视频生成需要更长的间隔（避免触发限流）
    if (result.success) {
      await new Promise(resolve => setTimeout(resolve, BATCH_VIDEO_INTERVAL_MS));
    }
  }

  return results;
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
 * 获取视频 URL（本地 base64）
 */
export function getVideoUrl(asset: Asset): string {
  if (asset.localData) {
    return asset.localData;
  }
  return '';
}

/**
 * 获取视频预览信息
 */
export function getVideoInfo(asset: Asset): {
  duration: number;
  size: string;
  mimeType: string;
} {
  return {
    duration: asset.duration || 0,
    size: formatFileSize(asset.size),
    mimeType: asset.mimeType,
  };
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
