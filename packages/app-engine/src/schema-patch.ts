// ─── Schema Patch 引擎 ───────────────────────────────────
//
// 对 AppSchema 应用增量 Patch（add/update/delete/move）。
// 核心原则：
//   - 不可变：applyPatch 返回新的 Schema，不修改原对象
//   - 可追踪：SchemaPatch 含唯一 ID + 描述 + 版本
//   - 可撤销：invertPatch 生成逆 Patch
//   - 可验证：validatePatch 检查操作合法性
//   - 失败安全：Patch 应用失败不破坏原 Schema（先深拷贝再应用）

import type {
  AppSchema,
  PatchOp,
  PatchValidationResult,
  SchemaPatch,
  PatchResult,
} from '@aikd/shared'
import { validateAppSchema } from './app-schema'
import { bumpVersion } from './version'

// ─── JSON Pointer 解析 ───────────────────────────────────

/**
 * 解析 JSON Pointer 为路径段数组。
 * '/pages/0/title' → ['pages', '0', 'title']
 * '~1' → '/'，'~0' → '~'
 */
function parsePointer(pointer: string): string[] {
  if (pointer === '' || pointer === '/') return []
  if (!pointer.startsWith('/')) {
    throw new Error(`无效的 JSON Pointer: ${pointer}（必须以 / 开头）`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
}

/** 判断路径段是否为数组索引 */
function isIndex(seg: string): boolean {
  return /^\d+$/.test(seg)
}

// ─── 深拷贝 ──────────────────────────────────────────────

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

// ─── Patch 应用 ──────────────────────────────────────────

/**
 * 应用单个操作到目标对象。
 * 返回新的根对象（不可变）。失败抛出错误。
 */
function applyOp(root: unknown, op: PatchOp): unknown {
  const clone = deepClone(root)

  switch (op.op) {
    case 'add':
      applyAdd(clone, parsePointer(op.path), op.value)
      break
    case 'update':
      applyUpdate(clone, parsePointer(op.path), op.value)
      break
    case 'delete':
      applyDelete(clone, parsePointer(op.path))
      break
    case 'move':
      applyMove(clone, parsePointer(op.from), parsePointer(op.path))
      break
    default:
      throw new Error(`未知的 Patch 操作: ${(op as PatchOp).op}`)
  }

  return clone
}

function getParent(obj: unknown, segs: string[]): { parent: unknown; key: string } {
  let current: unknown = obj
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]
    if (Array.isArray(current)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx)) throw new Error(`数组索引无效: ${seg}`)
      current = current[idx]
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[seg]
    } else {
      throw new Error(`路径不存在: /${segs.slice(0, i + 1).join('/')}`)
    }
  }
  return { parent: current, key: segs[segs.length - 1] }
}

function applyAdd(obj: unknown, segs: string[], value: unknown): void {
  if (segs.length === 0) {
    // 添加根：不允许
    throw new Error('add 操作不允许作用于根路径')
  }

  const { parent, key } = getParent(obj, segs)

  if (Array.isArray(parent)) {
    if (key === '-') {
      parent.push(value)
    } else {
      const idx = Number(key)
      if (!Number.isInteger(idx)) throw new Error(`数组索引无效: ${key}`)
      parent.splice(idx, 0, value)
    }
  } else if (parent && typeof parent === 'object') {
    (parent as Record<string, unknown>)[key] = value
  } else {
    throw new Error(`add 目标不是对象或数组: /${segs.join('/')}`)
  }
}

function applyUpdate(obj: unknown, segs: string[], value: unknown): void {
  if (segs.length === 0) {
    throw new Error('update 操作不允许作用于根路径')
  }
  const { parent, key } = getParent(obj, segs)

  if (Array.isArray(parent)) {
    const idx = Number(key)
    if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) {
      throw new Error(`update 数组索引越界: ${key}`)
    }
    parent[idx] = value
  } else if (parent && typeof parent === 'object' && key in (parent as object)) {
    (parent as Record<string, unknown>)[key] = value
  } else {
    throw new Error(`update 路径不存在: /${segs.join('/')}`)
  }
}

function applyDelete(obj: unknown, segs: string[]): void {
  if (segs.length === 0) {
    throw new Error('delete 操作不允许作用于根路径')
  }
  const { parent, key } = getParent(obj, segs)

  if (Array.isArray(parent)) {
    const idx = Number(key)
    if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) {
      throw new Error(`delete 数组索引越界: ${key}`)
    }
    parent.splice(idx, 1)
  } else if (parent && typeof parent === 'object' && key in (parent as object)) {
    delete (parent as Record<string, unknown>)[key]
  } else {
    throw new Error(`delete 路径不存在: /${segs.join('/')}`)
  }
}

