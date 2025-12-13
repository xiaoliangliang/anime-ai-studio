/**
 * 图像设计师阶段系统提示词
 * 基于 图像设计师.md v2.0-生图公式版
 */

// 直接使用根目录的图像设计师规范文件作为系统提示词的主体
// 通过 Vite 的 ?raw 导入为纯文本
import IMAGE_DESIGNER_MD from '../../图像设计师.md?raw';

const BACKTICK = '`';
const TRIPLE_BACKTICK = BACKTICK.repeat(3);

const APPENDIX_JSON_RULES = `
---

附加要求（系统）：
你必须严格按照以下 JSON 结构输出（使用 ${TRIPLE_BACKTICK}json 代码块包裹），这样系统才能解析并渲染到画布：

${TRIPLE_BACKTICK}json
{
  "referenceImages": [
    {
      "refId": "R-P01",
      "type": "character",
      "name": "人物名称",
      "prompt": "完整的提示词...",
      "description": "简短描述"
    }
  ],
  "keyframes": [
    {
      "shotId": "S01-01",
      "frameNumber": 1,
      "prompt": "{动作姿势},{表情情绪},{场景环境},{光线氛围},{镜头构图},二次元动漫风格,高清",
      "referenceIds": ["R-P01", "R-S01"],
      "characters": ["人物A"],
      "scene": "场景名",
      "description": "画面描述"
    }
  ],
  "summary": {
    "totalCharacters": 0,
    "totalScenes": 0,
    "totalKeyframes": 0
  }
}
${TRIPLE_BACKTICK}

注意：
- 参考图编号必须是 R-Pxx / R-Sxx 形式，例如 R-P01、R-S01。
- 有参考图时，不要重复描述人物外貌，只描述动作/表情/场景/光线/镜头。
- 覆盖所有镜头，按镜号顺序输出关键帧。
- 上下文会提供分镜表（上一阶段输出），请以此为唯一数据来源。
`;

export const IMAGE_DESIGNER_SYSTEM_PROMPT = IMAGE_DESIGNER_MD + APPENDIX_JSON_RULES;

/**
 * 图像设计师输出 JSON Schema
 */
export const IMAGE_DESIGNER_OUTPUT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    referenceImages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['refId', 'type', 'name', 'prompt'],
        properties: {
          refId: { 
            type: 'string',
            pattern: '^R-(P|S)\\d{2}$'  // R-P01 或 R-S01
          },
          type: { type: 'string', enum: ['character', 'scene'] },
          name: { type: 'string', minLength: 1 },
          prompt: { type: 'string', minLength: 10 },
          description: { type: 'string' }
        }
      }
    },
    keyframes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['shotId', 'frameNumber', 'prompt'],
        properties: {
          shotId: { type: 'string' },
          frameNumber: { type: 'integer', minimum: 1 },
          prompt: { type: 'string', minLength: 10 },
          referenceIds: {
            type: 'array',
            items: { type: 'string' }
          },
          characters: {
            type: 'array',
            items: { type: 'string' }
          },
          scene: { type: 'string' },
          description: { type: 'string' }
        }
      }
    },
    summary: {
      type: 'object',
      properties: {
        totalCharacters: { type: 'integer' },
        totalScenes: { type: 'integer' },
        totalKeyframes: { type: 'integer' }
      }
    }
  }
};
