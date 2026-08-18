// ─── App Planner Agent ───────────────────────────────────
//
// 「应用规划器」：将用户自然语言需求转化为 App Plan JSON。
//
// 与 PlannerAgent（生成 AppModel，即 UI 组件树）不同：
//   - AppPlannerAgent 输出 AppPlan（做什么）：App 信息、Pages、Tables、
//     Fields、Relations、Actions、Events、Workflows、Permissions
//   - 不生成 UI 组件树，不生成 React 代码
//
// 输出为严格的结构化 JSON，经 validateAppPlan 验证，失败自动重试。

import type { LLMClient, LLMMessage } from './types'
import type { AppPlan, AppType } from '@aikd/shared'
import { validateAppPlan } from '@aikd/app-engine'
import { extractJson } from './utils'

const APP_PLANNER_SYSTEM_PROMPT = `你是 AI快搭 的应用规划器（App Planner）。你的职责是将用户的自然语言需求转化为结构化的 App Plan JSON，而不是生成 HTML 或 React 代码。

## App Plan 结构

App Plan 描述应用「做什么」，包含以下部分：

\`\`\`json
{
  "schemaVersion": "1.0.0",
  "app": {
    "name": "应用名称",
    "type": "web",
    "description": "应用一句话描述"
  },
  "pages": [
    {
      "id": "page_list",
      "path": "/",
      "title": "客户列表",
      "layout": "web",
      "description": "展示所有客户，支持搜索和筛选",
      "tableId": "customers",
      "pageType": "list"
    }
  ],
  "tables": [
    {
      "id": "customers",
      "name": "客户",
      "fields": [
        { "name": "name", "type": "string", "required": true, "label": "客户名称" },
        { "name": "phone", "type": "string", "label": "手机号" },
        { "name": "status", "type": "enum", "enumOptions": ["active", "inactive"], "label": "状态" }
      ]
    }
  ],
  "relations": [],
  "actions": [
    { "id": "insert_customer", "name": "新增客户", "type": "database.insert", "params": { "tableId": "customers", "data": { "name": "{{form.name}}" } } }
  ],
  "events": [
    { "id": "save_customer", "name": "保存客户", "trigger": "interaction", "event": "submit", "actions": ["insert_customer", "refresh", "notify_ok"] }
  ],
  "workflows": [],
  "permissions": []
}
\`\`\`

## 字段类型

string | number | boolean | date | datetime | enum | uuid

## Action 类型

database.query | database.insert | database.update | database.delete | http.request | notification.success | notification.error | navigation.go | modal.open | modal.close | page.refresh

## 事件类型

click | submit | change | load | rowClick | pageLoad

## 规则

1. 只输出 App Plan JSON，不输出任何其他文字、解释或代码
2. 必须严格符合上述结构，字段名精确匹配
3. 表名用复数英文（如 customers），字段名用英文小写
4. 每个字段提供中文 label
5. 从需求中识别实体（如"客户管理系统"→ customers 表 + name/phone/email/status 字段）
6. 为每个列表页自动规划配套动作：新增、编辑、删除、搜索、筛选
7. 如果需求存在歧义，使用合理默认值，不要反问用户
8. pages 至少包含一个首页（path 为 "/"）
9. 动作参数的变量表达式使用 {{form.xxx}}、{{record.xxx}}、{{user.id}} 形式

## 输出格式

将 JSON 放在 \`\`\`json 代码块中，不要包含其他文字。`

export interface AppPlannerOptions {
  /** 用户需求描述 */
  prompt: string
  /** 应用类型 */
  appType?: AppType
  /** 应用名称（可选，未提供时从需求推断） */
  appName?: string
  /** 最大重试次数（默认 3） */
  maxRetries?: number
  /** 中止信号 */
  signal?: AbortSignal
}

export interface AppPlannerResult {
  plan: AppPlan
  retries: number
}

export class AppPlannerAgent {
  constructor(private llm: LLMClient) {}

