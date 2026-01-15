/**
 * 导演阶段视频生成服务
 * 支持多供应商：RunComfy（默认）和 Pollinations（可选）
 * 
 * 工作流程：
 * 1. 从分镜数据获取每个镜头的：镜号、地点、画面内容、景别、机位、运镜、时长、负责人
 * 2. 从美工数据获取：角色参考图、场景参考图、关键帧图片
 * 3. 构建提示词：图1是{人物}，图2是{地点}，图3是关键帧。{画面内容}，{景别}，{机位}，{运镜}
 * 4. 根据配置选择供应商调用 API 生成视频
 * 
 * 供应商说明：
 * - runcomfy（默认）: 前端调用 /api/runcomfy/submit + /api/runcomfy/status（异步轮询）
 * - pollinations: 前端直连 https://gen.pollinations.ai/image/{prompt}，同步返回视频
 */

import { saveAsset, getAsset, updateProject, getProject } from './storageService';
import { submitAndWait } from './taskPolling';
import {
  CURRENT_VIDEO_PROVIDER,
  getCurrentVideoProviderConfig,
  isCurrentProviderAvailable,
  type VideoProvider,
  type VideoProviderConfig,
} from '@/config/videoProviders';
import type { 
  Project, 
  Shot, 
  GeneratedVideo,
  GeneratedImage,
  StoryboardData,
  ArtistData,
  DirectorData,
} from '@/types';

// ===== 类型定义 =====

/** 视频生成参数 */
export interface VideoGenerationParams {
  shotId: string;
  shotNumber: string;
  images: string[];           // 1-4张参考图片URL（RunComfy限制）
  text: string;               // 提示词（含参考图片说明）
  duration: number;           // 视频时长 2-12秒
  resolution: '480p' | '720p';
  ratio: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
  seed?: number;
}

/** 视频错误详情 */
export interface VideoErrorDetails {
  httpStatus?: number;
  contentType?: string;
  rawError?: string;
  provider?: VideoProvider;
}

/** 单个视频生成结果 */
export interface GenerateSingleVideoResult {
  success: boolean;
  video?: GeneratedVideo;
  error?: string;
  details?: VideoErrorDetails;
}

/** 批量生成进度回调 */
export interface VideoGenerationProgress {
  phase: 'preparing' | 'generating' | 'completed' | 'error';
  current: number;
  total: number;
  currentShot?: string;
  error?: string;
}

/** 批量生成选项 */
export interface GenerateAllVideosOptions {
  resolution?: '480p' | '720p';
  ratio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
  onProgress?: (progress: VideoGenerationProgress) => void;
  onVideoGenerated?: (video: GeneratedVideo) => void;
  abortSignal?: AbortSignal;
}

/** 批量生成结果 */
export interface GenerateAllVideosResult {
  success: boolean;
  videos: GeneratedVideo[];
  errors: string[];
}
// ===== 角色解析与参考图规则 =====

const MAX_REFERENCE_IMAGES = 4; // RunComfy API 限制 1-4 张参考图
const NO_CHARACTER_MARKERS = new Set(['无', '空', '空镜', '空镜无人物']);

const normalizeName = (name: string): string =>
  String(name || '').trim().toLowerCase().replace(/\s+/g, '');

const dedupeByNormalize = (names: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
};

const splitCharacterText = (text: string): string[] => {
  const raw = String(text || '').trim();
  if (!raw || NO_CHARACTER_MARKERS.has(raw)) return [];

  // 优先使用常见分隔符拆分
  const primary = raw
    .split(/\s*[、,，;；\/|&]+\s*/g)
    .map(s => s.trim())
    .filter(Boolean);
  if (primary.length > 1) return primary;

  // 次选：中文连接词
  const secondary = raw
    .split(/[和与及跟]/g)
    .map(s => s.trim())
    .filter(Boolean);
  if (secondary.length > 1) return secondary;

  return primary.length > 0 ? primary : [raw];
};

const mapToKnownNames = (names: string[], knownNames: Set<string>): string[] => {
  if (!knownNames || knownNames.size === 0) return names;

  const knownMap = new Map<string, string>();
  for (const name of knownNames) {
    const key = normalizeName(name);
    if (key && !knownMap.has(key)) knownMap.set(key, name);
  }

  return names.map(name => knownMap.get(normalizeName(name)) || name);
};

const getShotCharacterNames = (shot: Shot, artistData?: ArtistData): string[] => {
  const rawCharacters =
    (Array.isArray((shot as any)?.characters) && (shot as any).characters) ||
    (typeof (shot as any)?.character === 'string' && (shot as any).character) ||
    (typeof shot.assignee === 'string' && shot.assignee) ||
    '';

  let names: string[] = [];
  if (Array.isArray(rawCharacters)) {
    names = rawCharacters.map(x => String(x || '').trim()).filter(Boolean);
  } else if (typeof rawCharacters === 'string') {
    names = splitCharacterText(rawCharacters);
  }

  const knownNames = new Set<string>(
    (artistData?.characterImages || [])
      .map(img => String(img.name || '').trim())
      .filter(Boolean)
  );

  names = mapToKnownNames(names, knownNames)
    .filter(name => !NO_CHARACTER_MARKERS.has(name));

  return dedupeByNormalize(names);
};

