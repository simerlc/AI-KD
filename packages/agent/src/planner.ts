import type { LLMClient, LLMMessage } from './types'
import type { AppModel, AppType, ComponentNode } from '@aikd/shared'
import { validateAppModel } from '@aikd/app-engine'
import { registry } from '@aikd/component-registry'
import { createStarterAppModel } from '@aikd/app-engine'
import { extractJson, generateId } from './utils'

// ─── Planner Agent ───────────────────────────────────────
//
// Planner 负责将用户需求转化为 App Model JSON。
// 使用 LLM 生成结构化的 App Model，通过 zod schema 验证，
// 失败时自动重试（最多 maxRetries 次）。

const PLANNER_SYSTEM_PROMPT = `你是 AI快搭 的 Planner Agent，负责将用户的自然语言需求转化为富含设计细节的 App Model JSON（蓝图）。

## App Model 结构

App Model 描述应用的布局、主题、数据源与交互事件。顶层结构如下：

\`\`\`json
{
  "id": "app_xxx",
  "name": "应用名称",
  "type": "web | h5 | static",
  "version": "0.1.0",
  "schema": {
    "theme": {
      "primaryColor": "#1677ff",
      "fontFamily": "Inter, sans-serif",
      "borderRadius": 8,
      "spacing": 8,
      "darkMode": false
    },
    "pages": [
      {
        "id": "page_home",
        "path": "/",
        "title": "页面标题",
        "layout": "web | mobile | sidebar | top-nav",
        "pageType": "home | list | detail | form | dashboard | login | custom",
        "tableId": "可选，绑定的数据表 id",
        "components": [
          {
            "id": "c1",
            "type": "组件类型",
            "props": {},
            "style": { "color": "#333", "padding": "16px" },
            "dataBinding": { "sourceId": "posts", "path": "data.list" },
            "events": { "onClick": { "type": "navigate", "target": "/posts" } },
            "children": []
          }
        ]
      }
    ],
    "routes": [
      { "path": "/", "pageId": "page_home" }
    ],
    "dataSources": [
      {
        "id": "posts",
        "name": "posts",
        "type": "mock | rest | graphql | local",
        "data": [],
        "url": "可选",
        "method": "GET | POST | PUT | DELETE",
        "responseMapping": "可选，如 data.list"
      }
    ]
  },
  "createdAt": 0,
  "updatedAt": 0
}
\`\`\`

## 全局主题（强制）
- 必须为整个应用定义**全局主题**（theme）：primaryColor 主色、borderRadius 圆角、fontFamily 字体、spacing 间距单位；如需暗黑模式设 darkMode: true

## 页面布局（强制）
- 每个页面必须显式定义 layout 类型（web/mobile/sidebar/top-nav）
- 每个页面必须包含至少 1 个有实际内容的组件

## 组件数据绑定与事件（强制）
- 组件数据来源必须通过 dataBinding 声明（sourceId 对应 DataSource.id，path 声明字段路径）
- 交互行为必须通过 events 声明事件动作（onClick/onChange/onSubmit → { type: navigate | callApi | updateState | showModal | custom }）

## 列表页规范（强制）
- 列表页必须包含：**搜索**（searchable: true）、**分页**（pagination: true）、**操作按钮**（actions: ["detail","edit","delete"]）
- 通过 Table 的 dataSource 绑定数据源，并通过 dataBinding 声明字段映射

## 表单页规范（强制）
- 表单页必须包含：**字段校验**（required 等规则）与**提交流程**（Form + submit 事件，绑定 callApi 或 updateState）

## 响应式与视觉设计（强制）
- 所有页面必须支持响应式布局
- 遵循视觉设计原则：F 型视觉流（重要内容左上优先）、色彩对比度（文本/背景对比达标）、统一间距与圆角

## 可用组件

${registry.toPromptDescription()}

## 规则

1. 每个应用至少包含一个首页（path 为 "/"），且每个页面必须包含至少 1 个有实际内容的组件
2. 组件的 type 必须是上面列出的可用组件之一
3. 组件的 props 必须符合组件的 propsSchema 定义
4. acceptsChildren 为 true 的组件才能有 children
5. 根据应用类型选择合适的 layout：web 应用用 "web"/"sidebar"，h5 应用用 "mobile"
6. 为每个组件提供合理的默认 props
7. 使用有意义的中文 id 和标题
8. createdAt 和 updatedAt 使用 0，系统会自动填充
9. id 使用任意占位字符串（如 "app_x"），系统会自动生成唯一 id
10. 内容要具体丰富：Heading/Paragraph 提供真实中文文案；List 通过 props.items 提供 3-5 条静态示例数据；Table 通过 props.columns 和 props.rows 提供示例数据；避免空组件导致页面空白

## 输出格式

请直接输出符合上述结构的 App Model JSON（纯 JSON），不要包含其他说明文字。将 JSON 放在 \`\`\`json 代码块中。`

