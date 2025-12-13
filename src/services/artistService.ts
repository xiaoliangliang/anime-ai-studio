/**
 * 美工阶段图片生成服务
 * 串行生成角色参考图、场景参考图、关键帧图片
 */

import { generateImageFromText, generateImageFromImage, getImageUrl } from './imageService';
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
  
  // 新格式
  const newData = imageDesigner as ImageDesignerData;
  return {
    characterPrompts: newData.characterPrompts || [],
    scenePrompts: newData.scenePrompts || [],
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

      // 查找参考图URL
      const referenceUrls = kfPrompt.referenceIds
        .map(refId => referenceUrlMap.get(refId))
        .filter((url): url is string => !!url);

      let genResult;
      
      if (referenceUrls.length > 0) {
        // 有参考图时使用图生图
        // 使用第一张参考图作为主参考图
        genResult = await generateImageFromImage(projectId, {
          prompt: kfPrompt.prompt,
          referenceImageUrl: referenceUrls[0],
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
      hasErrors: false,
    };
  }

  const countCompleted = (images: GeneratedImage[]) => 
    images.filter(img => img.status === 'completed').length;
  
  const hasErrors = (images: GeneratedImage[]) => 
    images.some(img => img.status === 'failed');

  return {
    totalCharacters: artistData.characterImages.length,
    completedCharacters: countCompleted(artistData.characterImages),
    totalScenes: artistData.sceneImages.length,
    completedScenes: countCompleted(artistData.sceneImages),
    totalKeyframes: artistData.keyframeImages.length,
    completedKeyframes: countCompleted(artistData.keyframeImages),
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
    
    const genResult = await generateImageFromText(projectId, {
      prompt: prompt.prompt,
      width: 1024,
      height: 1024,
      model: txt2imgModel,
    });

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

    // 保存进度
    artistData.characterImages.push(image);
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
    
    const genResult = await generateImageFromText(projectId, {
      prompt: prompt.prompt,
      width: 1024,
      height: 1024,
      model: txt2imgModel,
    });

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

    artistData.sceneImages.push(image);
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
    const nextIndex = completedKeyframes;
    const kfPrompt = keyframePrompts[nextIndex];
    
    // 查找参考图URL
    const referenceUrls = kfPrompt.referenceIds
      .map(refId => referenceUrlMap.get(refId))
      .filter((url): url is string => !!url);

    let genResult;
    if (referenceUrls.length > 0) {
      genResult = await generateImageFromImage(projectId, {
        prompt: kfPrompt.prompt,
        referenceImageUrl: referenceUrls[0],
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
      id: crypto.randomUUID(),
      promptId: kfPrompt.id,
      assetId: genResult.asset?.id || '',
      status: genResult.success ? 'completed' : 'failed',
      error: genResult.error,
      imageUrl: genResult.success ? imageUrl : undefined,
      name: kfPrompt.code,
      isStale: false,
    };

    artistData.keyframeImages.push(image);
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
