/**
 * GenerationController - 图片生成流程控制器
 * 管理美工阶段图片生成的暂停、继续、重试等操作
 */

import type {
  IGenerationController,
  GenerationState,
  GenerationPhase,
  GenerationProgress,
  GenerationControllerConfig,
  GenerateAllImagesResult,
  RetryOptions,
  QueueItem,
} from './types';
import { isValidTransition } from './types';
import { GenerationQueue } from './GenerationQueue';
import { getProject, updateProject, getAsset } from '../storageService';
import { generateImageFromText, generateImageFromImage } from '../imageService';
import { getCurrentProviderConfig } from '@/config/imageProviders';
import type { 
  GeneratedImage, 
  Project, 
  ArtistData,
  ReferencePrompt,
  KeyframePrompt,
  ImageDesignerData,
} from '@/types';

/** 旧版图像设计数据格式（兼容） */
interface LegacyImageDesignerData {
  referenceImages: Array<{
    refId: string;
    type: 'character' | 'scene';
    name: string;
    prompt: string;
  }>;
  keyframes: Array<{
    shotId: string;
    frameNumber: number;
    prompt: string;
    referenceIds?: string[];
  }>;
  isStale: boolean;
}

export class GenerationController implements IGenerationController {
  private _state: GenerationState = 'idle';
  private _phase: GenerationPhase = 'idle';
  private queue: GenerationQueue;
  private config: GenerationControllerConfig;
  private slots: Map<string, GeneratedImage> = new Map();
  private inFlightCount: number = 0;
  private shouldPause: boolean = false;
  private referenceUrlMap: Map<string, string> = new Map();
  private characterPrompts: ReferencePrompt[] = [];
  private scenePrompts: ReferencePrompt[] = [];
  private keyframePrompts: KeyframePrompt[] = [];

  constructor(config: GenerationControllerConfig) {
    this.config = config;
    this.queue = new GenerationQueue();
  }

  get state(): GenerationState {
    return this._state;
  }

  get phase(): GenerationPhase {
    return this._phase;
  }

  /**
   * 状态转换
   */
  private setState(newState: GenerationState): void {
    if (this._state === newState) return;
    
    if (!isValidTransition(this._state, newState)) {
      console.warn(`[GenerationController] Invalid state transition: ${this._state} -> ${newState}`);
      return;
    }

    const previousState = this._state;
    this._state = newState;
    this.config.onStateChange?.(newState, previousState);
    this.notifyProgress();
  }

  /**
   * 阶段转换
   */
  private setPhase(newPhase: GenerationPhase): void {
    if (this._phase === newPhase) return;
    this._phase = newPhase;
    this.notifyProgress();
  }

  /**
   * 开始生成
   * 
   * 如果已经调用过 restoreFromStorage()，则直接使用已恢复的槽位
   * 否则会初始化队列和槽位
   */
  async start(): Promise<void> {
    if (this._state !== 'idle' && this._state !== 'completed') {
      console.warn(`[GenerationController] Cannot start from state: ${this._state}`);
      return;
    }

    const project = await getProject(this.config.projectId);
    if (!project) {
      this.config.onError?.('项目不存在');
      return;
    }

    const imageDesigner = project.imageDesigner;
    if (!imageDesigner) {
      this.config.onError?.('请先完成图像设计阶段');
      return;
    }

    // 检查是否已经恢复过（slots 不为空说明已恢复）
    const alreadyRestored = this.slots.size > 0;
    
    if (!alreadyRestored) {
      // 提取提示词
      const { characterPrompts, scenePrompts, keyframePrompts } = 
        this.extractPromptsFromImageDesigner(imageDesigner);
      
      this.characterPrompts = characterPrompts;
      this.scenePrompts = scenePrompts;
      this.keyframePrompts = keyframePrompts;

      // 初始化队列和槽位
      this.initializeQueue(characterPrompts, scenePrompts, keyframePrompts);
      
      // 恢复已有的图片数据
      await this.restoreExistingImages(project);
    }

    this.setState('running');
    this.shouldPause = false;

    // 开始处理队列
    await this.processQueue();
  }

  /**
   * 暂停生成
   */
  pause(): void {
    if (this._state !== 'running') {
      console.warn(`[GenerationController] Cannot pause from state: ${this._state}`);
      return;
    }

    this.shouldPause = true;
    
    if (this.inFlightCount > 0) {
      this.setState('pausing');
    } else {
      this.setState('paused');
    }
  }

