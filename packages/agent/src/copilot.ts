// ─── Application Copilot ─────────────────────────────────
//
// AI 应用副驾驶：用户进入已创建的应用后，通过自然语言继续修改应用。
//
// 支持的修改类型：
//   - 修改页面 / 增加字段 / 删除字段 / 增加组件 / 修改样式
//   - 增加 API / 增加 Action / 增加 Workflow / 增加权限 / 修复错误
//
// 核心原则：
//   - 读取完整上下文（App Schema / Database / Actions / Workflows / Permissions / Error Logs）
//   - 优先生成 Patch，不重新生成整个应用
//   - 每次修改返回结构化结果（内容/原因/结果/成功）

import type { LLMClient, LLMMessage } from './types'
import type {
  AppSchema,
  DebugError,
  SchemaPatch,
  WorkflowSchema,
  RbacContext,
} from '@aikd/shared'
import { applyPatch, validatePatch, createPatch } from '@aikd/app-engine'
import { extractJson } from './utils'

// ─── Copilot 上下文 ──────────────────────────────────────

/** Copilot 读取的完整应用上下文 */
export interface CopilotContext {
  /** 当前 App Schema */
  schema: AppSchema
  /** 当前数据库 Schema（表 + 字段） */
  databaseSchema?: Array<{ id: string; name: string; fields: Array<{ name: string; type: string }> }>
  /** 当前 Actions */
  actions?: AppSchema['actions']
  /** 当前 Workflows */
  workflows?: WorkflowSchema[]
  /** 当前 Permissions */
  permissions?: RbacContext[]
  /** 错误日志 */
  errorLogs?: DebugError[]
  /** 附加上下文 */
  meta?: Record<string, unknown>
}

// ─── Copilot 结果 ────────────────────────────────────────

/** 修改类型 */
export type CopilotChangeType =
  | 'modifyPage'
  | 'addField'
  | 'deleteField'
  | 'addComponent'
  | 'modifyStyle'
  | 'addApi'
  | 'addAction'
  | 'addWorkflow'
  | 'addPermission'
  | 'fixError'

/** 单次修改的结构化结果 */
export interface CopilotResult {
  /** 修改内容（具体改了什么） */
  change: string
  /** 修改原因（为什么改） */
  reason: string
  /** 修改类型 */
  changeType: CopilotChangeType
  /** 是否成功 */
  success: boolean
  /** 生成的 Patch（若有） */
  patch?: SchemaPatch
  /** 修改后的新 Schema（成功时） */
  schema?: AppSchema
  /** 错误信息（失败时） */
  error?: string
  /** 修改历史记录数 */
  historyCount?: number
}

// ─── Copilot System Prompt ───────────────────────────────

const COPILOT_SYSTEM_PROMPT = `你是 AI快搭 的应用副驾驶（Application Copilot）。用户在已创建的应用中通过自然语言继续修改应用。

## 你的职责

分析用户的修改请求，优先生成 Schema Patch 完成修改，不重新生成整个应用。

## 支持的修改类型

1. modifyPage - 修改页面（标题/布局/组件）
2. addField - 增加字段（数据表字段 + 表单组件）
3. deleteField - 删除字段
4. addComponent - 增加组件
5. modifyStyle - 修改样式（主题/颜色）
6. addApi - 增加 API（http.request 动作）
7. addAction - 增加 Action
8. addWorkflow - 增加 Workflow
9. addPermission - 增加权限
10. fixError - 修复错误

## Patch 操作

\`\`\`json
{
  "ops": [
    { "op": "add", "path": "/pages/0/components/-", "value": {...} },
    { "op": "update", "path": "/theme/primaryColor", "value": "#ff0000" },
    { "op": "delete", "path": "/data/sources/0/fields/1" }
  ]
}
\`\`\`

## 输出格式

输出 JSON：

\`\`\`json
{
  "change": "修改内容描述",
  "reason": "修改原因",
  "changeType": "addField",
  "patch": { "ops": [...] }
}
\`\`\`

## 规则

1. 只输出 JSON，不输出其他文字
2. 优先通过 Patch 增量修改，不重新生成整个应用
3. 修改前仔细阅读当前 Schema，路径必须精确
4. 一次修改聚焦一个意图，避免大范围改动`

