// ─── Schema Patch 类型定义 ───────────────────────────────
//
// Schema Patch 用于对 AppSchema 进行增量修改。
// 支持 add / update / delete / move 四种操作。
// Patch 可追踪（含唯一 ID + 时间戳）、可撤销（invertPatch）、可验证。
//
// 路径使用 JSON Pointer（RFC 6901）风格：
//   /pages/0/title       → schema.pages[0].title
//   /pages/-             → 追加到 pages 数组末尾
//   /data/sources/0/name → schema.data.sources[0].name

import type { AppSchema } from './app-schema'

// ─── Patch 操作类型 ──────────────────────────────────────

/** add：在指定路径新增值（对象属性或数组追加/插入） */
export interface AddPatchOp {
  op: 'add'
  /** JSON Pointer 路径，/pages/- 表示追加到数组末尾 */
  path: string
  /** 新增的值 */
  value: unknown
}

/** update：替换指定路径的值 */
export interface UpdatePatchOp {
  op: 'update'
  /** JSON Pointer 路径 */
  path: string
  /** 新值 */
  value: unknown
}

/** delete：删除指定路径的值（对象属性或数组元素） */
export interface DeletePatchOp {
  op: 'delete'
  /** JSON Pointer 路径 */
  path: string
}

/** move：移动数组元素（from → to 路径） */
export interface MovePatchOp {
  op: 'move'
  /** 源路径 */
  from: string
  /** 目标路径 */
  path: string
}

/** 单个 Patch 操作 */
export type PatchOp = AddPatchOp | UpdatePatchOp | DeletePatchOp | MovePatchOp

/** 操作类型联合 */
export type PatchOpType = PatchOp['op']

// ─── Schema Patch ────────────────────────────────────────

/**
 * Schema Patch：一组按顺序应用的操作。
 * 描述一次自然语言修改产生的 Schema 变更。
 */
export interface SchemaPatch {
  /** Patch 唯一 ID */
  id: string
  /** Patch 描述（用户请求，如"增加客户等级字段"） */
  description: string
  /** 目标 Schema 版本（应用前） */
  baseVersion: string
  /** 应用后的新版本 */
  targetVersion: string
  /** 操作列表（按顺序执行） */
  ops: PatchOp[]
  /** 创建时间 */
  createdAt: number
  /** 创建者 */
  createdBy?: string
}

/** Patch 应用结果 */
export interface PatchResult {
  success: boolean
  /** 应用后的新 Schema（成功时） */
  schema?: AppSchema
  /** 错误信息（失败时） */
  error?: string
}

/** Patch 验证结果 */
export interface PatchValidationResult {
  success: boolean
  errors: string[]
}
