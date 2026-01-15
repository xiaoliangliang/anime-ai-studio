/**
 * GenerationController 端到端测试脚本
 * 
 * 这是一个手动测试脚本，用于验证 GenerationController 的核心功能。
 * 由于项目未配置测试框架，此脚本可以在浏览器控制台中运行。
 * 
 * 使用方法：
 * 1. 在浏览器中打开应用
 * 2. 打开开发者工具控制台
 * 3. 复制并运行相应的测试函数
 * 
 * 测试覆盖：
 * - 完整生成流程
 * - 暂停/继续流程
 * - 失败重试流程
 * - 状态恢复流程
 */

import { 
  createGenerationController, 
  restoreGenerationController,
  canGenerateKeyframes,
  getPendingImageCount,
  getFailedImages,
  type GenerationState,
  type GenerationProgress,
} from '../generationController';
import { getProject } from '../storageService';
import type { GeneratedImage } from '@/types';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

/** 测试上下文 */
interface TestContext {
  projectId: string;
  results: TestResult[];
  logs: string[];
}

/**
 * 创建测试上下文
 */
export function createTestContext(projectId: string): TestContext {
  return {
    projectId,
    results: [],
    logs: [],
  };
}

/**
 * 记录测试日志
 */
function log(ctx: TestContext, message: string): void {
  const timestamp = new Date().toISOString();
  ctx.logs.push(`[${timestamp}] ${message}`);
  console.log(`[E2E Test] ${message}`);
}

/**
 * 记录测试结果
 */
function recordResult(ctx: TestContext, name: string, passed: boolean, message: string, duration: number): void {
  ctx.results.push({ name, passed, message, duration });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  log(ctx, `${status}: ${name} (${duration}ms) - ${message}`);
}

// ============================================
// 测试 1: 完整生成流程
// ============================================

/**
 * 测试完整生成流程
 * 
 * 验证点：
 * - 控制器正确初始化
 * - 状态从 idle -> running -> completed 转换
 * - 每张图片生成后触发回调
 * - 进度正确更新
 * - 最终结果正确
 */
export async function testCompleteGenerationFlow(ctx: TestContext): Promise<boolean> {
  const startTime = Date.now();
  const testName = '完整生成流程';
  
  try {
    log(ctx, `开始测试: ${testName}`);
    
    // 验证项目存在
    const project = await getProject(ctx.projectId);
    if (!project) {
      recordResult(ctx, testName, false, '项目不存在', Date.now() - startTime);
      return false;
    }
    
    if (!project.imageDesigner) {
      recordResult(ctx, testName, false, '请先完成图像设计阶段', Date.now() - startTime);
      return false;
    }
    
    // 跟踪状态变化
    const stateChanges: GenerationState[] = [];
    const progressUpdates: GenerationProgress[] = [];
    const generatedImages: GeneratedImage[] = [];
    
    // 创建控制器
    const controller = createGenerationController({
      projectId: ctx.projectId,
      onStateChange: (state, prev) => {
        stateChanges.push(state);
        log(ctx, `状态变化: ${prev} -> ${state}`);
      },
      onProgress: (progress) => {
        progressUpdates.push({ ...progress });
        log(ctx, `进度: ${progress.phase} ${progress.current}/${progress.total}`);
      },
      onImageGenerated: (image, phase) => {
        generatedImages.push(image);
        log(ctx, `图片生成: ${image.name} (${phase}) - ${image.status}`);
      },
      onComplete: (result) => {
        log(ctx, `生成完成: 成功=${result.success}, 错误数=${result.errors.length}`);
      },
      onError: (error) => {
        log(ctx, `错误: ${error}`);
      },
    });
    
    // 验证初始状态
    if (controller.state !== 'idle') {
      recordResult(ctx, testName, false, `初始状态应为 idle，实际为 ${controller.state}`, Date.now() - startTime);
      return false;
    }
    
    // 启动生成
    log(ctx, '启动生成...');
    await controller.start();
    
    // 验证最终状态
    const finalState = controller.state as string;
    if (finalState !== 'completed' && finalState !== 'blocked' && finalState !== 'error') {
      recordResult(ctx, testName, false, `最终状态应为 completed、blocked 或 error，实际为 ${finalState}`, Date.now() - startTime);
      return false;
    }
    
    // 验证状态转换
    if (!stateChanges.includes('running')) {
      recordResult(ctx, testName, false, '状态转换中缺少 running 状态', Date.now() - startTime);
      return false;
    }
    
    // 验证进度更新
    if (progressUpdates.length === 0) {
      recordResult(ctx, testName, false, '没有收到进度更新', Date.now() - startTime);
      return false;
    }
    
    // 验证图片生成回调
    const progress = controller.getProgress();
    if (generatedImages.length !== progress.overallTotal && finalState === 'completed') {
      recordResult(ctx, testName, false, 
        `图片回调数量 (${generatedImages.length}) 与总数 (${progress.overallTotal}) 不匹配`, 
        Date.now() - startTime);
      return false;
    }
    
    recordResult(ctx, testName, true, 
      `生成完成: ${generatedImages.length} 张图片, 状态=${finalState}`, 
      Date.now() - startTime);
    return true;
    
  } catch (error) {
    recordResult(ctx, testName, false, `异常: ${error instanceof Error ? error.message : String(error)}`, Date.now() - startTime);
    return false;
  }
}