// ─── Application Copilot ─────────────────────────────────

export class ApplicationCopilot {
  constructor(private llm: LLMClient) {}

  /**
   * 处理一次自然语言修改请求。
   *
   * @param request 用户修改请求
   * @param context 当前应用上下文
   */
  async modify(request: string, context: CopilotContext): Promise<CopilotResult> {
    // 1. 调用 LLM 生成修改计划（Patch 优先）
    let plan: CopilotPlan
    try {
      plan = await this.generatePlan(request, context)
    } catch (err) {
      return {
        change: request,
        reason: '无法生成修改计划',
        changeType: 'modifyPage',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    // 2. 验证 Patch
    const fullPatch = createPatch(plan.change, plan.patch.ops, context.schema.version)

    const validation = validatePatch(context.schema, fullPatch)
    if (!validation.success) {
      return {
        change: plan.change,
        reason: plan.reason,
        changeType: plan.changeType,
        success: false,
        patch: fullPatch,
        error: `Patch 验证失败: ${validation.errors.join('; ')}`,
      }
    }

    // 3. 应用 Patch
    const result = applyPatch(context.schema, fullPatch)
    if (!result.success) {
      return {
        change: plan.change,
        reason: plan.reason,
        changeType: plan.changeType,
        success: false,
        patch: fullPatch,
        error: result.error,
      }
    }

    return {
      change: plan.change,
      reason: plan.reason,
      changeType: plan.changeType,
      success: true,
      patch: fullPatch,
      schema: result.schema,
    }
  }

  /** 生成修改计划（LLM） */
  private async generatePlan(request: string, context: CopilotContext): Promise<CopilotPlan> {
    const messages = this.buildMessages(request, context)

    const response = await this.llm.complete(messages, {
      temperature: 0.2,
      max_tokens: 8192,
    })

    const parsed = extractJson(response)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('无法从响应中提取 JSON')
    }

    const plan = this.normalizePlan(parsed as Record<string, unknown>, request)
    if (!plan) {
      throw new Error('修改计划格式不正确')
    }

    return plan
  }

  private buildMessages(request: string, context: CopilotContext): LLMMessage[] {
    const contextJson = JSON.stringify(
      {
        schema: context.schema,
        databaseSchema: context.databaseSchema,
        actions: context.actions,
        workflows: context.workflows,
        permissions: context.permissions,
        errorLogs: context.errorLogs,
      },
      null,
      2,
    )

    return [
      { role: 'system', content: COPILOT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `## 当前应用上下文\n\n\`\`\`json\n${contextJson}\n\`\`\`\n\n## 修改请求\n\n${request}\n\n请分析并生成修改方案。`,
      },
    ]
  }

  private normalizePlan(data: Record<string, unknown>, fallbackChange: string): CopilotPlan | null {
    const patchData = data.patch as Record<string, unknown> | undefined
    const ops = patchData?.ops
    if (!Array.isArray(ops) || ops.length === 0) return null

    const changeType = String(data.changeType ?? 'modifyPage')
    const validTypes: CopilotChangeType[] = [
      'modifyPage', 'addField', 'deleteField', 'addComponent', 'modifyStyle',
      'addApi', 'addAction', 'addWorkflow', 'addPermission', 'fixError',
    ]

    return {
      change: String(data.change ?? fallbackChange),
      reason: String(data.reason ?? ''),
      changeType: validTypes.includes(changeType as CopilotChangeType)
        ? (changeType as CopilotChangeType)
        : 'modifyPage',
      patch: { ops: ops as SchemaPatch['ops'] },
    }
  }
}

/** 修改计划（LLM 输出的中间结构） */
interface CopilotPlan {
  change: string
  reason: string
  changeType: CopilotChangeType
  patch: Pick<SchemaPatch, 'ops'>
}
