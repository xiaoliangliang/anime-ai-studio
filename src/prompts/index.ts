/**
 * 系统提示词和 JSON Schema 导出
 */

export { SCREENWRITER_SYSTEM_PROMPT, SCREENWRITER_OUTPUT_SCHEMA } from './screenwriter';
export { STORYBOARD_SYSTEM_PROMPT, STORYBOARD_OUTPUT_SCHEMA } from './storyboard';
export { IMAGE_DESIGNER_SYSTEM_PROMPT, IMAGE_DESIGNER_OUTPUT_SCHEMA } from './imageDesigner';

import { ProjectStage } from '@/types';
import { SCREENWRITER_SYSTEM_PROMPT, SCREENWRITER_OUTPUT_SCHEMA } from './screenwriter';
import { STORYBOARD_SYSTEM_PROMPT, STORYBOARD_OUTPUT_SCHEMA } from './storyboard';
import { IMAGE_DESIGNER_SYSTEM_PROMPT, IMAGE_DESIGNER_OUTPUT_SCHEMA } from './imageDesigner';

/**
 * 根据阶段获取系统提示词
 */
export function getSystemPrompt(stage: ProjectStage): string {
  switch (stage) {
    case 'screenwriter':
      return SCREENWRITER_SYSTEM_PROMPT;
    case 'storyboard':
      return STORYBOARD_SYSTEM_PROMPT;
    case 'imageDesigner':
      return IMAGE_DESIGNER_SYSTEM_PROMPT;
    case 'artist':
      return '你是美工助手，帮助用户生成和管理关键帧图片。';
    case 'director':
      return '你是导演助手，帮助用户生成视频片段并进行预览。';
    default:
      return '';
  }
}

/**
 * 根据阶段获取输出 Schema
 */
export function getOutputSchema(stage: ProjectStage): object | null {
  switch (stage) {
    case 'screenwriter':
      return SCREENWRITER_OUTPUT_SCHEMA;
    case 'storyboard':
      return STORYBOARD_OUTPUT_SCHEMA;
    case 'imageDesigner':
      return IMAGE_DESIGNER_OUTPUT_SCHEMA;
    default:
      return null;
  }
}

/**
 * 阶段是否需要 JSON 输出校验
 */
export function stageRequiresValidation(stage: ProjectStage): boolean {
  return ['screenwriter', 'storyboard', 'imageDesigner'].includes(stage);
}
