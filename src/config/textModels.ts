/**
 * 文本模型配置
 * 基于 Pollinations API 可用模型
 */

export interface TextModel {
  id: string;
  name: string;
  description: string;
  tier: 'free' | 'seed' | 'flower' | 'nectar';
  recommended?: boolean;
}

/** 文生文可用模型列表 */
export const TEXT_MODELS: TextModel[] = [
  // 推荐模型
  { id: 'openai', name: 'OpenAI GPT-4o', description: '通用智能，平衡速度与质量', tier: 'free', recommended: true },
  { id: 'claude', name: 'Claude 3.5', description: '擅长写作和创意任务', tier: 'seed', recommended: true },
  { id: 'deepseek', name: 'DeepSeek V3', description: '中文理解能力强', tier: 'free', recommended: true },
  
  // OpenAI 系列
  { id: 'openai-fast', name: 'OpenAI GPT-4o-mini', description: '快速响应，适合简单任务', tier: 'free' },
  { id: 'openai-large', name: 'OpenAI o1', description: '最强推理能力', tier: 'nectar' },
  { id: 'openai-reasoning', name: 'OpenAI o3-mini', description: '推理增强模型', tier: 'flower' },
  
  // Claude 系列
  { id: 'claude-fast', name: 'Claude 3.5 Haiku', description: '快速且经济', tier: 'free' },
  { id: 'claude-large', name: 'Claude 4 Opus', description: '最强写作能力', tier: 'nectar' },
  
  // Gemini 系列
  { id: 'gemini', name: 'Gemini 2.0 Flash', description: '谷歌最新模型', tier: 'free' },
  { id: 'gemini-large', name: 'Gemini 2.5 Pro', description: '多模态增强', tier: 'flower' },
  { id: 'gemini-search', name: 'Gemini + 搜索', description: '支持实时搜索', tier: 'seed' },
  
  // 其他模型
  { id: 'mistral', name: 'Mistral Large', description: '欧洲开源模型', tier: 'free' },
  { id: 'grok', name: 'Grok', description: 'xAI 模型', tier: 'seed' },
  { id: 'qwen-coder', name: 'Qwen Coder', description: '代码生成专用', tier: 'free' },
  { id: 'kimi-k2-thinking', name: 'Kimi K2', description: '月之暗面思考模型', tier: 'seed' },
  { id: 'perplexity-fast', name: 'Perplexity Sonar', description: '搜索增强', tier: 'seed' },
  { id: 'perplexity-reasoning', name: 'Perplexity Reasoning', description: '搜索+推理', tier: 'flower' },
  { id: 'nova-micro', name: 'Nova Micro', description: 'AWS 轻量模型', tier: 'free' },
];

/** 获取推荐模型列表 */
export function getRecommendedModels(): TextModel[] {
  return TEXT_MODELS.filter(m => m.recommended);
}

/** 根据 tier 获取模型列表 */
export function getModelsByTier(tier: TextModel['tier']): TextModel[] {
  return TEXT_MODELS.filter(m => m.tier === tier);
}

/** 根据 ID 获取模型 */
export function getModelById(id: string): TextModel | undefined {
  return TEXT_MODELS.find(m => m.id === id);
}

/** 默认模型 ID */
export const DEFAULT_TEXT_MODEL = 'openai';
