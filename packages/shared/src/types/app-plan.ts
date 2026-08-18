// ─── App Plan 类型定义 ───────────────────────────────────
//
// AppPlan 是 AI「应用规划器」的输出：描述应用「要做什么」的高层规划，
// 不包含具体 UI 组件树（那是 AppSchema/AppModel 的职责）。
//
// 层级关系：
//   User Prompt ──→ AppPlan（规划：做什么）
//              ──→ AppSchemaGenerator ──→ AppSchema（结构：怎么做）
//              ──→ Schema Validator ──→ Runtime（运行）
//
// AppPlan 是可 JSON 序列化的纯数据结构，AI 以结构化 JSON 输出，
// 不允许包含无关文本。

import type { FieldType } from './database'
import type { ActionType, ActionParams } from './app-schema'

// ─── App 信息 ────────────────────────────────────────────

export interface AppPlanInfo {
  /** 应用名称 */
  name: string
  /** 应用类型 */
  type: 'web' | 'h5' | 'static'
  /** 应用描述 */
  description: string
  /** 应用图标（可选） */
  icon?: string
  /** 首页路径 */
  homePath?: string
}

// ─── Table / Field ───────────────────────────────────────

/** 数据表规划 */
export interface AppPlanTable {
  /** 表 ID（如 'customers'） */
  id: string
  /** 表名（展示用） */
  name: string
  /** 字段定义 */
  fields: AppPlanField[]
}

/** 字段规划 */
export interface AppPlanField {
  /** 字段名（如 'name' 'phone'） */
  name: string
  /** 字段类型 */
  type: FieldType
  /** 是否必填 */
  required?: boolean
  /** 字段标签（中文展示名） */
  label?: string
  /** enum 类型的可选值 */
  enumOptions?: string[]
  /** 默认值 */
  default?: unknown
}

/** 表关系 */
export interface AppPlanRelation {
  /** 源表 ID */
  from: string
  /** 目标表 ID */
  to: string
  /** 关系类型 */
  type: 'oneToOne' | 'oneToMany' | 'manyToMany'
  /** 外键字段（在 from 表中） */
  foreignKey?: string
}

// ─── Action / Event ─────────────────────────────────────

/** 动作规划（引用具体 ActionType） */
export interface AppPlanAction {
  /** 动作 ID */
  id: string
  /** 动作名称 */
  name: string
  /** 动作类型 */
  type: ActionType
  /** 动作参数（可含 {{var}} 变量表达式） */
  params: ActionParams
  /** 动作描述 */
  description?: string
}

/** 事件规划 */
export interface AppPlanEvent {
  /** 事件 ID */
  id: string
  /** 事件名称 */
  name: string
  /** 触发类型 */
  trigger: 'interaction' | 'lifecycle' | 'dataChange' | 'custom'
  /** 交互事件名（trigger 为 interaction 时） */
  event?: string
  /** 生命周期事件名（trigger 为 lifecycle 时） */
  lifecycle?: string
  /** 绑定的动作 ID 列表 */
  actions: string[]
}

// ─── Workflow / Permission ──────────────────────────────

/** 工作流（一组动作的编排，可含条件分支） */
export interface AppPlanWorkflow {
  /** 工作流 ID */
  id: string
  /** 工作流名称 */
  name: string
  /** 触发事件 */
  trigger: string
  /** 步骤（动作 ID 列表，按顺序执行） */
  steps: string[]
  /** 步骤描述（可选，给用户看） */
  description?: string
}

/** 权限规划 */
export interface AppPlanPermission {
  /** 角色（如 'admin' 'user' 'guest'） */
  role: string
  /** 可访问的页面 path 列表（* 表示全部） */
  pages: string[]
  /** 可执行的动作 ID 列表（* 表示全部） */
  actions?: string[]
  /** 数据权限（可访问的表 ID 列表，* 表示全部） */
  tables?: string[]
}

// ─── App Plan 顶层 ──────────────────────────────────────

/**
 * App Plan：AI 应用规划器的结构化输出。
 * 描述应用做什么（信息/页面/表/字段/关系/动作/事件/工作流/权限），
 * 由 AppSchemaGenerator 转换为 AppSchema。
 */
export interface AppPlan {
  /** Plan 结构版本 */
  schemaVersion: string
  /** 应用信息 */
  app: AppPlanInfo
  /** 页面规划 */
  pages: AppPlanPage[]
  /** 数据表规划 */
  tables: AppPlanTable[]
  /** 表关系 */
  relations?: AppPlanRelation[]
  /** 动作规划 */
  actions?: AppPlanAction[]
  /** 事件规划 */
  events?: AppPlanEvent[]
  /** 工作流 */
  workflows?: AppPlanWorkflow[]
  /** 权限 */
  permissions?: AppPlanPermission[]
}

/** 页面规划（描述页面目的与内容，非具体组件树） */
export interface AppPlanPage {
  /** 页面 ID */
  id: string
  /** 路由 path */
  path: string
  /** 页面标题 */
  title: string
  /** 页面布局 */
  layout: 'web' | 'mobile'
  /** 页面目的/内容描述（自然语言，供 SchemaGenerator 决定组件） */
  description: string
  /** 页面绑定的表（展示/操作哪张表的数据） */
  tableId?: string
  /** 页面类型（列表页/表单页/详情页等） */
  pageType?: 'list' | 'form' | 'detail' | 'dashboard' | 'custom'
}

/** 创建 AppPlan 的输入（schemaVersion/id 可选） */
export type NewAppPlan = Omit<AppPlan, 'schemaVersion'> & Partial<Pick<AppPlan, 'schemaVersion'>>
