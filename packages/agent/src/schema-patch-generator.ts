// ─── Schema Patch Generator ──────────────────────────────
//
// AI 增量修改引擎：用户自然语言修改请求 → Schema Patch。
// 读取当前 AppSchema，分析修改意图，生成结构化 Patch（add/update/delete/move）。
// AI 不重新生成整个应用，只输出针对性的 Patch 操作。

import type { LLMClient, LLMMessage } from './types'
import type { AppSchema, PatchOp, SchemaPatch } from '@aikd/shared'
import { extractJson } from './utils'

const PATCH_SYSTEM_PROMPT = `你是 AI快搭 的增量修改引擎（Schema Patch Generator）。你的职责是：根据用户的修改请求，针对当前 App Schema 生成**增量 Patch**，而不是重新生成整个应用。

## Patch 操作类型

\`\`\`json
{
  "ops": [
    { "op": "add", "path": "/pages/0/title", "value": "新标题" },
    { "op": "update", "path": "/pages/0/layout", "value": "mobile" },
    { "op": "delete", "path": "/pages/2" },
    { "op": "move", "from": "/pages/2", "path": "/pages/0" }
  ]
}
\`\`\`

## 路径规则（JSON Pointer）

- \`/pages/0/title\` → schema.pages[0].title
- \`/pages/-\` → 追加到 pages 数组末尾
- \`/data/sources/0/name\` → schema.data.sources[0].name
- \`/actions/-\` → 追加到 actions 数组末尾
- \`/events/0/actions/0\` → schema.events[0].actions[0]

## AppSchema 结构

\`\`\`json
{
  "schemaVersion": "1.0.0",
  "id": "app_xxx",
  "name": "应用名",
  "type": "web",
  "version": "0.1.0",
  "pages": [{ "id": "page_1", "path": "/", "title": "标题", "layout": "web", "components": [...] }],
  "routes": [{ "path": "/", "pageId": "page_1" }],
  "theme": { "primaryColor": "#3b82f6", "fontFamily": "Inter" },
  "data": { "sources": [{ "id": "customers", "name": "客户", "type": "static", "data": [...] }] },
  "actions": [{ "id": "a1", "name": "动作", "type": "database.insert", "params": {...} }],
  "events": [{ "id": "e1", "name": "事件", "trigger": "interaction", "event": "click", "actions": ["a1"] }]
}
\`\`\`

## 组件结构（pages[].components[]）

组件节点：{ "id": "c1", "type": "Heading", "props": {...}, "children": [...] }
常用组件类型：Heading/Text/Button/Input/Select/Form/Table/Container/Flex/Card/Alert 等。

## 常见修改场景的 Patch 生成

1. "增加客户等级字段" → 修改 data.sources 的 customers 数据 + 对应表单组件
2. "给客户列表增加搜索" → 在列表页添加搜索 Input 组件 + 搜索动作
3. "增加客户详情页面" → add 新 page + add 新 route
4. "销售只能看到自己的客户" → update 权限/数据过滤

## 规则

1. 只输出 Patch JSON，不输出其他文字
2. 只做增量修改，不要重新生成整个 Schema
3. 路径必须精确指向当前 Schema 中存在的节点
4. 优先用最小数量的 op 完成修改
5. 新增对象（页面/组件/动作/事件）需要提供完整的对象结构
6. 修改组件时保持其 id 不变，只改 props 或 children

## 输出格式

将 JSON 放在 \`\`\`json 代码块中，格式：{"ops": [...]}`

export interface PatchGeneratorOptions {
  /** 用户修改请求 */
  request: string
  /** 当前 AppSchema */
  currentSchema: AppSchema
  /** 最大重试次数 */
  maxRetries?: number
  /** 中止信号 */
  signal?: AbortSignal
}

export interface PatchGeneratorResult {
  /** 生成的 Patch（ops + 描述） */
  patch: Omit<SchemaPatch, 'id' | 'baseVersion' | 'targetVersion' | 'createdAt'>
  retries: number
}

export class SchemaPatchGenerator {
  constructor(private llm: LLMClient) {}

  async generate(options: PatchGeneratorOptions): Promise<PatchGeneratorResult> {
    const maxRetries = options.maxRetries ?? 3
    let lastError = ''
    let retries = 0

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (options.signal?.aborted) {
        throw new Error('SchemaPatchGenerator aborted')
      }

      const messages = this.buildMessages(options, lastError)

      let response: string
      try {
        response = await this.llm.complete(messages, {
          temperature: 0.2,
          max_tokens: 8192,
          signal: options.signal,
        })
      } catch (err) {
        lastError = `LLM 调用失败：${err instanceof Error ? err.message : String(err)}`
        retries++
        continue
      }

      const parsed = extractJson(response)
      if (!parsed) {
        lastError = '无法从响应中提取 JSON'
        retries++
        continue
      }

      const ops = this.normalizeOps(parsed)
      if (!ops || ops.length === 0) {
        lastError = 'Patch 没有有效的操作'
        retries++
        continue
      }

      // 基础校验：op 类型和 path 格式
      const validationError = this.validateOpsBasic(ops)
      if (validationError) {
        lastError = validationError
        retries++
        continue
      }

      return {
        patch: {
          description: options.request,
          ops,
        },
        retries,
      }
    }

    throw new Error(`SchemaPatchGenerator 生成失败（已重试 ${maxRetries} 次）：${lastError}`)
  }

  private buildMessages(options: PatchGeneratorOptions, errorFeedback: string): LLMMessage[] {
    const currentSchemaJson = JSON.stringify(options.currentSchema, null, 2)

    let content = `## 当前 App Schema

\`\`\`json
${currentSchemaJson}
\`\`\`

## 修改请求

${options.request}

请生成增量 Patch。`

    if (errorFeedback) {
      content += `\n\n## 上次生成的 Patch 有误：\n\n${errorFeedback}\n\n请修复后重新生成。`
    }

    return [
      { role: 'system', content: PATCH_SYSTEM_PROMPT },
      { role: 'user', content },
    ]
  }

  private normalizeOps(data: unknown): PatchOp[] | null {
    if (!data || typeof data !== 'object') return null
    const obj = data as Record<string, unknown>
    const ops = obj.ops
    if (!Array.isArray(ops)) return null
    return ops as PatchOp[]
  }

  private validateOpsBasic(ops: PatchOp[]): string | null {
    const validOps = ['add', 'update', 'delete', 'move']
    for (const op of ops) {
      if (!op.op || !validOps.includes(String(op.op))) {
        return `无效的操作类型: ${String(op.op)}`
      }
      if (op.op === 'move') {
        if (typeof op.from !== 'string' || typeof op.path !== 'string') {
          return 'move 操作需要 from 和 path 字符串'
        }
      } else {
        if (typeof op.path !== 'string' || !op.path.startsWith('/')) {
          return `操作 path 必须是以 / 开头的字符串: ${String(op.path)}`
        }
      }
    }
    return null
  }
}