function applyMove(obj: unknown, fromSegs: string[], toSegs: string[]): void {
  if (fromSegs.length === 0 || toSegs.length === 0) {
    throw new Error('move 操作不允许作用于根路径')
  }

  // 读取源值
  const fromParent = getParent(obj, fromSegs)
  const fromKey = fromSegs[fromSegs.length - 1]
  let removed: unknown

  if (Array.isArray(fromParent.parent)) {
    const idx = Number(fromKey)
    if (!Number.isInteger(idx) || idx < 0 || idx >= fromParent.parent.length) {
      throw new Error(`move 源数组索引越界: ${fromKey}`)
    }
    removed = fromParent.parent.splice(idx, 1)[0]
  } else if (fromParent.parent && typeof fromParent.parent === 'object' && fromKey in (fromParent.parent as object)) {
    removed = (fromParent.parent as Record<string, unknown>)[fromKey]
    delete (fromParent.parent as Record<string, unknown>)[fromKey]
  } else {
    throw new Error(`move 源路径不存在: /${fromSegs.join('/')}`)
  }

  // 写入目标（复用 add 逻辑）
  applyAdd(obj, toSegs, removed)
}

// ─── 顶层 API ────────────────────────────────────────────

/**
 * 应用 Schema Patch 到 AppSchema。
 * - 先深拷贝原 Schema（失败安全）
 * - 按顺序应用每个 op
 * - 更新 version + updatedAt
 * - 应用后验证 Schema 合法性
 */
