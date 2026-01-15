/**
 * 美工阶段图片生成服务
 * 串行生成角色参考图、场景参考图、关键帧图片
 */

import { 
  generateImageFromText, 
  generateImageFromImage, 
  getImageUrl,
  batchGenerateImagesFromText,
  batchGenerateImagesFromImage,
  type BatchProgressCallback,
  type GenerateImageResult,
} from './imageService';
import { getAsset, updateProject, getProject } from './storageService';
import type { 
  Project, 
  ImageDesignerData, 
  ArtistData, 
  GeneratedImage,
  ReferencePrompt,
  KeyframePrompt 
} from '@/types';

/** 旧版图像设计数据格式（兼容） */
interface LegacyImageDesignerData {
  referenceImages: Array<{
    refId: string;
    type: 'character' | 'scene';
    name: string;
    prompt: string;
    description?: string;
  }>;
  keyframes: Array<{
    shotId: string;
    frameNumber: number;
    prompt: string;
    referenceIds?: string[];
    characters?: string[];
    scene?: string;
    description?: string;
  }>;
  isStale: boolean;
  summary?: {
    totalCharacters?: number;
    totalScenes?: number;
    totalKeyframes?: number;
  };
}

/** 生成进度类型 */
export type GenerationPhase = 'idle' | 'characters' | 'scenes' | 'keyframes' | 'completed' | 'error';

/** 生成进度回调参数 */
export interface GenerationProgress {
  phase: GenerationPhase;
  current: number;
  total: number;
  currentItem?: string;
  error?: string;
}

/** 生成选项 */
export interface GenerateAllImagesOptions {
  onProgress?: (progress: GenerationProgress) => void;
  onImageGenerated?: (image: GeneratedImage, phase: GenerationPhase) => void;
  abortSignal?: AbortSignal;
}

/** 生成结果 */
export interface GenerateAllImagesResult {
  success: boolean;
  characterImages: GeneratedImage[];
  sceneImages: GeneratedImage[];
  keyframeImages: GeneratedImage[];
  errors: string[];
}

/**
 * 从图像设计阶段数据中提取提示词
 * 兼容两种数据格式：
 * 1. 新格式：characterPrompts, scenePrompts, keyframePrompts
 * 2. 旧格式：referenceImages, keyframes
 */
export function extractPromptsFromImageDesigner(imageDesigner: ImageDesignerData | LegacyImageDesignerData): {
  characterPrompts: ReferencePrompt[];
  scenePrompts: ReferencePrompt[];
  keyframePrompts: KeyframePrompt[];
} {
  // 检查是否是旧格式数据
  const legacyData = imageDesigner as LegacyImageDesignerData;
  if (legacyData.referenceImages && Array.isArray(legacyData.referenceImages)) {
    // 旧格式：从 referenceImages 中分离 character 和 scene
    const characterPrompts: ReferencePrompt[] = legacyData.referenceImages
      .filter(ref => ref.type === 'character')
      .map(ref => ({
        id: ref.refId || crypto.randomUUID(),
        code: ref.refId,
        name: ref.name,
        prompt: ref.prompt,
        type: 'character' as const,
        isStale: false,
      }));
    
    const scenePrompts: ReferencePrompt[] = legacyData.referenceImages
      .filter(ref => ref.type === 'scene')
      .map(ref => ({
        id: ref.refId || crypto.randomUUID(),
        code: ref.refId,
        name: ref.name,
        prompt: ref.prompt,
        type: 'scene' as const,
        isStale: false,
      }));
    
    const keyframePrompts: KeyframePrompt[] = (legacyData.keyframes || []).map(kf => ({
      id: crypto.randomUUID(),
      code: `${kf.shotId}-${kf.frameNumber}`,
      shotId: kf.shotId,
      frameIndex: kf.frameNumber,
      prompt: kf.prompt,
      referenceIds: kf.referenceIds || [],
      isStale: false,
    }));
    
    return { characterPrompts, scenePrompts, keyframePrompts };
  }
  
  // 新格式（做一次防串类过滤）
  const newData = imageDesigner as ImageDesignerData;
  const isChar = (p: any) => p?.type === 'character' || /^R-P\d{2}$/i.test(p?.code || '');
  const isScene = (p: any) => p?.type === 'scene' || /^R-S\d{2}$/i.test(p?.code || '');
  return {
    characterPrompts: (newData.characterPrompts || []).filter(isChar),
    scenePrompts: (newData.scenePrompts || []).filter(isScene),
    keyframePrompts: newData.keyframePrompts || [],
  };
}

/**
 * 主流程：生成所有图片
 * 串行执行：角色参考图 → 场景参考图 → 关键帧图片
 */
