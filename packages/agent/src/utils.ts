// ─── JSON 提取工具 ───────────────────────────────────────
//
// 从 LLM 响应中提取 JSON 对象。
// 处理多种情况：纯 JSON、代码块包裹、前后有额外文本。

/**
 * 尝试解析一段文本为 JSON；失败时返回 null。
 * 内部会依次尝试：直接解析 → 代码块提取 → 括号截取，并对常见 LLM 输出瑕疵做修复。
 */
function tryParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    /* 继续 */
  }
  const repaired = repairJson(raw)
  if (repaired !== null) {
    try {
      return JSON.parse(repaired)
    } catch {
      /* 继续 */
    }
  }
  return null
}

/**
 * 修复 LLM 输出 JSON 的常见瑕疵：
 * - 行尾多余的逗号（",}" / ",]"）
 * - 键名缺失引号（{ name: "x" }）——太复杂，交给括号截取后的简单场景
 * - 未转义的换行/制表符（字符串内部的裸换行）
 * - 单引号键/值（'key': 'value'）
 */
function repairJson(raw: string): string | null {
  let s = raw.trim()
  if (!s) return null

  // 1) 单引号键名：{ 'key': ... } → { "key": ... }（仅键，不碰值）
  s = s.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')

  // 1b) 单引号值：把形如 : '...' 或 , '...' 的单引号字符串值改为双引号。
  //     仅当该值不含双引号时替换，避免破坏已合法的双引号字符串。
  s = s.replace(/:(?:\s*)'([^']*)'(?=\s*[,}\]])/g, (m, inner: string) => {
    if (inner.includes('"')) return m
    return `: "${inner}"`
  })
  s = s.replace(/,(?:\s*)'([^']*)'(?=\s*[,}\]])/g, (m, inner: string) => {
    if (inner.includes('"')) return m
    return `, "${inner}"`
  })

  // 2) 键名缺引号：{ name: "x" } → { "name": "x" }（仅简单标识符）
  //    仅在行内、冒号前是标识符且前面不是字符串值时替换。保守实现。
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')

  // 3) 字符串内部未转义的裸换行/制表符（出现在双引号之间）→ 替换为空格
  s = s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (m, inner: string) => {
    if (/[\r\n\t]/.test(inner)) {
      const esc = inner.replace(/[\r\n\t]+/g, ' ').replace(/\\/g, '\\\\')
      return `"${esc}"`
    }
    return m
  })

  // 4) 尾随逗号：,} → } 与 ,] → ]
  s = s.replace(/,\s*([}\]])/g, '$1')

  // 5) 控制字符（合法 JSON 之外）移除
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

  return s
}

/**
 * 从文本中提取 JSON 对象/数组。处理 LLM 输出的各种形态：
 * - 纯 JSON
 * - ```json / ```JSON / ``` code 等代码块包裹（含前后说明文字）
 * - 前后有额外文本（Markdown、解释段落）
 * - 含 <think> 推理标签
 * - 常见的 JSON 瑕疵（尾逗号、单引号、缺引号、裸换行）
 */
export function extractJson(text: string): unknown | null {
  if (!text) return null

  // 移除 deepseek-r1 等推理模型的 <think>...</think> 标签
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  // 0) 移除其余可能出现的思考/注释块（deepseek 有时用 <!-- ... --> 或注释）
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '').trim()

  // 1) 尝试直接解析（含修复）
  const direct = tryParse(cleaned)
  if (direct !== null) return direct

  // 2) 从所有 ``` ... ``` 代码块中提取（允许语言标签任意，如 json/JSON/code/空）
  const codeBlocks = cleaned.match(/```[^\n]*\n?([\s\S]*?)\n?\s*```/g) || []
  // 从后往前找，取最后一个能被解析的代码块（LLM 常重复输出）
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    const inner = codeBlocks[i].replace(/^```[^\n]*\n?/, '').replace(/\n?\s*```$/, '').trim()
    if (!inner) continue
    const parsed = tryParse(inner)
    if (parsed !== null) return parsed
  }

  // 3) 尝试找到第一个 { 和最后一个 } 之间的内容（含修复）
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = cleaned.substring(firstBrace, lastBrace + 1)
    const parsed = tryParse(jsonStr)
    if (parsed !== null) return parsed
  }

  // 4) 数组形态：第一个 [ 和最后一个 ]
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const arrStr = cleaned.substring(firstBracket, lastBracket + 1)
    const parsed = tryParse(arrStr)
    if (parsed !== null) return parsed
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
