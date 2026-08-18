// ─── 统一 App Schema 类型定义 ────────────────────────────
//
// App Schema 是 AI快搭 的统一结构化应用描述层。
// 与既有的 AppModel（生成 HTML/React 代码的历史数据源）并存：
//   - AppModel：描述页面布局 + 主题 + 数据源，由 Builder 渲染为 React 代码（旧路径）
//   - AppSchema：在 AppModel 之上补齐 Action / Event 语义，是后续
//     Runtime 统一执行、版本化、增量 Patch 的基础（新路径）
//
// 设计原则：
//   - 纯 TypeScript 类型，所有字段可 JSON 序列化（不含函数 / Date / class）
//   - 顶层携带 schemaVersion（schema 结构版本，区别于应用的语义版本 version）
//   - 所有对象携带可选的 meta（Record<string, unknown>），用于未来扩展而不破坏旧 Schema

// ─── Schema 版本 ─────────────────────────────────────────

/** Schema 结构版本号（语义化 x.y.z） */
export type SchemaVersionString = string

/** 当前 App Schema 的结构版本 */
export const APP_SCHEMA_VERSION = '1.0.0' as const

// ─── Action Schema ───────────────────────────────────────

/**
 * 运行时可执行的具体 Action 类型（Action Engine 分发依据）。
 * 与 UI 组件解耦，描述「做什么」，而非「哪个组件怎么做」。
 */
export type RuntimeActionType =
  // 数据库操作
  | 'database.query'
  | 'database.insert'
  | 'database.update'
  | 'database.delete'
  // 网络请求
  | 'http.request'
  // 通知
  | 'notification.success'
  | 'notification.error'
  // 导航
  | 'navigation.go'
  // 弹窗
  | 'modal.open'
  | 'modal.close'
  // 页面刷新
  | 'page.refresh'
  // 自定义动作（由 runtime 或插件扩展）
  | 'custom'

/**
 * Action 类型：描述一个可执行动作的语义。
 *
 * 兼容两层：
 *   - 旧抽象类型（navigate/setState/setData/callFunction/submitForm/custom）
 *   - 新的具体运行时类型（RuntimeActionType，如 database.query / http.request）
 */
export type ActionType =
  // 旧抽象类型（向后兼容，V1 早期）
  | 'navigate'
  | 'setState'
  | 'setData'
  | 'callFunction'
  | 'submitForm'
  // 具体运行时类型
  | RuntimeActionType

/**
 * Action 参数。
 * 不同 ActionType 对应不同结构，但都为纯 JSON 值。
 * 具体结构由 Action 的 handler 约定，这里保持开放以支持扩展。
 */
export type ActionParams = Record<string, unknown>

/**
 * Action Schema：应用内可执行的动作定义。
 * 可被 Event 触发，或由 Runtime 直接调用。
 */
