// ─── Data Binding 客户端 ──────────────────────────────────
//
// 前端访问统一 Data API 的类型安全封装。
// AI 生成的应用数据通过此客户端与服务端 SQLite 交互，
// 而非前端 Mock 数据。

import { api } from './api'
import type {
  DataQuery,
  DataQueryResult,
  DataRecord,
  NewDataRecord,
  NewTableSchema,
  TableField,
  TableSchema,
} from '@aikd/shared'

// ─── Table 操作 ──────────────────────────────────────────

export interface TableClient {
  /** 创建表 */
  createTable(appId: string, name: string, fields: TableField[]): Promise<TableSchema>
  /** 列出应用的所有表 */
  listTables(appId: string): Promise<TableSchema[]>
  /** 获取单表定义 */
  getTable(tableId: string): Promise<TableSchema>
  /** 删除表（级联删除记录） */
  deleteTable(tableId: string): Promise<void>
}

// ─── Record 操作 ─────────────────────────────────────────

export interface RecordClient {
  /** 创建记录 */
  create(tableId: string, data: Record<string, unknown>): Promise<DataRecord>
  /** 查询记录（search / filter / sort / pagination） */
  query(tableId: string, query?: DataQuery): Promise<DataQueryResult>
  /** 获取单条记录 */
  get(recordId: string): Promise<DataRecord>
  /** 更新记录（部分字段） */
  update(recordId: string, data: Record<string, unknown>): Promise<DataRecord>
  /** 删除记录 */
  remove(recordId: string): Promise<void>
}

// ─── DataClient ──────────────────────────────────────────

export const dataClient = {
  // Table
  async createTable(appId: string, name: string, fields: TableField[]): Promise<TableSchema> {
    const res = await api.post<{ table: TableSchema }>('/api/data/tables', { appId, name, fields })
    return res.table
  },

  async listTables(appId: string): Promise<TableSchema[]> {
    const res = await api.get<{ tables: TableSchema[] }>(`/api/data/tables?appId=${encodeURIComponent(appId)}`)
    return res.tables
  },

  async getTable(tableId: string): Promise<TableSchema> {
    const res = await api.get<{ table: TableSchema }>(`/api/data/tables/${tableId}`)
    return res.table
  },

  async deleteTable(tableId: string): Promise<void> {
    await api.delete(`/api/data/tables/${tableId}`)
  },

  // Record
  async create(tableId: string, data: Record<string, unknown>): Promise<DataRecord> {
    const res = await api.post<{ record: DataRecord }>(`/api/data/tables/${tableId}/records`, { data })
    return res.record
  },

  async query(tableId: string, query: DataQuery = {}): Promise<DataQueryResult> {
    const params = new URLSearchParams()
    if (query.search) params.set('search', query.search)
    if (query.filters && query.filters.length > 0) params.set('filters', JSON.stringify(query.filters))
    if (query.sort) params.set('sort', JSON.stringify(query.sort))
    if (query.pagination?.page) params.set('page', String(query.pagination.page))
    if (query.pagination?.pageSize) params.set('pageSize', String(query.pagination.pageSize))

    const qs = params.toString()
    return api.get<DataQueryResult>(`/api/data/tables/${tableId}/records${qs ? `?${qs}` : ''}`)
  },

  async get(recordId: string): Promise<DataRecord> {
    const res = await api.get<{ record: DataRecord }>(`/api/data/records/${recordId}`)
    return res.record
  },

  async update(recordId: string, data: Record<string, unknown>): Promise<DataRecord> {
    const res = await api.patch<{ record: DataRecord }>(`/api/data/records/${recordId}`, { data })
    return res.record
  },

  async remove(recordId: string): Promise<void> {
    await api.delete(`/api/data/records/${recordId}`)
  },
} satisfies TableClient & RecordClient

export type { NewTableSchema, NewDataRecord }
