# Implementation Plan: Artist Image Generation Optimization

## Overview

本实现计划将美工阶段图片生成流程从当前的批量生成模式优化为可暂停/继续、实时展示、智能重试的模式。核心改动包括：
1. 新增 GenerationController 状态机管理生成流程
2. 新增 GenerationQueue 管理待生成任务队列
3. 重构 UI 支持暂停/继续/重试操作
4. 实现逐张展示和进度可视化

## Tasks

- [x] 0. Preflight - 对齐工程现状与测试策略
  - [x] 0.1 确认现有工程无默认测试框架（当前 `package.json` 未包含 vitest/jest）
  - [x] 0.2 决定验证策略
    - 方案 A（推荐先做）：以 TypeScript 类型检查 + 手工/端到端回归用例为主，先交付 MVP
    - 方案 B：引入 vitest + fast-check，再做属性测试（会增加依赖与工程改动）
  - [x] 0.3 明确并发上限来源
    - 并发应来自 provider 配置（避免 UI/服务层硬编码），并在控制器中统一约束

- [x] 1. 创建 GenerationController 核心模块
  - [x] 1.1 定义 GenerationState 类型和状态转换逻辑
    - 实现状态机：idle → running → pausing → paused → blocked → completed → error
    - 定义状态转换规则和约束
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7_
  - [x] 1.2 实现 GenerationQueue 队列管理
    - 实现 QueueItem 接口和队列操作（enqueue, dequeue, getPending, getFailed）
    - 实现状态更新和失败任务重置
    - _Requirements: 3.1, 3.5_
  - [x] 1.3 实现 GenerationController 主类
    - 实现 start(), pause(), resume(), reset() 方法
    - 实现 retryFailed() 和 regenerateSingle() 方法
    - 实现回调机制（onProgress, onImageGenerated, onStateChange, onComplete, onError）
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.7, 3.1, 3.2, 6.1, 6.2, 6.3_
  - [ ] 1.4（可选，需先引入测试框架）编写 GenerationController 属性测试
    - **Property 1: Pause stops new generations**
    - **Property 2: State preservation during pause/resume**
    - **Property 3: Graceful pause with in-flight completion**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**

- [x] 2. 实现槽位模型和实时展示
  - [x] 2.1 实现稳定槽位创建机制
    - 在 start() 时一次性创建所有槽位（status=pending）
    - 使用 imageKey = ${phase}:${promptId} 作为稳定唯一键
    - _Requirements: 2.1_
  - [x] 2.2 实现单张图片完成回调
    - 每张图片完成后立即调用 onImageGenerated 回调
    - 成功时更新槽位为 completed，失败时更新为 failed 并记录 error
    - _Requirements: 2.2, 2.4, 2.5_
  - [x] 2.3 实现槽位恢复/补全（兼容历史项目数据）
    - 从 imageDesigner prompts 生成“应有槽位清单”，并与 project.artist 中现有图片按 imageKey 合并
    - 缺失的补为 pending；重复的按“最新/有效”规则去重（规则需明确）
    - _Requirements: 2.1, 4.2, 4.3_
  - [ ] 2.4（可选，需先引入测试框架）编写实时展示属性测试
    - **Property 4: Immediate callback per image**
    - **Property 5: Progress accuracy**
    - **Property 6: Failed image error tracking**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 5.4**

- [x] 3. 实现智能重试逻辑
  - [x] 3.1 实现 retryFailed 方法
    - 默认 includePending=true，重试 failed + pending 状态的图片
    - 保留所有 completed 状态的图片不变
    - _Requirements: 3.1, 3.2, 3.5, 3.6_
  - [x] 3.2 实现 Stop-on-Failure 机制
    - 任意图片失败后停止调度新任务，进入 blocked 状态
    - 在 blocked 状态下允许 retryFailed() 恢复
    - 若失败发生时存在并发 in-flight 请求：停止“新调度”，允许 in-flight 自然结束；最终进入 blocked（需要在实现里定义清晰的时序）
    - _Requirements: 1.7, 3.6_
  - [ ] 3.3（可选，需先引入测试框架）编写智能重试属性测试
    - **Property 7: Retry only failed images**
    - **Property 8: Successful images preserved during retry**
    - **Validates: Requirements 3.1, 3.2, 3.5**

