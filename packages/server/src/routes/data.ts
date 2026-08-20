import { Hono, type Context } from 'hono'
import { nanoid } from 'nanoid'
import { getDb } from '../db/index.js'
import { requireAuth, type AppEnv } from '../middleware/auth'
import {
  validateRecordData,
  applyQuery,
  parseFields,
  stringifyFields,
  parseRecordData,
} from '../services/data.service.js'
import type { DataQuery, DataRecord, TableField, TableSchema } from '@aikd/shared'
import type { DataModelRecord } from '../db/types.js'

const data = new Hono<AppEnv>()

// ─── 辅助：定位应用所属表 ─────────────────────────────────

type ResolveTableResult =
  | { error: string; status: number }
  | { table: DataModelRecord }

async function resolveTable(c: Context<AppEnv>, tableId: string): Promise<ResolveTableResult> {
  const session = c.get('session')!
  const table = await getDb().dataModels.findById(tableId)
  if (!table) return { error: 'Table not found', status: 404 }

  // 校验表属于当前用户的应用（通过 task 归属判断）
  const task = await getDb().tasks.findById(table.appId)
  if (!task || task.userId !== session.user.id) {
    return { error: 'Table not found', status: 404 }
  }

  return { table }
}

function toTableSchema(table: DataModelRecord): TableSchema {
  return { id: table.id, name: table.name, fields: parseFields(table.fieldsJson) }
}

function toDataRecord(row: { id: string; tableId: string; dataJson: string; createdAt: number; updatedAt: number }): DataRecord {
  return {
    id: row.id,
    tableId: row.tableId,
    data: parseRecordData(row.dataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── 表（Table）管理 ──────────────────────────────────────

// 创建表
data.post('/tables', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const body = await c.req.json<{ appId: string; name: string; fields: TableField[] }>()
  const { appId, name, fields } = body

  if (!appId || !name || !Array.isArray(fields) || fields.length === 0) {
    return c.json({ error: 'appId, name and fields (non-empty array) are required' }, 400)
  }

  // 校验 app 归属
  const task = await getDb().tasks.findByIdAndUserId(appId, session.user.id)
  if (!task) {
    return c.json({ error: 'App not found' }, 404)
  }

  // 表名唯一
  const existing = await getDb().dataModels.findByAppIdAndName(appId, name)
  if (existing) {
    return c.json({ error: `Table '${name}' already exists` }, 409)
  }

  const table = await getDb().dataModels.create({
    id: nanoid(),
    appId,
    name,
    fieldsJson: stringifyFields(fields),
  })

  return c.json({ table: toTableSchema(table) })
})

// 列出应用的所有表
data.get('/tables', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const appId = c.req.query('appId')
  if (!appId) {
    return c.json({ error: 'appId query param is required' }, 400)
  }

  const task = await getDb().tasks.findByIdAndUserId(appId, session.user.id)
  if (!task) {
    return c.json({ error: 'App not found' }, 404)
  }

  const tables = await getDb().dataModels.findByAppId(appId)
  return c.json({ tables: tables.map(toTableSchema) })
})

// 获取单个表定义
data.get('/tables/:tableId', async (c) => {
  const result = await resolveTable(c, c.req.param('tableId'))
  if ('error' in result) return c.json({ error: result.error }, result.status as 404)

  return c.json({ table: toTableSchema(result.table) })
})

// 删除表（级联删除记录）
data.delete('/tables/:tableId', async (c) => {
  const result = await resolveTable(c, c.req.param('tableId'))
  if ('error' in result) return c.json({ error: result.error }, result.status as 404)

  await getDb().dataModels.deleteById(result.table.id)
  return c.json({ success: true })
})

// ─── 记录（Record）CRUD ───────────────────────────────────

// 创建记录
data.post('/tables/:tableId/records', async (c) => {
  const result = await resolveTable(c, c.req.param('tableId'))
  if ('error' in result) return c.json({ error: result.error }, result.status as 404)

  const table = toTableSchema(result.table)
  const body = await c.req.json<{ data: Record<string, unknown> }>()
  const recordData = body.data

  if (!recordData || typeof recordData !== 'object' || Array.isArray(recordData)) {
    return c.json({ error: 'data (object) is required' }, 400)
  }

  // 字段校验
  const validation = validateRecordData(table, recordData)
  if (!validation.success) {
    return c.json({ error: 'Validation failed', details: validation.errors }, 400)
  }

  const created = await getDb().dataRecords.create({
    id: nanoid(),
    appId: result.table.appId,
    tableId: result.table.id,
    dataJson: JSON.stringify(recordData),
  })

  return c.json({ record: toDataRecord(created) }, 201)
})

// 查询记录（支持 search / filter / sort / pagination）
data.get('/tables/:tableId/records', async (c) => {
  const result = await resolveTable(c, c.req.param('tableId'))
  if ('error' in result) return c.json({ error: result.error }, result.status as 404)

  const table = toTableSchema(result.table)

  // 解析查询参数
  const query: DataQuery = {}
  const search = c.req.query('search')
  if (search) query.search = search

  const filtersRaw = c.req.query('filters')
  if (filtersRaw) {
    try {
      query.filters = JSON.parse(filtersRaw)
    } catch {
      return c.json({ error: 'filters must be valid JSON' }, 400)
    }
  }

  const sortRaw = c.req.query('sort')
  if (sortRaw) {
    try {
      query.sort = JSON.parse(sortRaw)
    } catch {
      return c.json({ error: 'sort must be valid JSON' }, 400)
    }
  }

  const page = c.req.query('page')
  const pageSize = c.req.query('pageSize')
  if (page || pageSize) {
    query.pagination = {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    }
  }

  const rows = await getDb().dataRecords.findByTableId(result.table.id)
  const records = rows.map(toDataRecord)
  const queryResult = applyQuery(records, query, table)

  return c.json(queryResult)
})

// 获取单条记录
data.get('/records/:recordId', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const recordId = c.req.param('recordId')
  const row = await getDb().dataRecords.findById(recordId)
  if (!row) {
    return c.json({ error: 'Record not found' }, 404)
  }

  // 校验归属
  const task = await getDb().tasks.findById(row.appId)
  if (!task || task.userId !== session.user.id) {
    return c.json({ error: 'Record not found' }, 404)
  }

  return c.json({ record: toDataRecord(row) })
})

