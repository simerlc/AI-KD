// ─── Application Blueprint 类型定义 ───────────────────────
//
// Blueprint（应用蓝图）是 AI快搭 Agent Engine V2 的核心产物。
//
// 核心原则：
//   用户需求 绝不能直接进入代码生成。必须先由 BlueprintAgent 产出合法
//   Blueprint，CodingAgent 只能读取合法（校验通过）的 Blueprint。
//
// Blueprint 包含六大要素：
//   1. appName       应用名称
//   2. pages         页面列表
//   3. pageComponents页面组件（每个页面的组件树）
//   4. dataModel     数据模型（表 / 字段）
//   5. apiDesign     API 设计（CRUD / 查询 / 业务接口）
//   6. userFlow      用户流程（用户操作路径）
//
// 所有字段可 JSON 序列化，天然适配 JSON Schema 校验。
// CodingAgent 通过 import 此类型即可获得「只能读取合法 Blueprint」的强约束。

import type { FieldType, TableSchema } from './database'

// ─── Schema 版本 ─────────────────────────────────────────

/** Blueprint 结构版本号 */
export type BlueprintVersionString = string

/** 当前 Blueprint 结构版本 */
export const BLUEPRINT_SCHEMA_VERSION = '1.0.0' as const

// ─── 页面定义 ───────────────────────────────────────────

/** 页面布局类型 */
export type BlueprintPageLayout = 'web' | 'mobile'

/**
 * 页面定义：描述应用中的一个页面（列表页 / 详情页 / 表单页 / 首页等）。
 * 每个页面包含基本信息、用途说明与组件规划。
 */
export interface BlueprintPage {
  /** 页面唯一 ID（如 'page_home' 'page_products'） */
  id: string
  /** 路由路径（如 '/' '/products' '/products/:id'） */
  path: string
  /** 页面标题 */
  title: string
  /** 页面布局 */
  layout: BlueprintPageLayout
  /** 页面类型（辅助 CodingAgent 决定渲染策略） */
  pageType: 'home' | 'list' | 'detail' | 'form' | 'dashboard' | 'login' | 'custom'
  /** 页面用途/内容说明（自然语言，供 CodingAgent 理解意图） */
  description: string
  /** 页面绑定的数据表（展示/操作哪张表的数据，可选） */
  tableId?: string
}

// ─── 页面组件规划 ───────────────────────────────────────

/**
 * 页面组件规划：描述某个页面应包含哪些组件。
 * 组件类型引用 component-registry 中的合法组件（如 Heading / Table / Form）。
 */
export interface BlueprintComponent {
  /** 组件实例唯一 ID */
  id: string
  /** 组件类型（必须是 component-registry 已注册组件） */
  type: string
  /** 组件 props（JSON 值） */
  props: Record<string, unknown>
  /** 子组件 */
  children?: BlueprintComponent[]
}

/** 单个页面的组件规划 */
export interface BlueprintPageComponent {
  /** 所属页面 ID（引用 BlueprintPage.id） */
  pageId: string
  /** 该页面的组件树 */
  components: BlueprintComponent[]
}

// ─── 数据模型 ───────────────────────────────────────────

/**
 * 数据模型：应用所需的数据表结构（复用 TableSchema）。
 * 每个表描述字段、类型、是否必填、enum 选项等。
 */
export interface BlueprintDataModel {
  /** 数据表列表 */
  tables: TableSchema[]
}

// ─── API 设计 ───────────────────────────────────────────

/** API 方法 */
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * API 设计：应用所需的后端接口规划。
 * 每个接口描述方法、路径、用途，以及 CRUD 语义（供 CodingAgent 生成 api.ts）。
 */
export interface ApiDesignEndpoint {
  /** 接口唯一 ID */
  id: string
  /** 方法 */
  method: ApiMethod
  /** 路径（如 '/api/products' '/api/products/:id'） */
  path: string
  /** 接口用途说明 */
  description: string
  /** CRUD 语义（辅助 CodingAgent 生成调用代码） */
  crud?: 'list' | 'get' | 'create' | 'update' | 'delete'
  /** 关联的数据表（可选） */
  tableId?: string
  /** 请求体字段（POST/PUT/PATCH） */
  requestFields?: Array<{ name: string; type: FieldType; required?: boolean }>
  /** 响应字段 */
  responseFields?: Array<{ name: string; type: FieldType }>
}

/** API 设计 */
export interface BlueprintApiDesign {
  /** 接口列表 */
  endpoints: ApiDesignEndpoint[]
}

// ─── 用户流程 ───────────────────────────────────────────

/** 用户流程步骤（一个页面内的用户操作） */
export interface BlueprintUserFlowStep {
  /** 步骤 ID */
  id: string
  /** 步骤说明（用户在该页做什么） */
  description: string
  /** 所在页面 ID */
  pageId: string
  /** 操作（如 'view' 'search' 'create' 'edit' 'delete' 'submit' 'navigate'） */
  action?: string
  /** 跳转到的页面 ID（导航类操作时） */
  targetPageId?: string
}

/**
 * 用户流程：描述用户从进入到完成核心任务的路径。
 * 例如商城：首页浏览 → 商品列表 → 商品详情 → 加购物车 → 下单。
 */
export interface BlueprintUserFlow {
  /** 流程列表（可有多条用户路径） */
  flows: Array<{
    /** 流程 ID */
    id: string
    /** 流程名称 */
    name: string
    /** 流程描述 */
    description: string
    /** 流程步骤 */
    steps: BlueprintUserFlowStep[]
  }>
}

// ─── Blueprint 顶层 ─────────────────────────────────────

/**
 * 产品规划信息：由 Product Planning Agent 产出，在 Blueprint 之前。
 * 描述应用的目标用户、核心功能、进阶功能，禁止直接进入代码生成。
 */
export interface ProductPlan {
  /** 目标用户群体 */
  targetUsers: string[]
  /** 核心功能（MVP 必须有） */
  coreFeatures: string[]
  /** 进阶功能（增强阶段可补充） */
  advancedFeatures: string[]
  /** 推荐的应用模式（Pattern Library） */
  pattern?: string
  /** 产品价值主张 */
  valueProposition?: string
}

/**
 * Application Blueprint：AI快搭 应用蓝图的完整定义。
 * CodingAgent 只允许读取校验通过（validateBlueprint）的合法 Blueprint。
 */
export interface Blueprint {
  /** Blueprint 结构版本 */
  schemaVersion: BlueprintVersionString
  /** 应用名称 */
  appName: string
  /** 应用类型 */
  appType: 'web' | 'h5' | 'static'
  /** 产品规划信息（Product Planning Agent 产出，可空以兼容旧数据） */
  productPlan?: ProductPlan
  /** 页面列表 */
  pages: BlueprintPage[]
  /** 页面组件（每页组件树） */
  pageComponents: BlueprintPageComponent[]
  /** 数据模型 */
  dataModel: BlueprintDataModel
  /** API 设计 */
  apiDesign: BlueprintApiDesign
  /** 用户流程 */
  userFlow: BlueprintUserFlow
  /** 创建时间（可选，系统填充） */
  createdAt?: number
  /** 更新时间（可选，系统填充） */
  updatedAt?: number
}

// ─── 校验结果 ───────────────────────────────────────────

/** Blueprint 校验结果 */
export interface BlueprintValidationResult {
  success: boolean
  /** 错误列表（失败时非空） */
  errors: string[]
  /** 警告列表 */
  warnings?: string[]
  /** 校验通过后的合法 Blueprint */
  data?: Blueprint
}