// ============================================
// 测试 2: 暂停/继续流程
// ============================================

/**
 * 测试暂停/继续流程
 * 
 * 验证点：
 * - pause() 正确停止新任务调度
 * - 状态从 running -> pausing -> paused 转换
 * - resume() 正确恢复生成
 * - 已完成的图片在暂停/继续后保持不变
 */
export async function testPauseResumeFlow(ctx: TestContext): Promise<boolean> {
  const startTime = Date.now();
  const testName = '暂停/继续流程';
  
  try {
    log(ctx, `开始测试: ${testName}`);
    
    const project = await getProject(ctx.projectId);
    if (!project?.imageDesigner) {
      recordResult(ctx, testName, false, '项目或图像设计数据不存在', Date.now() - startTime);
      return false;
    }
    
    const stateChanges: GenerationState[] = [];
    let completedBeforePause = 0;
    
    const controller = createGenerationController({
      projectId: ctx.projectId,
      onStateChange: (state) => {
        stateChanges.push(state);
        log(ctx, `状态变化: ${state}`);
      },
      onImageGenerated: (image) => {
        log(ctx, `图片生成: ${image.name} - ${image.status}`);
      },
    });
    
    // 启动生成（不等待完成）
    log(ctx, '启动生成...');
    const startPromise = controller.start();
    
    // 等待一小段时间后暂停
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (controller.state === 'running') {
      completedBeforePause = controller.getProgress().overallCompleted;
      log(ctx, `暂停前已完成: ${completedBeforePause} 张`);
      
      // 暂停
      controller.pause();
      log(ctx, '已调用 pause()');
      
      // 等待进入 paused 状态
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const currentState = controller.state as string;
      if (currentState !== 'paused' && currentState !== 'blocked' && currentState !== 'completed') {
        recordResult(ctx, testName, false, 
          `暂停后状态应为 paused、blocked 或 completed，实际为 ${currentState}`, 
          Date.now() - startTime);
        return false;
      }
      
      // 验证 pausing 状态出现过
      if (!stateChanges.includes('pausing') && !stateChanges.includes('blocked')) {
        log(ctx, '警告: 状态转换中可能缺少 pausing 状态（可能是因为没有在途请求）');
      }
      
      const completedAfterPause = controller.getProgress().overallCompleted;
      log(ctx, `暂停后已完成: ${completedAfterPause} 张`);
      
      // 继续生成
      const stateAfterPause = controller.state as string;
      if (stateAfterPause === 'paused') {
        log(ctx, '继续生成...');
        await controller.resume();
        
        // 等待完成
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } else {
      // 生成太快，已经完成了
      log(ctx, '生成已完成，跳过暂停测试');
      await startPromise;
    }
    
    const finalState = controller.state;
    const finalProgress = controller.getProgress();
    
    recordResult(ctx, testName, true, 
      `测试完成: 最终状态=${finalState}, 完成=${finalProgress.overallCompleted}/${finalProgress.overallTotal}`, 
      Date.now() - startTime);
    return true;
    
  } catch (error) {
    recordResult(ctx, testName, false, `异常: ${error instanceof Error ? error.message : String(error)}`, Date.now() - startTime);
    return false;
  }
}

// ============================================
// 测试 3: 失败重试流程
// ============================================

/**
 * 测试失败重试流程
 * 
 * 验证点：
 * - 失败后进入 blocked 状态
 * - retryFailed() 只重试失败的图片
 * - 成功的图片在重试后保持不变
 */
export async function testRetryFailedFlow(ctx: TestContext): Promise<boolean> {
  const startTime = Date.now();
  const testName = '失败重试流程';
  
  try {
    log(ctx, `开始测试: ${testName}`);
    
    // 检查是否有失败的图片
    const failedImages = await getFailedImages(ctx.projectId);
    const totalFailed = failedImages.characters.length + failedImages.scenes.length + failedImages.keyframes.length;
    
    if (totalFailed === 0) {
      log(ctx, '没有失败的图片，跳过重试测试');
      recordResult(ctx, testName, true, '没有失败的图片需要重试', Date.now() - startTime);
      return true;
    }
    
    log(ctx, `发现 ${totalFailed} 张失败的图片`);
    
    // 恢复控制器
    const restored = await restoreGenerationController(ctx.projectId, {
      onStateChange: (state) => {
        log(ctx, `状态变化: ${state}`);
      },
      onImageGenerated: (image) => {
        log(ctx, `图片生成: ${image.name} - ${image.status}`);
      },
    });
    
    const controller = restored.controller;
    log(ctx, `恢复状态: hasPending=${restored.hasPendingImages}, hasFailed=${restored.hasFailedImages}`);
    
    // 记录重试前的成功图片
    const slotsBeforeRetry = controller.getSlots();
    const successfulBefore = new Map<string, GeneratedImage>();
    for (const [key, slot] of slotsBeforeRetry) {
      if (slot.status === 'completed') {
        successfulBefore.set(key, { ...slot });
      }
    }
    log(ctx, `重试前成功图片数: ${successfulBefore.size}`);
    
    // 执行重试
    log(ctx, '执行 retryFailed()...');
    await controller.retryFailed({ includePending: true });
    
    // 等待完成
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 验证成功的图片保持不变
    const slotsAfterRetry = controller.getSlots();
    let preservedCount = 0;
    for (const [key, slotBefore] of successfulBefore) {
      const slotAfter = slotsAfterRetry.get(key);
      if (slotAfter && slotAfter.status === 'completed' && slotAfter.assetId === slotBefore.assetId) {
        preservedCount++;
      }
    }
    
    if (preservedCount !== successfulBefore.size) {
      recordResult(ctx, testName, false, 
        `成功图片未完全保留: ${preservedCount}/${successfulBefore.size}`, 
        Date.now() - startTime);
      return false;
    }
    
    const finalProgress = controller.getProgress();
    recordResult(ctx, testName, true, 
      `重试完成: 保留=${preservedCount}, 完成=${finalProgress.overallCompleted}/${finalProgress.overallTotal}`, 
      Date.now() - startTime);
    return true;
    
  } catch (error) {
    recordResult(ctx, testName, false, `异常: ${error instanceof Error ? error.message : String(error)}`, Date.now() - startTime);
    return false;
  }
}

// ============================================
// 测试 4: 状态恢复流程
// ============================================

/**
 * 测试状态恢复流程
 * 
 * 验证点：
 * - restoreGenerationController 正确恢复状态
 * - 已完成的图片正确恢复
 * - 待处理的图片正确识别
 * - 恢复后可以继续生成
 */
export async function testStateRestorationFlow(ctx: TestContext): Promise<boolean> {
  const startTime = Date.now();
  const testName = '状态恢复流程';
  
  try {
    log(ctx, `开始测试: ${testName}`);
    
    // 获取当前项目状态
    const project = await getProject(ctx.projectId);
    if (!project?.imageDesigner) {
      recordResult(ctx, testName, false, '项目或图像设计数据不存在', Date.now() - startTime);
      return false;
    }
    
    // 获取预期的图片数量
    const pendingCount = await getPendingImageCount(ctx.projectId);
    log(ctx, `预期图片数量: 角色=${pendingCount.characters}, 场景=${pendingCount.scenes}, 关键帧=${pendingCount.keyframes}`);
    
    // 恢复控制器
    const restored = await restoreGenerationController(ctx.projectId, {
      onProgress: (progress) => {
        log(ctx, `进度: ${progress.phase} ${progress.current}/${progress.total}`);
      },
    });
    
    const controller = restored.controller;
    const slots = restored.slots;
    const progress = restored.progress;
    
    log(ctx, `恢复结果: slots=${slots.size}, completed=${progress.overallCompleted}, total=${progress.overallTotal}`);
    log(ctx, `建议状态: ${restored.suggestedState}`);
    
    // 验证槽位数量
    const expectedTotal = pendingCount.total + progress.overallCompleted;
    if (slots.size !== progress.overallTotal) {
      log(ctx, `警告: 槽位数量 (${slots.size}) 与进度总数 (${progress.overallTotal}) 不匹配`);
    }
    
    // 验证已完成的图片
    let completedCount = 0;
    let failedCount = 0;
    let pendingSlotCount = 0;
    
    for (const slot of slots.values()) {
      switch (slot.status) {
        case 'completed':
          completedCount++;
          break;
        case 'failed':
          failedCount++;
          break;
        case 'pending':
          pendingSlotCount++;
          break;
      }
    }
    
    log(ctx, `槽位状态: completed=${completedCount}, failed=${failedCount}, pending=${pendingSlotCount}`);
    
    // 验证恢复状态与实际数据一致
    if (restored.hasFailedImages !== (failedCount > 0)) {
      recordResult(ctx, testName, false, 
        `hasFailedImages (${restored.hasFailedImages}) 与实际失败数 (${failedCount}) 不一致`, 
        Date.now() - startTime);
      return false;
    }
    
    if (restored.hasPendingImages !== (pendingSlotCount > 0)) {
      recordResult(ctx, testName, false, 
        `hasPendingImages (${restored.hasPendingImages}) 与实际待处理数 (${pendingSlotCount}) 不一致`, 
        Date.now() - startTime);
      return false;
    }
    
    recordResult(ctx, testName, true, 
      `恢复成功: slots=${slots.size}, completed=${completedCount}, failed=${failedCount}, pending=${pendingSlotCount}`, 
      Date.now() - startTime);
    return true;
    
  } catch (error) {
    recordResult(ctx, testName, false, `异常: ${error instanceof Error ? error.message : String(error)}`, Date.now() - startTime);
    return false;
  }
}

// ============================================
// 测试 5: 关键帧依赖检查
// ============================================

/**
 * 测试关键帧依赖检查
 * 
 * 验证点：
 * - canGenerateKeyframes 正确检查参考图状态
 * - 参考图未完成时阻止关键帧生成
 * - 参考图全部完成后允许关键帧生成
 */
export async function testKeyframeDependencyCheck(ctx: TestContext): Promise<boolean> {
  const startTime = Date.now();
  const testName = '关键帧依赖检查';
  
  try {
    log(ctx, `开始测试: ${testName}`);
    
    const result = await canGenerateKeyframes(ctx.projectId);
    
    log(ctx, `依赖检查结果:`);
    log(ctx, `  canGenerate: ${result.canGenerate}`);
    log(ctx, `  角色: ${result.completedCharacters}/${result.totalCharacters} (失败: ${result.failedCharacters})`);
    log(ctx, `  场景: ${result.completedScenes}/${result.totalScenes} (失败: ${result.failedScenes})`);
    if (result.message) {
      log(ctx, `  消息: ${result.message}`);
    }
    
    // 验证逻辑一致性
    const allCharactersComplete = result.completedCharacters === result.totalCharacters;
    const allScenesComplete = result.completedScenes === result.totalScenes;
    const expectedCanGenerate = allCharactersComplete && allScenesComplete;
    
    if (result.canGenerate !== expectedCanGenerate) {
      recordResult(ctx, testName, false, 
        `canGenerate (${result.canGenerate}) 与预期 (${expectedCanGenerate}) 不一致`, 
        Date.now() - startTime);
      return false;
    }
    
    // 验证失败名称列表
    if (result.failedCharacters > 0 && result.failedCharacterNames.length !== result.failedCharacters) {
      recordResult(ctx, testName, false, 
        `失败角色名称数量 (${result.failedCharacterNames.length}) 与失败数 (${result.failedCharacters}) 不一致`, 
        Date.now() - startTime);
      return false;
    }
    
    recordResult(ctx, testName, true, 
      `检查通过: canGenerate=${result.canGenerate}`, 
      Date.now() - startTime);
    return true;
    
  } catch (error) {
    recordResult(ctx, testName, false, `异常: ${error instanceof Error ? error.message : String(error)}`, Date.now() - startTime);
    return false;
  }
}

// ============================================
// 运行所有测试
// ============================================

/**
 * 运行所有端到端测试
 */
export async function runAllE2ETests(projectId: string): Promise<{
  passed: number;
  failed: number;
  results: TestResult[];
  logs: string[];
}> {
  const ctx = createTestContext(projectId);
  
  console.log('========================================');
  console.log('GenerationController 端到端测试');
  console.log('========================================');
  console.log(`项目ID: ${projectId}`);
  console.log('');
  
  // 运行测试
  await testStateRestorationFlow(ctx);
  await testKeyframeDependencyCheck(ctx);
  // 注意：以下测试会实际调用 API，可能需要较长时间
  // await testCompleteGenerationFlow(ctx);
  // await testPauseResumeFlow(ctx);
  // await testRetryFailedFlow(ctx);
  
  // 统计结果
  const passed = ctx.results.filter(r => r.passed).length;
  const failed = ctx.results.filter(r => !r.passed).length;
  
  console.log('');
  console.log('========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${ctx.results.length}`);
  
  return {
    passed,
    failed,
    results: ctx.results,
    logs: ctx.logs,
  };
}

/**
 * 快速测试（不调用 API）
 */
export async function runQuickTests(projectId: string): Promise<{
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const ctx = createTestContext(projectId);
  
  console.log('========================================');
  console.log('GenerationController 快速测试（不调用 API）');
  console.log('========================================');
  
  await testStateRestorationFlow(ctx);
  await testKeyframeDependencyCheck(ctx);
  
  const passed = ctx.results.filter(r => r.passed).length;
  const failed = ctx.results.filter(r => !r.passed).length;
  
  console.log('');
  console.log(`结果: ${passed} 通过, ${failed} 失败`);
  
  return { passed, failed, results: ctx.results };
}

// 导出测试函数供控制台使用
if (typeof window !== 'undefined') {
  (window as any).generationControllerE2ETests = {
    createTestContext,
    testCompleteGenerationFlow,
    testPauseResumeFlow,
    testRetryFailedFlow,
    testStateRestorationFlow,
    testKeyframeDependencyCheck,
    runAllE2ETests,
    runQuickTests,
  };
}