export interface ActionSchema {
  /** 动作唯一 ID（应用内） */
  id: string
  /** 动作名称（展示用） */
  name: string
  /** 动作类型 */
  type: ActionType
  /** 动作参数（JSON 值，语义由 type 决定，支持 {{var}} 变量表达式） */
  params: ActionParams
  /** 动作描述（给 Planner / 用户） */
  description?: string
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ─── Event Schema ────────────────────────────────────────

/** 事件触发源类型 */
export type EventTrigger =
  /** 组件交互事件（click / change / submit / hover ...） */
  | 'interaction'
  /** 页面生命周期（onMount / onUnmount） */
  | 'lifecycle'
  /** 数据变化 */
  | 'dataChange'
  /** 自定义事件 */
  | 'custom'

/** 交互事件名（组件层面） */
export type InteractionEventName =
  | 'click'
  | 'change'
  | 'submit'
  | 'hover'
  | 'focus'
  | 'blur'
  | 'input'
  /** 行点击（表格等列表场景） */
  | 'rowClick'
  /** 加载（组件/数据加载完成） */
  | 'load'

/** 生命周期事件名（页面层面） */
export type LifecycleEventName = 'onMount' | 'onUnmount' | 'pageLoad'

/**
 * Event Schema：将组件/页面事件绑定到一个或多个 Action。
 */
export interface EventSchema {
  /** 事件唯一 ID（应用内） */
  id: string
  /** 事件名称 */
  name: string
  /** 触发源类型 */
  trigger: EventTrigger
  /** 交互事件名（trigger === 'interaction' 时有效） */
  event?: InteractionEventName
  /** 生命周期事件名（trigger === 'lifecycle' 时有效） */
  lifecycle?: LifecycleEventName
  /** 事件绑定的动作 ID 列表（按顺序执行） */
  actions: string[]
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ─── Component Schema ────────────────────────────────────

/**
 * Component Schema：统一组件节点描述。
 *
 * 在既有 ComponentNode 基础语义上，新增可选的事件绑定（events）
 * 与内联动作（inlineActions）。两个字段均可省略，保证与旧 AppModel 兼容。
 *
 * 注意：为与既有 AppModel 保持单一可信源，这里采用「类型兼容」而非
 * 定义新节点结构——即既有的 ComponentNode 继续作为组件树的基础类型，
 * 此处仅补充事件/动作语义。参见下方 ComponentSchema 的类型别名说明。
 */

/** 组件上绑定的事件（引用应用级 EventSchema.id） */
export type ComponentEvents = string[]

/** 组件上内联定义的动作（不注册到应用级 actions 时使用） */
export type ComponentInlineActions = ActionSchema[]

// ─── Data Schema ─────────────────────────────────────────

/** 数据源类型 */
export type DataSourceTypeV1 = 'static' | 'mock' | 'local'

/** 数据字段绑定描述 */
export interface DataBinding {
  /** 绑定来源：数据源 ID 或组件 ID */
  source: string
  /** 字段路径，如 'items'、'data.list' */
  path?: string
  /** 默认值（数据缺失时使用） */
  default?: unknown
}

/**
 * Data Schema：应用的数据定义。
 * 兼容既有 AppModel 的 DataSource，并新增 bindings（数据绑定）语义。
 */
export interface DataSchema {
  /** 数据源列表 */
  sources: DataSourceSchema[]
  /** 数据绑定（组件 → 数据源字段） */
  bindings?: DataBinding[]
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

/** 单个数据源 */
export interface DataSourceSchema {
  /** 数据源唯一 ID */
  id: string
  /** 数据源名称 */
  name: string
  /** 数据源类型 */
  type: DataSourceTypeV1
  /** JSON 数据 */
  data: unknown
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ─── Page Schema ─────────────────────────────────────────

/** 页面布局类型 */
export type PageLayoutV1 = 'web' | 'mobile'

/**
 * Page Schema：应用页面定义。
 * 兼容既有 AppModel 的 Page，补充 events（页面级事件）语义。
 */
export interface PageSchema {
  /** 页面唯一 ID */
  id: string
  /** 路由路径，如 '/' '/about' */
  path: string
  /** 页面标题 */
  title: string
  /** 页面布局 */
  layout: PageLayoutV1
  /** 页面内组件树（沿用既有 ComponentNode） */
  components: import('./app-model').ComponentNode[]
  /** 页面级事件（onMount 等生命周期） */
  events?: string[]
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ─── Theme Schema ────────────────────────────────────────

/** 主题配置（兼容既有 Theme） */
export interface ThemeSchema {
  primaryColor: string
  fontFamily: string
  secondaryColor?: string
  backgroundColor?: string
  textColor?: string
  [key: string]: unknown
}

// ─── App Schema ──────────────────────────────────────────

/**
 * App Schema：应用的结构化描述（单一可信源）。
 *
 * 与既有 AppModel 的关系：
 *   - AppSchema 是「语义层」，描述应用要做什么（页面 + 动作 + 事件 + 数据）。
 *   - AppModel 是「渲染层」，描述应用长什么样（组件树 + 主题）。
 *   - V1 阶段二者并存：AppSchema 可以包裹/引用 AppModel 的内容，也可以独立存在。
 *
 * 未来演进：Builder 从 AppSchema（而非裸代码）渲染，Runtime 直接执行
 * Action / Event，实现真正的「Schema 驱动」应用。
 */
export interface AppSchema {
  /** Schema 结构版本（APP_SCHEMA_VERSION），用于迁移与兼容 */
  schemaVersion: SchemaVersionString
  /** 应用唯一 ID */
  id: string
  /** 应用名称 */
  name: string
  /** 应用类型 */
  type: 'web' | 'h5' | 'static'
  /** 应用语义版本号 */
  version: string
  /** 页面列表 */
  pages: PageSchema[]
  /** 路由映射 */
  routes: Array<{ path: string; pageId: string }>
  /** 主题配置 */
  theme: ThemeSchema
  /** 数据定义 */
  data: DataSchema
  /** 应用级动作 */
  actions?: ActionSchema[]
  /** 应用级事件 */
  events?: EventSchema[]
  /** 应用级工作流 */
  workflows?: import('./workflow').WorkflowSchema[]
  /** 应用级权限配置 */
  permissions?: import('./permission').RbacContext[]
  /** 扩展元数据 */
  meta?: Record<string, unknown>
  /** 创建时间 */
  createdAt?: number
  /** 更新时间 */
  updatedAt?: number
}

// ─── Schema 兼容性辅助类型 ───────────────────────────────

/** Schema 验证结果 */
export interface SchemaValidationResult {
  success: boolean
  errors: string[]
  data?: AppSchema
}

/** 创建 AppSchema 的输入（id / 时间戳可选） */
export type NewAppSchema = Omit<AppSchema, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<AppSchema, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'>>

// ─── Action / Event 运行时类型 ───────────────────────────

/** 变量表达式上下文：提供给 {{var}} 解析的运行时数据 */
export interface ActionContext {
  /** 表单数据，如 { name: '张三', phone: '...' } */
  form?: Record<string, unknown>
  /** 当前记录，如 { id: 'xxx', name: '...' } */
  record?: Record<string, unknown>
  /** 当前用户 */
  user?: { id: string; [key: string]: unknown }
  /** 页面级数据 */
  page?: Record<string, unknown>
  /** 任意扩展上下文 */
  [key: string]: unknown
}

/** 单个 Action 执行结果 */
export interface ActionResult {
  /** 动作是否成功 */
  success: boolean
  /** 错误信息（失败时） */
  error?: string
  /** 动作返回的数据（如 database.query 的结果） */
  data?: unknown
}

/** Event（一组 Action）执行结果 */
export interface EventResult {
  /** 整体是否成功（所有 action 都成功） */
  success: boolean
  /** 每个 action 的执行结果 */
  results: ActionResult[]
  /** 发生错误时，第一个错误信息 */
  error?: string
}
