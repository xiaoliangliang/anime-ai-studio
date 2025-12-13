/**
 * 图像生成模型配置
 */

export interface ImageModel {
  id: string;
  name: string;
  description: string;
  type: 'txt2img' | 'img2img' | 'both';
}

// 文生图模型
export const TXT2IMG_MODELS: ImageModel[] = [
  { id: 'flux', name: 'Flux', description: '默认模型，质量均衡', type: 'txt2img' },
  { id: 'turbo', name: 'Turbo', description: '快速生成', type: 'txt2img' },
  { id: 'gptimage', name: 'GPT Image', description: 'OpenAI 图像生成', type: 'both' },
  { id: 'seedream', name: 'Seedream', description: 'ByteDance 高质量', type: 'both' },
  { id: 'seedream-pro', name: 'Seedream Pro', description: '4K输出，最强多图合成', type: 'both' },
  { id: 'nanobanana', name: 'NanoBanana', description: 'Gemini 2.5 Flash', type: 'both' },
  { id: 'nanobanana-pro', name: 'NanoBanana Pro', description: 'Gemini 3 Pro', type: 'both' },
  { id: 'zimage', name: 'ZImage', description: '替代模型', type: 'txt2img' },
];

// 图生图模型
export const IMG2IMG_MODELS: ImageModel[] = [
  { id: 'kontext', name: 'Kontext', description: '上下文感知，适合风格迁移', type: 'img2img' },
  { id: 'gptimage', name: 'GPT Image', description: 'OpenAI 图像生成', type: 'both' },
  { id: 'seedream', name: 'Seedream', description: 'ByteDance 高质量', type: 'both' },
  { id: 'seedream-pro', name: 'Seedream Pro', description: '最强多图合成', type: 'both' },
  { id: 'nanobanana', name: 'NanoBanana', description: 'Gemini 2.5 Flash', type: 'both' },
  { id: 'nanobanana-pro', name: 'NanoBanana Pro', description: 'Gemini 3 Pro', type: 'both' },
];

export const DEFAULT_TXT2IMG_MODEL = 'seedream';
export const DEFAULT_IMG2IMG_MODEL = 'seedream';
