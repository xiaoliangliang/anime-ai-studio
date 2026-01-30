/**
 * AI Chat 服务
 * 负责调用 /api/chat 端点与 AI 进行对话
 * 使用流式响应避免 Vercel 超时问题
 */

import type { Message, ChatOptions, AIValidationResult, ProjectStage } from '@/types';
import { getSystemPrompt, getOutputSchema, stageRequiresValidation, type ImageDesignerPhase } from '@/prompts';
import { validateJSON, extractJSON, formatValidationErrors } from './validationService';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface ChatResponse {
  success: boolean;
  message?: Message;
  data?: unknown;
  validationResult?: AIValidationResult;
  error?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

type ImageDesignerExpectations = {
  shotIds: string[];
  characters: string[];
  scenes: string[];
};

function getImageDesignerExpectations(contextData: unknown): ImageDesignerExpectations {
  const ctx: any = contextData || {};

  const shotIds: string[] = Array.isArray(ctx.shotIds)
    ? ctx.shotIds.map((x: any) => String(x).trim()).filter(Boolean)
    : Array.isArray(ctx.shots)
      ? ctx.shots.map((s: any) => String(s?.id || '').trim()).filter(Boolean)
      : [];

  const characters: string[] = Array.isArray(ctx.characters)
    ? ctx.characters.map((x: any) => String(x).trim()).filter(Boolean)
    : [];

  const scenes: string[] = Array.isArray(ctx.scenes)
    ? ctx.scenes.map((x: any) => String(x).trim()).filter(Boolean)
    : [];

  return { shotIds, characters, scenes };
}

const normalizeName = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');
const hasFuzzy = (set: Set<string>, name: string) => {
  const target = normalizeName(name);
  if (!target) return true;
  for (const raw of set) {
    const cand = normalizeName(raw);
    if (!cand) continue;
    if (cand === target) return true;
    if (cand.includes(target) || target.includes(cand)) return true;
  }
  return false;
};

function extractReferenceImages(data: unknown): Array<{ refId?: string; type?: string; name?: string; prompt?: string }> {
  const out: any = data || {};
  if (Array.isArray(out.referenceImages)) return out.referenceImages;

  const characterPrompts = Array.isArray(out.characterPrompts) ? out.characterPrompts : [];
  const scenePrompts = Array.isArray(out.scenePrompts) ? out.scenePrompts : [];

  const characters = characterPrompts.map((p: any) => ({
    refId: p.code ?? p.refId,
    type: 'character',
    name: p.name,
    prompt: p.prompt,
  }));
  const scenes = scenePrompts.map((p: any) => ({
    refId: p.code ?? p.refId,
    type: 'scene',
    name: p.name,
    prompt: p.prompt,
  }));

  return [...characters, ...scenes];
}

function extractKeyframes(data: unknown): Array<{ shotId?: string; frameNumber?: number; prompt?: string }> {
  const out: any = data || {};
  if (Array.isArray(out.keyframes)) return out.keyframes;
  if (!Array.isArray(out.keyframePrompts)) return [];

  return out.keyframePrompts.map((kf: any) => ({
    shotId: kf.shotId,
    frameNumber: kf.frameNumber ?? kf.frameIndex,
    prompt: kf.prompt,
    referenceIds: kf.referenceIds,
    characters: kf.characters,
    scene: kf.scene,
    description: kf.description,
  }));
}

/**
 * 检查图像设计阶段输出是否“对得上”上游分镜（防止被截断/漏项导致画布缺模块）
 */
function checkImageDesignerCoverage(data: unknown, contextData: unknown): { valid: boolean; error?: string } {
  const { shotIds: expectedShotIds, characters: expectedCharacters, scenes: expectedScenes } = getImageDesignerExpectations(contextData);

  const keyframes = extractKeyframes(data);
  const referenceImages = extractReferenceImages(data);

  const actualShotIds = new Set<string>(keyframes.map(k => String(k?.shotId || '').trim()).filter(Boolean));
  const actualCharacterNames = new Set<string>(referenceImages
    .filter(r => r?.type === 'character')
    .map(r => String(r?.name || '').trim())
    .filter(Boolean));
  const actualSceneNames = new Set<string>(referenceImages
    .filter(r => r?.type === 'scene')
    .map(r => String(r?.name || '').trim())
    .filter(Boolean));

  const missingShots = expectedShotIds.filter(id => !actualShotIds.has(id));
  const missingChars = expectedCharacters.filter(name => !hasFuzzy(actualCharacterNames, name));
  const missingScenes = expectedScenes.filter(name => !hasFuzzy(actualSceneNames, name));

  const problems: string[] = [];
  if (expectedShotIds.length > 0 && missingShots.length > 0) {
    problems.push(`缺少关键帧镜头: ${missingShots.slice(0, 12).join(', ')}${missingShots.length > 12 ? '...' : ''}`);
  }
  // 如果上游确实提取到了人物/场景清单，则要求至少覆盖（否则不强行卡死）
  if (expectedCharacters.length > 0 && missingChars.length > 0) {
    problems.push(`缺少人物参考图: ${missingChars.slice(0, 12).join(', ')}${missingChars.length > 12 ? '...' : ''}`);
  }
  if (expectedScenes.length > 0 && missingScenes.length > 0) {
    problems.push(`缺少场景参考图: ${missingScenes.slice(0, 12).join(', ')}${missingScenes.length > 12 ? '...' : ''}`);
  }

  return problems.length > 0 ? { valid: false, error: problems.join('；') } : { valid: true };
}

function checkImageDesignerReferenceCoverage(data: unknown, contextData: unknown): { valid: boolean; error?: string } {
  const { characters: expectedCharacters, scenes: expectedScenes } = getImageDesignerExpectations(contextData);
  const referenceImages = extractReferenceImages(data);

  const actualCharacterNames = new Set<string>(referenceImages
    .filter(r => r?.type === 'character')
    .map(r => String(r?.name || '').trim())
    .filter(Boolean));
  const actualSceneNames = new Set<string>(referenceImages
    .filter(r => r?.type === 'scene')
    .map(r => String(r?.name || '').trim())
    .filter(Boolean));

  const missingChars = expectedCharacters.filter(name => !hasFuzzy(actualCharacterNames, name));
  const missingScenes = expectedScenes.filter(name => !hasFuzzy(actualSceneNames, name));

  const problems: string[] = [];
  if (expectedCharacters.length > 0 && missingChars.length > 0) {
    problems.push(`缺少人物参考图: ${missingChars.slice(0, 12).join(', ')}${missingChars.length > 12 ? '...' : ''}`);
  }
  if (expectedScenes.length > 0 && missingScenes.length > 0) {
    problems.push(`缺少场景参考图: ${missingScenes.slice(0, 12).join(', ')}${missingScenes.length > 12 ? '...' : ''}`);
  }

  return problems.length > 0 ? { valid: false, error: problems.join('；') } : { valid: true };
}

function checkImageDesignerKeyframeCoverage(data: unknown, contextData: unknown): { valid: boolean; error?: string } {
  const { shotIds: expectedShotIds } = getImageDesignerExpectations(contextData);
  const keyframes = extractKeyframes(data);

  const actualShotIds = new Set<string>(keyframes.map(k => String(k?.shotId || '').trim()).filter(Boolean));
  const missingShots = expectedShotIds.filter(id => !actualShotIds.has(id));

  if (expectedShotIds.length > 0 && missingShots.length > 0) {
    return {
      valid: false,
      error: `缺少关键帧镜头: ${missingShots.slice(0, 12).join(', ')}${missingShots.length > 12 ? '...' : ''}`,
    };
  }

  return { valid: true };
}

/**
 * 解析 SSE 流式数据，返回完整内容
 */
async function parseSSEStream(
  response: Response,
  onChunk?: (chunk: string, accumulated: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  let currentEvent: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留不完整的行

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const eventType = currentEvent || parsed.event || parsed.type || null;
            if (eventType === 'phase') {
              continue;
            }

            const chunk = parsed.choices?.[0]?.delta?.content ?? parsed.content ?? '';
            const accumulated = typeof parsed.accumulated === 'string' ? parsed.accumulated : null;

            if (accumulated !== null) {
              fullContent = accumulated;
              onChunk?.(chunk || '', fullContent);
            } else if (chunk) {
              fullContent += chunk;
              onChunk?.(chunk, fullContent);
            }
          } catch {
            // 忽略解析错误
          } finally {
            currentEvent = null;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * 发送聊天请求到 AI（流式模式）
 */
export async function sendChatMessage(
  userMessage: string,
  stage: ProjectStage,
  history: Message[] = [],
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const {
    model = 'openai',
    temperature = 1,
    maxRetries = 3,
    maxTokens,
    contextData,
    onProgress, // 新增：进度回调
    onPhase,
    onPartialData,
  } = options;

  // 不同阶段的输出长度差异很大：图像设计阶段往往需要输出大量提示词
  // 若不显式提高 max_tokens，后端会使用默认值(8192)导致输出被截断，进而出现“只生成部分人物/场景/关键帧”的不稳定现象
  const stageDefaultMaxTokens = stage === 'imageDesigner' ? 24000 : 8192;
  const effectiveMaxTokens = typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : stageDefaultMaxTokens;

  const needsValidation = stageRequiresValidation(stage);
  const strictValidation = stage === 'imageDesigner';

  const buildMessages = (systemPrompt: string, contextOverride?: unknown) => {
    const msgs: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (contextOverride) {
      msgs.push({
        role: 'system',
        content: `当前项目数据：\n${JSON.stringify(contextOverride, null, 2)}`,
      });
    }

    for (const msg of history) {
      msgs.push({
        role: msg.role,
        content: msg.content,
      });
    }

    msgs.push({ role: 'user', content: userMessage });
    return msgs;
  };

  const runSinglePhase = async (params: {
    phase?: ImageDesignerPhase;
    systemPrompt: string;
    schema: object | null;
    contextOverride?: unknown;
    retryHint?: string;
    extraValidation?: (data: unknown) => { valid: boolean; error?: string };
  }): Promise<{
    success: boolean;
    content?: string;
    data?: unknown;
    validationResult?: AIValidationResult;
    error?: string;
  }> => {
    const { systemPrompt, schema, contextOverride, retryHint, extraValidation } = params;
    const messages = buildMessages(systemPrompt, contextOverride);
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[chatService] 发送流式请求 (尝试 ${attempt}/${maxRetries})`);

        const responseFormat = needsValidation && schema ? { type: 'json_object' } : undefined;

        const response = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: effectiveMaxTokens,
            stream: true,
            ...(responseFormat ? { response_format: responseFormat } : {}),
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const contentType = response.headers.get('content-type') || '';
        let assistantContent: string;

        if (contentType.includes('text/event-stream')) {
          console.log('[chatService] 接收流式响应...');
          assistantContent = await parseSSEStream(response, (_chunk, accumulated) => {
            onProgress?.(accumulated);
          });
          console.log('[chatService] 流式响应完成，内容长度:', assistantContent.length);
        } else {
          const data: ChatCompletionResponse = await response.json();
          assistantContent = data.choices[0]?.message?.content || '';
        }

        if (needsValidation && schema) {
          console.log('[chatService] 尝试提取 JSON，内容长度:', assistantContent.length);
          const extractedJSON = extractJSON(assistantContent);
          console.log('[chatService] 提取结果:', extractedJSON ? '成功' : '失败');

          if (extractedJSON) {
            const validationResult = validateJSON(extractedJSON, schema);
            console.log('[chatService] 校验结果:', validationResult.valid);

            if (validationResult.valid) {
              if (extraValidation) {
                const extra = extraValidation(validationResult.data);
                if (!extra.valid) {
                  lastError = extra.error || '图像设计输出不完整';
                  console.log('[chatService] 输出不完整:', lastError);

                  if (attempt < maxRetries) {
                    messages.push({ role: 'assistant', content: assistantContent });
                    messages.push({
                      role: 'user',
                      content: `你的JSON不完整：${lastError}。请严格按照要求补全所有缺失项，并重新输出“完整JSON对象”（只能输出JSON，不能带任何解释文字）。${retryHint ? `\n${retryHint}` : ''}`,
                    });
                    continue;
                  }

                  return { success: false, error: lastError };
                }
              }

              return {
                success: true,
                content: assistantContent,
                data: validationResult.data,
                validationResult,
              };
            } else {
              if (!strictValidation) {
                console.log('[chatService] 校验失败但仍返回数据（宽松模式）');
                return {
                  success: true,
                  content: assistantContent,
                  data: extractedJSON,
                  validationResult,
                };
              }

              lastError = validationResult.errors ? formatValidationErrors(validationResult.errors) : 'JSON Schema 校验失败';
              console.log('[chatService] 严格模式校验失败:', lastError);

              if (attempt < maxRetries) {
                messages.push({ role: 'assistant', content: assistantContent });
                messages.push({
                  role: 'user',
                  content: `你的JSON未通过校验：${lastError}。请严格按JSON结构重写，并只输出JSON对象（不要代码块/不要解释）。${retryHint ? `\n${retryHint}` : ''}`,
                });
                continue;
              }

              return { success: false, error: lastError };
            }
          } else {
            console.log('[chatService] 未找到 JSON');
            lastError = '未能从回复中提取有效的 JSON 数据';

            if (attempt < maxRetries) {
              messages.push({ role: 'assistant', content: assistantContent });
              messages.push({
                role: 'user',
                content: `你的回复中没有包含 JSON 数据。请确保以 JSON 格式输出结果。${retryHint ? `\n${retryHint}` : ''}`,
              });
              continue;
            }
          }
        }

        return {
          success: true,
          content: assistantContent,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : '未知错误';
        console.error(`[chatService] 请求失败 (尝试 ${attempt}/${maxRetries}):`, lastError);

        if (attempt === maxRetries) {
          return {
            success: false,
            error: `请求失败: ${lastError}`,
          };
        }

        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    return {
      success: false,
      error: lastError || '未知错误',
    };
  };

  if (stage === 'imageDesigner') {
    onPhase?.({ stage, phase: 'reference', label: '参考图生成中...' });
    const referenceResult = await runSinglePhase({
      phase: 'reference',
      systemPrompt: getSystemPrompt(stage, { phase: 'reference' }),
      schema: getOutputSchema(stage, { phase: 'reference' }),
      contextOverride: contextData,
      retryHint: '仅输出 referenceImages JSON（不要输出 keyframes）。',
      extraValidation: contextData ? (data) => checkImageDesignerReferenceCoverage(data, contextData) : undefined,
    });

    if (!referenceResult.success || !referenceResult.data) {
      return { success: false, error: referenceResult.error || '参考图生成失败' };
    }

    const referenceImages = extractReferenceImages(referenceResult.data);
    const summaryPartial = {
      totalCharacters: referenceImages.filter(r => r?.type === 'character').length,
      totalScenes: referenceImages.filter(r => r?.type === 'scene').length,
    };
    if (referenceImages.length > 0) {
      onPartialData?.({
        referenceImages,
        summary: summaryPartial,
      });
    }

    const keyframeContext =
      contextData && typeof contextData === 'object'
        ? { ...(contextData as Record<string, unknown>), referenceImages }
        : { referenceImages };

    onPhase?.({ stage, phase: 'keyframes', label: '关键帧生成中...' });
    const keyframesResult = await runSinglePhase({
      phase: 'keyframes',
      systemPrompt: getSystemPrompt(stage, { phase: 'keyframes' }),
      schema: getOutputSchema(stage, { phase: 'keyframes' }),
      contextOverride: keyframeContext,
      retryHint: '仅输出 keyframes JSON（不要输出 referenceImages）。',
      extraValidation: contextData ? (data) => checkImageDesignerKeyframeCoverage(data, contextData) : undefined,
    });

    if (!keyframesResult.success || !keyframesResult.data) {
      return { success: false, error: keyframesResult.error || '关键帧生成失败' };
    }

    const keyframes = extractKeyframes(keyframesResult.data);
    const combinedData = {
      referenceImages,
      keyframes,
      summary: {
        totalCharacters: summaryPartial.totalCharacters,
        totalScenes: summaryPartial.totalScenes,
        totalKeyframes: keyframes.length,
      },
    };

    if (contextData) {
      const coverage = checkImageDesignerCoverage(combinedData, contextData);
      if (!coverage.valid) {
        return { success: false, error: coverage.error || '图像设计输出未覆盖全部分镜' };
      }
    }

    const assistantContent = JSON.stringify(combinedData, null, 2);
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: assistantContent,
      timestamp: Date.now(),
      stage,
    };

    return {
      success: true,
      message: assistantMessage,
      data: combinedData,
      validationResult: { valid: true, data: combinedData },
    };
  }

  const generalResult = await runSinglePhase({
    systemPrompt: getSystemPrompt(stage),
    schema: getOutputSchema(stage),
    contextOverride: contextData,
    extraValidation: strictValidation && contextData ? (data) => checkImageDesignerCoverage(data, contextData) : undefined,
  });

  if (!generalResult.success || !generalResult.content) {
    return { success: false, error: generalResult.error || 'AI 响应失败' };
  }

  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: generalResult.content,
    timestamp: Date.now(),
    stage,
  };

  return {
    success: true,
    message: assistantMessage,
    data: generalResult.data,
    validationResult: generalResult.validationResult,
  };
}

/**
 * 流式聊天生成器
 * 实时返回内容片段
 */
export async function* streamChatMessage(
  userMessage: string,
  stage: ProjectStage,
  history: Message[] = [],
  options: ChatOptions = {}
): AsyncGenerator<string, ChatResponse, unknown> {
  const {
    model = 'openai',
    temperature = 1,
    contextData,
  } = options;

  // 构建消息数组
  const systemPrompt = getSystemPrompt(stage);
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];

  if (contextData) {
    messages.push({
      role: 'system',
      content: `当前项目数据：\n${JSON.stringify(contextData, null, 2)}`
    });
  }

  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: userMessage });

  const needsValidation = stageRequiresValidation(stage);
  const schema = getOutputSchema(stage);
  const responseFormat = needsValidation && schema ? { type: 'json_object' } : undefined;

  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: true,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const eventType = parsed.event || parsed.type || null;
            if (eventType === 'phase') continue;

            const chunk = parsed.choices?.[0]?.delta?.content ?? parsed.content ?? '';
            const accumulated = typeof parsed.accumulated === 'string' ? parsed.accumulated : null;
            if (accumulated !== null) {
              fullContent = accumulated;
              if (chunk) yield chunk;
            } else if (chunk) {
              fullContent += chunk;
              yield chunk;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 返回最终结果
  
  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: fullContent,
    timestamp: Date.now(),
    stage,
  };

  if (needsValidation && schema) {
    const extractedJSON = extractJSON(fullContent);
    if (extractedJSON) {
      const validationResult = validateJSON(extractedJSON, schema);
      return {
        success: true,
        message: assistantMessage,
        data: extractedJSON,
        validationResult,
      };
    }
  }

  return {
    success: true,
    message: assistantMessage,
  };
}

/**
 * 健康检查
 */
export async function checkAPIHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}