const findCharacterImageByName = (
  images: GeneratedImage[],
  name: string
): GeneratedImage | undefined => {
  const target = normalizeName(name);
  if (!target) return undefined;

  return images.find(
    img =>
      img.status === 'completed' &&
      normalizeName(img.name || '') === target
  );
};

// ===== 参数归一化工具函数 =====

/**
 * 归一化视频时长
 * 根据供应商配置限制时长范围
 * 
 * @param duration 原始时长
 * @param config 供应商配置
 * @returns 归一化后的时长
 */
export function normalizeDuration(
  duration: number | undefined,
  config: VideoProviderConfig
): number {
  // 未定义时使用默认值
  if (duration === undefined || duration === null) {
    console.log(`[参数归一化] duration 未定义，使用默认值: ${config.defaultDuration}`);
    return config.defaultDuration;
  }
  
  // 限制到有效范围
  if (duration < config.minDuration) {
    console.log(`[参数归一化] duration ${duration} 小于最小值，限制为: ${config.minDuration}`);
    return config.minDuration;
  }
  
  if (duration > config.maxDuration) {
    console.log(`[参数归一化] duration ${duration} 大于最大值，限制为: ${config.maxDuration}`);
    return config.maxDuration;
  }
  
  return duration;
}

/**
 * 归一化宽高比
 * 对于 Pollinations，仅支持 16:9 和 9:16，其他比例自动映射
 * 
 * 映射规则（确定性）：
 * - 9:16 或 3:4 → 9:16（竖屏）
 * - 其他所有（16:9, 4:3, 1:1, 21:9）→ 16:9（横屏）
 * 
 * @param ratio 原始宽高比
 * @param config 供应商配置
 * @returns 归一化后的宽高比
 */
export function normalizeAspectRatio(
  ratio: string | undefined,
  config: VideoProviderConfig
): string {
  // 未定义时使用默认值
  if (!ratio) {
    return config.defaultAspectRatio;
  }
  
  // 如果供应商支持该比例，直接返回
  if (config.supportedAspectRatios.includes(ratio)) {
    return ratio;
  }
  
  // Pollinations 特殊处理：仅支持 16:9 和 9:16
  if (config.id === 'pollinations') {
    // 竖屏比例映射到 9:16
    if (ratio === '9:16' || ratio === '3:4') {
      console.log(`[参数归一化] ratio ${ratio} 映射为 9:16（Pollinations 竖屏）`);
      return '9:16';
    }
    // 其他所有比例映射到 16:9
    console.log(`[参数归一化] ratio ${ratio} 映射为 16:9（Pollinations 横屏）`);
    return '16:9';
  }
  
  // 其他供应商：使用默认值
  console.log(`[参数归一化] ratio ${ratio} 不支持，使用默认值: ${config.defaultAspectRatio}`);
  return config.defaultAspectRatio;
}

// ===== 核心功能 =====

/**
 * 从 GeneratedImage 中提取云端 URL
 * RunComfy API 要求使用公开可访问的 HTTPS URL，不支持 base64
 * 
 * 优先级：
 * 1. 从 asset 中获取 cloudUrl
 * 2. 如果 imageUrl 是 https URL 则使用
 * 3. base64 数据不能使用
 */
async function getCloudUrl(img: GeneratedImage | undefined): Promise<string | null> {
  if (!img || img.status !== 'completed') return null;
  
  // 优先通过 assetId 从存储中获取 cloudUrl
  if (img.assetId) {
    const asset = await getAsset(img.assetId);
    if (asset?.cloudUrl && (asset.cloudUrl.startsWith('http://') || asset.cloudUrl.startsWith('https://'))) {
      console.log(`[视频生成] 图片 ${img.name} 使用云端 URL: ${asset.cloudUrl.substring(0, 60)}...`);
      return asset.cloudUrl;
    }
  }
  
  // 其次检查 imageUrl 是否为有效的 URL
  const url = img.imageUrl || '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    console.log(`[视频生成] 图片 ${img.name} 使用 imageUrl: ${url.substring(0, 60)}...`);
    return url;
  }
  
  // base64 数据不能使用
  if (url.startsWith('data:')) {
    console.warn(`[视频生成] 图片 ${img.name} 只有 base64 数据（assetId: ${img.assetId}），无法用于视频生成`);
  } else {
    console.warn(`[视频生成] 图片 ${img.name} 没有有效的 URL（assetId: ${img.assetId}, imageUrl: ${url ? url.substring(0, 30) : '无'}）`);
  }
  
  return null;
}

/**
 * 获取镜头的视频生成参数
 * 从分镜数据和美工数据中提取所需信息
 * 注意：RunComfy API 要求 images 必须是公开可访问的 HTTPS URL
 */
