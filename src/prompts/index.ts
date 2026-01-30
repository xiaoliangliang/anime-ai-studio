/**
 * 系统提示词和 JSON Schema 导出
 */

export { SCREENWRITER_SYSTEM_PROMPT, SCREENWRITER_OUTPUT_SCHEMA } from './screenwriter';
export { STORYBOARD_SYSTEM_PROMPT, STORYBOARD_OUTPUT_SCHEMA } from './storyboard';
export {
  IMAGE_DESIGNER_SYSTEM_PROMPT,
  IMAGE_DESIGNER_REFERENCE_SYSTEM_PROMPT,
  IMAGE_DESIGNER_KEYFRAMES_SYSTEM_PROMPT,
  IMAGE_DESIGNER_OUTPUT_SCHEMA,
  IMAGE_DESIGNER_REFERENCE_SCHEMA,
  IMAGE_DESIGNER_KEYFRAMES_ONLY_SCHEMA,
} from './imageDesigner';

import { ProjectStage } from '@/types';
import { SCREENWRITER_SYSTEM_PROMPT, SCREENWRITER_OUTPUT_SCHEMA } from './screenwriter';
import { STORYBOARD_SYSTEM_PROMPT, STORYBOARD_OUTPUT_SCHEMA } from './storyboard';
import {
  IMAGE_DESIGNER_SYSTEM_PROMPT,
  IMAGE_DESIGNER_REFERENCE_SYSTEM_PROMPT,
  IMAGE_DESIGNER_KEYFRAMES_SYSTEM_PROMPT,
  IMAGE_DESIGNER_OUTPUT_SCHEMA,
  IMAGE_DESIGNER_REFERENCE_SCHEMA,
  IMAGE_DESIGNER_KEYFRAMES_ONLY_SCHEMA,
} from './imageDesigner';

export type ImageDesignerPhase = 'reference' | 'keyframes';

/**
 * 根据阶段获取系统提示词
 */
export function getSystemPrompt(stage: ProjectStage, opts?: { phase?: ImageDesignerPhase }): string {
  switch (stage) {
    case 'screenwriter':
      return SCREENWRITER_SYSTEM_PROMPT;
    case 'storyboard':
      return STORYBOARD_SYSTEM_PROMPT;
    case 'imageDesigner':
      if (opts?.phase === 'reference') return IMAGE_DESIGNER_REFERENCE_SYSTEM_PROMPT;
      if (opts?.phase === 'keyframes') return IMAGE_DESIGNER_KEYFRAMES_SYSTEM_PROMPT;
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
export function getOutputSchema(stage: ProjectStage, opts?: { phase?: ImageDesignerPhase }): object | null {
  switch (stage) {
    case 'screenwriter':
      return SCREENWRITER_OUTPUT_SCHEMA;
    case 'storyboard':
      return STORYBOARD_OUTPUT_SCHEMA;
    case 'imageDesigner':
      if (opts?.phase === 'reference') return IMAGE_DESIGNER_REFERENCE_SCHEMA;
      if (opts?.phase === 'keyframes') return IMAGE_DESIGNER_KEYFRAMES_ONLY_SCHEMA;
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
