// ─── AI Debugger 类型定义 ────────────────────────────────
//
// AI Debugger：当生成的应用出现错误时，AI 自动分析并修复。
// 错误信息统一为 DebugError，诊断上下文为 DebugContext，
// 诊断结果含根因与 Schema Patch，历史记录为 DebugRecord。

import type { AppSchema, ActionContext } from './app-schema'
import type { SchemaPatch } from './schema-patch'

// ─── 错误类型 ────────────────────────────────────────────

/** 错误来源类型 */
export type DebugErrorKind =
  | 'runtime' // 运行时错误（组件渲染/执行崩溃）
  | 'console' // 控制台错误
  | 'api' // API 请求错误
  | 'database' // 数据库操作错误
  | 'validation' // Schema 验证错误

/** 统一的错误信息结构 */
export interface DebugError {
  /** 错误唯一 ID */
  id: string
  /** 错误来源类型 */
  kind: DebugErrorKind
  /** 错误消息 */
  message: string
  /** 错误堆栈（可选） */
  stack?: string
  /** 错误发生位置（组件 id / 路径 / 表名等） */
  location?: string
  /** 错误发生时间 */
  timestamp: number
  /** 附加上下文（状态码、查询参数等） */
  meta?: Record<string, unknown>
}

// ─── 诊断上下文 ──────────────────────────────────────────

/** AI 诊断所需的完整上下文 */
export interface DebugContext {
  /** 当前 AppSchema */
  schema: AppSchema
  /** 错误列表 */
  errors: DebugError[]
  /** 当前 Runtime State（表单/记录/页面数据等） */
  runtimeState?: ActionContext
  /** 附加信息（环境、用户等） */
  meta?: Record<string, unknown>
}

// ─── 诊断结果 ────────────────────────────────────────────

/** 根因分析 */
export interface RootCause {
  /** 根因类别 */
  category: 'schema' | 'action' | 'event' | 'data' | 'workflow' | 'permission' | 'source'
  /** 根因描述 */
  description: string
  /** 问题定位（路径/组件/动作等） */
  location?: string
  /** 是否必须修改源代码（而非 Schema Patch） */
  requiresSourceChange: boolean
  /** 若需修改源代码，说明原因 */
  sourceChangeReason?: string
}

/** AI 诊断结果 */
export interface DebugDiagnosis {
  /** 根因 */
  rootCause: RootCause
  /** 修复用的 Patch 操作（优先方案，仅 ops，完整 SchemaPatch 由 debug 流程补全） */
  patch?: Pick<SchemaPatch, 'ops'>
  /** 修复说明 */
  explanation: string
  /** 置信度 0-1 */
  confidence: number
}

// ─── 调试结果与历史 ──────────────────────────────────────

/** 一次调试循环的结果 */
export interface DebugResult {
  /** 是否成功修复 */
  success: boolean
  /** 诊断结果 */
  diagnosis: DebugDiagnosis
  /** 应用后的新 Schema（成功时） */
  schema?: AppSchema
  /** 重测结果（修复后是否通过） */
  retestPassed: boolean
  /** 错误信息（失败时） */
  error?: string
}

/** Debug 历史记录 */
export interface DebugRecord {
  /** 记录 ID */
  id: string
  /** 触发调试的错误 */
  errors: DebugError[]
  /** 诊断结果 */
  diagnosis: DebugDiagnosis
  /** 调试结果 */
  result: DebugResult
  /** 调试时间 */
  timestamp: number
  /** 调试者 */
  createdBy?: string
}

// ─── 重测接口 ────────────────────────────────────────────

/** 重测回调：应用 Patch 后重新验证应用是否正常 */
export type RetestCallback = (schema: AppSchema) => Promise<DebugError[]>
