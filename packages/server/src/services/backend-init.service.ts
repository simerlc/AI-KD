// ─── 后端初始化服务 ─────────────────────────────────────
//
// 当 AI 生成应用后，根据 App Model 中的 dataSources，
// 在服务端数据库创建真实的数据表并写入初始数据。
//
// 这让 AI 生成的应用拥有真实的后端数据存取能力，
// 而不是只在前端硬编码 Mock 数据。

import { nanoid } from 'nanoid'
import type { AppModel, DataSource, TableField, FieldType } from '@aikd/shared'
import { getDb } from '../db/index.js'
import { stringifyFields } from './data.service.js'

// ─── 初始化结果 ──────────────────────────────────────────

export interface BackendInitResult {
  /** 创建的数据库表 ID 列表 */
  tableIds: string[]
  /** 写入的记录数 */
  recordCount: number
  /** 警告信息（非致命） */
  warnings: string[]
}

// ─── 主入口 ──────────────────────────────────────────────

/**
 * 根据 App Model 初始化后端数据库。
 *
 * 1. 为每个 dataSource 创建数据表（字段从数据推断）
 * 2. 将 dataSource.data 写入数据记录
 *
 * @param appId 应用 ID（task id）
 * @param appModel AI 生成的 App Model
 */
export async function initializeBackend(appId: string, appModel: AppModel): Promise<BackendInitResult> {
  const tableIds: string[] = []
  let recordCount = 0
  const warnings: string[] = []

  const dataSources = appModel.schema.dataSources ?? []

  for (const dataSource of dataSources) {
    try {
      // 跳过空数据源
      if (!dataSource || !dataSource.name) {
        warnings.push('跳过无名称的数据源')
        continue
      }

      const { id: tableId, created } = await ensureTable(appId, dataSource)
      tableIds.push(tableId)

      // 仅在新建表时写入初始数据；已有表（用户反复生成/修改）不重复插入，
      // 避免数据累积、也避免重复初始化时报主键冲突。
      if (created) {
        const rows = extractRows(dataSource.data)
        const written = await writeRecords(appId, tableId, rows)
        recordCount += written
      }
    } catch (err) {
      warnings.push(`数据源 ${dataSource.name} 初始化失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { tableIds, recordCount, warnings }
}

// ─── 建表 ────────────────────────────────────────────────

/**
 * 确保表存在（不存在则创建）。
 * 字段从数据推断，若无数据则跳过（空表）。
 *
 * @returns { id, created }：id 为表主键；created 表示是否为本次新建。
 */
async function ensureTable(appId: string, dataSource: DataSource): Promise<{ id: string; created: boolean }> {
  // 期望的表主键（与前端 Builder 生成的 api.ts 一致，均为 `${appId}:${name}`）
  const expectedId = `${appId}:${dataSource.name}`

  // 幂等：同一应用下同名表已存在则复用，避免重复建表导致主键冲突
  const existing = await getDb().dataModels.findByAppIdAndName(appId, dataSource.name)
  if (existing) {
    // 数据迁移：旧版本可能用 dataSource.id 作为表主键（而非 `${appId}:${name}`），
    // 这会导致前端 api.ts 的 tableId 无法命中后端表（预览功能失效）。
    // 检测到 id 不一致时，删除旧表（级联删除其记录）并用新规则重建，
    // 保证前后端 tableId 严格一致。样例数据会随重建重新写入。
    if (existing.id !== expectedId) {
      await getDb().dataModels.deleteById(existing.id)
    } else {
      // 已存在且 id 一致：仅更新字段定义（保留 id，覆盖字段）
      const fields = inferFields(dataSource.data)
      if (fields.length > 0) {
        await getDb().dataModels.update(existing.id, { fieldsJson: stringifyFields(fields) })
      }
      return { id: existing.id, created: false }
    }
  }

  const fields = inferFields(dataSource.data)

  // 注意：不能直接使用 dataSource.id 作为主键。
  // AI 生成的 App Model 中 dataSource.id 可能是占位符/重复值/空值，
  // 多个 dataSource 共享同一 id 时会导致 data_models.id 唯一约束冲突
  // （例如报错 "UNIQUE constraint failed: data_models.id"）。
  // 因此改用「appId + name」生成确定性的稳定 id，保证同名表幂等。
  const table = await getDb().dataModels.create({
    id: expectedId,
    appId,
    name: dataSource.name,
    fieldsJson: stringifyFields(fields),
  })

  return { id: table.id, created: true }
}

// ─── 字段推断 ────────────────────────────────────────────

/**
 * 从数据推断字段定义。
 * 数据为数组时，取第一条记录的所有键推断类型；
 * 数据为对象时，取对象的所有键推断类型。
 */
export function inferFields(data: unknown): TableField[] {
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return Object.keys(first).map((key) => ({ name: key, type: inferType(first[key]) }))
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return Object.keys(data).map((key) => ({ name: key, type: inferType((data as Record<string, unknown>)[key]) }))
  }
  return []
}

/** 从值推断字段类型 */
function inferType(value: unknown): FieldType {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (value instanceof Date) return 'datetime'
  // 字符串：尝试识别日期/枚举/uuid
  if (typeof value === 'string') {
    if (!Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'datetime'
    return 'string'
  }
  return 'string'
}

// ─── 写入记录 ────────────────────────────────────────────

/** 从数据源提取行数据 */
export function extractRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => item && typeof item === 'object' && !Array.isArray(item))
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return [data as Record<string, unknown>]
  }
  return []
}

/** 写入记录到数据表 */
async function writeRecords(appId: string, tableId: string, rows: Record<string, unknown>[]): Promise<number> {
  let count = 0
  for (const row of rows) {
    // 移除 id 字段（由系统生成）
    const { id: _id, ...data } = row
    await getDb().dataRecords.create({
      id: nanoid(),
      appId,
      tableId,
      dataJson: JSON.stringify(data),
    })
    count++
  }
  return count
}