  /**
   * 继续生成
   */
  async resume(): Promise<void> {
    // 常规：从 paused 继续
    if (this._state === 'paused') {
      this.shouldPause = false;
      this.setState('running');
      await this.processQueue();
      return;
    }

    // 兼容：从 restore 后的 idle/completed 继续（相当于 start）
    if (this._state === 'idle' || this._state === 'completed') {
      await this.start();
      return;
    }

    console.warn(`[GenerationController] Cannot resume from state: ${this._state}`);
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.shouldPause = false;
    this.inFlightCount = 0;
    this.queue.clear();
    this.slots.clear();
    this.referenceUrlMap.clear();
    this._phase = 'idle';
    this._state = 'idle';
    this.config.onStateChange?.('idle', this._state);
  }

  /**
   * 重试失败的图片
   * 
   * 智能重试逻辑（Requirements 3.1, 3.2, 3.5, 3.6）：
   * - 默认 includePending=true，重试 failed + pending 状态的图片
   * - 保留所有 completed 状态的图片不变
   * - 在 blocked 状态下可作为恢复手段
   * 
   * @param options.includePending 是否包含 pending 状态的图片，默认 true
   */
  async retryFailed(options: RetryOptions = {}): Promise<void> {
    const { includePending = true } = options;

    // 仅在运行中/暂停中时禁止重试，其他状态（idle/blocked/paused/completed/error）均允许
    if (this._state === 'running' || this._state === 'pausing') {
      console.warn(`[GenerationController] Cannot retry while ${this._state}`);
      return;
    }

    // 统计重试前的状态（用于日志）
    const stats = this.queue.getStats();
    console.log(`[GenerationController] retryFailed called: includePending=${includePending}, ` +
      `failed=${stats.failed}, pending=${stats.pending}, completed=${stats.completed}`);

    // 重置队列中的失败任务为 pending
    // 注意：completed 状态的任务不会被重置
    this.queue.resetFailed(includePending);

    // 同步更新槽位状态
    // 只更新 failed 状态的槽位（和可选的 pending 状态）
    // completed 状态的槽位保持不变
    for (const item of this.queue.getAll()) {
      const slot = this.slots.get(item.imageKey);
      if (!slot) continue;

      // 只处理需要重试的槽位
      if (slot.status === 'failed') {
        // 失败的槽位重置为 pending
        slot.status = 'pending';
        slot.error = undefined;
      }
      // completed 状态的槽位保持不变（Requirements 3.2）
      // pending 状态的槽位保持 pending（如果 includePending=true，它们会被继续处理）
    }

    // 重置暂停标志
    this.shouldPause = false;

    // 转换到 running 状态
    this.setState('running');

    // 更新阶段（可能需要回到之前的阶段）
    this.updateCurrentPhase();

    // 继续处理队列
    await this.processQueue();
  }