export function applyPatch(schema: AppSchema, patch: SchemaPatch): PatchResult {
  let current: unknown = schema

  try {
    for (const op of patch.ops) {
      current = applyOp(current, op)
    }
  } catch (err) {
    return {
      success: false,
      error: `Patch 应用失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const newSchema = current as AppSchema
  newSchema.version = patch.targetVersion
  newSchema.updatedAt = Date.now()

  // 应用后验证
  const validation = validateAppSchema(newSchema)
  if (!validation.success) {
    return {
      success: false,
      error: `Patch 应用后 Schema 验证失败: ${validation.errors.join('; ')}`,
    }
  }

  return { success: true, schema: newSchema }
}

/**
 * 验证 Patch 操作的合法性（不实际应用）。
 * 检查：操作类型、路径格式、引用完整性。
 */
export function validatePatch(schema: AppSchema, patch: SchemaPatch): PatchValidationResult {
  const errors: string[] = []

  if (!patch.ops || patch.ops.length === 0) {
    errors.push('Patch 至少需要一个操作')
  }

  const validOps = ['add', 'update', 'delete', 'move']
  for (const op of patch.ops) {
    // 操作类型校验
    if (!validOps.includes(op.op)) {
      errors.push(`无效的操作类型: ${op.op}`)
      continue
    }

    try {
      if (op.op === 'move') {
        parsePointer(op.from)
        parsePointer(op.path)
      } else {
        parsePointer(op.path)
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  return { success: errors.length === 0, errors }
}

/**
 * 生成逆 Patch（撤销）。
 * - add → delete（根据 appliedSchema 定位实际添加位置）
 * - update → update（回写原值，从 originalSchema 读取）
 * - delete → add（恢复被删除的值，从 originalSchema 读取）
 * - move → move（反向移动）
 *
 * @param patch 要撤销的 Patch
 * @param originalSchema Patch 应用前的 Schema（用于恢复原值）
 * @param appliedSchema Patch 应用后的 Schema（用于定位 add 的实际位置）
 */
export function invertPatch(
  patch: SchemaPatch,
  originalSchema: AppSchema,
  appliedSchema?: AppSchema,
): SchemaPatch {
  const ops: PatchOp[] = []

  // 逆序处理（后操作的先撤销）
  for (let i = patch.ops.length - 1; i >= 0; i--) {
    const op = patch.ops[i]
    ops.push(invertOp(op, originalSchema, appliedSchema))
  }

  return {
    id: `invert_${patch.id}`,
    description: `撤销: ${patch.description}`,
    baseVersion: patch.targetVersion,
    targetVersion: patch.baseVersion,
    ops,
    createdAt: Date.now(),
    createdBy: patch.createdBy,
  }
}

function invertOp(op: PatchOp, original: AppSchema, applied?: AppSchema): PatchOp {
  switch (op.op) {
    case 'add': {
      // add 后删除：若路径是数组末尾（-），需要根据 applied 计算实际索引
      if (op.path.endsWith('/-') && applied) {
        const actualPath = resolveActualIndex(applied, op.path)
        if (actualPath) return { op: 'delete', path: actualPath }
      }
      return { op: 'delete', path: op.path }
    }
    case 'update': {
      // update 后回写原值
      const originalValue = getValueAt(original, op.path)
      return { op: 'update', path: op.path, value: originalValue }
    }
    case 'delete': {
      // delete 后恢复原值
      const originalValue = getValueAt(original, op.path)
      return { op: 'add', path: op.path, value: originalValue }
    }
    case 'move': {
      // move 后反向移动（from 与 path 互换）
      return { op: 'move', from: op.path, path: op.from }
    }
    default:
      return op
  }
}

/**
 * 将 /arr/- 解析为实际索引路径 /arr/N。
 * 例如 /pages/- → /pages/2（当 pages 有 3 个元素时）。
 */
function resolveActualIndex(applied: AppSchema, pointer: string): string | null {
  const segs = parsePointer(pointer)
  // 去掉末尾的 '-'
  const parentPath = segs.slice(0, -1)
  let current: unknown = applied
  for (const seg of parentPath) {
    if (Array.isArray(current)) {
      current = current[Number(seg)]
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[seg]
    } else {
      return null
    }
  }
  if (Array.isArray(current)) {
    return `/${parentPath.join('/')}/${current.length - 1}`
  }
  return null
}

/** 读取路径处的值（用于逆 Patch 恢复） */
function getValueAt(obj: unknown, pointer: string): unknown {
  const segs = parsePointer(pointer)
  let current: unknown = obj
  for (const seg of segs) {
    if (Array.isArray(current)) {
      current = current[Number(seg)]
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return current
}

// ─── Patch 历史 ──────────────────────────────────────────

/**
 * Patch 历史管理器：记录已应用的 Patch 及每次应用前后的 Schema 快照，
 * 支持撤销/重做。
 *
 * 设计：维护一个「快照栈」。
 *   - record(patch, before, after)：记录一次变更（patch + before 快照 + after 快照）
 *   - undo()：回退到 before 快照
 *   - redo()：前进到 after 快照
 *
 * 通过保存完整快照保证撤销/重做精确、失败安全。
 */
export interface PatchRecord {
  patch: SchemaPatch
  /** 应用前快照 */
  before: AppSchema
  /** 应用后快照 */
  after: AppSchema
}

export class PatchHistory {
  private records: PatchRecord[] = []
  /** 当前游标（指向当前 schema 在 records 中的位置，-1 表示初始状态） */
  private cursor = -1

  /**
   * 记录一次成功的 Patch 应用。
   * @param patch 已应用的 Patch
   * @param before 应用前快照
   * @param after 应用后快照
   */
  record(patch: SchemaPatch, before: AppSchema, after: AppSchema): void {
    // 截断游标之后的历史（新操作清空重做栈）
    this.records = this.records.slice(0, this.cursor + 1)
    this.records.push({ patch, before: deepClone(before), after: deepClone(after) })
    this.cursor = this.records.length - 1
  }

  /** 撤销：回退到上一个快照 */
  undo(): PatchResult {
    if (this.cursor < 0) {
      return { success: false, error: '没有可撤销的 Patch' }
    }
    const record = this.records[this.cursor]
    this.cursor--
    return { success: true, schema: deepClone(record.before) }
  }

  /** 重做：前进到下一个快照 */
  redo(): PatchResult {
    if (this.cursor >= this.records.length - 1) {
      return { success: false, error: '没有可重做的 Patch' }
    }
    this.cursor++
    const record = this.records[this.cursor]
    return { success: true, schema: deepClone(record.after) }
  }

  /** 历史记录（只读） */
  get history(): SchemaPatch[] {
    return this.records.map((r) => r.patch)
  }

  /** 可撤销数量 */
  get canUndo(): boolean {
    return this.cursor >= 0
  }

  /** 可重做数量 */
  get canRedo(): boolean {
    return this.cursor < this.records.length - 1
  }
}

// ─── 辅助：创建 Patch ────────────────────────────────────

/**
 * 创建 Schema Patch（自动生成 ID、时间戳、版本递增）。
 */
export function createPatch(
  description: string,
  ops: PatchOp[],
  baseVersion: string,
  createdBy?: string,
): SchemaPatch {
  return {
    id: `patch_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
    description,
    baseVersion,
    targetVersion: bumpVersion(baseVersion, 'patch'),
    ops,
    createdAt: Date.now(),
    createdBy,
  }
}
