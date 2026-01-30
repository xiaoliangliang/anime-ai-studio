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
你必须严格按照以下 JSON 结构输出，这样系统才能解析并渲染到画布：

{
  "referenceImages": [
    {
      "refId": "R-P01",
      "type": "character",
      "name": "人物名称",
      "prompt": "林野,25岁男性,黑色短发,方脸浓眉,身材精瘦,灰色工装,无配饰,全身站立正面照,白色背景,二次元动漫风格,高清",
      "description": "主角参考图"
    },
    {
      "refId": "R-S01",
      "type": "scene",
      "name": "场景名称",
      "prompt": "低矮棚屋,破旧木床,窗户透光,灰蒙蒙灰尘,昆暗灯光,空镜无人物,二次元动漫风格,高清",
      "description": "场景参考图"
    }
  ],
  "keyframes": [
    {
      "shotId": "S01-01",
      "frameNumber": 1,
      "prompt": "蹲在床边,焦急表情,握着面包,低矮棚屋,昆暗灯光,中景仰视,二次元动漫风格,高清",
      "referenceIds": ["R-P01", "R-S01"],
      "characters": ["林野"],
      "scene": "低矮棚屋",
      "description": "林野蹲在床边喂妹妹吃面包"
    }
  ],
  "summary": {
    "totalCharacters": 1,
    "totalScenes": 1,
    "totalKeyframes": 1
  }
}

❗❗❗ 极其重要的输出规则：
- 你的回复必须且只能是一个有效的JSON对象
- 禁止在JSON前后添加任何解释文字、导语或总结
- 禁止使用代码块包裹（不要用 ${TRIPLE_BACKTICK}json）
- 直接以 { 开头，以 } 结尾
- 确保JSON语法完全正确

❗❗❗ 参考图提示词规则：
- 人物参考图（R-Pxx）: 必须包含"全身站立正面照,白色背景"
- 场景参考图（R-Sxx）: 必须包含"空镜无人物" - 绝对禁止描述任何人物/人群/身影
- 关键帧提示词: 不要描述人物外貌（已在参考图中），只描述动作/表情/场景/光线/镜头

其他注意：
- 参考图编号必须是 R-Pxx / R-Sxx 形式，例如 R-P01、R-S01
- 遍历分镜表中的所有人物和场景，确保不遗漏
- 覆盖所有镜头，按镜号顺序输出关键帧
- 上下文会提供分镜表（上一阶段输出）以及 shotIds / characters / scenes 清单，请严格按清单输出，数量必须对齐（缺一不可）
  - keyframes[*].shotId 必须来自 shotIds
  - referenceImages 中人物/场景的 name 必须与 characters/scenes 对齐（不要自创新名字）
`;

export const IMAGE_DESIGNER_SYSTEM_PROMPT = IMAGE_DESIGNER_MD + APPENDIX_JSON_RULES;

const APPENDIX_REFERENCE_ONLY_RULES = `
---

附加要求（系统）：
本阶段只生成“参考图提示词”，不要生成关键帧。
你必须严格按照以下 JSON 结构输出，这样系统才能解析并渲染到画布：

{
  "referenceImages": [
    {
      "refId": "R-P01",
      "type": "character",
      "name": "人物名称",
      "prompt": "林野,25岁男性,黑色短发,方脸浓眉,身材精瘦,灰色工装,无配饰,全身站立正面照,白色背景,二次元动漫风格,高清",
      "description": "主角参考图"
    },
    {
      "refId": "R-S01",
      "type": "scene",
      "name": "场景名称",
      "prompt": "低矮棚屋,破旧木床,窗户透光,灰蒙蒙灰尘,昆暗灯光,空镜无人物,二次元动漫风格,高清",
      "description": "场景参考图"
    }
  ],
  "summary": {
    "totalCharacters": 1,
    "totalScenes": 1
  }
}

❗❗❗ 极其重要的输出规则：
- 你的回复必须且只能是一个有效的JSON对象
- 禁止在JSON前后添加任何解释文字、导语或总结
- 禁止使用代码块包裹（不要用 ${TRIPLE_BACKTICK}json）
- 直接以 { 开头，以 } 结尾
- 确保JSON语法完全正确
- 本阶段不要输出 keyframes 字段（不要输出空数组、不要输出占位符）

