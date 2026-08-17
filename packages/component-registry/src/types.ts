// ─── Component Registry 类型定义 ──────────────────────────

/** 组件分类 */
export type ComponentCategory = 'layout' | 'text' | 'button' | 'form' | 'display' | 'navigation' | 'feedback'

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

/** 组件定义 */
export interface ComponentDefinition {
  /** 唯一标识，如 'Button'、'Header' */
  type: string
  /** 显示名 */
  name: string
  /** 分类 */
  category: ComponentCategory
  /** 给 Planner 的描述（说明组件用途） */
  description: string
  /** props schema 列表 */
  propsSchema: PropSchema[]
  /** 是否接受子组件 */
  acceptsChildren: boolean
  /** 默认 props */
  defaultProps: Record<string, unknown>
}
