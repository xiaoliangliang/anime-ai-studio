/**
 * GenerationController 模块导出
 * 美工阶段图片生成流程控制
 */

export { GenerationController } from './GenerationController';
export { GenerationQueue } from './GenerationQueue';
export * from './types';

import { GenerationController } from './GenerationController';
import { getProject } from '../storageService';
import type { GenerationControllerConfig, GenerationProgress } from './types';
import type { GeneratedImage } from '@/types';

/** 恢复状态结果 */
export interface RestoredState {
  /** 恢复后的控制器 */
  controller: GenerationController;
  /** 是否有待处理的图片 */
  hasPendingImages: boolean;
  /** 是否有失败的图片 */
  hasFailedImages: boolean;
  /** 已恢复的槽位 */
  slots: Map<string, GeneratedImage>;
  /** 恢复后的进度信息 */
  progress: GenerationProgress;
  /** 建议的初始状态 */
  suggestedState: 'idle' | 'paused' | 'blocked' | 'completed';
}

/**
 * 创建生成控制器
 */
export function createGenerationController(
  config: GenerationControllerConfig
): GenerationController {
  return new GenerationController(config);
}

/**
 * 从项目状态恢复控制器
 * 
 * 恢复逻辑（Requirements 4.2, 4.3, 4.4）：
 * 1. 从 IndexedDB 读取项目数据
 * 2. 初始化队列和槽位（基于 imageDesigner prompts）
 * 3. 恢复已有的图片数据（基于 artist data）
 * 4. 返回恢复状态信息，供 UI 使用
 * 
 * 恢复后控制器处于 idle 状态，调用方可以：
 * - 调用 start() 继续生成（会跳过已完成的图片）
 * - 调用 retryFailed() 重试失败的图片
 * - 直接使用 getSlots() 获取已恢复的图片用于展示
 * 
 * @param projectId 项目ID
 * @param config 控制器配置（不含 projectId）
 * @returns 恢复状态结果
 */
export async function restoreGenerationController(
  projectId: string,
  config: Omit<GenerationControllerConfig, 'projectId'>
): Promise<RestoredState> {
  const controller = new GenerationController({
    ...config,
    projectId,
  });
  
  // 调用控制器的恢复方法（不启动生成）
  await controller.restoreFromStorage();
  
  // 获取恢复后的状态
  const slots = controller.getSlots();
  const progress = controller.getProgress();
  const hasFailedImages = controller.hasFailedImages();
  
  // 计算是否有待处理的图片
  let pendingCount = 0;
  for (const slot of slots.values()) {
    if (slot.status === 'pending') {
      pendingCount++;
    }
  }
  const hasPendingImages = pendingCount > 0;
  
  // 确定建议的初始状态
  let suggestedState: 'idle' | 'paused' | 'blocked' | 'completed' = 'idle';
  if (hasFailedImages) {
    // 有失败的图片，建议进入 blocked 状态等待用户操作
    suggestedState = 'blocked';
  } else if (hasPendingImages) {
    // 有待处理的图片但没有失败，建议进入 paused 状态
    suggestedState = 'paused';
  } else if (slots.size > 0) {
    // 所有图片都已完成
    suggestedState = 'completed';
  }
  
  return {
    controller,
    hasPendingImages,
    hasFailedImages,
    slots,
    progress,
    suggestedState,
  };
}

/**
 * 获取待生成的图片数量
 */