export async function generateAllImages(
  projectId: string,
  options: GenerateAllImagesOptions = {}
): Promise<GenerateAllImagesResult> {
  const { onProgress, onImageGenerated, abortSignal } = options;
  
  const result: GenerateAllImagesResult = {
    success: false,
    characterImages: [],
    sceneImages: [],
    keyframeImages: [],
    errors: [],
  };

  // 获取项目数据
  const project = await getProject(projectId);
  if (!project) {
    result.errors.push('项目不存在');
    return result;
  }

  // 获取图像设计阶段数据
  const imageDesigner = project.imageDesigner;
  if (!imageDesigner) {
    result.errors.push('请先完成图像设计阶段');
    return result;
  }

  const { characterPrompts, scenePrompts, keyframePrompts } = extractPromptsFromImageDesigner(imageDesigner);
  
  // 计算总数
  const totalCharacters = characterPrompts.length;
  const totalScenes = scenePrompts.length;
  const totalKeyframes = keyframePrompts.length;
  
  // 存储已生成的参考图URL映射 (refId -> cloudUrl)
  const referenceUrlMap = new Map<string, string>();

  try {
    // ===== 阶段1: 生成角色参考图 =====
    onProgress?.({ phase: 'characters', current: 0, total: totalCharacters });
    
    for (let i = 0; i < characterPrompts.length; i++) {
      if (abortSignal?.aborted) {
        result.errors.push('用户取消');
        return result;
      }

      const prompt = characterPrompts[i];
      onProgress?.({ 
        phase: 'characters', 
        current: i, 
        total: totalCharacters,
        currentItem: prompt.name 
      });

      const genResult = await generateImageFromText(projectId, {
        prompt: prompt.prompt,
        width: 1024,
        height: 1024,
      });

      // 获取图片URL：优先使用 localData (data URL)，其次 cloudUrl
      const imageUrl = genResult.asset?.localData || genResult.cloudUrl || '';
      
      const image: GeneratedImage = {
        id: crypto.randomUUID(),
        promptId: prompt.id,
        assetId: genResult.asset?.id || '',
        status: genResult.success ? 'completed' : 'failed',
        error: genResult.error,
        imageUrl: genResult.success ? imageUrl : undefined,
        name: prompt.name,
        isStale: false,
      };

      result.characterImages.push(image);
      onImageGenerated?.(image, 'characters');

      // 保存URL映射供关键帧使用 (优先使用云端 URL，因为 img2img API 需要公开 URL)
      if (genResult.success && genResult.cloudUrl) {
        referenceUrlMap.set(prompt.code, genResult.cloudUrl);
      }

      // 更新项目数据
      await saveArtistProgress(projectId, result);
      
      // 延迟避免API限流
      await delay(1000);
    }

    // ===== 阶段2: 生成场景参考图 =====
    onProgress?.({ phase: 'scenes', current: 0, total: totalScenes });
    
    for (let i = 0; i < scenePrompts.length; i++) {
      if (abortSignal?.aborted) {
        result.errors.push('用户取消');
        return result;
      }

      const prompt = scenePrompts[i];
      onProgress?.({ 
        phase: 'scenes', 
        current: i, 
        total: totalScenes,
        currentItem: prompt.name 
      });

      const genResult = await generateImageFromText(projectId, {
        prompt: prompt.prompt,
        width: 1024,
        height: 1024,
      });

      // 获取图片URL
      const sceneImageUrl = genResult.asset?.localData || genResult.cloudUrl || '';
      
      const image: GeneratedImage = {
        id: crypto.randomUUID(),
        promptId: prompt.id,
        assetId: genResult.asset?.id || '',
        status: genResult.success ? 'completed' : 'failed',
        error: genResult.error,
        imageUrl: genResult.success ? sceneImageUrl : undefined,
        name: prompt.name,
        isStale: false,
      };

      result.sceneImages.push(image);
      onImageGenerated?.(image, 'scenes');

      // 保存URL映射供关键帧使用
      if (genResult.success && genResult.cloudUrl) {
        referenceUrlMap.set(prompt.code, genResult.cloudUrl);
      }

      // 更新项目数据
      await saveArtistProgress(projectId, result);
      
      await delay(1000);
    }

    // ===== 阶段3: 生成关键帧图片 (图生图) =====
    onProgress?.({ phase: 'keyframes', current: 0, total: totalKeyframes });
    
    for (let i = 0; i < keyframePrompts.length; i++) {
      if (abortSignal?.aborted) {
        result.errors.push('用户取消');
        return result;
      }

      const kfPrompt = keyframePrompts[i];
      onProgress?.({ 
        phase: 'keyframes', 
        current: i, 
        total: totalKeyframes,
        currentItem: kfPrompt.code 
      });

      // 查找参考图URL和名称
      const referenceInfos = kfPrompt.referenceIds
        .map(refId => {
          const url = referenceUrlMap.get(refId);
          if (!url) return null;
          // 根据 refId 查找对应的名称
          const charPrompt = characterPrompts.find(p => p.code === refId);
          const scenePrompt = scenePrompts.find(p => p.code === refId);
          const name = charPrompt?.name || scenePrompt?.name || refId;
          const type = refId.startsWith('R-P') ? 'character' : 'scene';
          return { refId, url, name, type };
        })
        .filter((info): info is NonNullable<typeof info> => info !== null);

      let genResult;
      
      if (referenceInfos.length > 0) {
        // 构建增强版提示词：在原有提示词前加上参考图说明
        const refDescriptions = referenceInfos.map((info, idx) => {
          const typeLabel = info.type === 'character' ? '人物' : '场景';
          return `参考图${idx + 1}是${info.name}（${typeLabel}）`;
        }).join('，');
        
        const enhancedPrompt = `${refDescriptions}。画面：${kfPrompt.prompt}`;
        
        console.log('[generateAllImages] 图生图增强提示词:', enhancedPrompt);
        
        // 有参考图时使用图生图
        genResult = await generateImageFromImage(projectId, {
          prompt: enhancedPrompt,
          referenceImageUrl: referenceInfos[0].url,
          width: 1024,
          height: 1024,
          model: 'kontext',  // 使用 kontext 模型进行图生图
        });
      } else {
        // 没有参考图时使用文生图
        genResult = await generateImageFromText(projectId, {
          prompt: kfPrompt.prompt,
          width: 1024,
          height: 1024,
        });
      }

      // 获取图片URL
      const kfImageUrl = genResult.asset?.localData || genResult.cloudUrl || '';
      
      const image: GeneratedImage = {
        id: crypto.randomUUID(),
        promptId: kfPrompt.id,
        assetId: genResult.asset?.id || '',
        status: genResult.success ? 'completed' : 'failed',
        error: genResult.error,
        imageUrl: genResult.success ? kfImageUrl : undefined,
        name: kfPrompt.code,
        isStale: false,
      };

      result.keyframeImages.push(image);
      onImageGenerated?.(image, 'keyframes');

      // 更新项目数据
      await saveArtistProgress(projectId, result);
      
      await delay(1000);
    }

    result.success = true;
    onProgress?.({ phase: 'completed', current: totalKeyframes, total: totalKeyframes });

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : '生成失败');
    onProgress?.({ 
      phase: 'error', 
      current: 0, 
      total: 0, 
      error: result.errors.join(', ') 
    });
  }

  return result;
}