  /**
   * 重新生成单张图片
   * 
   * 单张图片重新生成逻辑（Requirements 6.1, 6.2, 6.3, 6.4）：
   * - 只重新生成指定的单张图片
   * - 不影响其他图片的状态
   * - 可以在任何状态下调用（idle, paused, blocked, completed）
   * - 不会改变控制器的整体状态
   * 
   * @param imageKey 图片的唯一键（格式：${phase}:${promptId}）
   * @returns 重新生成后的图片，如果失败则返回带有错误信息的图片对象
   */
  async regenerateSingle(imageKey: string): Promise<GeneratedImage | null> {
    // 验证 imageKey 是否存在
    const queueItem = this.queue.getByImageKey(imageKey);
    if (!queueItem) {
      console.warn(`[GenerationController] Image not found: ${imageKey}`);
      return null;
    }

    // 检查控制器状态：不允许在 running 或 pausing 状态下进行单张重生
    // 因为这可能会与正在进行的批量生成冲突
    if (this._state === 'running' || this._state === 'pausing') {
      console.warn(`[GenerationController] Cannot regenerate single image while ${this._state}`);
      this.config.onError?.(`无法在${this._state === 'running' ? '生成中' : '暂停中'}状态下重新生成单张图片`);
      return null;
    }

    // 获取当前槽位
    const existingSlot = this.slots.get(imageKey);
    if (!existingSlot) {
      console.warn(`[GenerationController] Slot not found: ${imageKey}`);
      return null;
    }

    // 保存原始状态，以便在失败时恢复
    const originalStatus = existingSlot.status;
    const originalError = existingSlot.error;

    // 更新状态为 generating
    this.queue.updateStatus(queueItem.id, 'generating');
    existingSlot.status = 'generating';
    existingSlot.error = undefined;

    // 通知进度更新
    this.notifyProgress();

    try {
      const result = await this.generateSingleImage(queueItem);
      
      if (result) {
        // 更新槽位（保留原始 id）
        const updatedSlot: GeneratedImage = {
          ...result,
          id: existingSlot.id, // 保持原始 id 不变
        };
        this.slots.set(imageKey, updatedSlot);
        this.queue.updateStatus(queueItem.id, result.status, result.error);
        
        // 持久化
        await this.persistProgress();
        
        // 回调通知
        this.config.onImageGenerated?.(updatedSlot, queueItem.phase as GenerationPhase);
        this.notifyProgress();

        // 如果成功且是参考图，更新 URL 映射
        if (result.status === 'completed' && result.assetId) {
          const asset = await getAsset(result.assetId);
          if (asset?.cloudUrl) {
            if (queueItem.phase === 'characters') {
              const prompt = this.characterPrompts.find(p => p.id === queueItem.promptId);
              if (prompt) this.referenceUrlMap.set(prompt.code, asset.cloudUrl);
            } else if (queueItem.phase === 'scenes') {
              const prompt = this.scenePrompts.find(p => p.id === queueItem.promptId);
              if (prompt) this.referenceUrlMap.set(prompt.code, asset.cloudUrl);
            }
          }
        }

        return updatedSlot;
      }

      // 如果 generateSingleImage 返回 null，恢复原始状态
      existingSlot.status = originalStatus;
      existingSlot.error = originalError;
      this.queue.updateStatus(queueItem.id, originalStatus, originalError);
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '生成失败';
      
      // 更新为失败状态
      this.queue.updateStatus(queueItem.id, 'failed', errorMsg);
      existingSlot.status = 'failed';
      existingSlot.error = errorMsg;
      
      // 持久化失败状态
      await this.persistProgress();
      
      // 回调通知失败
      this.config.onImageGenerated?.(existingSlot, queueItem.phase as GenerationPhase);
      this.notifyProgress();

      return existingSlot;
    }
  }

  /**
   * 获取当前进度
   */
  getProgress(): GenerationProgress {
    const stats = this.queue.getStats();
    const phaseStats = this.queue.getPhaseStats(this._phase);
    
    // 找到当前正在生成的项目
    const generatingItems = this.queue.getAll().filter(item => item.status === 'generating');
    const currentItem = generatingItems.length > 0 ? generatingItems[0].name : undefined;

    return {
      state: this._state,
      phase: this._phase,
      current: phaseStats.completed,
      total: phaseStats.total,
      overallCompleted: stats.completed,
      overallTotal: stats.total,
      currentItem,
      failedCount: stats.failed,
    };
  }

  /**
   * 获取失败的图片列表
   */
  getFailedImages(): GeneratedImage[] {
    const failedItems = this.queue.getFailed();
    return failedItems
      .map(item => this.slots.get(item.imageKey))
      .filter((img): img is GeneratedImage => img !== undefined);
  }

  /**
   * 是否有失败的图片
   */
  hasFailedImages(): boolean {
    return this.queue.getFailed().length > 0;
  }

  /**
   * 获取所有槽位
   */
  getSlots(): Map<string, GeneratedImage> {
    return new Map(this.slots);
  }

