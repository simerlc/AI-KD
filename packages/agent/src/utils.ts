// ─── JSON 提取工具 ───────────────────────────────────────
//
// 从 LLM 响应中提取 JSON 对象。
// 处理多种情况：纯 JSON、代码块包裹、前后有额外文本。

export function extractJson(text: string): unknown | null {
  if (!text) return null

  // 移除 deepseek-r1 等推理模型的 <think>...</think> 标签
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  // 尝试直接解析
  try {
    return JSON.parse(cleaned)
  } catch {
    // 继续
  }

  // 尝试从 ```json ... ``` 代码块中提取
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1])
    } catch {
      // 继续
    }
  }

  // 尝试找到第一个 { 和最后一个 } 之间的内容
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = cleaned.substring(firstBrace, lastBrace + 1)
    try {
      return JSON.parse(jsonStr)
    } catch {
      // 继续
    }
  }

  return null
}

/**
 * 生成唯一 ID（简易实现，不依赖 nanoid）。
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`
}