export async function getShotVideoParams(
  shot: Shot,
  artistData: ArtistData,
  options: {
    resolution?: '480p' | '720p';
    ratio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
  } = {}
): Promise<VideoGenerationParams | null> {
  const { resolution = '480p', ratio = '16:9' } = options;

  // 1. 查找角色参考图（可能有多个出场角色）
  const characterNames = getShotCharacterNames(shot, artistData);

  // 2. 查找场景参考图（通过地点/location）
  let sceneImage: GeneratedImage | undefined;
  if (shot.location) {
    sceneImage = artistData.sceneImages.find(
      img => img.name === shot.location && img.status === 'completed'
    );
  }
  
  // 3. 查找关键帧图片（通过shotId）
  const keyframeImage = artistData.keyframeImages.find(
    img => img.id.includes(shot.id) || img.name?.includes(shot.shotNumber)
  );
  // 如果没有直接匹配，尝试按镜号匹配
  const keyframeByNumber = keyframeImage || artistData.keyframeImages.find(
    img => img.name === shot.shotNumber && img.status === 'completed'
  );
  
  // 4. 收集参考图片（最多4张，顺序：场景 → 角色 → 关键帧）
  // 注意：必须使用云端 URL (https://)，不能使用 base64
  const images: string[] = [];
  const imageDescriptions: string[] = [];

  const pushImage = (url: string, desc: string) => {
    if (images.length >= MAX_REFERENCE_IMAGES) {
      console.warn(`[视频生成] 超出参考图上限(${MAX_REFERENCE_IMAGES})，已忽略: ${desc}`);
      return false;
    }
    const index = images.length + 1;
    images.push(url);
    imageDescriptions.push(`图${index}是${desc}`);
    return true;
  };

  const sceneUrl = await getCloudUrl(sceneImage);
  if (sceneUrl) {
    pushImage(sceneUrl, shot.location);
  }

  for (const name of characterNames) {
    const characterImage = findCharacterImageByName(artistData.characterImages, name);
    const charUrl = await getCloudUrl(characterImage);
    if (charUrl) {
      if (!pushImage(charUrl, name)) {
        break;
      }
    } else {
      console.warn(`[视频生成] 未找到角色参考图: ${name}`);
    }
  }
  
  const keyframeUrl = await getCloudUrl(keyframeByNumber);
  if (keyframeUrl) {
    pushImage(keyframeUrl, '关键帧');
  }
  
  // 至少需要1张图片（必须是云端 URL）
  if (images.length === 0) {
    console.warn(`镜头 ${shot.shotNumber} 没有可用的云端图片 URL（RunComfy API 不支持 base64）`);
    return null;
  }
  
  // 5. 构建提示词
  const text = buildVideoPrompt(shot, imageDescriptions, characterNames);
  
  // 6. 确保时长在有效范围内 (2-12秒)
  const duration = Math.max(2, Math.min(12, shot.duration || 5));
  
  return {
    shotId: shot.id,
    shotNumber: shot.shotNumber,
    images,
    text,
    duration,
    resolution,
    ratio,
  };
}

/**
 * 构建视频生成提示词
 * 格式：{参考图片说明}。{出场角色}，{画面内容}，{景别}，{机位}，{运镜}
 */
export function buildVideoPrompt(
  shot: Shot,
  imageDescriptions: string[],
  characterNames: string[] = []
): string {
  const parts: string[] = [];
  
  // 参考图片说明
  if (imageDescriptions.length > 0) {
    parts.push(imageDescriptions.join('，') + '。');
  }

  // 出场角色（与分镜阶段输出对齐）
  if (characterNames.length > 0) {
    parts.push(`出场角色：${characterNames.join('、')}`);
  }
  
  // 画面内容
  if (shot.content) {
    parts.push(shot.content);
  }
  
  // 景别、机位、运镜
  const technicalParts: string[] = [];
  if (shot.shotSize) technicalParts.push(shot.shotSize);
  if (shot.cameraAngle) technicalParts.push(shot.cameraAngle);
  if (shot.cameraMovement) technicalParts.push(shot.cameraMovement);
  
  if (technicalParts.length > 0) {
    parts.push(technicalParts.join('，'));
  }
  
  // 合并并限制长度（API限制500字符）
  let prompt = parts.join('，');
  if (prompt.length > 490) {
    prompt = prompt.substring(0, 490) + '...';
  }
  
  return prompt;
}

/**
 * 生成单个镜头的视频
 * 根据当前配置的供应商选择调用方式
 */
export async function generateShotVideo(
  projectId: string,
  params: VideoGenerationParams,
  abortSignal?: AbortSignal
): Promise<GenerateSingleVideoResult> {
  // 检查供应商可用性
  const availability = isCurrentProviderAvailable();
  if (!availability.available) {
    return {
      success: false,
      error: availability.error || '当前视频供应商不可用',
    };
  }

  const config = getCurrentVideoProviderConfig();
  const provider = CURRENT_VIDEO_PROVIDER;

  console.log(`[视频生成] 使用供应商: ${config.name} (${provider})`);

  // 根据供应商选择调用方式
  if (provider === 'pollinations') {
    return generateWithPollinations(projectId, params, config, abortSignal);
  } else {
    return generateWithRunComfy(projectId, params, config, abortSignal);
  }
}