  /**
   * 从存储恢复状态（不启动生成）
   * 
   * 恢复逻辑（Requirements 4.2, 4.3, 4.4）：
   * 1. 从 IndexedDB 读取项目数据
   * 2. 初始化队列和槽位（基于 imageDesigner prompts）
   * 3. 恢复已有的图片数据（基于 artist data）
   * 4. 控制器保持 idle 状态，等待调用方决定下一步操作
   * 
   * 调用方可以：
   * - 调用 start() 继续生成（会跳过已完成的图片）
   * - 调用 retryFailed() 重试失败的图片
   * - 直接使用 getSlots() 获取已恢复的图片用于展示
   */
  async restoreFromStorage(): Promise<void> {
    const project = await getProject(this.config.projectId);
    if (!project) {
      console.warn('[GenerationController] Project not found for restoration');
      return;
    }

    const imageDesigner = project.imageDesigner;
    if (!imageDesigner) {
      console.warn('[GenerationController] No imageDesigner data for restoration');
      return;
    }

    // 提取提示词
    const { characterPrompts, scenePrompts, keyframePrompts } = 
      this.extractPromptsFromImageDesigner(imageDesigner);
    
    this.characterPrompts = characterPrompts;
    this.scenePrompts = scenePrompts;
    this.keyframePrompts = keyframePrompts;

    // 初始化队列和槽位（创建所有应有的槽位）
    this.initializeQueue(characterPrompts, scenePrompts, keyframePrompts);
    
    // 恢复已有的图片数据（从 artist data 合并到槽位）
    await this.restoreExistingImages(project);

    console.log(`[GenerationController] Restored from storage: ${this.slots.size} slots, ` +
      `${this.queue.getStats().completed} completed, ` +
      `${this.queue.getStats().failed} failed, ` +
      `${this.queue.getStats().pending} pending`);
  }

  // ============== 私有方法 ==============