/**
 * 保存美工阶段进度到项目
 */
async function saveArtistProgress(
  projectId: string, 
  result: GenerateAllImagesResult
): Promise<void> {
  const project = await getProject(projectId);
  if (!project) return;

  const artistData: ArtistData = {
    characterImages: result.characterImages,
    sceneImages: result.sceneImages,
    keyframeImages: result.keyframeImages,
    isStale: false,
  };

  const updatedProject: Project = {
    ...project,
    artist: artistData,
  };

  await updateProject(updatedProject);
}

/**
 * 获取美工阶段统计信息
 */
export function getArtistStats(artistData?: ArtistData): {
  totalCharacters: number;
  completedCharacters: number;
  totalScenes: number;
  completedScenes: number;
  totalKeyframes: number;
  completedKeyframes: number;
  failedCharacters: number;
  failedScenes: number;
  failedKeyframes: number;
  hasErrors: boolean;
} {
  if (!artistData) {
    return {
      totalCharacters: 0,
      completedCharacters: 0,
      totalScenes: 0,
      completedScenes: 0,
      totalKeyframes: 0,
      completedKeyframes: 0,
      failedCharacters: 0,
      failedScenes: 0,
      failedKeyframes: 0,
      hasErrors: false,
    };
  }

  const countCompleted = (images: GeneratedImage[]) => 
    images.filter(img => img.status === 'completed').length;
  
  const countFailed = (images: GeneratedImage[]) => 
    images.filter(img => img.status === 'failed').length;
  
  const hasErrors = (images: GeneratedImage[]) => 
    images.some(img => img.status === 'failed');

  return {
    totalCharacters: artistData.characterImages.length,
    completedCharacters: countCompleted(artistData.characterImages),
    totalScenes: artistData.sceneImages.length,
    completedScenes: countCompleted(artistData.sceneImages),
    totalKeyframes: artistData.keyframeImages.length,
    completedKeyframes: countCompleted(artistData.keyframeImages),
    failedCharacters: countFailed(artistData.characterImages),
    failedScenes: countFailed(artistData.sceneImages),
    failedKeyframes: countFailed(artistData.keyframeImages),
    hasErrors: hasErrors(artistData.characterImages) || 
               hasErrors(artistData.sceneImages) || 
               hasErrors(artistData.keyframeImages),
  };
}

/**
 * 获取图片显示URL (优先云端，回退本地)
 */
