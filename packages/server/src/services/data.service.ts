// ─── Data Service ─────────────────────────────────────────
//
// 统一 Data API 的业务核心：字段校验 + search / filter / sort / pagination。
// 数据存储使用动态 schema（TableSchema 描述字段，记录以 JSON 存储），
// 因此查询逻辑在内存中完成（应用数据量级较小，符合 V1 场景）。

import type {
  DataFilter,
  DataQuery,
  DataQueryResult,
  DataRecord,
  DataSort,
  FieldValidationResult,
  TableField,
  TableSchema,
} from '@aikd/shared'

// ─── 字段校验 ────────────────────────────────────────────

/**
 * 校验记录数据是否符合表字段定义。
 * - 必填字段不能缺失
 * - 字段值类型必须匹配字段类型
 * - enum 字段值必须在 enumOptions 中
 */
export function validateRecordData(table: TableSchema, data: Record<string, unknown>): FieldValidationResult {
  const errors: string[] = []

  for (const field of table.fields) {
    const value = data[field.name]

    // 必填校验
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`字段 ${field.name} 为必填`)
      continue
    }

    if (value === undefined || value === null) continue

    // 类型校验
    if (!isValidFieldValue(field, value)) {
      errors.push(`字段 ${field.name} 的类型应为 ${field.type}`)
    }

    // enum 校验
    if (field.type === 'enum' && field.enumOptions && !field.enumOptions.includes(String(value))) {
      errors.push(`字段 ${field.name} 的值必须是 [${field.enumOptions.join(', ')}] 之一`)
    }
  }

  return { success: errors.length === 0, errors }
}

function isValidFieldValue(field: TableField, value: unknown): boolean {
  switch (field.type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'boolean':
      return typeof value === 'boolean'
    case 'date':
    case 'datetime':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    case 'enum':
      return typeof value === 'string' || typeof value === 'number'
    case 'uuid':
      return typeof value === 'string' && /^[0-9a-fA-F-]{8,36}$/.test(value)
    default:
      return true
  }
}

// ─── 查询逻辑 ────────────────────────────────────────────

/**
 * 对记录集应用统一查询（search / filter / sort / pagination）。
 * 返回 DataQueryResult。
 */
export function applyQuery(records: DataRecord[], query: DataQuery, table?: TableSchema): DataQueryResult {
  let result = [...records]

  // 1. filter
  if (query.filters && query.filters.length > 0) {
    result = result.filter((r) => query.filters!.every((f) => applyFilter(r, f)))
  }

  // 2. search（在字符串字段中模糊匹配）
  if (query.search && query.search.trim()) {
    const keyword = query.search.trim().toLowerCase()
    result = result.filter((r) => searchMatch(r, keyword, table))
  }

  // 3. sort
  if (query.sort) {
    result = sortRecords(result, query.sort)
  } else {
    // 默认按创建时间倒序
    result.sort((a, b) => b.createdAt - a.createdAt)
  }

  // 4. pagination
  const page = query.pagination?.page && query.pagination.page > 0 ? query.pagination.page : 1
  const pageSize = query.pagination?.pageSize && query.pagination.pageSize > 0 ? query.pagination.pageSize : 20
  const total = result.length
  const start = (page - 1) * pageSize
  const pageRecords = result.slice(start, start + pageSize)

  return { records: pageRecords, total, page, pageSize }
}

function applyFilter(record: DataRecord, filter: DataFilter): boolean {
  const value = record.data[filter.field]
  const target = filter.value

  switch (filter.op) {
    case 'eq':
      return value === target
    case 'ne':
      return value !== target
    case 'gt':
      return compareValues(value, target) > 0
    case 'gte':
      return compareValues(value, target) >= 0
    case 'lt':
      return compareValues(value, target) < 0
    case 'lte':
      return compareValues(value, target) <= 0
    case 'contains':
      return typeof value === 'string' && value.toLowerCase().includes(String(target).toLowerCase())
    case 'in':
      return Array.isArray(target) && target.includes(value)
    default:
      return true
  }
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function searchMatch(record: DataRecord, keyword: string, table?: TableSchema): boolean {
  const fields = table?.fields.map((f) => f.name) ?? Object.keys(record.data)
  for (const field of fields) {
    const value = record.data[field]
    if (typeof value === 'string' && value.toLowerCase().includes(keyword)) return true
    if (typeof value === 'number' && String(value).includes(keyword)) return true
  }
  return false
}

function sortRecords(records: DataRecord[], sort: DataSort): DataRecord[] {
  const { field, order } = sort
  return records.sort((a, b) => {
    const cmp = compareValues(a.data[field], b.data[field])
    return order === 'desc' ? -cmp : cmp
  })
}

// ─── 辅助函数 ────────────────────────────────────────────

/** 解析字段 JSON 字符串为 TableField[] */
export function parseFields(fieldsJson: string): TableField[] {
  try {
    const parsed = JSON.parse(fieldsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 序列化 TableField[] 为 JSON 字符串 */
export function stringifyFields(fields: TableField[]): string {
  return JSON.stringify(fields)
}

/** 解析记录 JSON 字符串为对象 */
export function parseRecordData(dataJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(dataJson)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