// ─── 修改模式 Prompt（多轮对话中基于已有 App Model 更新） ───
const PLANNER_UPDATE_SYSTEM_PROMPT = `你是 AI快搭 的 Planner Agent，负责在已有 App Model 的基础上，根据用户的修改需求生成更新后的完整 App Model JSON。

## App Model 结构

App Model 是描述应用的 JSON 数据结构，包含页面、路由、主题和数据源。

\`\`\`json
{
  "id": "app_xxx",
  "name": "应用名称",
  "type": "web | h5 | static",
  "version": "0.1.0",
  "schema": {
    "pages": [
      {
        "id": "page_home",
        "path": "/",
        "title": "页面标题",
        "layout": "web | mobile",
        "components": [
          {
            "id": "c1",
            "type": "组件类型",
            "props": {},
            "children": []
          }
        ]
      }
    ],
    "routes": [
      { "path": "/", "pageId": "page_home" }
    ],
    "theme": {
      "primaryColor": "#3b82f6",
      "fontFamily": "Inter, sans-serif"
    },
    "dataSources": [
      {
        "id": "posts",
        "name": "posts",
        "type": "mock",
        "data": []
      }
    ]
  },
  "createdAt": 0,
  "updatedAt": 0
}
\`\`\`

## 可用组件

${registry.toPromptDescription()}

## 修改模式规则

1. 用户会提供「已有 App Model」和「新的修改需求」
2. 保持已有 App Model 的 id 和 createdAt 不变
3. 只修改用户明确要求的部分（页面、组件、主题、数据源）；未提及的部分保持原样
4. 组件的 type 必须是可用组件之一，props 必须符合组件的 propsSchema 定义
5. 根据应用类型选择合适的 layout：web 应用用 "web"，h5 应用用 "mobile"
6. 使用有意义的中文 id 和标题
7. createdAt 和 updatedAt 使用 0，系统会自动填充
8. 每个页面必须包含至少 1 个有实际内容的组件；List 通过 props.items 提供静态示例数据，Table 通过 props.columns 和 props.rows 提供示例数据

## 输出格式

请直接输出更新后的完整 App Model JSON（不是 diff），不要包含其他说明文字。将 JSON 放在 \`\`\`json 代码块中。`

