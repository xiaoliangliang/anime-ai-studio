/**
 * GenerationQueue - 图片生成队列管理
 * 管理待生成的图片任务队列
 */

import type { 
  IGenerationQueue, 
  QueueItem, 
  QueueItemStatus, 
  GenerationPhase 
} from './types';

export class GenerationQueue implements IGenerationQueue {
  private items: Map<string, QueueItem> = new Map();
  private order: string[] = []; // 保持插入顺序

  /**
   * 添加单个任务
   */
  enqueue(item: QueueItem): void {
    if (!this.items.has(item.id)) {
      this.order.push(item.id);
    }
    this.items.set(item.id, { ...item });
  }

  /**
   * 批量添加任务
   */
  enqueueAll(items: QueueItem[]): void {
    for (const item of items) {
      this.enqueue(item);
    }
  }

  /**
   * 获取下一个待处理任务（不移除）
   */
  dequeue(): QueueItem | null {
    for (const id of this.order) {
      const item = this.items.get(id);
      if (item && item.status === 'pending') {
        return { ...item };
      }
    }
    return null;
  }

  /**
   * 获取所有待处理任务
   */
  getPending(): QueueItem[] {
    return this.order
      .map(id => this.items.get(id))
      .filter((item): item is QueueItem => item !== undefined && item.status === 'pending')
      .map(item => ({ ...item }));
  }

  /**
   * 获取所有失败任务
   */
  getFailed(): QueueItem[] {
    return this.order
      .map(id => this.items.get(id))
      .filter((item): item is QueueItem => item !== undefined && item.status === 'failed')
      .map(item => ({ ...item }));
  }

  /**
   * 获取所有任务
   */
  getAll(): QueueItem[] {
    return this.order
      .map(id => this.items.get(id))
      .filter((item): item is QueueItem => item !== undefined)
      .map(item => ({ ...item }));
  }

  /**
   * 更新任务状态
   */
  updateStatus(id: string, status: QueueItemStatus, error?: string): void {
    const item = this.items.get(id);
    if (item) {
      item.status = status;
      if (error !== undefined) {
        item.error = error;
      } else if (status === 'completed') {
        item.error = undefined;
      }
    }
  }

  /**
   * 重置失败任务为待处理
   * 
   * 智能重试逻辑（Requirements 3.1, 3.2, 3.5）：
   * - 只重置 failed 状态的任务为 pending
   * - completed 状态的任务保持不变
   * - pending 状态的任务保持不变（它们会被继续处理）
   * 
   * @param includePending 是否也处理 pending 状态（默认 true）
   *   - true: pending 状态保持不变，会被继续处理
   *   - false: 只重置 failed 状态
   */
  resetFailed(includePending: boolean = true): void {
    for (const item of this.items.values()) {
      // 只重置 failed 状态的任务
      if (item.status === 'failed') {
        item.status = 'pending';
        item.error = undefined;
      }
      // completed 状态的任务保持不变（Requirements 3.2）
      // pending 状态的任务保持不变（它们会被继续处理）
      // generating 状态的任务保持不变（正在进行中）
    }
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.items.clear();
    this.order = [];
  }

  /**
   * 队列是否为空（无 pending 任务）
   */
  isEmpty(): boolean {
    return this.getPending().length === 0;
  }

  /**
   * 获取队列总长度
   */
  size(): number {
    return this.items.size;
  }

  /**
   * 获取指定阶段的任务
   */
  getByPhase(phase: GenerationPhase): QueueItem[] {
    return this.order
      .map(id => this.items.get(id))
      .filter((item): item is QueueItem => item !== undefined && item.phase === phase)
      .map(item => ({ ...item }));
  }

  /**
   * 根据 imageKey 获取任务
   */
  getByImageKey(imageKey: string): QueueItem | undefined {
    for (const item of this.items.values()) {
      if (item.imageKey === imageKey) {
        return { ...item };
      }
    }
    return undefined;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    pending: number;
    generating: number;
    completed: number;
    failed: number;
  } {
    let pending = 0;
    let generating = 0;
    let completed = 0;
    let failed = 0;

    for (const item of this.items.values()) {
      switch (item.status) {
        case 'pending':
          pending++;
          break;
        case 'generating':
          generating++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return {
      total: this.items.size,
      pending,
      generating,
      completed,
      failed,
    };
  }

  /**
   * 获取指定阶段的统计信息
   */
  getPhaseStats(phase: GenerationPhase): {
    total: number;
    pending: number;
    generating: number;
    completed: number;
    failed: number;
  } {
    const phaseItems = this.getByPhase(phase);
    let pending = 0;
    let generating = 0;
    let completed = 0;
    let failed = 0;

    for (const item of phaseItems) {
      switch (item.status) {
        case 'pending':
          pending++;
          break;
        case 'generating':
          generating++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return {
      total: phaseItems.length,
      pending,
      generating,
      completed,
      failed,
    };
  }
}
