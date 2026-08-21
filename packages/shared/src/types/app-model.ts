import { z } from 'zod'

// ─── App Model 类型定义 ──────────────────────────────────
//
// App Model 是 AI快搭 的核心数据结构，描述一个应用的完整布局与配置。
// Builder Agent 根据 App Model 生成可运行的 React 代码。
// 用户对话修改 → 更新 App Model → Builder 重新生成代码 → 预览刷新。

/** 应用类型 */
export type AppType = 'web' | 'h5' | 'static'

/** 页面布局类型 */
export type PageLayout = 'web' | 'mobile'

/** 数据源类型 */
export type DataSourceType = 'static' | 'mock' | 'rest' | 'graphql' | 'local'

/** HTTP 请求方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/** 组件节点 - App Model 中对组件的描述 */
export interface ComponentNode {
  /** 组件实例唯一 ID */
  id: string
  /** 引用 component-registry 中的组件类型，如 'Button'、'Header' */
  type: string
  /** 组件 props（JSON 值，结构由 component-registry 的 propsSchema 约束） */
  props: Record<string, unknown>
  /** 内联样式（JSON 化 CSS 属性，避免对 React 类型的硬依赖） */
  style?: Record<string, unknown>
  /** 事件绑定：事件名 → Action（onClick / onChange / onSubmit ...） */
  events?: Record<string, Action>
  /** 数据绑定：关联数据源字段 */
  dataBinding?: {
    /** 对应 DataSource.id */
    sourceId: string
    /** 字段路径，如 "name" 或 "list[0].title" */
    path: string
  }
  /** 子组件（仅当组件 acceptsChildren 为 true 时有效） */
  children?: ComponentNode[]
}

/** 页面定义 */
export interface Page {
  /** 页面唯一 ID */
  id: string
  /** 路由路径，如 '/' '/about' */
  path: string
  /** 页面标题 */
  title: string
  /** 页面布局：web（桌面端）/ mobile（移动端 H5） */
  layout: PageLayout
  /** 页面内的组件树 */
  components: ComponentNode[]
  /** 页面类型（从 Blueprint 透传，用于 Builder 生成正确的列表/新增/详情链接） */
  pageType?: 'home' | 'list' | 'detail' | 'form' | 'dashboard' | 'login' | 'custom'
  /** 页面绑定的数据表 ID（列表/详情/新增页关联的数据源） */
  tableId?: string
  /** 页面描述（从 Blueprint 透传） */
  description?: string
}

/** 路由映射 */
export interface Route {
  /** 路由路径 */
  path: string
  /** 关联的页面 ID */
  pageId: string
}

/** 主题配置 */
export interface Theme {
  /** 主色调（十六进制颜色值） */
  primaryColor: string
  /** 字体族 */
  fontFamily: string
  /** 次要颜色 */
  secondaryColor?: string
  /** 背景色 */
  backgroundColor?: string
  /** 文字颜色 */
  textColor?: string
  /** 圆角半径（px） */
  borderRadius?: number
  /** 基础间距单位（px） */
  spacing?: number
  /** 是否启用暗黑模式 */
  darkMode?: boolean
}

/** 数据源定义（静态数据 / mock / 远程 REST / GraphQL / 本地） */
export interface DataSource {
  /** 数据源唯一 ID */
  id: string
  /** 数据源名称（供组件引用） */
  name: string
  /** 数据源类型 */
  type: DataSourceType
  /** JSON 数据（静态 / mock / local 数据源使用） */
  data?: unknown
  /** 远程接口地址（rest / graphql 数据源使用） */
  url?: string
  /** HTTP 请求方法（rest 数据源使用） */
  method?: HttpMethod
  /** 请求头（rest 数据源使用） */
  headers?: Record<string, string>
  /** 响应字段映射，如 "data.list"（rest 数据源使用） */
  responseMapping?: string
}

/** App Model 的 schema 部分 */
export interface AppModelSchema {
  /** 页面列表 */
  pages: Page[]
  /** 路由映射 */
  routes: Route[]
  /** 主题配置 */
  theme: Theme
  /** 数据源列表 */
  dataSources: DataSource[]
}

/** App Model - 应用模型的完整描述 */
export interface AppModel {
  /** 应用唯一 ID */
  id: string
  /** 应用名称 */
  name: string
  /** 应用类型 */
  type: AppType
  /** 语义化版本号，如 '0.1.0' */
  version: string
  /** 应用 schema（页面、路由、主题、数据源） */
  schema: AppModelSchema
  /** 创建时间（毫秒时间戳） */
  createdAt: number
  /** 更新时间（毫秒时间戳） */
  updatedAt: number
}

// ─── App Version 类型 ────────────────────────────────────

/** 应用版本快照 */
export interface AppVersion {
  /** 版本记录唯一 ID */
  id: string
  /** 关联的应用 ID */
  appId: string
  /** 版本号，如 '0.1.0' */
  version: string
  /** 版本标签 */
  label?: string | null
  /** 该版本对应的 App Model ID */
  appModelId: string
  /** 代码快照 hash（用于校验代码变更） */
  codeHash?: string | null
  /** 创建时间 */
  createdAt: number
  /** 创建者用户 ID */
  userId: string
}