// ===== 供应商特定实现 =====

/**
 * 使用 RunComfy 生成视频（异步轮询模式）
 * 前端调用 /api/runcomfy/submit + /api/runcomfy/status
 * 
 * 响应处理：
 * - 成功：保存 videoUrl 到资产（cloudUrl），返回 GeneratedVideo
 * - 失败：返回带有详细错误信息的结果
 */
async function generateWithRunComfy(
  projectId: string,
  params: VideoGenerationParams,
  config: VideoProviderConfig,
  abortSignal?: AbortSignal
): Promise<GenerateSingleVideoResult> {
  const startTime = Date.now();
  
  try {
    // 归一化参数
    const normalizedDuration = normalizeDuration(params.duration, config);
    const normalizedRatio = normalizeAspectRatio(params.ratio, config);

    console.log(`[RunComfy] 开始生成视频: ${params.shotNumber}`, {
      imageCount: params.images.length,
      duration: normalizedDuration,
      resolution: params.resolution,
      ratio: normalizedRatio,
      provider: config.id,
    });

    // 使用异步模式：提交任务 + 轮询等待
    const pollResult = await submitAndWait(
      {
        type: 'ref2video',
        images: params.images,
        text: params.text,
        duration: normalizedDuration,
        resolution: params.resolution,
        ratio: normalizedRatio,
        seed: params.seed,
      },
      {
        maxAttempts: 180, // 约3分钟
        interval: 1000,
        abortSignal,
      }
    );

    if (!pollResult.success || !pollResult.result?.videoUrl) {
      const errorMessage = pollResult.error || '视频生成失败：未返回视频 URL';
      console.error(`[RunComfy] 任务失败: ${params.shotNumber}`, {
        error: errorMessage,
        elapsed: Date.now() - startTime,
      });
      
      return createFailedVideoResult(params, new Error(errorMessage), {
        provider: 'runcomfy',
        rawError: pollResult.error,
      });
    }

    const videoUrl = pollResult.result.videoUrl;
    const elapsed = Date.now() - startTime;
    
    console.log(`[RunComfy] 视频生成成功: ${params.shotNumber}`, {
      videoUrl: videoUrl.substring(0, 80) + '...',
      elapsed: `${elapsed}ms`,
    });

    // 保存视频资产到 IndexedDB（RunComfy 返回云端 URL）
    const asset = await saveAsset({
      projectId,
      type: 'video',
      mimeType: 'video/mp4',
      size: 0, // URL视频无法获取大小
      cloudUrl: videoUrl,
      uploadStatus: 'uploaded', // 已在云端
      duration: normalizedDuration,
    });

    // 创建 GeneratedVideo 记录
    const video: GeneratedVideo = {
      id: crypto.randomUUID(),
      shotId: params.shotId,
      shotNumber: params.shotNumber,
      keyframeAssetId: '', // 多图参考模式，无单一关键帧
      assetId: asset.id,
      status: 'completed',
      duration: normalizedDuration,
      videoUrl: videoUrl,
      prompt: params.text,
      referenceImages: params.images,
      isStale: false,
    };

    return {
      success: true,
      video,
    };

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[RunComfy] 视频生成异常: ${params.shotNumber}`, {
      error,
      elapsed: `${elapsed}ms`,
    });
    
    return createFailedVideoResult(params, error, {
      provider: 'runcomfy',
      rawError: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 使用 Pollinations 生成视频（同步直连模式）
 * 前端直连 https://gen.pollinations.ai/image/{prompt}
 * 
 * 响应处理：
 * - 成功：验证 Content-Type 为 video/*，blob 转 base64，保存到 IndexedDB
 * - 失败：根据 HTTP 状态码返回对应错误信息
 * 
 * 错误处理：
 * - HTTP 400: 请求参数无效
 * - HTTP 401: 鉴权失败
 * - HTTP 429: 速率限制
 * - HTTP 500/502/503: 服务器错误
 * - 非 video/* Content-Type: 意外响应格式
 */
async function generateWithPollinations(
  projectId: string,
  params: VideoGenerationParams,
  config: VideoProviderConfig,
  abortSignal?: AbortSignal
): Promise<GenerateSingleVideoResult> {
  const startTime = Date.now();
  
  try {
    // 检查 API Key（快速失败，不发起网络请求）
    if (!config.clientKey || config.clientKey.trim() === '') {
      const errorMessage = '未配置 VITE_POLLINATIONS_API_KEY，无法使用 Pollinations 视频生成';
      console.error(`[Pollinations] 配置错误: ${errorMessage}`);
      
      return createFailedVideoResult(params, new Error(errorMessage), {
        provider: 'pollinations',
      });
    }

    // 归一化参数
    const normalizedDuration = normalizeDuration(params.duration, config);
    const normalizedRatio = normalizeAspectRatio(params.ratio, config);
    // Pollinations 忽略 resolution 参数

    console.log(`[Pollinations] 开始生成视频: ${params.shotNumber}`, {
      imageCount: params.images.length,
      duration: normalizedDuration,
      aspectRatio: normalizedRatio,
      model: config.defaultModel,
      provider: config.id,
    });

    // 构建 Pollinations URL
    const url = buildPollinationsUrl(params.text, params.images, {
      model: config.defaultModel,
      duration: normalizedDuration,
      aspectRatio: normalizedRatio,
      seed: params.seed,
      nologo: config.defaultNologo ?? true,
      private: config.defaultNoFeed ?? true,
      nofeed: config.defaultNoFeed ?? true,
      key: config.clientKey,
    });

    console.log(`[Pollinations] 请求 URL: ${url.substring(0, 150)}...`);

    // 发起请求
    const response = await fetch(url, {
      method: 'GET',
      signal: abortSignal,
    });

    // 处理 HTTP 错误
    if (!response.ok) {
      const httpStatus = response.status;
      const errorType = mapHttpStatusToErrorType(httpStatus);
      const errorMessage = mapHttpErrorToMessage(httpStatus);
      
      // 尝试获取响应体以获取更多错误信息
      let rawError: string | undefined;
      try {
        rawError = await response.text();
        console.error(`[Pollinations] HTTP ${httpStatus} 响应内容:`, rawError.substring(0, 500));
      } catch {
        // 忽略读取响应体的错误
      }
      
      console.error(`[Pollinations] HTTP 错误: ${params.shotNumber}`, {
        status: httpStatus,
        errorType,
        errorMessage,
        elapsed: Date.now() - startTime,
      });
      
      return createFailedVideoResult(params, new Error(errorMessage), {
        httpStatus,
        provider: 'pollinations',
        rawError,
      });
    }

    // 验证 Content-Type
    const contentType = response.headers.get('content-type') || '';
    const contentTypeError = validateVideoContentType(contentType);
    
    if (contentTypeError) {
      // 尝试获取响应内容以便调试
      let rawError: string | undefined;
      try {
        rawError = await response.text();
        console.error(`[Pollinations] 非视频响应内容:`, rawError.substring(0, 500));
      } catch {
        // 忽略读取响应体的错误
      }
      
      console.error(`[Pollinations] Content-Type 验证失败: ${params.shotNumber}`, {
        contentType,
        error: contentTypeError,
        elapsed: Date.now() - startTime,
      });
      
      return createFailedVideoResult(params, new Error(contentTypeError), {
        contentType,
        provider: 'pollinations',
        rawError,
      });
    }

    // 获取视频 blob
    const blob = await response.blob();
    
    // 验证 blob 大小
    if (blob.size === 0) {
      const errorMessage = '响应视频数据为空';
      console.error(`[Pollinations] ${errorMessage}: ${params.shotNumber}`);
      
      return createFailedVideoResult(params, new Error(errorMessage), {
        contentType,
        provider: 'pollinations',
      });
    }
    
    const base64 = await blobToBase64(blob);
    const elapsed = Date.now() - startTime;

    console.log(`[Pollinations] 视频生成成功: ${params.shotNumber}`, {
      size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
      contentType,
      elapsed: `${elapsed}ms`,
    });

    // 保存视频资产到 IndexedDB（本地存储，无云端 URL）
    const asset = await saveAsset({
      projectId,
      type: 'video',
      mimeType: contentType,
      size: blob.size,
      localData: base64,
      uploadStatus: 'local_only', // Pollinations 直连模式，仅本地存储
      duration: normalizedDuration,
    });

    // 创建 GeneratedVideo 记录
    const video: GeneratedVideo = {
      id: crypto.randomUUID(),
      shotId: params.shotId,
      shotNumber: params.shotNumber,
      keyframeAssetId: '',
      assetId: asset.id,
      status: 'completed',
      duration: normalizedDuration,
      videoUrl: '', // Pollinations 直连模式无云端 URL
      prompt: params.text,
      referenceImages: params.images,
      isStale: false,
    };

    return {
      success: true,
      video,
    };

  } catch (error) {
    const elapsed = Date.now() - startTime;
    
    // 区分网络错误和其他错误
    let errorMessage: string;
    let errorDetails: VideoErrorDetails = { provider: 'pollinations' };
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      errorMessage = '网络错误，请检查网络连接';
      console.error(`[Pollinations] 网络错误: ${params.shotNumber}`, {
        error: error.message,
        elapsed: `${elapsed}ms`,
      });
    } else if (error instanceof DOMException && error.name === 'AbortError') {
      errorMessage = '请求已取消';
      console.log(`[Pollinations] 请求取消: ${params.shotNumber}`, {
        elapsed: `${elapsed}ms`,
      });
    } else {
      errorMessage = error instanceof Error ? error.message : '生成失败';
      errorDetails.rawError = error instanceof Error ? error.message : String(error);
      console.error(`[Pollinations] 视频生成异常: ${params.shotNumber}`, {
        error,
        elapsed: `${elapsed}ms`,
      });
    }
    
    return createFailedVideoResult(params, new Error(errorMessage), errorDetails);
  }
}

// ===== Pollinations URL 构造 =====

/**
 * 构建 Pollinations API URL
 * 格式: https://gen.pollinations.ai/image/{encodedPrompt}?model=seedance&image={imageUrls}&...
 */
export function buildPollinationsUrl(
  prompt: string,
  images: string[],
  options: {
    model: string;
    duration: number;
    aspectRatio: string;
    seed?: number;
    nologo?: boolean;
    private?: boolean;
    nofeed?: boolean;
    key: string;
  }
): string {
  const baseUrl = 'https://gen.pollinations.ai';
  
  // URL 编码 prompt 到路径
  const encodedPrompt = encodeURIComponent(prompt);
  
  // 构建 query 参数
  const params = new URLSearchParams();
  params.set('model', options.model);
  params.set('duration', String(options.duration));
  params.set('aspectRatio', options.aspectRatio);
  
  // 图片 URL（多个用逗号拼接）
  if (images.length > 0) {
    params.set('image', images.join(','));
  }
  
  // 可选参数
  if (options.seed !== undefined) {
    params.set('seed', String(options.seed));
  }
  
  if (options.nologo) {
    params.set('nologo', 'true');
  }
  
  if (options.private) {
    params.set('private', 'true');
  }
  
  if (options.nofeed) {
    params.set('nofeed', 'true');
  }
  
  // API Key（必需）
  params.set('key', options.key);
  
  return `${baseUrl}/image/${encodedPrompt}?${params.toString()}`;
}

// ===== 错误处理工具函数 =====

/** HTTP 错误类型 */
export type HttpErrorType = 
  | 'invalid_input'      // 400
  | 'auth_failed'        // 401
  | 'rate_limited'       // 429
  | 'server_error'       // 500/502/503
  | 'invalid_response'   // 非 video/* content-type
  | 'network_error'      // 网络错误
  | 'unknown';           // 其他

/**
 * 将 HTTP 状态码映射为错误类型
 */
function mapHttpStatusToErrorType(status: number): HttpErrorType {
  switch (status) {
    case 400:
      return 'invalid_input';
    case 401:
      return 'auth_failed';
    case 429:
      return 'rate_limited';
    case 500:
    case 502:
    case 503:
      return 'server_error';
    default:
      return 'unknown';
  }
}

/**
 * 将 HTTP 状态码映射为用户友好的错误消息
 */
function mapHttpErrorToMessage(status: number): string {
  switch (status) {
    case 400:
      return '请求参数无效，请检查提示词和图片';
    case 401:
      return '鉴权失败，请检查 API Key 配置';
    case 429:
      return '已达速率限制，请稍后重试';
    case 500:
    case 502:
    case 503:
      return '服务器错误，请稍后重试';
    default:
      return `HTTP 错误: ${status}`;
  }
}

/**
 * 验证响应的 Content-Type 是否为视频类型
 * @returns 如果是有效的视频类型返回 null，否则返回错误信息
 */
function validateVideoContentType(contentType: string | null): string | null {
  if (!contentType) {
    return '响应缺少 Content-Type 头';
  }
  
  if (!contentType.startsWith('video/')) {
    return `意外的响应格式: ${contentType}（期望 video/*）`;
  }
  
  return null;
}

/**
 * 创建失败的视频结果
 */
function createFailedVideoResult(
  params: VideoGenerationParams,
  error: unknown,
  details?: VideoErrorDetails
): GenerateSingleVideoResult {
  const errorMessage = error instanceof Error ? error.message : '生成失败';
  
  // 详细日志记录
  console.error(`[视频生成失败] 镜头: ${params.shotNumber}`, {
    error: errorMessage,
    details,
    params: {
      shotId: params.shotId,
      imageCount: params.images.length,
      duration: params.duration,
      ratio: params.ratio,
    },
  });
  
  const failedVideo: GeneratedVideo = {
    id: crypto.randomUUID(),
    shotId: params.shotId,
    shotNumber: params.shotNumber,
    keyframeAssetId: '',
    assetId: '',
    status: 'failed',
    duration: params.duration,
    prompt: params.text,
    referenceImages: params.images,
    error: errorMessage,
    isStale: false,
  };

  return {
    success: false,
    video: failedVideo,
    error: errorMessage,
    details,
  };
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
 * 批量生成所有视频
 * 串行执行，支持进度回调和中断
 * 请求间隔根据供应商配置动态调整
 */
export async function generateAllVideos(
  projectId: string,
  options: GenerateAllVideosOptions = {}
): Promise<GenerateAllVideosResult> {
  const { 
    resolution = '480p', 
    ratio = '16:9',
    onProgress, 
    onVideoGenerated, 
    abortSignal 
  } = options;
  
  const result: GenerateAllVideosResult = {
    success: false,
    videos: [],
    errors: [],
  };

  // 检查供应商可用性
  const availability = isCurrentProviderAvailable();
  if (!availability.available) {
    result.errors.push(availability.error || '当前视频供应商不可用');
    return result;
  }

  const config = getCurrentVideoProviderConfig();
  console.log(`[批量视频生成] 使用供应商: ${config.name}, 请求间隔: ${config.requestInterval}ms`);

  // 获取项目数据
  const project = await getProject(projectId);
  if (!project) {
    result.errors.push('项目不存在');
    return result;
  }

  // 检查分镜数据 - 兼容两种格式
  const storyboard = project.storyboard as {
    episodes?: Array<{ episodeNumber: number; shots?: Shot[] }>;
    episodeNumber?: number;
    shots?: Array<{
      shotId?: string;
      id?: string;
      shotNumber?: string;
      location: string;
      description?: string;
      content?: string;
      shotSize: string;
      cameraAngle: string;
      cameraMovement: string;
      duration: number;
      dialogue?: string;
      character?: string;
      assignee?: string;
      notes?: string;
    }>;
  };
  
  const hasEpisodes = storyboard?.episodes && storyboard.episodes.length > 0;
  const hasDirectShots = storyboard?.shots && storyboard.shots.length > 0;
  
  if (!storyboard || (!hasEpisodes && !hasDirectShots)) {
    result.errors.push('请先完成分镜阶段');
    return result;
  }

  // 检查美工数据
  const artistData = project.artist;
  if (!artistData) {
    result.errors.push('请先完成美工阶段');
    return result;
  }

  // 收集所有镜头 - 兼容两种格式
  const allShots: Shot[] = [];
  
  // 格式1: 多集格式 { episodes: [{ shots }] }
  if (hasEpisodes && storyboard.episodes) {
    for (const episode of storyboard.episodes) {
      if (episode.shots) {
        allShots.push(...episode.shots);
      }
    }
  }
  // 格式2: 单集格式 { episodeNumber, shots }
  else if (hasDirectShots && storyboard.shots) {
    const episodeNum = storyboard.episodeNumber || 1;
    for (const shot of storyboard.shots) {
      // 转换为标准 Shot 格式
      allShots.push({
        id: shot.id || shot.shotId || `shot-${allShots.length}`,
        shotNumber: shot.shotNumber || shot.shotId || `S${String(episodeNum).padStart(2, '0')}-${String(allShots.length + 1).padStart(2, '0')}`,
        location: shot.location || '',
        content: shot.content || shot.description || '',
        shotSize: shot.shotSize as Shot['shotSize'],
        cameraAngle: shot.cameraAngle as Shot['cameraAngle'],
        cameraMovement: shot.cameraMovement as Shot['cameraMovement'],
        duration: shot.duration || 5,
        dialogue: shot.dialogue || '无',
        assignee: shot.assignee || shot.character,
        notes: shot.notes,
        isStale: false,
      });
    }
  }

  if (allShots.length === 0) {
    result.errors.push('没有可生成的镜头');
    return result;
  }

  // 读取已生成状态，仅对未完成的镜头继续生成
  const existingVideos = (project.director?.videos || []);
  const completedShotIds = new Set<string>(
    existingVideos
      .filter(v => v.status === 'completed')
      .map(v => v.shotId || v.shotNumber)
  );

  const toProcessShots = allShots.filter(s => !completedShotIds.has(s.id) && !completedShotIds.has(s.shotNumber));

  const total = toProcessShots.length;
  onProgress?.({ phase: 'preparing', current: 0, total });

  // 初始化导演数据
  let directorData: DirectorData = project.director || {
    videos: [],
    isStale: false,
  };

  // 串行生成每个镜头的视频
  for (let i = 0; i < toProcessShots.length; i++) {
    if (abortSignal?.aborted) {
      result.errors.push('用户取消');
      break;
    }

    const shot = toProcessShots[i];
    onProgress?.({ 
      phase: 'generating', 
      current: i, 
      total, 
      currentShot: shot.shotNumber 
    });

    // 获取视频生成参数
    const params = await getShotVideoParams(shot, artistData, { resolution, ratio });
    
    if (!params) {
      // 没有可用参考图，跳过
      const skippedVideo: GeneratedVideo = {
        id: crypto.randomUUID(),
        shotId: shot.id,
        shotNumber: shot.shotNumber,
        keyframeAssetId: '',
        assetId: '',
        status: 'failed',
        duration: shot.duration || 5,
        error: '没有可用的参考图片',
        isStale: false,
      };
      result.videos.push(skippedVideo);
      result.errors.push(`${shot.shotNumber}: 没有可用的参考图片`);
      continue;
    }

    // 生成视频
    const genResult = await generateShotVideo(projectId, params, abortSignal);
    
    if (genResult.video) {
      result.videos.push(genResult.video);
      
      // 更新导演数据
      const existingIndex = directorData.videos.findIndex(v => v.shotId === shot.id);
      if (existingIndex >= 0) {
        directorData.videos[existingIndex] = genResult.video;
      } else {
        directorData.videos.push(genResult.video);
      }

      onVideoGenerated?.(genResult.video);
    }

    if (!genResult.success && genResult.error) {
      result.errors.push(`${shot.shotNumber}: ${genResult.error}`);
    }

    // 保存进度到项目
    const latestProject = await getProject(projectId);
    if (latestProject) {
      latestProject.director = directorData;
      await updateProject(latestProject);
    }

    // 视频生成间隔（根据供应商配置）
    if (genResult.success && i < toProcessShots.length - 1) {
      const interval = config.requestInterval;
      if (interval > 0) {
        console.log(`[批量视频生成] 等待 ${interval}ms 后继续下一个镜头...`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }

  onProgress?.({ phase: 'completed', current: total, total });
  
  result.success = result.errors.length === 0;
  return result;
}

/**
 * 获取导演阶段统计信息
 */
export function getDirectorStats(project: Project): {
  totalShots: number;
  completedVideos: number;
  failedVideos: number;
  pendingVideos: number;
  progress: number;
} {
  // 统计总镜头数 - 兼容两种格式
  let totalShots = 0;
  const storyboard = project.storyboard as {
    episodes?: Array<{ shots?: unknown[] }>;
    shots?: unknown[];
  };
  
  // 格式1: 多集格式
  if (storyboard?.episodes && storyboard.episodes.length > 0) {
    for (const episode of storyboard.episodes) {
      totalShots += episode.shots?.length || 0;
    }
  }
  // 格式2: 单集格式
  else if (storyboard?.shots) {
    totalShots = storyboard.shots.length;
  }

  // 统计视频状态
  const videos = project.director?.videos || [];
  const completedVideos = videos.filter(v => v.status === 'completed').length;
  const failedVideos = videos.filter(v => v.status === 'failed').length;
  const generatingVideos = videos.filter(v => v.status === 'generating').length;
  const pendingVideos = totalShots - completedVideos - failedVideos - generatingVideos;

  const progress = totalShots > 0 ? Math.round((completedVideos / totalShots) * 100) : 0;

  return {
    totalShots,
    completedVideos,
    failedVideos,
    pendingVideos,
    progress,
  };
}

/**
 * 重新生成单个视频
 */
export async function regenerateVideo(
  projectId: string,
  shotId: string,
  options: {
    resolution?: '480p' | '720p';
    ratio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
  } = {}
): Promise<GenerateSingleVideoResult> {
  const project = await getProject(projectId);
  if (!project) {
    return { success: false, error: '项目不存在' };
  }

  // 工具：将原始分镜对象标准化为 Shot
  const normalizeShot = (s: any): Shot => ({
    id: s.id || s.shotId || s.shotNumber || crypto.randomUUID(),
    shotNumber: s.shotNumber || s.shotId || s.id || 'S01-01',
    location: s.location || s.place || '',
    content: s.content || s.description || '',
    shotSize: (s.shotSize as Shot['shotSize']) || '中景',
    cameraAngle: (s.cameraAngle as Shot['cameraAngle']) || '平视',
    cameraMovement: (s.cameraMovement as Shot['cameraMovement']) || '固定',
    duration: s.duration || 5,
    dialogue: s.dialogue || '无',
    assignee: s.assignee || s.character || '',
    notes: s.notes || '',
    isStale: false,
  });

  // 查找镜头 - 支持多集/单集，支持按 id/shotNumber/shotId 匹配
  let found: any | undefined;

  const sb: any = project.storyboard;
  if (sb?.episodes?.length) {
    outer: for (const ep of sb.episodes) {
      for (const s of ep.shots || []) {
        if (s.id === shotId || s.shotNumber === shotId || (s as any).shotId === shotId) {
          found = s; break outer;
        }
      }
    }
  }
  if (!found && sb?.shots?.length) {
    for (const s of sb.shots) {
      if (s.id === shotId || s.shotNumber === shotId || (s as any).shotId === shotId) { found = s; break; }
    }
  }

  if (!found) {
    return { success: false, error: '镜头不存在' };
  }

  if (!project.artist) {
    return { success: false, error: '美工数据不存在' };
  }

  const targetShot = normalizeShot(found);

  // 获取参数并生成
  const params = await getShotVideoParams(targetShot, project.artist, options);
  if (!params) {
    return { success: false, error: '没有可用的参考图片' };
  }

  const result = await generateShotVideo(projectId, params);

  // 更新项目数据
  if (result.video) {
    const latestProject = await getProject(projectId);
    if (latestProject) {
      const directorData = latestProject.director || { videos: [], isStale: false };
      const existingIndex = directorData.videos.findIndex(v => (v.shotId === shotId) || (v.shotNumber === shotId));
      if (existingIndex >= 0) {
        directorData.videos[existingIndex] = result.video;
      } else {
        directorData.videos.push(result.video);
      }
      latestProject.director = directorData;
      await updateProject(latestProject);
    }
  }

  return result;
}

/**
 * 获取视频URL
 */
export async function getVideoUrlById(
  projectId: string,
  videoId: string
): Promise<string | null> {
  const project = await getProject(projectId);
  if (!project?.director?.videos) return null;

  const video = project.director.videos.find(v => v.id === videoId);
  if (!video) return null;

  // 优先返回 videoUrl（云端URL）
  if (video.videoUrl) {
    return video.videoUrl;
  }

  // 如果有 assetId，尝试从资产获取
  if (video.assetId) {
    const asset = await getAsset(video.assetId);
    if (asset?.cloudUrl) return asset.cloudUrl;
    if (asset?.localData) return asset.localData;
  }

  return null;
}
