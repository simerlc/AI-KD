// ─── Blueprint Generator ─────────────────────────────────
//
// 负责将需求分析结果（RequirementAgent 输出）转化为合法 Blueprint。
// - 使用 LLM 生成（OpenAI 兼容）
// - 生成后必须通过 BlueprintValidator 校验，失败自动重试（最多 maxRetries 次）
// - 校验失败时把错误反馈回 LLM 进行修正，直到通过或达上限
//
// 强制约束：本 Generator 只产出「合法 Blueprint」，绝不直接输出代码。

import type { Blueprint, BlueprintValidationResult } from '@aikd/shared'
import type { LLMClient, LLMMessage } from '../../types'
import { validateBlueprint } from './validator'
import { extractJson } from '../../utils'
import { registry } from '@aikd/component-registry'

export interface BlueprintGeneratorOptions {
  /** 用户原始需求 */
  prompt: string
  /** 需求分析结果（RequirementAgent 输出） */
  requirement: {
    summary: string
    appType: 'web' | 'h5' | 'static'
    appName?: string
    features: string[]
    entities: Array<{ name: string; description: string }>
  }
  /** 已有 Blueprint（修改模式，可选） */
  existingBlueprint?: Blueprint
  /**
   * 蓝图变更请求（Fix 阶段触发结构变更时传入）。
   * 传入时表示「最小化修改」：只修正 changeRequest 指出的问题，禁止重写整个蓝图。
   */
  changeRequest?: string
  /** 最大重试次数（默认 3） */
  maxRetries?: number
  /** 中止信号 */
  signal?: AbortSignal
}

export interface BlueprintGeneratorResult {
  blueprint: Blueprint
  retries: number
}

const BLUEPRINT_GENERATOR_SYSTEM_PROMPT = `你是 AI快搭 的 BlueprintGenerator，负责根据需求分析结果生成「应用蓝图」（Application Blueprint）。

## 核心原则
用户需求绝不能直接进入代码生成。你必须先生成一份**合法、完整**的应用蓝图，CodingAgent 只允许读取校验通过后的合法 Blueprint。

## Blueprint 必须包含六大要素
1. **appName**：应用名称
2. **pages**：页面列表（每个页面含 id/path/title/layout/pageType/description/tableId）
3. **pageComponents**：页面组件（每个页面对应一组组件树，组件 type 必须是下面列出的可用组件之一）
4. **dataModel**：数据模型（表 + 字段，字段 type 必须是 string/number/boolean/date/datetime/enum/uuid）
5. **apiDesign**：API 设计（接口列表，含 method/path/description/crud）
6. **userFlow**：用户流程（用户操作路径，steps 引用页面 id）

## 组件复用原则（重要）
优先复用组件库中已存在的组件，避免从零拼装。请根据页面类型选择最合适的组件：
- **首页/数据看板**：优先用 Dashboard（含 StatCard 统计卡片）与 Chart 图表
- **列表页**：优先用 Table（支持搜索/新增/编辑/删除）
- **详情页**：优先用 Detail
- **表单页**：优先用 Form + Input/Select/Textarea
- **登录/认证页**：优先用 Login
- 通用展示：Heading / Paragraph / Card / List / Image / NavBar / Footer

## 可用组件（含用法示例）
${registry.toPromptDescription()}

## 规则
1. 每个应用至少有一个首页（path 为 "/"），且每个页面都必须有对应的 pageComponents 组件规划
2. 页面 path 必须唯一；动态路径用 :id（如 "/products/:id"）
3. 组件 type 必须是上面列出的可用组件之一，props 符合其 propsSchema；优先参考组件的用法示例
4. dataModel.tables 每个表必须有 id/name/fields，字段必须有 name/type；enum 字段必须有 enumOptions
5. apiDesign.endpoints 每个接口必须有 method/path/description；涉及数据 CRUD 的标注 crud
6. userFlow.flows 每个流程的 steps 引用的 pageId 必须存在于 pages
7. 页面绑定的 tableId 必须存在于 dataModel.tables
8. appType 为 "web" | "h5" | "static"
9. 修改模式（已有 Blueprint）：保持已有 pages/id 稳定，只修改用户明确要求的部分

## 输出格式
请直接输出 Blueprint JSON（不要包含代码块之外的说明文字）。结构：
{
  "schemaVersion": "1.0.0",
  "appName": "应用名称",
  "appType": "web | h5 | static",
  "pages": [{ "id": "page_home", "path": "/", "title": "首页", "layout": "web", "pageType": "home", "description": "页面说明", "tableId": "products" }],
  "pageComponents": [{ "pageId": "page_home", "components": [{ "id": "c1", "type": "Heading", "props": {} }] }],
  "dataModel": { "tables": [{ "id": "products", "name": "商品", "fields": [{ "name": "name", "type": "string", "required": true }] }] },
  "apiDesign": { "endpoints": [{ "id": "list_products", "method": "GET", "path": "/api/products", "description": "商品列表", "crud": "list", "tableId": "products" }] },
  "userFlow": { "flows": [{ "id": "flow1", "name": "浏览下单", "description": "流程说明", "steps": [{ "id": "s1", "description": "浏览首页", "pageId": "page_home", "action": "view" }] }] }
}`

