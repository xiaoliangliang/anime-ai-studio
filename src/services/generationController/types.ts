/**
 * GenerationController 类型定义
 * 美工阶段图片生成流程的状态管理
 */

import type { GeneratedImage } from '@/types';

/** 生成状态 */
export type GenerationState = 
  | 'idle'       // 空闲：未开始或已重置
  | 'running'    // 运行中：正在生成图片
  | 'pausing'    // 暂停中：停止调度新任务，等待在途请求结束
  | 'paused'     // 已暂停：等待用户继续
  | 'blocked'    // 阻塞：因单张失败停止调度，等待用户"重新生成/重置"
  | 'completed'  // 已完成：所有图片生成完成
  | 'error';     // 致命错误：流程无法继续，需要重置

/** 生成阶段 */
export type GenerationPhase = 'idle' | 'characters' | 'scenes' | 'keyframes' | 'completed' | 'error';

/** 状态转换规则 */
export const STATE_TRANSITIONS: Record<GenerationState, GenerationState[]> = {
  idle: ['running'],
  running: ['pausing', 'blocked', 'completed', 'error'],
  pausing: ['paused', 'blocked', 'error'],
  paused: ['running', 'idle'],
  blocked: ['running', 'idle'],
  completed: ['idle', 'running'],
  error: ['idle'],
};

/**
 * 验证状态转换是否合法
 */
export function isValidTransition(from: GenerationState, to: GenerationState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 队列项状态 */
export type QueueItemStatus = 'pending' | 'generating' | 'completed' | 'failed';

/** 队列项 */
export interface QueueItem {
  id: string;
  promptId: string;
  prompt: string;
  phase: GenerationPhase;
  name: string;
  referenceUrl?: string;  // 用于 img2img
  status: QueueItemStatus;
  error?: string;
  imageKey: string;  // 稳定唯一键: ${phase}:${promptId}
}

/** 生成进度 */
export interface GenerationProgress {
  /** 当前状态 */
  state: GenerationState;
  /** 当前阶段 */
  phase: GenerationPhase;
  /** 当前阶段已完成数量 */
  current: number;
  /** 当前阶段总数量 */
  total: number;
  /** 总体已完成数量 */
  overallCompleted: number;
  /** 总体总数量 */
  overallTotal: number;
  /** 当前正在生成的图片名称 */
  currentItem?: string;
  /** 失败数量 */
  failedCount: number;
  /** 错误信息 */
  error?: string;
}

/** 生成控制器配置 */
export interface GenerationControllerConfig {
  projectId: string;
  /** 生成图片宽度，默认 1024 */
  width?: number;
  /** 生成图片高度，默认 1024 */
  height?: number;
  onProgress?: (progress: GenerationProgress) => void;
  onImageGenerated?: (image: GeneratedImage, phase: GenerationPhase) => void;
  onStateChange?: (state: GenerationState, previousState: GenerationState) => void;
  onComplete?: (result: GenerateAllImagesResult) => void;
  onError?: (error: string) => void;
}

/** 生成结果 */
export interface GenerateAllImagesResult {
  success: boolean;
  characterImages: GeneratedImage[];
  sceneImages: GeneratedImage[];
  keyframeImages: GeneratedImage[];
  errors: string[];
}

/** 重试选项 */
export interface RetryOptions {
  /** 是否包含 pending 状态的图片，默认 true */
  includePending?: boolean;
}

/** 生成控制器接口 */
export interface IGenerationController {
  /** 当前状态 */
  readonly state: GenerationState;
  
  /** 当前阶段 */
  readonly phase: GenerationPhase;
  
  /** 开始生成 */
  start(): Promise<void>;
  
  /** 暂停生成 */
  pause(): void;
  
  /** 继续生成 */
  resume(): Promise<void>;
  
  /** 重置状态 */
  reset(): void;
  
  /** 重试失败的图片 */
  retryFailed(options?: RetryOptions): Promise<void>;
  
  /** 重新生成单张图片 */
  regenerateSingle(imageKey: string): Promise<GeneratedImage | null>;
  
  /** 获取当前进度 */
  getProgress(): GenerationProgress;
  
  /** 获取失败的图片列表 */
  getFailedImages(): GeneratedImage[];
  
  /** 是否有失败的图片 */
  hasFailedImages(): boolean;
  
  /** 获取所有槽位 */
  getSlots(): Map<string, GeneratedImage>;
  
  /** 从存储恢复状态（不启动生成） */
  restoreFromStorage(): Promise<void>;
}

/** 生成队列接口 */
export interface IGenerationQueue {
  /** 添加任务 */
  enqueue(item: QueueItem): void;
  
  /** 批量添加任务 */
  enqueueAll(items: QueueItem[]): void;
  
  /** 获取下一个待处理任务 */
  dequeue(): QueueItem | null;
  
  /** 获取所有待处理任务 */
  getPending(): QueueItem[];
  
  /** 获取所有失败任务 */
  getFailed(): QueueItem[];
  
  /** 获取所有任务 */
  getAll(): QueueItem[];
  
  /** 更新任务状态 */
  updateStatus(id: string, status: QueueItemStatus, error?: string): void;
  
  /** 重置失败任务为待处理 */
  resetFailed(includePending?: boolean): void;
  
  /** 清空队列 */
  clear(): void;
  
  /** 队列是否为空（无 pending 任务） */
  isEmpty(): boolean;
  
  /** 获取队列长度 */
  size(): number;
  
  /** 获取指定阶段的任务 */
  getByPhase(phase: GenerationPhase): QueueItem[];
  
  /** 根据 imageKey 获取任务 */
  getByImageKey(imageKey: string): QueueItem | undefined;
}