// 更新记录
data.patch('/records/:recordId', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const recordId = c.req.param('recordId')
  const row = await getDb().dataRecords.findById(recordId)
  if (!row) {
    return c.json({ error: 'Record not found' }, 404)
  }

  const task = await getDb().tasks.findById(row.appId)
  if (!task || task.userId !== session.user.id) {
    return c.json({ error: 'Record not found' }, 404)
  }

  const table = await getDb().dataModels.findById(row.tableId)
  if (!table) {
    return c.json({ error: 'Table not found' }, 404)
  }

  const body = await c.req.json<{ data: Record<string, unknown> }>()
  const newData = body.data
  if (!newData || typeof newData !== 'object' || Array.isArray(newData)) {
    return c.json({ error: 'data (object) is required' }, 400)
  }

  // 合并 + 校验：忽略 newData 中为 undefined 的字段，避免覆盖已有值并导致类型校验失败。
  const cleanedNewData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(newData)) {
    if (value !== undefined) cleanedNewData[key] = value
  }
  const merged = { ...parseRecordData(row.dataJson), ...cleanedNewData }
  const tableSchema = toTableSchema(table)
  const validation = validateRecordData(tableSchema, merged)
  if (!validation.success) {
    return c.json({ error: 'Validation failed', details: validation.errors }, 400)
  }

  const updated = await getDb().dataRecords.update(recordId, JSON.stringify(merged))
  return c.json({ record: toDataRecord(updated!) })
})

// 删除记录
data.delete('/records/:recordId', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const recordId = c.req.param('recordId')
  const row = await getDb().dataRecords.findById(recordId)
  if (!row) {
    return c.json({ error: 'Record not found' }, 404)
  }

  const task = await getDb().tasks.findById(row.appId)
  if (!task || task.userId !== session.user.id) {
    return c.json({ error: 'Record not found' }, 404)
  }

  await getDb().dataRecords.deleteById(recordId)
  return c.json({ success: true })
})

export default data
