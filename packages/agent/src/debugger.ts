// ─── AI Debugger ─────────────────────────────────────────
//
// 当生成的应用出现错误时，AI 自动分析并修复。
//
// 流程：Error → AI Diagnosis → Root Cause → Schema Patch
//       → Validate → Apply → Retest
//
// 原则：
//   - AI 不直接修改源代码，优先通过 Schema Patch / Action Patch /
//     Workflow Patch / Data Schema Patch 修复
//   - 若必须修改源代码，需在根因中说明原因
//   - 记录 Debug History

import type { LLMClient, LLMMessage } from './types'
import type {
  DebugContext,
  DebugDiagnosis,
  DebugError,
  DebugResult,
  RetestCallback,
  SchemaPatch,
} from '@aikd/shared'
import { createPatch } from '@aikd/app-engine'
import { extractJson } from './utils'

const DEBUGGER_SYSTEM_PROMPT = `你是 AI快搭 的 AI Debugger（调试器）。你的职责是：分析应用错误，定位根因，并通过 Schema Patch 修复问题。

## 你可以读取的信息

- Runtime Error（运行时错误）
- Console Error（控制台错误）
- API Error（API 错误）
- Database Error（数据库错误）
- App Schema（应用结构）
- Action Schema（动作定义）
- Event Schema（事件定义）
- 当前 Runtime State（运行时状态）

## 修复原则

1. **优先通过 Schema Patch 修复**，不要直接修改源代码
2. 可用的 Patch 类型：
   - Schema Patch（修改 pages/components/theme 等结构）
   - Action Patch（修改 actions 的动作类型/参数）
   - Workflow Patch（修改 workflows 的步骤）
   - Data Schema Patch（修改 data.sources 的表结构/字段）
3. 只有 Schema Patch 无法解决时，才标记需要修改源代码，并说明原因

## 诊断输出格式

输出 JSON：

\`\`\`json
{
  "rootCause": {
    "category": "schema | action | event | data | workflow | permission | source",
    "description": "根因描述",
    "location": "问题定位（路径）",
    "requiresSourceChange": false,
    "sourceChangeReason": "若需改源码，说明原因"
  },
  "patch": {
    "ops": [
      { "op": "update", "path": "/pages/0/components/0/props/text", "value": "修复后的值" }
    ]
  },
  "explanation": "修复说明",
  "confidence": 0.9
}
\`\`\`

## 常见错误与修复

1. 组件渲染错误 → 检查组件 type 是否合法、props 是否完整
2. 事件引用了不存在的动作 → 修复 events 的 actions 引用
3. 动作类型错误 → 修正 action 的 type
4. 数据表字段缺失 → 修正 data.sources 的字段
5. 路由引用了不存在的页面 → 修正 routes 或添加页面

## 规则

1. 只输出 JSON，不输出其他文字
2. 根因要具体、可定位
3. Patch 操作要最小化、精确
4. confidence 表示对修复方案的信心（0-1）`

export interface DebuggerOptions {
  /** 诊断上下文 */
  context: DebugContext
  /** 最大重试次数 */
  maxRetries?: number
  /** 中止信号 */
  signal?: AbortSignal
}

export class AIDebugger {
  constructor(private llm: LLMClient) {}

  /**
   * 诊断错误，生成修复方案（不实际应用）。
   */
  async diagnose(options: DebuggerOptions): Promise<DebugDiagnosis> {
    const maxRetries = options.maxRetries ?? 3
    let lastError = ''

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (options.signal?.aborted) {
        throw new Error('AIDebugger aborted')
      }

      const messages = this.buildMessages(options.context, lastError)

      let response: string
      try {
        response = await this.llm.complete(messages, {
          temperature: 0.2,
          max_tokens: 8192,
          signal: options.signal,
        })
      } catch (err) {
        lastError = `LLM 调用失败：${err instanceof Error ? err.message : String(err)}`
        continue
      }

      const parsed = extractJson(response)
      if (!parsed || typeof parsed !== 'object') {
        lastError = '无法从响应中提取 JSON'
        continue
      }

      const diagnosis = this.normalizeDiagnosis(parsed as Record<string, unknown>)
      if (!diagnosis) {
        lastError = '诊断结果格式不正确'
        continue
      }

      return diagnosis
    }