  /**
   * 从图像设计阶段数据中提取提示词
   */
  private extractPromptsFromImageDesigner(imageDesigner: ImageDesignerData | LegacyImageDesignerData): {
    characterPrompts: ReferencePrompt[];
    scenePrompts: ReferencePrompt[];
    keyframePrompts: KeyframePrompt[];
  } {
    const legacyData = imageDesigner as LegacyImageDesignerData;
    if (legacyData.referenceImages && Array.isArray(legacyData.referenceImages)) {
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
    
    const newData = imageDesigner as ImageDesignerData;
    return {
      characterPrompts: newData.characterPrompts || [],
      scenePrompts: newData.scenePrompts || [],
      keyframePrompts: newData.keyframePrompts || [],
    };
  }

  /**
   * 初始化队列和槽位
   */
  private initializeQueue(
    characterPrompts: ReferencePrompt[],
    scenePrompts: ReferencePrompt[],
    keyframePrompts: KeyframePrompt[]
  ): void {
    this.queue.clear();
    this.slots.clear();

    // 角色参考图
    for (const prompt of characterPrompts) {
      const imageKey = `characters:${prompt.id}`;
      const queueItem: QueueItem = {
        id: crypto.randomUUID(),
        promptId: prompt.id,
        prompt: prompt.prompt,
        phase: 'characters',
        name: prompt.name,
        status: 'pending',
        imageKey,
      };
      this.queue.enqueue(queueItem);
      
      // 创建槽位
      this.slots.set(imageKey, {
        id: crypto.randomUUID(),
        promptId: prompt.id,
        assetId: '',
        status: 'pending',
        name: prompt.name,
        isStale: false,
      });
    }

    // 场景参考图
    for (const prompt of scenePrompts) {
      const imageKey = `scenes:${prompt.id}`;
      const queueItem: QueueItem = {
        id: crypto.randomUUID(),
        promptId: prompt.id,
        prompt: prompt.prompt,
        phase: 'scenes',
        name: prompt.name,
        status: 'pending',
        imageKey,
      };
      this.queue.enqueue(queueItem);
      
      this.slots.set(imageKey, {
        id: crypto.randomUUID(),
        promptId: prompt.id,
        assetId: '',
        status: 'pending',
        name: prompt.name,
        isStale: false,
      });
    }

    // 关键帧
    for (const prompt of keyframePrompts) {
      const imageKey = `keyframes:${prompt.id}`;
      const queueItem: QueueItem = {
        id: crypto.randomUUID(),
        promptId: prompt.id,
        prompt: prompt.prompt,
        phase: 'keyframes',
        name: prompt.code,
        status: 'pending',
        imageKey,
        referenceUrl: undefined, // 将在生成时动态获取
      };
      this.queue.enqueue(queueItem);
      
      this.slots.set(imageKey, {
        id: crypto.randomUUID(),
        promptId: prompt.id,
        assetId: '',
        status: 'pending',
        name: prompt.code,
        isStale: false,
      });
    }
  }

  /**
   * 恢复已有的图片数据
   * 
   * 槽位恢复/补全逻辑：
   * 1. 从 imageDesigner prompts 生成"应有槽位清单"（已在 initializeQueue 中完成）
   * 2. 与 project.artist 中现有图片按 imageKey 合并
   * 3. 缺失的保持为 pending
   * 4. 已有的按状态恢复（completed/failed 都恢复，generating 重置为 pending）
   * 5. 重复的按"最新有效"规则：优先 completed > failed > pending
   */
  private async restoreExistingImages(project: Project): Promise<void> {
    const artistData = project.artist;
    if (!artistData) return;

    // 恢复角色图
    await this.restoreImagesByPhase(
      artistData.characterImages || [],
      'characters',
      this.characterPrompts
    );

    // 恢复场景图
    await this.restoreImagesByPhase(
      artistData.sceneImages || [],
      'scenes',
      this.scenePrompts
    );

    // 恢复关键帧
    await this.restoreImagesByPhase(
      artistData.keyframeImages || [],
      'keyframes',
      null // 关键帧不需要更新 referenceUrlMap
    );
  }

  /**
   * 按阶段恢复图片数据
   */
  private async restoreImagesByPhase(
    existingImages: GeneratedImage[],
    phase: 'characters' | 'scenes' | 'keyframes',
    prompts: ReferencePrompt[] | null
  ): Promise<void> {
    // 按 promptId 分组，处理可能的重复
    const imagesByPromptId = new Map<string, GeneratedImage[]>();
    for (const img of existingImages) {
      const existing = imagesByPromptId.get(img.promptId) || [];
      existing.push(img);
      imagesByPromptId.set(img.promptId, existing);
    }

    // 遍历每个 promptId，选择最佳图片
    for (const [promptId, images] of imagesByPromptId) {
      const imageKey = `${phase}:${promptId}`;
      const existingSlot = this.slots.get(imageKey);
      
      // 如果槽位不存在（说明 imageDesigner 中没有对应的 prompt），跳过
      if (!existingSlot) continue;

      // 选择最佳图片：completed > failed > pending > generating
      const bestImage = this.selectBestImage(images);
      if (!bestImage) continue;

      // 根据状态决定如何恢复
      const statusToRestore = this.normalizeImageStatus(bestImage.status);
      
      // 更新槽位
      this.slots.set(imageKey, {
        ...bestImage,
        status: statusToRestore,
      });

      // 更新队列状态
      const queueItem = this.queue.getByImageKey(imageKey);
      if (queueItem) {
        this.queue.updateStatus(queueItem.id, statusToRestore, bestImage.error);
      }

      // 如果是 completed 的参考图，更新 URL 映射
      if (statusToRestore === 'completed' && bestImage.assetId && prompts) {
        const asset = await getAsset(bestImage.assetId);
        if (asset?.cloudUrl) {
          const prompt = prompts.find(p => p.id === promptId);
          if (prompt) {
            this.referenceUrlMap.set(prompt.code, asset.cloudUrl);
          }
        }
      }
    }
  }

  /**
   * 选择最佳图片（处理重复）
   * 优先级：completed > failed > pending > generating
   */
  private selectBestImage(images: GeneratedImage[]): GeneratedImage | null {
    if (images.length === 0) return null;
    if (images.length === 1) return images[0];

    // 按状态优先级排序
    const statusPriority: Record<string, number> = {
      'completed': 0,
      'failed': 1,
      'pending': 2,
      'generating': 3,
    };

    return images.sort((a, b) => {
      const priorityA = statusPriority[a.status] ?? 4;
      const priorityB = statusPriority[b.status] ?? 4;
      return priorityA - priorityB;
    })[0];
  }

  /**
   * 规范化图片状态
   * generating 状态在恢复时重置为 pending（因为生成过程已中断）
   */
  private normalizeImageStatus(status: GeneratedImage['status']): GeneratedImage['status'] {
    if (status === 'generating') {
      return 'pending';
    }
    return status;
  }

  /**
   * 处理队列
   * 
   * 并发控制和 Stop-on-Failure 机制：
   * - 按 provider 配置的并发数控制同时进行的请求
   * - 失败时停止调度新任务，等待在途请求完成
   * - 在途请求完成后进入 blocked 或 paused 状态
   */
  private async processQueue(): Promise<void> {
    const providerConfig = getCurrentProviderConfig();
    const concurrency = providerConfig.batchConcurrency;
    const requestInterval = providerConfig.requestInterval;

    // 确定当前阶段
    this.updateCurrentPhase();

    while (this._state === 'running') {
      // 检查是否应该暂停（用户暂停或失败导致的停止）
      if (this.shouldPause) {
        if (this.inFlightCount === 0) {
          // 所有在途请求已完成，可以进入最终状态
          // 检查是否有失败的图片来决定进入 paused 还是 blocked
          if (this.hasFailedImages()) {
            this.setState('blocked');
          } else {
            this.setState('paused');
          }
        }
        break;
      }

      // 获取下一个待处理任务
      const pendingItems = this.queue.getPending();
      if (pendingItems.length === 0) {
        // 等待所有在途请求完成
        if (this.inFlightCount === 0) {
          this.setState('completed');
          this.setPhase('completed');
          this.notifyComplete();
        }
        break;
      }

      // 控制并发
      if (this.inFlightCount >= concurrency) {
        await this.delay(100);
        continue;
      }

      // 获取下一个任务
      const item = pendingItems[0];
      
      // ===== 服务层兜底校验：关键帧依赖检查（Requirements 7.1, 7.2）=====
      // 当即将处理关键帧任务时，验证所有参考图是否已完成
      if (item.phase === 'keyframes') {
        const dependencyCheck = await this.checkKeyframeDependencies();
        if (!dependencyCheck.canGenerate) {
          console.warn('[GenerationController] Keyframe dependency check failed:', dependencyCheck.message);
          // 停止调度，进入 blocked 状态
          this.shouldPause = true;
          this.config.onError?.(dependencyCheck.message || '参考图未完成，无法生成关键帧');
          if (this.inFlightCount === 0) {
            this.setState('blocked');
          }
          break;
        }
      }
      
      // 更新阶段
      this.updateCurrentPhase();

      // 开始生成
      this.inFlightCount++;
      this.queue.updateStatus(item.id, 'generating');
      
      const slot = this.slots.get(item.imageKey);
      if (slot) {
        slot.status = 'generating';
      }
      
      this.notifyProgress();

      // 异步生成（不阻塞循环）
      this.generateAndHandle(item).then(() => {
        this.inFlightCount--;
        
        // 检查是否需要进入最终状态
        if (this.shouldPause && this.inFlightCount === 0) {
          if (this._state === 'pausing') {
            this.setState('paused');
          } else if (this._state === 'running') {
            // 失败导致的停止，进入 blocked 状态
            if (this.hasFailedImages()) {
              this.setState('blocked');
            }
          }
        }
      });

      // 请求间隔
      if (requestInterval > 0) {
        await this.delay(requestInterval);
      }
    }
  }

  /**
   * 生成单张图片并处理结果
   * 
   * Stop-on-Failure 机制（Requirements 1.7, 3.6）：
   * - 任意图片失败后停止调度新任务
   * - 允许在途请求自然完成
   * - 最终进入 blocked 状态
   */
  private async generateAndHandle(item: QueueItem): Promise<void> {
    try {
      const result = await this.generateSingleImage(item);
      
      if (result) {
        this.slots.set(item.imageKey, result);
        this.queue.updateStatus(item.id, result.status, result.error);
        
        // 持久化
        await this.persistProgress();
        
        // 回调
        this.config.onImageGenerated?.(result, item.phase as GenerationPhase);
        this.notifyProgress();

        // 如果成功且是参考图，更新 URL 映射
        if (result.status === 'completed' && result.assetId) {
          const asset = await getAsset(result.assetId);
          if (asset?.cloudUrl) {
            if (item.phase === 'characters') {
              const prompt = this.characterPrompts.find(p => p.id === item.promptId);
              if (prompt) this.referenceUrlMap.set(prompt.code, asset.cloudUrl);
            } else if (item.phase === 'scenes') {
              const prompt = this.scenePrompts.find(p => p.id === item.promptId);
              if (prompt) this.referenceUrlMap.set(prompt.code, asset.cloudUrl);
            }
          }
        }

        // Stop-on-Failure: 如果失败，停止调度新任务
        if (result.status === 'failed') {
          this.handleFailure(item, result.error);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '生成失败';
      this.queue.updateStatus(item.id, 'failed', errorMsg);
      
      const slot = this.slots.get(item.imageKey);
      if (slot) {
        slot.status = 'failed';
        slot.error = errorMsg;
        
        // 持久化失败状态
        await this.persistProgress();
        
        // 回调通知失败的图片（Requirements 2.4, 2.5）
        this.config.onImageGenerated?.(slot, item.phase as GenerationPhase);
        this.notifyProgress();
      }

      // Stop-on-Failure: 处理失败
      this.handleFailure(item, errorMsg);
    }
  }

  /**
   * 处理图片生成失败
   * 
   * Stop-on-Failure 机制（Requirements 1.7, 3.6）：
   * - 停止调度新任务（设置 shouldPause = true）
   * - 如果没有在途请求，立即进入 blocked 状态
   * - 如果有在途请求，等待它们完成后再进入 blocked 状态
   */
  private handleFailure(item: QueueItem, errorMsg?: string): void {
    console.log(`[GenerationController] Image generation failed: ${item.name}, error: ${errorMsg}`);
    
    // 停止调度新任务
    this.shouldPause = true;
    
    // 检查是否可以立即进入 blocked 状态
    // 注意：inFlightCount 在 generateAndHandle 完成后会减 1
    // 所以这里检查 <= 1 表示当前这个请求是最后一个在途请求
    if (this._state === 'running' && this.inFlightCount <= 1) {
      this.setState('blocked');
    }
    // 如果还有其他在途请求，它们会在完成后检查并进入 blocked 状态
  }

  /**
   * 生成单张图片
   */
  private async generateSingleImage(item: QueueItem): Promise<GeneratedImage | null> {
    const { projectId } = this.config;
    const width = this.config.width ?? 1024;
    const height = this.config.height ?? 1024;

    if (item.phase === 'keyframes') {
      // 关键帧需要查找参考图
      const kfPrompt = this.keyframePrompts.find(p => p.id === item.promptId);
      if (!kfPrompt) return null;

      const referenceInfos = kfPrompt.referenceIds
        .map(refId => {
          const url = this.referenceUrlMap.get(refId);
          if (!url) return null;
          const charPrompt = this.characterPrompts.find(p => p.code === refId);
          const scenePrompt = this.scenePrompts.find(p => p.code === refId);
          const name = charPrompt?.name || scenePrompt?.name || refId;
          const type = refId.startsWith('R-P') ? 'character' : 'scene';
          return { refId, url, name, type };
        })
        .filter((info): info is NonNullable<typeof info> => info !== null);

      let genResult;
      if (referenceInfos.length > 0) {
        const refDescriptions = referenceInfos.map((info, idx) => {
          const typeLabel = info.type === 'character' ? '人物' : '场景';
          return `参考图${idx + 1}是${info.name}（${typeLabel}）`;
        }).join('，');
        
        const enhancedPrompt = `${refDescriptions}。画面：${item.prompt}`;
        
        genResult = await generateImageFromImage(projectId, {
          prompt: enhancedPrompt,
          referenceImageUrl: referenceInfos[0].url,
          width,
          height,
        });
      } else {
        genResult = await generateImageFromText(projectId, {
          prompt: item.prompt,
          width,
          height,
        });
      }

      const imageUrl = genResult.asset?.localData || genResult.cloudUrl || '';
      const existingSlot = this.slots.get(item.imageKey);
      
      return {
        id: existingSlot?.id || crypto.randomUUID(),
        promptId: item.promptId,
        assetId: genResult.asset?.id || '',
        status: genResult.success ? 'completed' : 'failed',
        error: genResult.error,
        imageUrl: genResult.success ? imageUrl : undefined,
        name: item.name,
        isStale: false,
      };
    } else {
      // 角色/场景参考图使用文生图
      const genResult = await generateImageFromText(projectId, {
        prompt: item.prompt,
        width,
        height,
      });

      const imageUrl = genResult.asset?.localData || genResult.cloudUrl || '';
      const existingSlot = this.slots.get(item.imageKey);
      
      return {
        id: existingSlot?.id || crypto.randomUUID(),
        promptId: item.promptId,
        assetId: genResult.asset?.id || '',
        status: genResult.success ? 'completed' : 'failed',
        error: genResult.error,
        imageUrl: genResult.success ? imageUrl : undefined,
        name: item.name,
        isStale: false,
      };
    }
  }

  /**
   * 更新当前阶段
   */
  private updateCurrentPhase(): void {
    const pendingItems = this.queue.getPending();
    if (pendingItems.length === 0) {
      return;
    }

    // 按阶段顺序处理
    const phases: GenerationPhase[] = ['characters', 'scenes', 'keyframes'];
    for (const phase of phases) {
      const phaseItems = pendingItems.filter(item => item.phase === phase);
      if (phaseItems.length > 0) {
        this.setPhase(phase);
        return;
      }
    }
  }

  /**
   * 检查关键帧依赖（Requirements 7.1, 7.2）
   * 
   * 验证所有角色/场景参考图是否已完成：
   * - 检查 slots 中所有 characters 和 scenes 阶段的图片状态
   * - 所有参考图必须 status=completed 才能生成关键帧
   * 
   * @returns 依赖检查结果
   */
  private async checkKeyframeDependencies(): Promise<{
    canGenerate: boolean;
    message?: string;
    failedCount: number;
    pendingCount: number;
  }> {
    let failedCount = 0;
    let pendingCount = 0;
    const failedNames: string[] = [];
    const pendingNames: string[] = [];

    // 检查所有角色和场景参考图的状态
    for (const [imageKey, slot] of this.slots) {
      if (imageKey.startsWith('characters:') || imageKey.startsWith('scenes:')) {
        if (slot.status === 'failed') {
          failedCount++;
          failedNames.push(slot.name || imageKey);
        } else if (slot.status === 'pending' || slot.status === 'generating') {
          pendingCount++;
          pendingNames.push(slot.name || imageKey);
        }
        // completed 状态的不计入
      }
    }

    const canGenerate = failedCount === 0 && pendingCount === 0;

    let message: string | undefined;
    if (!canGenerate) {
      const parts: string[] = [];
      if (failedCount > 0) {
        parts.push(`${failedCount} 个参考图生成失败（${failedNames.slice(0, 3).join('、')}${failedNames.length > 3 ? '等' : ''}）`);
      }
      if (pendingCount > 0) {
        parts.push(`${pendingCount} 个参考图待生成`);
      }
      message = `请先完成所有参考图：${parts.join('，')}`;
    }

    return {
      canGenerate,
      message,
      failedCount,
      pendingCount,
    };
  }

  /**
   * 持久化进度
   */
  private async persistProgress(): Promise<void> {
    const project = await getProject(this.config.projectId);
    if (!project) return;

    const characterImages: GeneratedImage[] = [];
    const sceneImages: GeneratedImage[] = [];
    const keyframeImages: GeneratedImage[] = [];

    for (const [imageKey, slot] of this.slots) {
      if (imageKey.startsWith('characters:')) {
        characterImages.push(slot);
      } else if (imageKey.startsWith('scenes:')) {
        sceneImages.push(slot);
      } else if (imageKey.startsWith('keyframes:')) {
        keyframeImages.push(slot);
      }
    }

    const artistData: ArtistData = {
      characterImages,
      sceneImages,
      keyframeImages,
      isStale: false,
    };

    await updateProject({
      ...project,
      artist: artistData,
    });
  }

  /**
   * 通知进度更新
   */
  private notifyProgress(): void {
    this.config.onProgress?.(this.getProgress());
  }

  /**
   * 通知完成
   */
  private notifyComplete(): void {
    const characterImages: GeneratedImage[] = [];
    const sceneImages: GeneratedImage[] = [];
    const keyframeImages: GeneratedImage[] = [];
    const errors: string[] = [];

    for (const [imageKey, slot] of this.slots) {
      if (imageKey.startsWith('characters:')) {
        characterImages.push(slot);
      } else if (imageKey.startsWith('scenes:')) {
        sceneImages.push(slot);
      } else if (imageKey.startsWith('keyframes:')) {
        keyframeImages.push(slot);
      }
      
      if (slot.status === 'failed' && slot.error) {
        errors.push(`${slot.name}: ${slot.error}`);
      }
    }

    const result: GenerateAllImagesResult = {
      success: errors.length === 0,
      characterImages,
      sceneImages,
      keyframeImages,
      errors,
    };

    this.config.onComplete?.(result);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
