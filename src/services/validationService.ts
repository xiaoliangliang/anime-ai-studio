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

  // 调试：打印原始内容前500字符
  console.log('[extractJSON] 原始内容前500字符:', text.substring(0, 500));
  console.log('[extractJSON] 原始内容后200字符:', text.substring(text.length - 200));

  // 1. 尝试直接解析（纯 JSON）
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    console.log('[extractJSON] 直接解析失败:', (e as Error).message?.substring(0, 100));
  }

  // 2. 尝试从 markdown 代码块中提取
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    console.log('[extractJSON] 找到代码块, 长度:', codeBlockMatch[1].length);
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {
      console.log('[extractJSON] 代码块解析失败:', (e as Error).message?.substring(0, 100));
    }
  }

  // 3. 尝试匹配最外层的 { } 或 [ ]
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    console.log('[extractJSON] 正则匹配到JSON, 长度:', jsonMatch[1].length);
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.log('[extractJSON] 正则匹配解析失败:', (e as Error).message?.substring(0, 100));
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
  console.log('[extractJSON] JSON开始位置:', jsonStart);
  
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
    
    console.log('[extractJSON] 括号匹配结束位置:', endPos, '最终depth:', depth);
    
    if (endPos !== -1) {
      const jsonStr = cleaned.slice(0, endPos);
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        console.log('[extractJSON] 括号匹配解析失败:', (e as Error).message);
        // 尝试修复常见JSON错误
        const fixed = fixCommonJSONErrors(jsonStr);
        if (fixed !== jsonStr) {
          try {
            console.log('[extractJSON] 尝试修复后解析...');
            return JSON.parse(fixed);
          } catch (e2) {
            console.log('[extractJSON] 修复后仍失败:', (e2 as Error).message);
          }
        }
      }
    } else if (depth > 0) {
      // JSON 不完整（被截断），尝试智能补全括号
      console.log('[extractJSON] JSON不完整，尝试补全括号, 缺少深度:', depth);
      
      // 追踪需要闭合的括号类型（使用栈）
      const bracketStack: string[] = [];
      let inStr = false;
      let esc = false;
      
      for (let i = 0; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') bracketStack.push('}');
        else if (c === '[') bracketStack.push(']');
        else if (c === '}' || c === ']') bracketStack.pop();
      }
      
      // 检查是否在字符串中被截断，如果是先闭合字符串
      let fixedJson = cleaned;
      if (inStr) {
        // 移除未完成的字符串值部分，找到最后一个完整的 key-value
        const lastQuoteIdx = fixedJson.lastIndexOf('"');
        const lastColonBeforeQuote = fixedJson.lastIndexOf(':', lastQuoteIdx);
        if (lastColonBeforeQuote > 0) {
          // 找到这个 key 的开始位置
          let keyStart = fixedJson.lastIndexOf('"', lastColonBeforeQuote - 1);
          keyStart = fixedJson.lastIndexOf('"', keyStart - 1);
          if (keyStart > 0) {
            // 截断到上一个完整元素
            fixedJson = fixedJson.substring(0, keyStart).trimEnd();
            // 移除尾随逗号
            if (fixedJson.endsWith(',')) {
              fixedJson = fixedJson.slice(0, -1);
            }
            // 重新计算需要闭合的括号
            bracketStack.length = 0;
            inStr = false;
            esc = false;
            for (let i = 0; i < fixedJson.length; i++) {
              const c = fixedJson[i];
              if (esc) { esc = false; continue; }
              if (c === '\\') { esc = true; continue; }
              if (c === '"') { inStr = !inStr; continue; }
              if (inStr) continue;
              if (c === '{') bracketStack.push('}');
              else if (c === '[') bracketStack.push(']');
              else if (c === '}' || c === ']') bracketStack.pop();
            }
          }
        }
      }
      
      // 逆序添加需要闭合的括号
      while (bracketStack.length > 0) {
        fixedJson += bracketStack.pop();
      }
      
      try {
        console.log('[extractJSON] 尝试智能补全...');
        return JSON.parse(fixedJson);
      } catch (e) {
        console.log('[extractJSON] 智能补全后解析失败:', (e as Error).message?.substring(0, 100));
        
        // 最后尝试：移除更多不完整内容
        try {
          // 找最后一个完整的数组元素或对象属性
          let truncated = fixedJson;
          // 尝试找到最后一个 }, 或 ],
          const lastComplete = Math.max(
            truncated.lastIndexOf('},'),
            truncated.lastIndexOf('],'),
            truncated.lastIndexOf('}]'),
            truncated.lastIndexOf(']}'),
            truncated.lastIndexOf('}}')
          );
          if (lastComplete > truncated.length * 0.5) {
            truncated = truncated.substring(0, lastComplete + 1);
            // 重新计算并添加闭合括号
            const stack2: string[] = [];
            let inS = false, es = false;
            for (let i = 0; i < truncated.length; i++) {
              const c = truncated[i];
              if (es) { es = false; continue; }
              if (c === '\\') { es = true; continue; }
              if (c === '"') { inS = !inS; continue; }
              if (inS) continue;
              if (c === '{') stack2.push('}');
              else if (c === '[') stack2.push(']');
              else if (c === '}' || c === ']') stack2.pop();
            }
            while (stack2.length > 0) truncated += stack2.pop();
            console.log('[extractJSON] 尝试截断到最后完整元素...');
            return JSON.parse(truncated);
          }
        } catch {
          console.log('[extractJSON] 截断修复也失败');
        }
      }
    }
  }

  return null;
}

/**
 * 修复常见的 JSON 语法错误
 */
function fixCommonJSONErrors(jsonStr: string): string {
  let fixed = jsonStr;
  
  // 移除尾随逗号 (trailing commas)
  fixed = fixed.replace(/,\s*([\]\}])/g, '$1');
  
  // 修复单引号为双引号 (简单情况)
  // fixed = fixed.replace(/'([^']*)':/g, '"$1":');
  
  return fixed;
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