    throw new Error(`AIDebugger 诊断失败（已重试 ${maxRetries} 次）：${lastError}`)
  }

  /**
   * 完整的调试循环：诊断 → 验证 → 应用 → 重测。
   *
   * @param context 诊断上下文
   * @param applyPatchFn 应用 Patch 的回调（由宿主提供，通常调用 applyPatch）
   * @param retest 重测回调（验证修复后的应用是否正常）
   */
  async debug(
    context: DebugContext,
    applyPatchFn: (patch: SchemaPatch) => DebugResult['schema'],
    retest: RetestCallback,
    options?: { maxRetries?: number; signal?: AbortSignal },
  ): Promise<DebugResult> {
    // 1. 诊断
    const diagnosis = await this.diagnose({
      context,
      maxRetries: options?.maxRetries,
      signal: options?.signal,
    })

    // 2. 若无 Patch 且需要修改源码，返回失败
    if (!diagnosis.patch) {
      return {
        success: false,
        diagnosis,
        retestPassed: false,
        error: diagnosis.rootCause.requiresSourceChange
          ? `需要修改源代码：${diagnosis.rootCause.sourceChangeReason ?? diagnosis.rootCause.description}`
          : '诊断未生成 Patch',
      }
    }

    // 3. 补全 Patch 并应用
    const fullPatch = createPatch(
      `修复: ${diagnosis.rootCause.description}`,
      diagnosis.patch.ops,
      context.schema.version,
    )

    let newSchema: DebugResult['schema']
    try {
      newSchema = applyPatchFn(fullPatch)
    } catch (err) {
      return {
        success: false,
        diagnosis,
        retestPassed: false,
        error: `Patch 应用失败：${err instanceof Error ? err.message : String(err)}`,
      }
    }

    if (!newSchema) {
      return {
        success: false,
        diagnosis,
        retestPassed: false,
        error: 'Patch 应用未返回 Schema',
      }
    }

    // 4. 重测
    let remainingErrors: DebugError[]
    try {
      remainingErrors = await retest(newSchema)
    } catch (err) {
      return {
        success: false,
        diagnosis,
        schema: newSchema,
        retestPassed: false,
        error: `重测失败：${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const retestPassed = remainingErrors.length === 0
    return {
      success: retestPassed,
      diagnosis,
      schema: newSchema,
      retestPassed,
      error: retestPassed ? undefined : `修复后仍有 ${remainingErrors.length} 个错误`,
    }
  }

  private buildMessages(context: DebugContext, errorFeedback: string): LLMMessage[] {
    const errorsJson = JSON.stringify(context.errors, null, 2)
    const schemaJson = JSON.stringify(context.schema, null, 2)
    const stateJson = context.runtimeState ? JSON.stringify(context.runtimeState, null, 2) : '无'

    let content = `## 错误信息

\`\`\`json
${errorsJson}
\`\`\`

## 当前 App Schema

\`\`\`json
${schemaJson}
\`\`\`

## 当前 Runtime State

\`\`\`json
${stateJson}
\`\`\`

请分析错误根因，并生成 Schema Patch 修复方案。`

    if (errorFeedback) {
      content += `\n\n## 上次诊断有误：\n\n${errorFeedback}\n\n请重新诊断。`
    }

    return [
      { role: 'system', content: DEBUGGER_SYSTEM_PROMPT },
      { role: 'user', content },
    ]
  }

  private normalizeDiagnosis(data: Record<string, unknown>): DebugDiagnosis | null {
    const rootCause = data.rootCause as Record<string, unknown> | undefined
    if (!rootCause || typeof rootCause !== 'object') return null
    if (typeof rootCause.description !== 'string') return null

    const patchData = data.patch as Record<string, unknown> | undefined
    const patchOps = patchData?.ops
    const patch = Array.isArray(patchOps) && patchOps.length > 0
      ? { ops: patchOps as SchemaPatch['ops'] }
      : undefined

    const category = String(rootCause.category ?? 'schema')
    const validCategories = ['schema', 'action', 'event', 'data', 'workflow', 'permission', 'source']
    const normalizedCategory = validCategories.includes(category)
      ? (category as DebugDiagnosis['rootCause']['category'])
      : 'schema'

    const confidence = typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.5

    return {
      rootCause: {
        category: normalizedCategory,
        description: rootCause.description,
        location: typeof rootCause.location === 'string' ? rootCause.location : undefined,
        requiresSourceChange: rootCause.requiresSourceChange === true,
        sourceChangeReason: typeof rootCause.sourceChangeReason === 'string' ? rootCause.sourceChangeReason : undefined,
      },
      patch,
      explanation: typeof data.explanation === 'string' ? data.explanation : rootCause.description,
      confidence,
    }
  }
}