export class BlueprintGenerator {
  constructor(private llm: LLMClient) {}

  async generate(options: BlueprintGeneratorOptions): Promise<BlueprintGeneratorResult> {
    const maxRetries = options.maxRetries ?? 3
    let lastError = ''
    let retries = 0

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (options.signal?.aborted) throw new Error('BlueprintGenerator aborted')

      const messages = this.buildMessages(options, lastError)
      let response: string
      try {
        response = await this.llm.complete(messages, {
          temperature: 0.5,
          max_tokens: 20480,
          signal: options.signal,
        })
      } catch (err) {
        console.error('[BlueprintGenerator] LLM call failed:', err)
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
        lastError = '无法从 LLM 响应中提取 JSON'
        retries++
        continue
      }

      // 归一化 + 校验
      const result: BlueprintValidationResult = validateBlueprint(parsed)
      if (result.success && result.data) {
        return { blueprint: result.data, retries }
      }

      lastError = result.errors.join('; ')
      console.error('[BlueprintGenerator] Validation failed:', lastError)
      retries++
    }

    throw new Error(
      `Blueprint 生成失败（已重试 ${maxRetries} 次）：${lastError}。请检查 LLM 配置或换用其他模型。`,
    )
  }

  private buildMessages(options: BlueprintGeneratorOptions, errorFeedback: string): LLMMessage[] {
    const messages: LLMMessage[] = [
      { role: 'system', content: BLUEPRINT_GENERATOR_SYSTEM_PROMPT },
    ]

    let body = ''
    if (options.existingBlueprint) {
      body += `## 已有 Blueprint（修改模式）\n\n\`\`\`json\n${JSON.stringify(
        options.existingBlueprint,
        null,
        2,
      )}\n\`\`\`\n\n`
    }

    // Patch 优先：明确要求最小化改动，避免整体重写导致已有页面/ID 漂移
    if (options.changeRequest) {
      body += `## 蓝图变更请求（最小化修改，禁止重写整个蓝图）\n\n${options.changeRequest}\n\n`
      body += `请在「已有 Blueprint」基础上做**最小必要修改**：\n`
      body += `- 保持所有未涉及的 page.id / component.id / table.id 完全不变\n`
      body += `- 只新增或修正与上述变更请求直接相关的部分\n`
      body += `- 不要删除与变更请求无关的页面、组件、数据表或接口\n\n`
    }

    body += `## 需求分析结果\n\n- 需求概述：${options.requirement.summary}\n`
    body += `- 应用类型：${options.requirement.appType}\n`
    body += `- 应用名称：${options.requirement.appName ?? '未命名'}\n`
    if (options.requirement.features.length > 0) {
      body += `- 功能点：${options.requirement.features.join('、')}\n`
    }
    if (options.requirement.entities.length > 0) {
      body += `- 数据实体：\n${options.requirement.entities
        .map((e) => `  - ${e.name}（${e.description}）`)
        .join('\n')}\n`
    }

    body += `\n## 用户原始需求\n\n${options.prompt}\n\n`

    // 基于需求做组件推荐（组件选择能力）
    body += `## 组件推荐（请优先复用这些组件）\n\n${this.recommendComponents(options.requirement)}\n\n`

    body += `请基于以上信息输出合法、完整的 Blueprint JSON。`

    if (errorFeedback) {
      body += `\n\n## 上次生成校验失败，请修复以下问题后重新生成完整 JSON：\n\n${errorFeedback}`
    }

    messages.push({ role: 'user', content: body })
    return messages
  }

  /**
   * 组件选择能力：基于需求（功能点 + 实体 + 概述）推荐最合适的组件，
   * 让 BlueprintAgent 在做页面规划时优先复用组件库已有组件。
   */
  private recommendComponents(requirement: BlueprintGeneratorOptions['requirement']): string {
    const lines: string[] = []
    const desc = `${requirement.summary} ${requirement.features.join(' ')}`

    // 首页/看板场景
    const dashRecommendations = registry.recommend({
      description: desc,
      pageType: 'home',
      category: 'dashboard',
      limit: 3,
    })
    if (dashRecommendations.length > 0) {
      lines.push(
        `- 首页/数据看板：${dashRecommendations.map((c) => c.type).join(', ')}`,
      )
    }

    // 列表/详情/表单/登录 场景统一推荐
    const listRec = registry.recommend({ description: desc, pageType: 'list', limit: 2 })
    const formRec = registry.recommend({ description: desc, pageType: 'form', limit: 2 })
    const loginRec = registry.recommend({ description: desc, pageType: 'login', limit: 2 })
    if (listRec.length) lines.push(`- 列表页：${listRec.map((c) => c.type).join(', ')}`)
    if (formRec.length) lines.push(`- 表单页：${formRec.map((c) => c.type).join(', ')}`)
    if (loginRec.length) lines.push(`- 认证页：${loginRec.map((c) => c.type).join(', ')}`)

    if (lines.length === 0) lines.push('- 请根据组件清单中的可用组件选择合适组件')

    return lines.join('\n')
  }
}
