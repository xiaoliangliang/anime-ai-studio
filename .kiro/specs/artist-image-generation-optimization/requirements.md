# Requirements Document

## Introduction

本文档定义了美工阶段图片生成流程的优化需求。当前实现存在以下问题：
1. 图片连续生成，中途无法暂停
2. 所有图片生成完成后才一次性展示，用户体验差
3. 重新生成时会重新请求所有图片，包括已成功生成的图片

优化目标是实现可暂停/继续的生成流程、实时展示生成结果、以及智能重试失败图片的功能。

## Scope & Priority

为避免需求范围膨胀，建议明确优先级：

- **P0（本次必须交付）**
  - 暂停/继续：停止发起新请求，保留进度
  - 逐张展示：每张图片完成后立即上画布（成功/失败都要反映）
  - 仅补未成功：重新生成只请求未成功的图片（失败 + 未生成/待生成）
- **P1（本次建议交付）**
  - 进度可视化：阶段/当前项/X-Y
- **P2（可后续迭代）**
  - 进度持久化增强（跨刷新/关闭恢复的完整体验）
  - 单张失败图的单独重生

## Glossary

- **Artist_Stage**: 美工阶段，负责根据图像设计阶段的提示词生成角色参考图、场景参考图和关键帧图片
- **Generation_Controller**: 生成控制器，管理图片生成流程的暂停、继续和状态追踪
- **Image_Queue**: 图片生成队列，存储待生成的图片任务
- **Generation_State**: 生成状态，包括
  - idle（空闲）
  - running（运行中）
  - pausing（暂停中：停止调度新任务，等待在途请求结束）
  - paused（已暂停：等待用户继续）
  - blocked（阻塞：因单张失败停止调度，等待用户“重新生成/重置”）
  - completed（已完成）
  - error（致命错误：流程无法继续，需要重置）
- **Canvas_Panel**: 画布面板，用于展示生成的图片
- **Progress_Callback**: 进度回调，用于实时通知生成进度和结果

## Requirements

### Requirement 1: 暂停和继续生成

**User Story:** As a user, I want to pause the image generation process and resume it later, so that I can take breaks or review generated images without losing progress.

#### Acceptance Criteria

1. WHEN the user clicks the pause button during generation, THE Generation_Controller SHALL immediately stop initiating new image generation requests
2. WHILE the generation is paused, THE Generation_Controller SHALL preserve the current generation state including completed images and pending queue
3. WHEN the user clicks the continue button after pausing, THE Generation_Controller SHALL resume generation from the next pending image
4. WHEN generation is paused, THE Artist_Stage SHALL display a "paused" status indicator to the user
5. IF an image generation request is in progress when pause is triggered, THEN THE Generation_Controller SHALL wait for that request to complete before entering paused state
6. WHEN pause is triggered and there is an in-flight request, THE Artist_Stage SHALL display a "pausing" indicator until the controller enters paused state
7. WHEN a single image generation fails, THE Generation_Controller SHALL stop scheduling new images and enter a "blocked" state awaiting user action (retry or reset)

### Requirement 2: 实时展示生成结果

**User Story:** As a user, I want to see each generated image immediately on the canvas, so that I can monitor the generation progress in real-time.

#### Acceptance Criteria

1. WHEN generation starts, THE Canvas_Panel SHALL create placeholders for all images to be generated (stable order and positions)
2. WHEN a single image generation completes successfully, THE Canvas_Panel SHALL immediately display that image without waiting for other images
3. WHEN an image is displayed on the canvas, THE Artist_Stage SHALL update the progress indicator to reflect the current completion count
4. WHEN an image generation fails, THE Canvas_Panel SHALL display a placeholder with error indication for that specific image
5. THE Generation_Controller SHALL invoke the Progress_Callback after each individual image generation completes
6. WHILE images are being generated, THE Canvas_Panel SHALL maintain the display of all previously generated images

### Requirement 3: 智能重试失败图片

**User Story:** As a user, I want to retry only the failed images when clicking regenerate, so that I don't waste time and API calls regenerating successful images.

#### Acceptance Criteria

1. WHEN the user clicks regenerate after some images are unsuccessful, THE Generation_Controller SHALL only queue images with unsuccessful status for regeneration (failed + pending/unstarted)
2. THE Generation_Controller SHALL preserve all successfully generated images when retrying failed ones
3. WHEN retrying failed images, THE Canvas_Panel SHALL update only the regenerated image positions without affecting successful images
4. IF all images are successfully generated, THEN THE regenerate button SHALL be disabled or hidden
5. WHEN a previously failed image is successfully regenerated, THE Generation_Controller SHALL update its status from failed to completed
6. WHEN generation is blocked due to a failure, THE regenerate action SHALL resume generation by first regenerating the failed image(s) and then continuing with pending/unstarted images

### Requirement 4: 生成状态持久化

**User Story:** As a user, I want my generation progress to be saved, so that I can close the browser and resume later without losing completed images.

#### Acceptance Criteria

1. WHEN an image generation completes (success or failure), THE Generation_Controller SHALL immediately persist the result to IndexedDB
2. WHEN the user returns to the Artist_Stage, THE Generation_Controller SHALL restore the previous generation state from IndexedDB
3. THE Generation_Controller SHALL correctly identify which images are pending based on persisted state
4. WHEN restoring state, THE Canvas_Panel SHALL display all previously generated images

### Requirement 5: 生成进度可视化

**User Story:** As a user, I want to see detailed progress information during generation, so that I know exactly how many images are completed and what is currently being generated.

#### Acceptance Criteria

1. WHILE generation is running, THE Artist_Stage SHALL display the current phase (characters/scenes/keyframes)
2. WHILE generation is running, THE Artist_Stage SHALL display progress as "X/Y completed" for the current phase
3. WHEN generating an image, THE Artist_Stage SHALL display the name of the current image being generated
4. WHEN an error occurs, THE Artist_Stage SHALL display the error message for the specific failed image

### Requirement 6: 单张图片重新生成

**User Story:** As a user, I want to regenerate a specific failed image individually, so that I can fix issues without affecting other images.

#### Acceptance Criteria

1. WHEN the user clicks regenerate on a specific failed image, THE Generation_Controller SHALL only regenerate that single image
2. WHEN single image regeneration completes, THE Canvas_Panel SHALL update only that specific image
3. THE Generation_Controller SHALL not affect the generation state of other images during single image regeneration
4. IF single image regeneration fails, THEN THE Artist_Stage SHALL display the new error message for that image

### Requirement 7: 关键帧生成前置条件（依赖参考图全部成功）

**User Story:** As a user, I want keyframe generation to start only after all character/scene reference images are successfully generated, so that keyframes always use complete and correct references.

#### Acceptance Criteria

1. WHEN the user starts keyframe generation, THE Artist_Stage SHALL validate that all character and scene reference image slots are status=completed
2. IF any reference image slot is not completed (pending/generating/failed), THEN THE Artist_Stage SHALL block keyframe generation and show an actionable message (e.g. counts or list of missing/failed references)
3. WHEN all reference image slots become completed, THEN THE keyframe generation action SHALL be enabled

## Decisions (已确认)

（已确认）
1. **“重新生成”覆盖范围**：包含 `failed + pending/unstarted`
2. **失败后行为**：遇到失败即停止调度，进入阻塞态等待用户“重新生成/重置”
3. **暂停语义**：暂停时允许在途请求完成
4. **并发策略**：允许有限并发，展示顺序允许“谁先完成先展示”（仍基于稳定槽位更新）
5. **关键帧依赖**：关键帧必须在角色/场景参考图全部成功后才能生成（不允许退化为文生图）