export async function getPendingImageCount(projectId: string): Promise<{
  characters: number;
  scenes: number;
  keyframes: number;
  total: number;
}> {
  const project = await getProject(projectId);
  if (!project?.imageDesigner) {
    return { characters: 0, scenes: 0, keyframes: 0, total: 0 };
  }

  const imageDesigner = project.imageDesigner;
  const artistData = project.artist;

  const completedCharacters = artistData?.characterImages?.filter(
    img => img.status === 'completed'
  ).length || 0;
  const completedScenes = artistData?.sceneImages?.filter(
    img => img.status === 'completed'
  ).length || 0;
  const completedKeyframes = artistData?.keyframeImages?.filter(
    img => img.status === 'completed'
  ).length || 0;

  const totalCharacters = imageDesigner.characterPrompts?.length || 0;
  const totalScenes = imageDesigner.scenePrompts?.length || 0;
  const totalKeyframes = imageDesigner.keyframePrompts?.length || 0;

  const pendingCharacters = Math.max(0, totalCharacters - completedCharacters);
  const pendingScenes = Math.max(0, totalScenes - completedScenes);
  const pendingKeyframes = Math.max(0, totalKeyframes - completedKeyframes);

  return {
    characters: pendingCharacters,
    scenes: pendingScenes,
    keyframes: pendingKeyframes,
    total: pendingCharacters + pendingScenes + pendingKeyframes,
  };
}

/**
 * 获取失败的图片列表
 */
export async function getFailedImages(projectId: string): Promise<{
  characters: import('@/types').GeneratedImage[];
  scenes: import('@/types').GeneratedImage[];
  keyframes: import('@/types').GeneratedImage[];
}> {
  const project = await getProject(projectId);
  if (!project?.artist) {
    return { characters: [], scenes: [], keyframes: [] };
  }

  const artistData = project.artist;

  return {
    characters: artistData.characterImages?.filter(img => img.status === 'failed') || [],
    scenes: artistData.sceneImages?.filter(img => img.status === 'failed') || [],
    keyframes: artistData.keyframeImages?.filter(img => img.status === 'failed') || [],
  };
}

/** 关键帧依赖检查结果 */
export interface KeyframeDependencyCheckResult {
  /** 是否可以生成关键帧 */
  canGenerate: boolean;
  /** 总角色参考图数量 */
  totalCharacters: number;
  /** 已完成的角色参考图数量 */
  completedCharacters: number;
  /** 未完成的角色参考图数量（pending + generating） */
  pendingCharacters: number;
  /** 失败的角色参考图数量 */
  failedCharacters: number;
  /** 总场景参考图数量 */
  totalScenes: number;
  /** 已完成的场景参考图数量 */
  completedScenes: number;
  /** 未完成的场景参考图数量（pending + generating） */
  pendingScenes: number;
  /** 失败的场景参考图数量 */
  failedScenes: number;
  /** 用户可读的提示消息 */
  message?: string;
  /** 失败的角色参考图名称列表 */
  failedCharacterNames: string[];
  /** 失败的场景参考图名称列表 */
  failedSceneNames: string[];
}

/**
 * 检查关键帧生成前置条件（Requirements 7.1, 7.2, 7.3）
 * 
 * 关键帧依赖规则：
 * - 所有角色参考图必须 status=completed
 * - 所有场景参考图必须 status=completed
 * - 任一参考图为 failed/pending/generating 时阻止关键帧生成
 * 
 * @param projectId 项目ID
 * @returns 依赖检查结果，包含详细的状态信息和用户可读的提示消息
 */