❗❗❗ 参考图提示词规则：
- 人物参考图（R-Pxx）: 必须包含"全身站立正面照,白色背景"
- 场景参考图（R-Sxx）: 必须包含"空镜无人物" - 绝对禁止描述任何人物/人群/身影

其他注意：
- 参考图编号必须是 R-Pxx / R-Sxx 形式，例如 R-P01、R-S01
- 遍历分镜表中的所有人物和场景，确保不遗漏
- 上下文会提供 shotIds / characters / scenes 清单，请严格按清单输出，数量必须对齐（缺一不可）
  - referenceImages 中人物/场景的 name 必须与 characters/scenes 对齐（不要自创新名字）
`;

const APPENDIX_KEYFRAMES_ONLY_RULES = `
---

附加要求（系统）：
本阶段只生成“关键帧提示词”，不要生成参考图。
你必须严格按照以下 JSON 结构输出，这样系统才能解析并渲染到画布：

{
  "keyframes": [
    {
      "shotId": "S01-01",
      "frameNumber": 1,
      "prompt": "蹲在床边,焦急表情,握着面包,低矮棚屋,昆暗灯光,中景仰视,二次元动漫风格,高清",
      "referenceIds": ["R-P01", "R-S01"],
      "characters": ["林野"],
      "scene": "低矮棚屋",
      "description": "林野蹲在床边喂妹妹吃面包"
    }
  ],
  "summary": {
    "totalKeyframes": 1
  }
}

❗❗❗ 极其重要的输出规则：
- 你的回复必须且只能是一个有效的JSON对象
- 禁止在JSON前后添加任何解释文字、导语或总结
- 禁止使用代码块包裹（不要用 ${TRIPLE_BACKTICK}json）
- 直接以 { 开头，以 } 结尾
- 确保JSON语法完全正确
- 本阶段不要输出 referenceImages 字段（不要输出空数组、不要输出占位符）

❗❗❗ 关键帧提示词规则：
- 不要描述人物外貌（已在参考图中），只描述动作/表情/场景/光线/镜头
- referenceIds 必须使用上下文 referenceImages 中的 refId

其他注意：
- 覆盖所有镜头，按镜号顺序输出关键帧
- 上下文会提供 shotIds / characters / scenes 清单以及 referenceImages，请严格按清单输出
  - keyframes[*].shotId 必须来自 shotIds
`;

export const IMAGE_DESIGNER_REFERENCE_SYSTEM_PROMPT = IMAGE_DESIGNER_MD + APPENDIX_REFERENCE_ONLY_RULES;
export const IMAGE_DESIGNER_KEYFRAMES_SYSTEM_PROMPT = IMAGE_DESIGNER_MD + APPENDIX_KEYFRAMES_ONLY_RULES;

/**
 * 图像设计师输出 JSON Schema
 */
const IMAGE_DESIGNER_REFERENCE_IMAGES_SCHEMA = {
  type: 'array',
  minItems: 1,
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
};

const IMAGE_DESIGNER_KEYFRAMES_SCHEMA = {
  type: 'array',
  minItems: 1,
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
};

const IMAGE_DESIGNER_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    totalCharacters: { type: 'integer' },
    totalScenes: { type: 'integer' },
    totalKeyframes: { type: 'integer' }
  }
};

export const IMAGE_DESIGNER_OUTPUT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  // 设计阶段必须产出完整模块，否则画布渲染会出现“缺少场景/关键帧模块”
  required: ['referenceImages', 'keyframes'],
  properties: {
    referenceImages: IMAGE_DESIGNER_REFERENCE_IMAGES_SCHEMA,
    keyframes: IMAGE_DESIGNER_KEYFRAMES_SCHEMA,
    summary: IMAGE_DESIGNER_SUMMARY_SCHEMA,
  },
};

export const IMAGE_DESIGNER_REFERENCE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['referenceImages'],
  properties: {
    referenceImages: IMAGE_DESIGNER_REFERENCE_IMAGES_SCHEMA,
    summary: IMAGE_DESIGNER_SUMMARY_SCHEMA,
  },
};

export const IMAGE_DESIGNER_KEYFRAMES_ONLY_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['keyframes'],
  properties: {
    keyframes: IMAGE_DESIGNER_KEYFRAMES_SCHEMA,
    summary: IMAGE_DESIGNER_SUMMARY_SCHEMA,
  },
};
