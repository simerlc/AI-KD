// ─── 变量表达式解析 ──────────────────────────────────────
//
// 支持 {{var}} 形式的变量表达式，在 Action 执行前解析为实际值。
// 表达式语法：
//   {{form.name}}   → 从上下文的 form 对象取 name 字段
//   {{record.id}}   → 从上下文的 record 对象取 id 字段
//   {{user.id}}     → 从上下文的 user 对象取 id 字段
//   {{foo.bar.baz}} → 支持任意深度嵌套路径

import type { ActionContext } from '@aikd/shared'

/** 表达式解析错误 */
export class ExpressionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpressionError'
  }
}

/**
 * 解析单个 {{expr}} 表达式。
 * expr 为点分路径，如 "form.name"、"record.id"、"user.id"。
 */
export function resolveExpression(expr: string, context: ActionContext): unknown {
  const path = expr.trim()
  if (!path) throw new ExpressionError(`空表达式: {{${expr}}}`)

  const parts = path.split('.')
  let current: unknown = context

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      throw new ExpressionError(`无法访问路径 "${path}"：中间值不是对象`)
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * 在字符串中解析所有 {{expr}} 表达式并替换。
 * - 若整个字符串恰好是一个 {{expr}}，则返回解析后的原始值（保留类型）
 * - 否则返回字符串替换结果
 */
export function resolveTemplate(input: string, context: ActionContext): unknown {
  const trimmed = input.trim()
  const singleMatch = trimmed.match(/^\{\{\s*([^{}]+)\s*\}\}$/)
  if (singleMatch) {
    return resolveExpression(singleMatch[1], context)
  }

  return input.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_full, expr: string) => {
    const value = resolveExpression(expr, context)
    return value === undefined || value === null ? '' : String(value)
  })
}

/**
 * 递归解析对象中的变量表达式。
 * 对 params 中的每个字符串值应用 {{}} 替换，对嵌套对象/数组递归处理。
 */
export function resolveObject(obj: unknown, context: ActionContext): unknown {
  if (typeof obj === 'string') {
    return resolveTemplate(obj, context)
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveObject(item, context))
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveObject(value, context)
    }
    return result
  }
  return obj
}