export async function canGenerateKeyframes(projectId: string): Promise<KeyframeDependencyCheckResult> {
  const project = await getProject(projectId);
  
  // 默认结果
  const defaultResult: KeyframeDependencyCheckResult = {
    canGenerate: false,
    totalCharacters: 0,
    completedCharacters: 0,
    pendingCharacters: 0,
    failedCharacters: 0,
    totalScenes: 0,
    completedScenes: 0,
    pendingScenes: 0,
    failedScenes: 0,
    failedCharacterNames: [],
    failedSceneNames: [],
  };

  if (!project?.imageDesigner) {
    return {
      ...defaultResult,
      message: '请先完成图像设计阶段',
    };
  }

  const imageDesigner = project.imageDesigner;
  const artistData = project.artist;

  const totalCharacters = imageDesigner.characterPrompts?.length || 0;
  const totalScenes = imageDesigner.scenePrompts?.length || 0;

  // 如果没有参考图需求，直接允许生成关键帧
  if (totalCharacters === 0 && totalScenes === 0) {
    return {
      ...defaultResult,
      canGenerate: true,
    };
  }

  // 统计角色参考图状态
  const characterImages = artistData?.characterImages || [];
  const completedCharacters = characterImages.filter(img => img.status === 'completed').length;
  const failedCharacters = characterImages.filter(img => img.status === 'failed').length;
  const pendingCharacters = totalCharacters - completedCharacters - failedCharacters;
  const failedCharacterNames = characterImages
    .filter(img => img.status === 'failed')
    .map(img => img.name || img.promptId);

  // 统计场景参考图状态
  const sceneImages = artistData?.sceneImages || [];
  const completedScenes = sceneImages.filter(img => img.status === 'completed').length;
  const failedScenes = sceneImages.filter(img => img.status === 'failed').length;
  const pendingScenes = totalScenes - completedScenes - failedScenes;
  const failedSceneNames = sceneImages
    .filter(img => img.status === 'failed')
    .map(img => img.name || img.promptId);

  // 判断是否可以生成关键帧：所有参考图必须 completed
  const canGenerate = 
    completedCharacters === totalCharacters && 
    completedScenes === totalScenes;

  // 构建用户可读的提示消息
  let message: string | undefined;
  if (!canGenerate) {
    const parts: string[] = [];
    
    // 失败的参考图优先提示
    if (failedCharacters > 0) {
      parts.push(`${failedCharacters} 个角色参考图生成失败（${failedCharacterNames.join('、')}）`);
    }
    if (failedScenes > 0) {
      parts.push(`${failedScenes} 个场景参考图生成失败（${failedSceneNames.join('、')}）`);
    }
    
    // 未完成的参考图
    if (pendingCharacters > 0) {
      parts.push(`${pendingCharacters} 个角色参考图待生成`);
    }
    if (pendingScenes > 0) {
      parts.push(`${pendingScenes} 个场景参考图待生成`);
    }
    
    message = `请先完成所有参考图：${parts.join('，')}`;
  }

  return {
    canGenerate,
    totalCharacters,
    completedCharacters,
    pendingCharacters,
    failedCharacters,
    totalScenes,
    completedScenes,
    pendingScenes,
    failedScenes,
    failedCharacterNames,
    failedSceneNames,
    message,
  };
}

/**
 * 验证关键帧生成依赖（服务层兜底校验）
 * 
 * 此函数用于在关键帧生成 service/API 调用入口处进行校验，
 * 防止绕过 UI 直接调用 API 时跳过依赖检查。
 * 
 * @param projectId 项目ID
 * @throws Error 如果依赖不满足，抛出包含详细信息的错误
 */
export async function validateKeyframeDependencies(projectId: string): Promise<void> {
  const result = await canGenerateKeyframes(projectId);
  
  if (!result.canGenerate) {
    const error = new Error(result.message || '参考图未完成，无法生成关键帧');
    // 附加详细信息到错误对象
    (error as any).dependencyCheckResult = result;
    throw error;
  }
}

/**
 * 重新生成单张图片（便捷函数）
 * 
 * 此函数创建一个临时控制器来重新生成单张图片。
 * 适用于 UI 中点击单张图片的"重新生成"按钮的场景。
 * 
 * @param projectId 项目ID
 * @param imageKey 图片的唯一键（格式：${phase}:${promptId}）
 * @param callbacks 可选的回调函数
 * @returns 重新生成后的图片，如果失败则返回带有错误信息的图片对象
 */
export async function regenerateSingleImage(
  projectId: string,
  imageKey: string,
  options?: {
    width?: number;
    height?: number;
    onProgress?: (progress: GenerationProgress) => void;
    onImageGenerated?: (image: GeneratedImage, phase: import('./types').GenerationPhase) => void;
    onError?: (error: string) => void;
  }
): Promise<GeneratedImage | null> {
  // 创建控制器并恢复状态
  const controller = new GenerationController({
    projectId,
    width: options?.width,
    height: options?.height,
    onProgress: options?.onProgress,
    onImageGenerated: options?.onImageGenerated,
    onError: options?.onError,
  });
  
  // 恢复现有状态
  await controller.restoreFromStorage();
  
  // 重新生成单张图片
  return controller.regenerateSingle(imageKey);
}
