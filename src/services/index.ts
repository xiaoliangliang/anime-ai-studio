/**
 * 服务层导出
 */

// Chat 服务
export {
  sendChatMessage,
  streamChatMessage,
  checkAPIHealth,
  type ChatResponse,
  type ChatCompletionResponse,
} from './chatService';

// 校验服务
export {
  validateJSON,
  extractJSON,
  formatValidationErrors,
  checkStageConstraints,
  deepMerge,
} from './validationService';

// 过期标记服务
export {
  markScreenwriterStale,
  markStoryboardStale,
  markImageDesignerStale,
  clearStaleMarks,
  getStaleStats,
  type StaleGranularity,
  type StaleChangeEvent,
} from './staleTracker';

// 存储服务
export {
  getDB,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getProjectList,
  updateProjectStage,
  saveAsset,
  getAsset,
  getProjectAssets,
  deleteAsset,
  updateAssetCloudUrl,
  getStorageStats,
  saveCanvasSnapshot,
  getCanvasSnapshot,
  deleteCanvasSnapshot,
  exportProject,
  importProject,
  clearAllData,
} from './storageService';

// 画布服务
export {
  STAGE_AREAS,
  navigateToStage,
  addStageBackgrounds,
  updateStageBackgroundHeight,
  getCurrentStageFromView,
  addShapeToStage,
  getShapesInStage,
  autoLayoutStage,
  exportCanvasSnapshot,
  importCanvasSnapshot,
  clearCanvas,
  getCanvasStats,
  clearStageData,
  renderScreenwriterData,
  renderStageData,
  renderArtistData,
} from './canvasService';

// 图片生成服务
export {
  generateImageFromText,
  generateImageFromImage,
  batchGenerateImages,
  getImageUrl,
  type GenerateImageOptions,
  type GenerateImageResult,
} from './imageService';

// 视频生成服务
export {
  generateVideoFromImage,
  batchGenerateVideos,
  getVideoUrl,
  getVideoInfo,
  type GenerateVideoOptions,
  type GenerateVideoResult,
} from './videoService';

// 美工阶段服务
export {
  generateAllImages,
  generateNextImage,
  extractPromptsFromImageDesigner,
  getArtistStats,
  getGeneratedImageUrl,
  regenerateSingleImage,
  type GenerationPhase,
  type GenerationProgress,
  type GenerateAllImagesOptions,
  type GenerateAllImagesResult,
  type GenerateNextResult,
  type GenerateNextOptions,
} from './artistService';