  async plan(options: AppPlannerOptions): Promise<AppPlannerResult> {
    const maxRetries = options.maxRetries ?? 3
    let lastError = ''
    let retries = 0

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (options.signal?.aborted) {
        throw new Error('AppPlanner aborted')
      }

      const messages = this.buildMessages(options, lastError)

      let response: string
      try {
        response = await this.llm.complete(messages, {
          temperature: 0.3,
          max_tokens: 16384,
          signal: options.signal,
        })
      } catch (err) {
        console.error('[AppPlanner] LLM call failed:', err)
        lastError = `LLM 调用失败：${err instanceof Error ? err.message : String(err)}`
        retries++
        continue
      }

      if (!response || response.trim().length === 0) {
        lastError = 'LLM 返回了空响应'
        retries++
        continue
      }

      const parsed = extractJson(response)
      if (!parsed) {
        lastError = '无法从 LLM 响应中提取 JSON。请确保输出是有效的 JSON 格式。'
        retries++
        continue
      }

      // 规范化：补充应用类型、默认值
      const normalized = this.normalizePlan(parsed, options)

      const result = validateAppPlan(normalized)
      if (result.success && result.data) {
        console.log('[AppPlanner] App Plan generated')
        return { plan: result.data, retries }
      }

      console.error('[AppPlanner] Validation failed:', result.errors)
      lastError = result.errors.join('; ')
      retries++
    }

    const lastErrMsg = lastError || '未知错误'
    throw new Error(`AppPlanner 生成失败（已重试 ${maxRetries} 次）：${lastErrMsg}`)
  }

  private buildMessages(options: AppPlannerOptions, errorFeedback: string): LLMMessage[] {
    let content = `## 应用形态

具有完整**前后端**、可立即预览与使用的轻应用（统一形态，不再区分 Web/H5/Static）：
- 前端：React 组件 + 表单/列表/详情等交互
- 后端：服务端 Data API（由 backend-init.service 自动建表、写入样例数据）；前端通过 \`api.ts\` 真实读写
- 数据：在 \`tables\` 字段中声明所有持久化表，并提供 \`sample\` 数据，Builder 会据此建表 + 插入数据
- 交互：用组件 props 表达（Table 的 \`dataSource\` + \`actions\` 数组、Form 的 \`dataSource\` + \`paramId\`、Button 的 \`onClick\`、Link 的 \`href\`），不要用 events/actions 字段（Builder 不渲染它们）

## 用户需求（一句话）

${options.prompt}

请根据以上需求直接生成完整的 App Plan JSON：必须包含 tables / fields / pages / components / actions / events，确保生成后即可以预览并真实读写数据。`

    if (options.appName) {
      content += `\n\n应用名称：${options.appName}`
    }

    if (errorFeedback) {
      content += `\n\n## 上次生成的 App Plan 验证失败，错误如下：\n\n${errorFeedback}\n\n请修复这些问题并重新生成完整 JSON。`
    }

    return [
      { role: 'system', content: APP_PLANNER_SYSTEM_PROMPT },
      { role: 'user', content },
    ]
  }

  /** 规范化 LLM 输出，补充默认值 */
  private normalizePlan(data: unknown, options: AppPlannerOptions): Record<string, unknown> {
    if (!data || typeof data !== 'object') return {}
    const obj = data as Record<string, unknown>

    const app = (obj.app || {}) as Record<string, unknown>
    const normalizedApp = {
      ...app,
      name: app.name || options.appName || '未命名应用',
      type: app.type || options.appType || 'web',
      description: app.description || '',
    }

    const pages = Array.isArray(obj.pages)
      ? (obj.pages as Record<string, unknown>[]).map((p) => ({
          ...p,
          layout: p.layout || 'web',
          description: p.description || '',
        }))
      : []

    return {
      ...obj,
      schemaVersion: obj.schemaVersion || '1.0.0',
      app: normalizedApp,
      pages,
      tables: Array.isArray(obj.tables) ? obj.tables : [],
      relations: Array.isArray(obj.relations) ? obj.relations : undefined,
      actions: Array.isArray(obj.actions) ? obj.actions : undefined,
      events: Array.isArray(obj.events) ? obj.events : undefined,
      workflows: Array.isArray(obj.workflows) ? obj.workflows : undefined,
      permissions: Array.isArray(obj.permissions) ? obj.permissions : undefined,
    }
  }
}
