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
export type DataSourceType = 'static' | 'mock'

/** 组件节点 - App Model 中对组件的描述 */
export interface ComponentNode {
  /** 组件实例唯一 ID */
  id: string
  /** 引用 component-registry 中的组件类型，如 'Button'、'Header' */
  type: string
  /** 组件 props（JSON 值，结构由 component-registry 的 propsSchema 约束） */
  props: Record<string, unknown>
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
}

/** 数据源定义（静态数据 / mock 数据） */
export interface DataSource {
  /** 数据源唯一 ID */
  id: string
  /** 数据源名称（供组件引用） */
  name: string
  /** 数据源类型 */
  type: DataSourceType
  /** JSON 数据 */
  data: unknown
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
