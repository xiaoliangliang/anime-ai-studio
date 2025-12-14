/**
 * 导演阶段视频生成服务
 * 使用 RunComfy Seedance 1.0 Lite 多图参考视频 API
 * 
 * 工作流程：
 * 1. 从分镜数据获取每个镜头的：镜号、地点、画面内容、景别、机位、运镜、时长、负责人
 * 2. 从美工数据获取：角色参考图、场景参考图、关键帧图片
 * 3. 构建提示词：图1是{人物}，图2是{地点}，图3是关键帧。{画面内容}，{景别}，{机位}，{运镜}
 * 4. 调用 ref2video API 生成视频
 */

import { saveAsset, getAsset, updateProject, getProject } from './storageService';
import { submitAndWait } from './taskPolling';
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
  images: string[];           // 1-4张参考图片URL
  text: string;               // 提示词（含参考图片说明）
  duration: number;           // 视频时长 2-12秒
  resolution: '480p' | '720p';
  ratio: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
  seed?: number;
}

/** 单个视频生成结果 */
export interface GenerateSingleVideoResult {
  success: boolean;
  video?: GeneratedVideo;
  error?: string;
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

// ===== 核心功能 =====

/**
 * 获取镜头的视频生成参数
 * 从分镜数据和美工数据中提取所需信息
 */
export function getShotVideoParams(
  shot: Shot,
  artistData: ArtistData,
  options: {
    resolution?: '480p' | '720p';
    ratio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
  } = {}
): VideoGenerationParams | null {
  const { resolution = '480p', ratio = '16:9' } = options;
  
  // 1. 查找角色参考图（通过负责人/assignee）
  let characterImage: GeneratedImage | undefined;
  let characterName = '';
  if (shot.assignee) {
    characterImage = artistData.characterImages.find(
      img => img.name === shot.assignee && img.status === 'completed' && img.imageUrl
    );
    characterName = shot.assignee;
  }
  
  // 2. 查找场景参考图（通过地点/location）
  let sceneImage: GeneratedImage | undefined;
  if (shot.location) {
    sceneImage = artistData.sceneImages.find(
      img => img.name === shot.location && img.status === 'completed' && img.imageUrl
    );
  }
  
  // 3. 查找关键帧图片（通过shotId）
  const keyframeImage = artistData.keyframeImages.find(
    img => img.id.includes(shot.id) || img.name?.includes(shot.shotNumber)
  );
  // 如果没有直接匹配，尝试按镜号匹配
  const keyframeByNumber = keyframeImage || artistData.keyframeImages.find(
    img => img.name === shot.shotNumber && img.status === 'completed' && img.imageUrl
  );
  
  // 4. 收集参考图片（最多4张，顺序：角色、场景、关键帧）
  const images: string[] = [];
  const imageDescriptions: string[] = [];
  
  if (characterImage?.imageUrl) {
    images.push(characterImage.imageUrl);
    imageDescriptions.push(`图${images.length}是${characterName}`);
  }
  
  if (sceneImage?.imageUrl) {
    images.push(sceneImage.imageUrl);
    imageDescriptions.push(`图${images.length}是${shot.location}`);
  }
  
  if (keyframeByNumber?.imageUrl) {
    images.push(keyframeByNumber.imageUrl);
    imageDescriptions.push(`图${images.length}是关键帧`);
  }
  
  // 至少需要1张图片
  if (images.length === 0) {
    console.warn(`镜头 ${shot.shotNumber} 没有可用的参考图片`);
    return null;
  }
  
  // 5. 构建提示词
  const text = buildVideoPrompt(shot, imageDescriptions);
  
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
 * 格式：{参考图片说明}。{画面内容}，{景别}，{机位}，{运镜}
 */
export function buildVideoPrompt(shot: Shot, imageDescriptions: string[]): string {
  const parts: string[] = [];
  
  // 参考图片说明
  if (imageDescriptions.length > 0) {
    parts.push(imageDescriptions.join('，') + '。');
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
 * 生成单个镜头的视频（异步模式）
 */
export async function generateShotVideo(
  projectId: string,
  params: VideoGenerationParams,
  abortSignal?: AbortSignal
): Promise<GenerateSingleVideoResult> {
  try {
    console.log(`开始生成视频: ${params.shotNumber}`, {
      imageCount: params.images.length,
      duration: params.duration,
      resolution: params.resolution,
    });

    // 使用异步模式：提交任务 + 轮询等待
    const pollResult = await submitAndWait(
      {
        type: 'ref2video',
        images: params.images,
        text: params.text,
        duration: params.duration,
        resolution: params.resolution,
        ratio: params.ratio,
        seed: params.seed,
      },
      {
        maxAttempts: 180, // 约3分钟
        interval: 1000,
        abortSignal,
      }
    );

    if (!pollResult.success || !pollResult.result?.videoUrl) {
      throw new Error(pollResult.error || '视频生成失败');
    }

    const videoUrl = pollResult.result.videoUrl;
    console.log(`视频生成成功: ${params.shotNumber}`, videoUrl);

    // 保存视频资产到 IndexedDB
    const asset = await saveAsset({
      projectId,
      type: 'video',
      mimeType: 'video/mp4',
      size: 0, // URL视频无法获取大小
      cloudUrl: videoUrl,
      uploadStatus: 'uploaded', // 已在云端
      duration: params.duration,
    });

    // 创建 GeneratedVideo 记录
    const video: GeneratedVideo = {
      id: crypto.randomUUID(),
      shotId: params.shotId,
      shotNumber: params.shotNumber,
      keyframeAssetId: '', // 多图参考模式，无单一关键帧
      assetId: asset.id,
      status: 'completed',
      duration: params.duration,
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
    console.error(`视频生成失败: ${params.shotNumber}`, error);
    
    // 创建失败记录
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
      error: error instanceof Error ? error.message : '生成失败',
      isStale: false,
    };

    return {
      success: false,
      video: failedVideo,
      error: error instanceof Error ? error.message : '生成失败',
    };
  }
}

/**
 * 批量生成所有视频
 * 串行执行，支持进度回调和中断
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
    const params = getShotVideoParams(shot, artistData, { resolution, ratio });
    
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

    // 视频生成间隔
    if (genResult.success && i < toProcessShots.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
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
  const params = getShotVideoParams(targetShot, project.artist, options);
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
