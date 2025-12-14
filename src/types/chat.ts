/**
 * 聊天服务相关类型定义
 */

import type { ProjectStage } from './project'

/** 聊天消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant';

/** 聊天消息 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  stage?: ProjectStage;
}

/** 聊天请求选项 */
export interface ChatOptions {
  model?: string;              // 模型名称，默认 'openai'
  temperature?: number;        // 温度 0-2，默认 0.7
  maxTokens?: number;          // 最大 token 数
  stream?: boolean;            // 是否流式输出
  maxRetries?: number;         // 最大重试次数
  contextData?: unknown;       // 上下文数据
  onProgress?: (content: string) => void; // 流式响应进度回调
}

/** OpenAI 兼容的聊天完成响应 */
export interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 校验错误 */
export interface ValidationError {
  path: string;
  message: string;
  keyword?: string;
  params?: Record<string, unknown>;
}

/** AI 验证结果 */
export interface AIValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  errors?: ValidationError[];
  rawResponse?: string;
}

/** 各阶段 AI 输出类型 */
export type AIOutputType = 
  | 'screenwriter_outline'      // 编剧大纲
  | 'screenwriter_characters'   // 编剧角色
  | 'screenwriter_script'       // 编剧剧本
  | 'storyboard_shots'          // 分镜表
  | 'imagedesigner_prompts';    // 图像设计提示词

/** 系统提示词配置 */
export interface SystemPromptConfig {
  stage: ProjectStage;
  version: string;
  content: string;
  outputFormat: {
    type: AIOutputType;
    schema: string;            // JSON Schema 名称
  };
}

/** 聊天会话状态 */
export interface ChatSessionState {
  stage: ProjectStage;
  messages: Message[];
  isLoading: boolean;
  error?: string;
  lastResponseAt?: string;
}

/** 聊天上下文 */
export interface ChatContext {
  projectId: string;
  stage: ProjectStage;
  currentEpisode?: number;     // 当前处理的集数
  additionalContext?: string;  // 额外上下文（如上游数据）
}