- [x] 4. 实现状态持久化
  - [x] 4.1 实现即时持久化
    - 每张图片完成后立即调用 updateProject() 写入 IndexedDB
    - 持久化槽位状态（pending/generating/completed/failed）
    - _Requirements: 4.1_
  - [x] 4.2 实现状态恢复
    - 实现 restoreGenerationController() 从 IndexedDB 恢复状态
    - 恢复时正确识别 pending 图片并继续生成
    - _Requirements: 4.2, 4.3, 4.4_
  - [ ] 4.3（可选，需先引入测试框架）编写持久化属性测试
    - **Property 9: Persistence round-trip**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 5. 实现单张图片重新生成
  - [x] 5.1 实现 regenerateSingle 方法
    - 只重新生成指定的单张图片
    - 不影响其他图片的状态
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 5.2（可选，需先引入测试框架）编写单张重生属性测试
    - **Property 10: Single image regeneration isolation**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 6. Checkpoint - 核心逻辑验证
  - 若已引入测试框架：确保核心单元/属性测试通过
  - 验证状态机转换正确性
  - 如有问题请询问用户

- [x] 7. 实现关键帧依赖检查
  - [x] 7.1 实现参考图完成状态验证
    - 在关键帧生成前检查所有角色/场景参考图是否 completed
    - 如有未完成的参考图，阻止关键帧生成并显示提示
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 7.2 服务层兜底校验（防绕过 UI）
    - 在关键帧生成 service/API 调用入口处再次校验依赖，不满足则直接返回明确错误
    - _Requirements: 7.1, 7.2_

- [x] 8. 重构 UI 组件
  - [x] 8.1 更新 ChatPanel 美工控制面板
    - 添加暂停/继续按钮
    - 显示 pausing/paused/blocked 状态指示器
    - _Requirements: 1.4, 1.6_
  - [x] 8.2 实现进度可视化
    - 显示当前阶段（characters/scenes/keyframes）
    - 显示 "X/Y completed" 进度
    - 显示当前正在生成的图片名称（并发时可显示“名称 + (N more)”或列表，需在 UI 约定）
    - 显示失败图片的错误信息
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 8.3 实现重新生成按钮逻辑
    - 当有失败图片时显示"重新生成"按钮
    - 所有图片成功时禁用/隐藏重新生成按钮
    - _Requirements: 3.4_
  - [x] 8.4 实现单张图片重生 UI
    - 在失败图片上显示重新生成按钮
    - 点击后只重新生成该图片
    - _Requirements: 6.1, 6.2_

- [-] 9. 更新 CanvasPanel 画布展示
  - [x] 9.1 实现占位符预创建
    - 生成开始时创建所有图片的占位符
    - 保持稳定的位置和顺序
    - _Requirements: 2.1_
  - [ ] 9.2 实现实时更新
    - 图片完成后立即更新对应占位符
    - 失败图片显示错误指示
    - _Requirements: 2.2, 2.4, 2.6_

- [x] 10. 集成测试和最终验证
  - [x] 10.1 集成 GenerationController 到 artistService
    - 导出 createGenerationController 和 restoreGenerationController
    - 更新现有的 generateAllReferences 和 generateAllKeyframes 使用新控制器
    - _Requirements: All_
  - [x] 10.2 端到端流程测试
    - 测试完整生成流程
    - 测试暂停/继续流程
    - 测试失败重试流程
    - 测试状态恢复流程
    - _Requirements: All_
  - [x] 10.3 回归用例清单（建议写入 README/QA checklist）
    - 并发下：逐张展示、进度统计、blocked 时序（含 in-flight 收尾）
    - retryFailed(includePending=true)：只补 failed+pending，completed 不重发请求
    - 关键帧入口：参考图不全时阻止 + 提示；补齐后放开
    - 多次点击：start/pause/resume/retry 的幂等与防抖

- [x] 11. Final Checkpoint - 确保所有测试通过
  - 若已引入测试框架：确保所有单元/属性测试通过
  - 确保 UI 交互正常
  - 如有问题请询问用户

## Notes

- 标注“（可选，需先引入测试框架）”的任务为可选，可在 MVP 交付后再补
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- 如需自动化测试：属性测试可覆盖通用正确性，单元测试覆盖关键边界例子
- 当前实现已有基础的批量生成功能，本次优化主要是添加状态控制和实时反馈