// ─── 增量修改专用 Prompt ─────────────────────────────────
//
// 用户迭代修改（"增加一个统计页面" 等）时使用。
// 与通用修改模式的区别：
//   1. 更严格地「只改被提及的元素」，未提及的页面/组件/路由保持不变
//   2. 显式要求「保留原有主题和数据源」（除非用户明确要求修改）
//   3. 强调新增页面时不要破坏既有页面的路由与结构
const PLANNER_INCREMENTAL_PROMPT = `你是 AI快搭 的 Planner Agent，负责对**已有应用**进行**增量修改**。

用户会提供「当前应用蓝图（App Model）」与「一条修改指令」。你的任务是在保持应用其余部分**完全不变**的前提下，只针对用户指令涉及的页面/组件做增删改。

## 硬性要求（必须遵守）

1. **保留原有主题（theme）**：除非用户明确要求改主题，否则必须**原样输出**输入中的 theme（primaryColor / borderRadius / fontFamily / spacing / darkMode）。
2. **保留原有数据源（dataSources）**：除非用户明确要求增删数据源，否则 dataSources 必须**原样保留**，一条不删、一条不改。
3. **保留原有 id 与 createdAt**：应用 id、页面 id、组件 id、createdAt 一律沿用输入中的值，禁止生成新的占位 id。
4. **只改动被提及的元素**：
   - 用户说「增加 XX 页面」→ 新增一个页面（含 path/路由/组件），**其余页面完全不动**。
   - 用户说「修改 XX 页面的 Y」→ 只调整该页面对应组件/属性，其余不动。
   - 用户说「删除 XX」→ 删除对应页面/组件并清理其路由，其余不动。
5. **新增页面必须绑定有效路由**：routes 中为新页面添加条目；首页 path 始终为 "/"。
6. **每个页面至少 1 个有实际内容的组件**；新增列表页含搜索/分页/操作按钮，表单页含校验与提交流程。
7. 组件的 type 必须是可用组件之一，props 符合其 propsSchema。

## 可用组件

${registry.toPromptDescription()}

## 输入格式

输入为：
\`\`\`json
{
  "existingAppModel": { ...当前 App Model 完整 JSON... },
  "instruction": "用户的修改指令，例如：增加一个统计页面"
}
\`\`\`

## 输出格式

请直接输出**增量修改后的完整 App Model JSON**（不是 diff、不是只输出改动部分），不要包含其他说明文字。将 JSON 放在 \`\`\`json 代码块中。`

export interface PlannerOptions {
  /** 用户需求描述 */
  prompt: string
  /** 应用类型（可选，由用户选择或从需求推断） */
  appType?: AppType
  /** 应用名称（可选） */
  appName?: string
  /** 已有 App Model（修改模式：在其基础上根据新需求更新） */
  existingAppModel?: AppModel
  /** 多轮对话历史（user/assistant 消息，用于提供上下文） */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** 最大重试次数（默认 3） */
  maxRetries?: number
  /** 中止信号 */
  signal?: AbortSignal
  /** 是否使用增量修改专用 Prompt（更严格地只改被提及元素、保留主题与数据源） */
  incremental?: boolean
}

export interface PlannerResult {
  appModel: AppModel
  retries: number
}

export class PlannerAgent {
  constructor(private llm: LLMClient) {}

  async plan(options: PlannerOptions): Promise<PlannerResult> {
    const maxRetries = options.maxRetries ?? 3
    const appType = options.appType || 'web'
    // 不要无脑兜底成"未命名应用"：保留 undefined，让上游在真正缺失时再决定，
    // 否则即便用户已命名，空串也会覆盖成「未命名应用」。
    const appName = options.appName
    const existing = options.existingAppModel
    const isUpdate = Boolean(existing)

    let lastError = ''
    let retries = 0

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (options.signal?.aborted) {
        throw new Error('Planner aborted')
      }

      const messages = this.buildMessages(
        options.prompt,
        appType,
        appName,
        lastError,
        existing,
        options.history,
        options.incremental,
      )

      let response: string
      try {
        response = await this.llm.complete(messages, {
          temperature: 0.7,
          // 给推理模型（如 deepseek-v4-flash）留出 reasoning 的 token，
          // 避免思考过程占满所有额度导致返回的 content 被截断为空。
          max_tokens: 20480,
          signal: options.signal,
        })
      } catch (err) {
        console.error('[Planner] LLM call failed:', err)
        lastError = `LLM 调用失败：${err instanceof Error ? err.message : String(err)}`
        retries++
        continue
      }

      if (!response || response.trim().length === 0) {
        console.error('[Planner] LLM returned empty response')
        lastError = 'LLM 返回了空响应'
        retries++
        continue
      }

      const parsed = extractJson(response)
      if (!parsed) {
        console.error('[Planner] JSON extraction failed')
        lastError = '无法从 LLM 响应中提取 JSON。请确保输出是有效的 JSON 格式。'
        retries++
        continue
      }

      // 规范化 LLM 输出，提高验证通过率
      const normalized = this.normalizeAppModel(parsed, appType)

      // 填充系统字段（修改模式下保留原 id 与 createdAt）。
      // 注意：id 不信任 LLM 输出（LLM 会模仿示例中的占位 id，如 app_xxx），
      // 创建时总是生成新 id，避免覆盖/污染已有的 App Model 记录。
      const now = Date.now()
      const modelData = {
        ...normalized,
        id: existing?.id || generateId('app'),
        name: (normalized as Record<string, unknown>).name || appName,
        type: (normalized as Record<string, unknown>).type || existing?.type || appType,
        version: (normalized as Record<string, unknown>).version || '0.1.0',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } as AppModel

      // 兜底：部分页面为空时先注入默认内容，再进入验证
      const enriched = this.ensurePageContent(modelData, appType, appName)
      const result = validateAppModel(enriched)
      if (result.success && result.data) {
        console.log(isUpdate ? '[Planner] App Model updated' : '[Planner] App Model created')
        return { appModel: result.data, retries }
      }

      console.error('[Planner] Validation failed')
      lastError = result.errors.join('; ')
      retries++
    }