export async function getGeneratedImageUrl(image: GeneratedImage): Promise<string> {
  if (!image.assetId) return '';
  
  const asset = await getAsset(image.assetId);
  if (!asset) return '';
  
  return getImageUrl(asset);
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// 批量并行生成方法
// ========================================

/** 批量生成进度回调 */
export interface BatchGenerationProgress {
  phase: 'characters' | 'scenes' | 'keyframes';
  completed: number;
  total: number;
  currentName?: string;
  success: boolean;
  error?: string;
}

/** 批量生成结果 */
export interface BatchGenerationResult {
  success: boolean;
  images: GeneratedImage[];
  successCount: number;
  failCount: number;
  errors: string[];
}

// ========================================
// GenerationController 集成方法
// ========================================

import { 
  createGenerationController, 
  restoreGenerationController,
  canGenerateKeyframes as checkKeyframeDependencies,
  type GenerationControllerConfig,
  type GenerationProgress as ControllerProgress,
  type GenerationState,
  type GenerationPhase as ControllerPhase,
} from './generationController';

// Re-export GenerationController factory functions for convenience
export { createGenerationController, restoreGenerationController };

/** 使用 GenerationController 生成所有参考图的选项 */
export interface GenerateReferencesWithControllerOptions {
  width?: number;
  height?: number;
  onProgress?: (progress: ControllerProgress) => void;
  onImageGenerated?: (image: GeneratedImage, phase: ControllerPhase) => void;
  onStateChange?: (state: GenerationState, previousState: GenerationState) => void;
  onComplete?: (result: GenerateAllImagesResult) => void;
  onError?: (error: string) => void;
}

/** 使用 GenerationController 生成所有参考图的结果 */
export interface GenerateReferencesWithControllerResult {
  controller: import('./generationController').GenerationController;
  startPromise: Promise<void>;
}

/**
 * 使用 GenerationController 生成所有参考图（角色 + 场景）
 * 
 * 此函数创建一个 GenerationController 实例并启动生成流程。
 * 返回控制器实例，调用方可以使用它来暂停/继续/重试生成。
 * 
 * 与 generateAllReferences 的区别：
 * - 支持暂停/继续/重试
 * - 支持实时展示每张图片
 * - 支持 Stop-on-Failure 机制
 * - 返回控制器实例供后续操作
 * 
 * @param projectId 项目ID
 * @param options 生成选项
 * @returns 控制器实例和启动 Promise
 */
export function generateReferencesWithController(
  projectId: string,
  options: GenerateReferencesWithControllerOptions = {}
): GenerateReferencesWithControllerResult {
  const controller = createGenerationController({
    projectId,
    width: options.width,
    height: options.height,
    onProgress: options.onProgress,
    onImageGenerated: options.onImageGenerated,
    onStateChange: options.onStateChange,
    onComplete: options.onComplete,
    onError: options.onError,
  });

  // 启动生成（异步）
  const startPromise = controller.start();

  return {
    controller,
    startPromise,
  };
}

/**
 * 恢复并继续生成参考图
 * 
 * 此函数从 IndexedDB 恢复之前的生成状态，并返回控制器实例。
 * 调用方可以检查恢复状态，然后决定是否继续生成。
 * 
 * @param projectId 项目ID
 * @param options 生成选项
 * @returns 恢复状态结果
 */
export async function restoreAndContinueReferences(
  projectId: string,
  options: Omit<GenerateReferencesWithControllerOptions, 'onComplete'> & {
    onComplete?: (result: GenerateAllImagesResult) => void;
  } = {}
) {
  return restoreGenerationController(projectId, {
    width: options.width,
    height: options.height,
    onProgress: options.onProgress,
    onImageGenerated: options.onImageGenerated,
    onStateChange: options.onStateChange,
    onComplete: options.onComplete,
    onError: options.onError,
  });
}

/**
 * 批量并行生成角色和场景参考图
 */
export async function generateAllReferences(
  projectId: string,
  options: {
    concurrency?: number;
    width?: number;
    height?: number;
    onProgress?: (progress: BatchGenerationProgress) => void;
  } = {}
): Promise<BatchGenerationResult> {
  // 不再硬编码并发数，让 imageService 根据供应商配置决定
  const { width, height, onProgress } = options;
  
  const result: BatchGenerationResult = {
    success: false,
    images: [],
    successCount: 0,
    failCount: 0,
    errors: [],
  };

  // 获取项目数据
  const project = await getProject(projectId);
  if (!project) {
    result.errors.push('项目不存在');
    return result;
  }

  const imageDesigner = project.imageDesigner;
  if (!imageDesigner) {
    result.errors.push('请先完成图像设计阶段');
    return result;
  }

  const { characterPrompts, scenePrompts } = extractPromptsFromImageDesigner(imageDesigner);
  
  // 获取已存在的美工数据
  const artistData = project.artist || {
    characterImages: [],
    sceneImages: [],
    keyframeImages: [],
    isStale: false,
  };

  // ===== 生成角色参考图 =====
  const characterResults = await batchGenerateImagesFromText(
    projectId,
    characterPrompts.map(p => ({ id: p.id, prompt: p.prompt, name: p.name })),
    {
      // 不传 concurrency，让 imageService 根据供应商配置决定
      width,
      height,
      onProgress: (progress) => {
        const prompt = characterPrompts.find(p => p.id === progress.currentId);
        onProgress?.({
          phase: 'characters',
          completed: progress.completed,
          total: progress.total,
          currentName: prompt?.name,
          success: progress.success,
          error: progress.error,
        });
      },
    }
  );

  // 转换角色图结果
  const characterImages: GeneratedImage[] = [];
  for (const prompt of characterPrompts) {
    const genResult = characterResults.get(prompt.id);
    const imageUrl = genResult?.asset?.localData || genResult?.cloudUrl || '';
    
    characterImages.push({
      id: crypto.randomUUID(),
      promptId: prompt.id,
      assetId: genResult?.asset?.id || '',
      status: genResult?.success ? 'completed' : 'failed',
      error: genResult?.error,
      imageUrl: genResult?.success ? imageUrl : undefined,
      name: prompt.name,
      isStale: false,
    });

    if (genResult?.success) {
      result.successCount++;
    } else {
      result.failCount++;
      if (genResult?.error) result.errors.push(`${prompt.name}: ${genResult.error}`);
    }
  }
  result.images.push(...characterImages);
  artistData.characterImages = characterImages;

  // 保存进度
  await updateProject({ ...project, artist: artistData });

  // ===== 生成场景参考图 =====
  const sceneResults = await batchGenerateImagesFromText(
    projectId,
    scenePrompts.map(p => ({ id: p.id, prompt: p.prompt, name: p.name })),
    {
      width,
      height,
      onProgress: (progress) => {
        const prompt = scenePrompts.find(p => p.id === progress.currentId);
        onProgress?.({
          phase: 'scenes',
          completed: progress.completed,
          total: progress.total,
          currentName: prompt?.name,
          success: progress.success,
          error: progress.error,
        });
      },
    }
  );

  // 转换场景图结果
  const sceneImages: GeneratedImage[] = [];
  for (const prompt of scenePrompts) {
    const genResult = sceneResults.get(prompt.id);
    const imageUrl = genResult?.asset?.localData || genResult?.cloudUrl || '';
    
    sceneImages.push({
      id: crypto.randomUUID(),
      promptId: prompt.id,
      assetId: genResult?.asset?.id || '',
      status: genResult?.success ? 'completed' : 'failed',
      error: genResult?.error,
      imageUrl: genResult?.success ? imageUrl : undefined,
      name: prompt.name,
      isStale: false,
    });

    if (genResult?.success) {
      result.successCount++;
    } else {
      result.failCount++;
      if (genResult?.error) result.errors.push(`${prompt.name}: ${genResult.error}`);
    }
  }
  result.images.push(...sceneImages);
  artistData.sceneImages = sceneImages;

  // 保存最终结果
  await updateProject({ ...project, artist: artistData });

  result.success = result.failCount === 0;
  return result;
}

/**
 * 批量并行生成关键帧图片
 * 
 * 关键帧依赖检查（Requirements 7.1, 7.2）：
 * - 在生成前验证所有角色/场景参考图是否 completed
 * - 如有未完成的参考图，阻止生成并返回明确错误
 */
export async function generateAllKeyframes(
  projectId: string,
  options: {
    concurrency?: number;
    width?: number;
    height?: number;
    onProgress?: (progress: BatchGenerationProgress) => void;
    /** 是否跳过依赖检查（仅用于内部调用，UI 不应使用） */
    skipDependencyCheck?: boolean;
  } = {}
): Promise<BatchGenerationResult> {
  // 不再硬编码并发数，让 imageService 根据供应商配置决定
  const { width, height, onProgress, skipDependencyCheck = false } = options;
  
  const result: BatchGenerationResult = {
    success: false,
    images: [],
    successCount: 0,
    failCount: 0,
    errors: [],
  };

  // ===== 服务层兜底校验：关键帧依赖检查（Requirements 7.1, 7.2）=====
  if (!skipDependencyCheck) {
    const { canGenerateKeyframes } = await import('./generationController');
    const dependencyCheck = await canGenerateKeyframes(projectId);
    
    if (!dependencyCheck.canGenerate) {
      result.errors.push(dependencyCheck.message || '参考图未完成，无法生成关键帧');
      console.warn('[generateAllKeyframes] Dependency check failed:', dependencyCheck);
      return result;
    }
  }

  // 获取项目数据
  const project = await getProject(projectId);
  if (!project) {
    result.errors.push('项目不存在');
    return result;
  }

  const imageDesigner = project.imageDesigner;
  if (!imageDesigner) {
    result.errors.push('请先完成图像设计阶段');
    return result;
  }

  const artistData = project.artist;
  if (!artistData?.characterImages?.length || !artistData?.sceneImages?.length) {
    result.errors.push('请先生成角色和场景参考图');
    return result;
  }

  const { characterPrompts, scenePrompts, keyframePrompts } = extractPromptsFromImageDesigner(imageDesigner);

  // 构建参考图URL映射 (code -> cloudUrl)
  const referenceUrlMap = new Map<string, string>();
  
  for (const img of artistData.characterImages) {
    if (img.status === 'completed' && img.assetId) {
      const asset = await getAsset(img.assetId);
      if (asset?.cloudUrl) {
        const prompt = characterPrompts.find(p => p.id === img.promptId);
        if (prompt) referenceUrlMap.set(prompt.code, asset.cloudUrl);
      }
    }
  }
  
  for (const img of artistData.sceneImages) {
    if (img.status === 'completed' && img.assetId) {
      const asset = await getAsset(img.assetId);
      if (asset?.cloudUrl) {
        const prompt = scenePrompts.find(p => p.id === img.promptId);
        if (prompt) referenceUrlMap.set(prompt.code, asset.cloudUrl);
      }
    }
  }

  // 准备关键帧生成任务
  const keyframeTasks: Array<{ id: string; prompt: string; referenceUrl: string; name: string }> = [];
  const textOnlyTasks: Array<{ id: string; prompt: string; name: string }> = [];

  for (const kfPrompt of keyframePrompts) {
    // 查找参考图URL
    const referenceInfos = kfPrompt.referenceIds
      .map(refId => {
        const url = referenceUrlMap.get(refId);
        if (!url) return null;
        const charPrompt = characterPrompts.find(p => p.code === refId);
        const scenePrompt = scenePrompts.find(p => p.code === refId);
        const name = charPrompt?.name || scenePrompt?.name || refId;
        const type = refId.startsWith('R-P') ? 'character' : 'scene';
        return { refId, url, name, type };
      })
      .filter((info): info is NonNullable<typeof info> => info !== null);

    if (referenceInfos.length > 0) {
      // 构建增强版提示词
      const refDescriptions = referenceInfos.map((info, idx) => {
        const typeLabel = info.type === 'character' ? '人物' : '场景';
        return `参考图${idx + 1}是${info.name}（${typeLabel}）`;
      }).join('，');
      
      const enhancedPrompt = `${refDescriptions}。画面：${kfPrompt.prompt}`;
      
      keyframeTasks.push({
        id: kfPrompt.id,
        prompt: enhancedPrompt,
        referenceUrl: referenceInfos[0].url,
        name: kfPrompt.code,
      });
    } else {
      // 没有参考图，使用文生图
      textOnlyTasks.push({
        id: kfPrompt.id,
        prompt: kfPrompt.prompt,
        name: kfPrompt.code,
      });
    }
  }

  const keyframeImages: GeneratedImage[] = [];

  // 先执行图生图任务
  if (keyframeTasks.length > 0) {
    const img2imgResults = await batchGenerateImagesFromImage(
      projectId,
      keyframeTasks,
      {
        width,
        height,
        onProgress: (progress) => {
          const task = keyframeTasks.find(t => t.id === progress.currentId);
          onProgress?.({
            phase: 'keyframes',
            completed: progress.completed,
            total: keyframeTasks.length + textOnlyTasks.length,
            currentName: task?.name,
            success: progress.success,
            error: progress.error,
          });
        },
      }
    );

    for (const task of keyframeTasks) {
      const genResult = img2imgResults.get(task.id);
      const imageUrl = genResult?.asset?.localData || genResult?.cloudUrl || '';
      
      keyframeImages.push({
        id: crypto.randomUUID(),
        promptId: task.id,
        assetId: genResult?.asset?.id || '',
        status: genResult?.success ? 'completed' : 'failed',
        error: genResult?.error,
        imageUrl: genResult?.success ? imageUrl : undefined,
        name: task.name,
        isStale: false,
      });

      if (genResult?.success) {
        result.successCount++;
      } else {
        result.failCount++;
        if (genResult?.error) result.errors.push(`${task.name}: ${genResult.error}`);
      }
    }
  }

  // 再执行文生图任务
  if (textOnlyTasks.length > 0) {
    const txt2imgResults = await batchGenerateImagesFromText(
      projectId,
      textOnlyTasks,
      {
        width,
        height,
        onProgress: (progress) => {
          const task = textOnlyTasks.find(t => t.id === progress.currentId);
          onProgress?.({
            phase: 'keyframes',
            completed: keyframeTasks.length + progress.completed,
            total: keyframeTasks.length + textOnlyTasks.length,
            currentName: task?.name,
            success: progress.success,
            error: progress.error,
          });
        },
      }
    );

    for (const task of textOnlyTasks) {
      const genResult = txt2imgResults.get(task.id);
      const imageUrl = genResult?.asset?.localData || genResult?.cloudUrl || '';
      
      keyframeImages.push({
        id: crypto.randomUUID(),
        promptId: task.id,
        assetId: genResult?.asset?.id || '',
        status: genResult?.success ? 'completed' : 'failed',
        error: genResult?.error,
        imageUrl: genResult?.success ? imageUrl : undefined,
        name: task.name,
        isStale: false,
      });

      if (genResult?.success) {
        result.successCount++;
      } else {
        result.failCount++;
        if (genResult?.error) result.errors.push(`${task.name}: ${genResult.error}`);
      }
    }
  }

  // 保存结果
  result.images = keyframeImages;
  artistData.keyframeImages = keyframeImages;
  await updateProject({ ...project, artist: artistData });

  result.success = result.failCount === 0;
  return result;
}

/**
 * 重新生成单张图片
 */
export async function regenerateSingleImage(
  projectId: string,
  imageId: string,
  phase: 'characters' | 'scenes' | 'keyframes'
): Promise<GeneratedImage | null> {
  const project = await getProject(projectId);
  if (!project?.artist || !project.imageDesigner) return null;

  // 根据 phase 找到对应的图片和提示词
  let images: GeneratedImage[];
  let prompts: ReferencePrompt[] | KeyframePrompt[];
  
  switch (phase) {
    case 'characters':
      images = project.artist.characterImages;
      prompts = project.imageDesigner.characterPrompts;
      break;
    case 'scenes':
      images = project.artist.sceneImages;
      prompts = project.imageDesigner.scenePrompts;
      break;
    case 'keyframes':
      images = project.artist.keyframeImages;
      prompts = project.imageDesigner.keyframePrompts;
      break;
  }

  const imageIndex = images.findIndex(img => img.id === imageId);
  if (imageIndex === -1) return null;

  const image = images[imageIndex];
  const prompt = prompts.find(p => p.id === image.promptId);
  if (!prompt) return null;

  // 重新生成
  const genResult = await generateImageFromText(projectId, {
    prompt: prompt.prompt,
    width: 1024,
    height: 1024,
  });

  // 更新图片信息
  const updatedImage: GeneratedImage = {
    ...image,
    assetId: genResult.asset?.id || '',
    status: genResult.success ? 'completed' : 'failed',
    error: genResult.error,
  };

  images[imageIndex] = updatedImage;

  // 保存到项目
  await updateProject(project);

  return updatedImage;
}

/** 手动模式生成结果 */
export interface GenerateNextResult {
  success: boolean;
  image?: GeneratedImage;
  phase: GenerationPhase;
  currentIndex: number;
  totalInPhase: number;
  isAllDone: boolean;
  nextPhase?: GenerationPhase;
  error?: string;
}

/** 生成配置选项 */
export interface GenerateNextOptions {
  txt2imgModel?: string;
  img2imgModel?: string;
}

/**
 * 手动模式：生成下一张图片
 * 返回生成结果和进度信息
 */
export async function generateNextImage(
  projectId: string,
  options: GenerateNextOptions = {}
): Promise<GenerateNextResult> {
  const { txt2imgModel = 'flux', img2imgModel = 'kontext' } = options;
  // 获取项目数据
  const project = await getProject(projectId);
  if (!project) {
    return { success: false, phase: 'error', currentIndex: 0, totalInPhase: 0, isAllDone: false, error: '项目不存在' };
  }

  // 获取图像设计阶段数据
  const imageDesigner = project.imageDesigner;
  if (!imageDesigner) {
    return { success: false, phase: 'error', currentIndex: 0, totalInPhase: 0, isAllDone: false, error: '请先完成图像设计阶段' };
  }

  const { characterPrompts, scenePrompts, keyframePrompts } = extractPromptsFromImageDesigner(imageDesigner);
  
  // 获取已生成的图片
  const artistData = project.artist || {
    characterImages: [],
    sceneImages: [],
    keyframeImages: [],
    isStale: false,
  };

  // 存储已生成的参考图 URL 映射 (refId -> cloudUrl)
  const referenceUrlMap = new Map<string, string>();
  
  // 从已生成的图片中构建 URL 映射
  for (const img of artistData.characterImages) {
    if (img.status === 'completed' && img.assetId) {
      const asset = await getAsset(img.assetId);
      if (asset?.cloudUrl) {
        // 找到对应的 prompt 获取 code
        const prompt = characterPrompts.find(p => p.id === img.promptId);
        if (prompt) {
          referenceUrlMap.set(prompt.code, asset.cloudUrl);
        }
      }
    }
  }
  for (const img of artistData.sceneImages) {
    if (img.status === 'completed' && img.assetId) {
      const asset = await getAsset(img.assetId);
      if (asset?.cloudUrl) {
        const prompt = scenePrompts.find(p => p.id === img.promptId);
        if (prompt) {
          referenceUrlMap.set(prompt.code, asset.cloudUrl);
        }
      }
    }
  }

  // 确定下一个要生成的图片
  const completedCharacters = artistData.characterImages.filter(img => img.status === 'completed').length;
  const completedScenes = artistData.sceneImages.filter(img => img.status === 'completed').length;
  const completedKeyframes = artistData.keyframeImages.filter(img => img.status === 'completed').length;

  // 阶段1: 生成角色参考图
  if (completedCharacters < characterPrompts.length) {
    const nextIndex = completedCharacters;
    const prompt = characterPrompts[nextIndex];
    
    // 检查是否存在相同 promptId 的失败图片，如果有则替换
    const existingFailedIndex = artistData.characterImages.findIndex(
      img => img.promptId === prompt.id && img.status === 'failed'
    );
    
    const genResult = await generateImageFromText(projectId, {
      prompt: prompt.prompt,
      width: 1024,
      height: 1024,
      model: txt2imgModel,
    });

    const imageUrl = genResult.asset?.localData || genResult.cloudUrl || '';
    
    const image: GeneratedImage = {
      id: existingFailedIndex >= 0 ? artistData.characterImages[existingFailedIndex].id : crypto.randomUUID(),
      promptId: prompt.id,
      assetId: genResult.asset?.id || '',
      status: genResult.success ? 'completed' : 'failed',
      error: genResult.error,
      imageUrl: genResult.success ? imageUrl : undefined,
      name: prompt.name,
      isStale: false,
    };

    // 保存进度：如果存在失败图片则替换，否则新建
    if (existingFailedIndex >= 0) {
      artistData.characterImages[existingFailedIndex] = image;
    } else {
      artistData.characterImages.push(image);
    }
    await updateProject({ ...project, artist: artistData });

    const isLastInPhase = nextIndex + 1 >= characterPrompts.length;
    return {
      success: genResult.success,
      image,
      phase: 'characters',
      currentIndex: nextIndex + 1,
      totalInPhase: characterPrompts.length,
      isAllDone: false,
      nextPhase: isLastInPhase ? (scenePrompts.length > 0 ? 'scenes' : (keyframePrompts.length > 0 ? 'keyframes' : 'completed')) : 'characters',
      error: genResult.error,
    };
  }

  // 阶段2: 生成场景参考图
  if (completedScenes < scenePrompts.length) {
    const nextIndex = completedScenes;
    const prompt = scenePrompts[nextIndex];
    
    // 检查是否存在相同 promptId 的失败图片，如果有则替换
    const existingFailedIndex = artistData.sceneImages.findIndex(
      img => img.promptId === prompt.id && img.status === 'failed'
    );
    
    const genResult = await generateImageFromText(projectId, {
      prompt: prompt.prompt,
      width: 1024,
      height: 1024,
      model: txt2imgModel,
    });

    const imageUrl = genResult.asset?.localData || genResult.cloudUrl || '';
    
    const image: GeneratedImage = {
      id: existingFailedIndex >= 0 ? artistData.sceneImages[existingFailedIndex].id : crypto.randomUUID(),
      promptId: prompt.id,
      assetId: genResult.asset?.id || '',
      status: genResult.success ? 'completed' : 'failed',
      error: genResult.error,
      imageUrl: genResult.success ? imageUrl : undefined,
      name: prompt.name,
      isStale: false,
    };

    // 保存进度：如果存在失败图片则替换，否则新建
    if (existingFailedIndex >= 0) {
      artistData.sceneImages[existingFailedIndex] = image;
    } else {
      artistData.sceneImages.push(image);
    }
    await updateProject({ ...project, artist: artistData });

    const isLastInPhase = nextIndex + 1 >= scenePrompts.length;
    return {
      success: genResult.success,
      image,
      phase: 'scenes',
      currentIndex: nextIndex + 1,
      totalInPhase: scenePrompts.length,
      isAllDone: false,
      nextPhase: isLastInPhase ? (keyframePrompts.length > 0 ? 'keyframes' : 'completed') : 'scenes',
      error: genResult.error,
    };
  }

  // 阶段3: 生成关键帧图片
  if (completedKeyframes < keyframePrompts.length) {
    // ===== 服务层兜底校验：关键帧依赖检查（Requirements 7.1, 7.2）=====
    const { canGenerateKeyframes } = await import('./generationController');
    const dependencyCheck = await canGenerateKeyframes(projectId);
    
    if (!dependencyCheck.canGenerate) {
      console.warn('[generateNextImage] Keyframe dependency check failed:', dependencyCheck);
      return {
        success: false,
        phase: 'keyframes',
        currentIndex: completedKeyframes,
        totalInPhase: keyframePrompts.length,
        isAllDone: false,
        error: dependencyCheck.message || '参考图未完成，无法生成关键帧',
      };
    }

    const nextIndex = completedKeyframes;
    const kfPrompt = keyframePrompts[nextIndex];
    
    // 检查是否存在相同 promptId 的失败图片，如果有则替换
    const existingFailedIndex = artistData.keyframeImages.findIndex(
      img => img.promptId === kfPrompt.id && img.status === 'failed'
    );
    
    // 查找参考图URL和名称
    const referenceInfos = kfPrompt.referenceIds
      .map(refId => {
        const url = referenceUrlMap.get(refId);
        if (!url) return null;
        // 根据 refId 查找对应的名称
        const charPrompt = characterPrompts.find(p => p.code === refId);
        const scenePrompt = scenePrompts.find(p => p.code === refId);
        const name = charPrompt?.name || scenePrompt?.name || refId;
        const type = refId.startsWith('R-P') ? 'character' : 'scene';
        return { refId, url, name, type };
      })
      .filter((info): info is NonNullable<typeof info> => info !== null);

    let genResult;
    if (referenceInfos.length > 0) {
      // 构建增强版提示词：在原有提示词前加上参考图说明
      const refDescriptions = referenceInfos.map((info, idx) => {
        const typeLabel = info.type === 'character' ? '人物' : '场景';
        return `参考图${idx + 1}是${info.name}（${typeLabel}）`;
      }).join('，');
      
      const enhancedPrompt = `${refDescriptions}。画面：${kfPrompt.prompt}`;
      
      console.log('[generateNextImage] 图生图增强提示词:', enhancedPrompt);
      
      genResult = await generateImageFromImage(projectId, {
        prompt: enhancedPrompt,
        referenceImageUrl: referenceInfos[0].url,
        width: 1024,
        height: 1024,
        model: img2imgModel,
      });
    } else {
      genResult = await generateImageFromText(projectId, {
        prompt: kfPrompt.prompt,
        width: 1024,
        height: 1024,
        model: txt2imgModel,
      });
    }

    const imageUrl = genResult.asset?.localData || genResult.cloudUrl || '';
    
    const image: GeneratedImage = {
      id: existingFailedIndex >= 0 ? artistData.keyframeImages[existingFailedIndex].id : crypto.randomUUID(),
      promptId: kfPrompt.id,
      assetId: genResult.asset?.id || '',
      status: genResult.success ? 'completed' : 'failed',
      error: genResult.error,
      imageUrl: genResult.success ? imageUrl : undefined,
      name: kfPrompt.code,
      isStale: false,
    };

    // 保存进度：如果存在失败图片则替换，否则新建
    if (existingFailedIndex >= 0) {
      artistData.keyframeImages[existingFailedIndex] = image;
    } else {
      artistData.keyframeImages.push(image);
    }
    await updateProject({ ...project, artist: artistData });

    const isLastInPhase = nextIndex + 1 >= keyframePrompts.length;
    return {
      success: genResult.success,
      image,
      phase: 'keyframes',
      currentIndex: nextIndex + 1,
      totalInPhase: keyframePrompts.length,
      isAllDone: isLastInPhase,
      nextPhase: isLastInPhase ? 'completed' : 'keyframes',
      error: genResult.error,
    };
  }

  // 所有图片都已生成
  return {
    success: true,
    phase: 'completed',
    currentIndex: 0,
    totalInPhase: 0,
    isAllDone: true,
  };
}