// ─── 辅助类型 ────────────────────────────────────────────

/** 创建 App Model 时的输入（不需要 id 和时间戳） */
export type NewAppModel = Omit<AppModel, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
  createdAt?: number
  updatedAt?: number
}

/** 创建 App Version 时的输入 */
export type NewAppVersion = Omit<AppVersion, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: number
}

/** App Model 验证结果 */
export interface AppModelValidationResult {
  success: boolean
  errors: string[]
  data?: AppModel
}

// ─── 高级特性扩展（主题 / 数据源 / 事件交互） ─────────────
//
// 以下类型在保留既有 AppModel 结构的基础上，为蓝图补充
// 主题、数据源、事件交互等更丰富的表达，供 Runtime / Builder 使用。
// 所有字段均可选，向后兼容既有 App Model。

/** 交互动作：事件触发时执行的行为 */
export interface Action {
  /** 动作类型 */
  type: 'navigate' | 'callApi' | 'updateState' | 'showModal' | 'custom'
  /** 动作目标（如导航路径、接口地址、状态名、弹窗 ID） */
  target?: string
  /** 动作负载（JSON 值，语义由 type 决定） */
  payload?: unknown
}

/** 页面布局类型（高级扩展，与既有 AppType 互补） */
export type PageLayoutStyle = 'full' | 'sidebar' | 'top-nav'

/** 富组件节点 - 在 ComponentNode 之上补齐 style / events / dataBinding */
export interface RichComponentNode {
  /** 组件实例唯一 ID */
  id: string
  /** 组件类型，如 "Button"、"Table" */
  type: string
  /** 组件 props（JSON 值） */
  props: Record<string, unknown>
  /** 内联样式（JSON 化 CSS 属性） */
  style?: Record<string, unknown>
  /** 事件绑定：事件名 → Action（onClick / onChange / onSubmit ...） */
  events?: Record<string, Action>
  /** 数据绑定：关联数据源字段 */
  dataBinding?: {
    /** 对应 DataSource.id */
    sourceId: string
    /** 字段路径，如 "name" 或 "list[0].title" */
    path: string
  }
  /** 子组件 */
  children?: RichComponentNode[]
}

/** 富页面定义 */
export interface RichPage {
  /** 页面唯一 ID */
  id: string
  /** 路由路径，如 '/' '/about' */
  path: string
  /** 页面标题 */
  title: string
  /** 页面布局样式 */
  layout: PageLayoutStyle
  /** 页面内组件树 */
  components: RichComponentNode[]
}

/** 富 App Model - 支持主题 / 数据源 / 事件交互的完整蓝图 */
export interface AppModelV2 {
  /** 应用唯一 ID */
  id?: string
  /** 应用名称 */
  name: string
  /** 应用描述 */
  description?: string
  /** 主题配置 */
  theme: Theme
  /** 全局布局样式 */
  layout: PageLayoutStyle
  /** 页面列表 */
  pages: RichPage[]
  /** 数据源列表 */
  dataSources: DataSource[]
  /** 全局状态 */
  globalState?: Record<string, unknown>
}

// ─── 高级特性 Zod Schema（运行时校验） ───────────────────

export const ActionZodSchema = z.object({
  type: z.enum(['navigate', 'callApi', 'updateState', 'showModal', 'custom']),
  target: z.string().optional(),
  payload: z.unknown().optional(),
})

export const ThemeZodSchema = z.object({
  primaryColor: z.string(),
  borderRadius: z.number().optional(),
  fontFamily: z.string(),
  spacing: z.number().optional(),
  darkMode: z.boolean().optional(),
  secondaryColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
})

export const DataSourceZodSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['static', 'mock', 'rest', 'graphql', 'local']),
  data: z.unknown().optional(),
  url: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  responseMapping: z.string().optional(),
})

export const DataBindingZodSchema = z.object({
  sourceId: z.string(),
  path: z.string(),
})

export const RichComponentNodeZodSchema: z.ZodType<RichComponentNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    props: z.record(z.string(), z.unknown()),
    style: z.record(z.string(), z.unknown()).optional(),
    events: z.record(z.string(), ActionZodSchema).optional(),
    dataBinding: DataBindingZodSchema.optional(),
    children: z.array(RichComponentNodeZodSchema).optional(),
  }),
)

export const RichPageZodSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  layout: z.enum(['full', 'sidebar', 'top-nav']),
  components: z.array(RichComponentNodeZodSchema),
})

export const AppModelV2Schema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  theme: ThemeZodSchema,
  layout: z.enum(['full', 'sidebar', 'top-nav']),
  pages: z.array(RichPageZodSchema),
  dataSources: z.array(DataSourceZodSchema),
  globalState: z.record(z.string(), z.unknown()).optional(),
})

export type AppModelV2Input = z.input<typeof AppModelV2Schema>
export type AppModelV2Output = z.output<typeof AppModelV2Schema>