    // 所有重试都失败：抛出错误而不是返回默认模板。
    // 让上游（Orchestrator -> ACP -> 前端）看到真实失败原因，
    // 避免静默 fallback 到"未命名应用"占位页面误导用户。
    const lastErrMsg = lastError || '未知错误'
    console.error('[Planner] All attempts failed:', lastErrMsg)
    throw new Error(`Planner 生成失败（已重试 ${maxRetries} 次）：${lastErrMsg}。请检查 LLM 配置或换用其他模型。`)
  }

  /**
   * 增量修改生成（用户迭代修改专用）。
   * 基于已有 App Model 与修改指令，生成只改动被提及元素的更新后模型。
   * 使用专用增量 Prompt，强制保留原有主题（theme）与数据源（dataSources）。
   */
  async planIncremental(options: {
    /** 用户修改指令，如"增加一个统计页面" */
    instruction: string
    /** 当前应用蓝图（必填） */
    existingAppModel: AppModel
    /** 多轮对话历史 */
    history?: PlannerOptions['history']
    /** 最大重试次数（默认 3） */
    maxRetries?: number
    /** 中止信号 */
    signal?: AbortSignal
  }): Promise<PlannerResult> {
    return this.plan({
      prompt: options.instruction,
      appType: options.existingAppModel.type,
      appName: options.existingAppModel.name,
      existingAppModel: options.existingAppModel,
      history: options.history,
      maxRetries: options.maxRetries,
      signal: options.signal,
      incremental: true,
    })
  }

  private buildMessages(
    prompt: string,
    appType: AppType,
    appName: string | undefined,
    errorFeedback: string,
    existing?: AppModel,
    history?: PlannerOptions['history'],
    incremental?: boolean,
  ): LLMMessage[] {
    const systemPrompt = incremental
      ? PLANNER_INCREMENTAL_PROMPT
      : existing
        ? PLANNER_UPDATE_SYSTEM_PROMPT
        : PLANNER_SYSTEM_PROMPT
    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }]

    // 注入多轮对话历史（仅用户消息，最多最近 6 条，避免占用过多 token）
    if (history && history.length > 0) {
      const userHistory = history.filter((m) => m.role === 'user').slice(-6)
      if (userHistory.length > 0) {
        messages.push({
          role: 'user',
          content: `以下是本次对话中用户之前提出的需求（按时间先后顺序）：\n\n${userHistory
            .map((m, i) => `${i + 1}. ${m.content}`)
            .join('\n\n')}\n\n请结合这些上下文理解用户的当前需求。`,
        })
      }
    }

    messages.push({
      role: 'user',
      content: this.buildUserPrompt(prompt, appType, appName, errorFeedback, existing, incremental),
    })
    return messages
  }

  /**
   * 兜底：当 LLM 生成的模型中部分页面没有组件时，为这些空页面注入默认内容，
   * 避免生成空壳页面导致预览白屏。
   *
   * 策略：
   * - 所有页面都有组件 → 直接返回，无需兜底
   * - 所有页面都为空 → 不注入，交由验证失败 → 重试 → fallback starter 模板（保留完整内容）
   * - 部分页面为空 → 为空页面注入内容（避免整模回退丢失其他页面内容）
   *
   * 注入时会对组件 id 加页面前缀，避免多页面组件 id 冲突。
   */
  private ensurePageContent(model: AppModel, appType: AppType, appName: string | undefined): AppModel {
    const pages = model.schema.pages
    if (pages.length === 0) return model
    const allHaveContent = pages.every((p) => (p.components?.length ?? 0) > 0)
    const anyHaveContent = pages.some((p) => (p.components?.length ?? 0) > 0)
    if (allHaveContent || !anyHaveContent) {
      return model
    }

    const starter = createStarterAppModel(appType, appName ?? '未命名应用')
    const starterHome = starter.schema.pages.find((p) => p.path === '/')
    const starterComponents = starterHome?.components ?? []

    const rebaseId = (node: ComponentNode, prefix: string): ComponentNode => ({
      ...node,
      id: `${prefix}_${node.id}`,
      children: node.children?.map((child) => rebaseId(child, prefix)),
    })

    const enrichedPages = pages.map((page) => {
      if ((page.components?.length ?? 0) > 0) return page
      if (starterComponents.length > 0) {
        const components = starterComponents.map((comp) => rebaseId(comp, page.id))
        return { ...page, components }
      }
      return {
        ...page,
        components: [
          {
            id: `c_empty_${page.id}`,
            type: 'Container',
            props: { maxWidth: '100%', padding: '40px', background: '#ffffff' },
            children: [
              {
                id: `c_empty_title_${page.id}`,
                type: 'Heading',
                props: { text: page.title || '页面', level: 'h2', align: 'center', color: '#1a1a1a' },
              },
              {
                id: `c_empty_desc_${page.id}`,
                type: 'Paragraph',
                props: {
                  text: '此页面暂无内容，请在对话中描述你希望展示的内容。',
                  fontSize: '16px',
                  lineHeight: '1.8',
                  color: '#666666',
                  align: 'center',
                },
              },
            ],
          },
        ],
      }
    })

    return { ...model, schema: { ...model.schema, pages: enrichedPages } }
  }

  /**
   * 规范化 LLM 输出的 App Model，修复常见格式问题：
   * - 组件类型大小写（container → Container, nav_bar → NavBar）
   * - layout 值（desktop → web）
   * - 缺失的 components 数组
   * - 缺失的 schema 字段
   */
  private normalizeAppModel(data: unknown, appType: AppType): Record<string, unknown> {
    if (!data || typeof data !== 'object') return {}
    const obj = data as Record<string, unknown>
    const schema = (obj.schema || {}) as Record<string, unknown>

    // 规范化 layout
    const normalizeLayout = (layout: unknown): 'web' | 'mobile' => {
      if (layout === 'mobile' || layout === 'h5') return 'mobile'
      return 'web'
    }

    // 规范化组件类型（大小写不敏感匹配 registry）
    const normalizeComponentType = (type: unknown): string => {
      if (typeof type !== 'string') return 'Container'
      // 精确匹配
      if (registry.has(type)) return type
      // 大小写不敏感匹配
      const lower = type.toLowerCase()
      const found = registry.list().find((c) => c.type.toLowerCase() === lower)
      if (found) return found.type
      // snake_case → PascalCase（如 nav_bar → NavBar）
      const pascal = type
        .split(/[_\-\s]+/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join('')
      if (registry.has(pascal)) return pascal
      // 默认返回原值（让验证报错）
      return type
    }

    // 递归规范化组件节点
    const normalizeNode = (node: unknown): unknown => {
      if (!node || typeof node !== 'object') return node
      const n = { ...(node as Record<string, unknown>) }
      n.type = normalizeComponentType(n.type)
      if (n.children) {
        n.children = (n.children as unknown[]).map(normalizeNode)
      }
      return n
    }

    // 规范化页面
    const pages = Array.isArray(schema.pages)
      ? (schema.pages as Record<string, unknown>[]).map((page) => ({
          ...page,
          layout: normalizeLayout(page.layout),
          components: Array.isArray(page.components) ? (page.components as unknown[]).map(normalizeNode) : [],
        }))
      : []

    const theme = (schema.theme || {}) as Record<string, unknown>

    return {
      ...obj,
      type: obj.type || appType,
      schema: {
        ...schema,
        pages,
        routes: Array.isArray(schema.routes) ? schema.routes : [{ path: '/', pageId: 'page_home' }],
        theme: {
          primaryColor: theme.primaryColor || '#3b82f6',
          fontFamily: theme.fontFamily || 'Inter, sans-serif',
        },
        dataSources: Array.isArray(schema.dataSources) ? schema.dataSources : [],
      },
    }
  }

  private buildUserPrompt(
    prompt: string,
    appType: AppType,
    appName: string | undefined,
    errorFeedback: string,
    existing?: AppModel,
    incremental?: boolean,
  ): string {
    // 修改模式：提供已有 App Model 供 LLM 参考
    if (existing) {
      // 增量修改：使用 { existingAppModel, instruction } 输入格式，强制保留主题/数据源
      if (incremental) {
        let content = `## 当前应用蓝图

请严格基于以下 App Model 进行**增量修改**，只改动用户指令涉及的页面/组件，保留原有主题（theme）与数据源（dataSources）。

\`\`\`json
{
  "existingAppModel": ${JSON.stringify(existing, null, 2)},
  "instruction": ${JSON.stringify(prompt)}
}
\`\`\`

请输出增量修改后的**完整** App Model JSON（不是 diff）。保持 id、createdAt、theme、dataSources 原样保留，除非用户指令明确要求修改。`

        if (errorFeedback) {
          content += `

## 上次生成的 App Model 验证失败，错误如下：

${errorFeedback}

请修复这些问题并重新生成完整 JSON。`
        }

        return content
      }

      let content = `## 已有 App Model

请基于以下已有 App Model，结合用户的修改需求，输出更新后的完整 App Model JSON。

\`\`\`json
${JSON.stringify(existing, null, 2)}
\`\`\`

## 用户的修改需求

${prompt}

请根据修改需求更新上述 App Model：保持 id 和 createdAt 不变，未提及的部分保持原样。`

      if (errorFeedback) {
        content += `

## 上次生成的 App Model 验证失败，错误如下：

${errorFeedback}

请修复这些问题并重新生成完整 JSON。`
      }

      return content
    }

    let content = `## 应用信息

- 应用名称：${appName ?? '未命名应用'}
- 应用形态：具有前后端、可预览、可立即使用的轻应用（统一形态，不再区分 Web/H5/Static）。
  请把应用视为一个**完整可运行的小型 Web 应用**，而不是单页 HTML 或纯静态落地页：
  - 前端：React 页面 + 必要的交互组件
  - 后端：可由 Builder 自动生成的 \`src/api.ts\`（CRUD over \`/api/data\`，由 \`backend-init.service\` 自动建表与写入）
  - 数据：使用 \`dataSources\` 描述持久化数据；运行时通过 \`api.ts\` 真实读写
  - 预览：生成完整代码后即可在预览中直接看到数据列表、提交表单等效果

## 用户需求（一句话）

${prompt}

请根据以上需求直接生成完整的 App Model JSON。请确保：
1) 在 \`dataSources\` 中声明所有需要持久化的数据表（含样例数据，Builder 会写入数据库并由前端通过 \`api.ts\` 真实加载）；
2) 在 \`schema.pages\` 中提供对应页面，且每个页面必须有具体的 \`components\`（不要留空）；
3) 用「组件 props」表达交互（Builder 只读取组件树 props，不支持 events/actions）：
   - 列表页 Table：设置 \`dataSource: "database.<表名>"\`、\`searchable: true\`（出现搜索框+新增按钮）、\`actions: ["detail","edit","delete"]\`（自动生成详情/编辑/删除按钮，删除会真实调用删除接口）；
   - 列表页用 \`<Button onClick="/<表名>/new">新增</Button>\` 也可表达新增；
   - 详情页 \`<Detail dataSource="database.<表名>" paramId=":id" />\`、编辑页 \`<Form dataSource="database.<表名>" paramId=":id" />\`、新增页 \`<Form dataSource="database.<表名>" />\`；
   - 链接用 \`<Link href="/<表名>">\` 或 \`<Link href={"/<表名>/" + row.id}>详情</Link>\`。
   不要依赖 events/actions 字段，Builder 不会渲染它们。`

    if (errorFeedback) {
      content += `

## 上次生成的 App Model 验证失败，错误如下：

${errorFeedback}

请修复这些问题并重新生成。`
    }

    return content
  }
}
