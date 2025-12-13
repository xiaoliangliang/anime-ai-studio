/**
 * JSON Schema 校验服务
 * 使用 Ajv 进行 JSON 校验
 */

import Ajv from 'ajv';
import type { AIValidationResult, ValidationError } from '@/types';

// 创建 Ajv 实例
const ajv = new Ajv({
  allErrors: true,      // 返回所有错误
  verbose: true,        // 详细错误信息
  strict: false,        // 宽松模式
  coerceTypes: true,    // 类型强制转换
});

/**
 * 使用 JSON Schema 校验数据
 */
export function validateJSON(data: unknown, schema: object): AIValidationResult {
  try {
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return {
        valid: true,
        data,
      };
    } else {
      const errors: ValidationError[] = (validate.errors || []).map(err => ({
        path: err.instancePath || '/',
        message: err.message || '校验失败',
        keyword: err.keyword,
        params: err.params,
      }));

      return {
        valid: false,
        data,
        errors,
      };
    }
  } catch (error) {
    return {
      valid: false,
      data,
      errors: [{
        path: '/',
        message: error instanceof Error ? error.message : '校验过程出错',
      }],
    };
  }
}

/**
 * 从文本中提取 JSON
 * 支持多种格式：
 * 1. 纯 JSON
 * 2. ```json ... ``` 代码块
 * 3. { ... } 或 [ ... ] 包裹的内容
 */
export function extractJSON(text: string): unknown | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // 1. 尝试直接解析（纯 JSON）
  try {
    return JSON.parse(text.trim());
  } catch {
    // 继续尝试其他方式
  }

  // 2. 尝试从 markdown 代码块中提取
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // 继续尝试其他方式
    }
  }

  // 3. 尝试匹配最外层的 { } 或 [ ]
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // 继续尝试修复
    }
  }

  // 4. 尝试修复常见问题后解析
  let cleaned = text
    // 移除 markdown 代码块标记
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    // 移除行首的 > 引用标记
    .replace(/^>\s*/gm, '')
    // 移除 BOM
    .replace(/^\uFEFF/, '')
    .trim();

  // 查找 JSON 开始位置
  const jsonStart = cleaned.search(/[\[{]/);
  if (jsonStart !== -1) {
    cleaned = cleaned.slice(jsonStart);
    
    // 查找匹配的结束位置
    let depth = 0;
    let inString = false;
    let escape = false;
    let endPos = -1;
    
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      
      if (escape) {
        escape = false;
        continue;
      }
      
      if (char === '\\') {
        escape = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '{' || char === '[') {
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
        if (depth === 0) {
          endPos = i + 1;
          break;
        }
      }
    }
    
    if (endPos !== -1) {
      try {
        return JSON.parse(cleaned.slice(0, endPos));
      } catch {
        // 最后尝试失败
      }
    }
  }

  return null;
}

/**
 * 格式化校验错误为可读字符串
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (!errors || errors.length === 0) {
    return '未知校验错误';
  }

  return errors.map(err => {
    const path = err.path || '/';
    return `[${path}] ${err.message}`;
  }).join('\n');
}

/**
 * 检查数据是否符合特定阶段的约束
 */
export function checkStageConstraints(
  stage: string,
  data: unknown
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (stage === 'storyboard' && data && typeof data === 'object') {
    const storyboard = data as { shots?: Array<{ duration?: number; shotId?: string }> };
    
    // 检查镜头时长约束（不超过10秒）
    if (storyboard.shots) {
      for (const shot of storyboard.shots) {
        if (shot.duration && shot.duration > 10) {
          warnings.push(`镜头 ${shot.shotId || '未知'} 时长超过10秒限制 (${shot.duration}秒)`);
        }
      }
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * 深度合并两个对象（用于部分更新）
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const output = { ...target };
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceVal = source[key];
      const targetVal = target[key];
      
      if (
        sourceVal &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        targetVal &&
        typeof targetVal === 'object' &&
        !Array.isArray(targetVal)
      ) {
        (output as Record<string, unknown>)[key] = deepMerge(
          targetVal as object,
          sourceVal as object
        );
      } else {
        (output as Record<string, unknown>)[key] = sourceVal;
      }
    }
  }
  
  return output;
}
