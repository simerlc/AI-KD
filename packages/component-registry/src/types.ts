// ─── Component Registry 类型定义 ──────────────────────────

/** 组件分类 */
export type ComponentCategory =
  | 'layout'
  | 'text'
  | 'button'
  | 'form'
  | 'display'
  | 'navigation'
  | 'feedback'
  // 扩展分类：仪表盘 / 图表 / 认证
  | 'dashboard'
  | 'chart'
  | 'auth'

/** Prop 值类型 */
export type PropType = 'string' | 'number' | 'boolean' | 'color' | 'select' | 'array' | 'object'

/** 单个 prop 的 schema 定义 */
export interface PropSchema {
  /** prop 名称 */
  name: string
  /** 值类型 */
  type: PropType
  /** 描述（给 Planner / Builder 的提示） */
  description: string
  /** 是否必填 */
  required?: boolean
  /** 默认值 */
  default?: unknown
  /** select 类型的可选值 */
  options?: string[]
}

/**
 * 组件定义。
 * 每个组件包含：name / description / propsSchema / usageExample。
 * 组件系统可扩展：通过 register() 或 ComponentRegistry(initial) 添加新组件。
 */
export interface ComponentDefinition {
  /** 唯一标识，如 'Button'、'Table'、'Dashboard' */
  type: string
  /** 显示名 */
  name: string
  /** 分类 */
  category: ComponentCategory
  /** 给 Planner 的描述（说明组件用途，用于组件选择） */
  description: string
  /** props schema 列表 */
  propsSchema: PropSchema[]
  /** 是否接受子组件 */
  acceptsChildren: boolean
  /** 默认 props */
  defaultProps: Record<string, unknown>
  /**
   * 用法示例（Component Library 的核心能力）。
   * 给 Blueprint/Coding Agent 的参考：展示如何用本组件表达常见场景。
   * 可包含多个示例；示例为 JSON 的组件节点或片段。
   * 可选——注册时未提供则使用 ComponentRegistry 的默认示例或空数组。
   */
  usageExamples?: UsageExample[]
}

/** 组件用法示例 */
export interface UsageExample {
  /** 示例名称（场景说明，如"商品列表"、"用户登录"） */
  name: string
  /** 示例描述（何时使用） */
  description?: string
  /** 示例数据：组件节点 JSON（type 可省略，默认为该组件） */
  component: Record<string, unknown>
}
