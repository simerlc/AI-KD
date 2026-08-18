// ─── 统一 Data API 类型定义 ──────────────────────────────
//
// AI快搭 的动态数据层：AI 生成的应用拥有自己的「表 / 字段 / 记录」，
// 通过统一的 Data API 持久化到服务端 SQLite，而非前端 Mock。
//
// 设计原则：
//   - 表结构是「动态 schema」：每个应用自定义表与字段，字段类型有限集
//   - 记录以 JSON 形式存储，字段值可 JSON 序列化
//   - 查询统一支持 search / filter / sort / pagination
//   - 纯类型定义，便于跨端（web / server / agent）复用

// ─── 字段类型 ────────────────────────────────────────────

/** 字段类型有限集 */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'uuid'

// ─── Table Schema ────────────────────────────────────────

/** 表字段定义 */
export interface TableField {
  /** 字段名（列名，如 'name' 'phone'） */
  name: string
  /** 字段类型 */
  type: FieldType
  /** 是否必填 */
  required?: boolean
  /** 字段描述（给 Planner / 用户） */
  description?: string
  /** enum 类型的可选值 */
  enumOptions?: string[]
  /** 默认值 */
  default?: unknown
}

/**
 * 表定义：AI 生成的应用的数据表结构。
 * 例如「客户管理系统」对应一张 customers 表，含 name/phone/email/status 字段。
 */
export interface TableSchema {
  /** 表唯一 ID */
  id: string
  /** 表名（如 'customers'） */
  name: string
  /** 字段列表 */
  fields: TableField[]
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

/** 创建表定义的输入（id 可选） */
export type NewTableSchema = Omit<TableSchema, 'id'> & { id?: string }

// ─── Data Record ─────────────────────────────────────────

/**
 * 数据记录：表中一行数据。
 * data 字段为 JSON 对象，键为字段名，值为对应字段类型的 JSON 值。
 */
export interface DataRecord {
  /** 记录唯一 ID */
  id: string
  /** 所属表 ID */
  tableId: string
  /** 记录数据（字段名 → JSON 值） */
  data: Record<string, unknown>
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
}

/** 创建记录输入（id / 时间戳可选） */
export type NewDataRecord = Omit<DataRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
  createdAt?: number
  updatedAt?: number
}

// ─── Query ───────────────────────────────────────────────

/** 过滤条件 */
export interface DataFilter {
  /** 字段名 */
  field: string
  /** 操作符 */
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'
  /** 比较值 */
  value: unknown
}

/** 排序规则 */
export interface DataSort {
  /** 字段名 */
  field: string
  /** 排序方向 */
  order: 'asc' | 'desc'
}

/** 分页参数 */
export interface DataPagination {
  /** 页码（从 1 开始） */
  page?: number
  /** 每页条数 */
  pageSize?: number
}

/** 统一查询参数（支持 search / filter / sort / pagination） */
export interface DataQuery {
  /** 关键词搜索（在字符串字段中模糊匹配） */
  search?: string
  /** 过滤条件 */
  filters?: DataFilter[]
  /** 排序规则 */
  sort?: DataSort
  /** 分页 */
  pagination?: DataPagination
}

/** 查询结果 */
export interface DataQueryResult {
  /** 当前页记录 */
  records: DataRecord[]
  /** 总记录数（用于前端分页展示） */
  total: number
  /** 当前页码 */
  page: number
  /** 每页条数 */
  pageSize: number
}

// ─── 字段值校验结果 ─────────────────────────────────────

/** 字段值校验结果 */
export interface FieldValidationResult {
  success: boolean
  errors: string[]
}
