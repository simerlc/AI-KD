import { describe, it, expect } from 'vitest'
import { validateRecordData, applyQuery, parseFields, parseRecordData, stringifyFields } from '../data.service'
import type { DataRecord, TableSchema } from '@aikd/shared'

// ─── 测试工具 ────────────────────────────────────────────

const customersTable: TableSchema = {
  id: 'table_customers',
  name: 'customers',
  fields: [
    { name: 'name', type: 'string', required: true },
    { name: 'phone', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'status', type: 'enum', enumOptions: ['active', 'inactive'] },
    { name: 'age', type: 'number' },
    { name: 'vip', type: 'boolean' },
  ],
}

function makeRecord(id: string, data: Record<string, unknown>, createdAt = Date.now()): DataRecord {
  return { id, tableId: 'table_customers', data, createdAt, updatedAt: createdAt }
}

// ─── 字段校验 ────────────────────────────────────────────

describe('validateRecordData 字段校验', () => {
  it('应接受合法的记录数据', () => {
    const result = validateRecordData(customersTable, {
      name: '张三',
      phone: '13800000000',
      email: 'a@b.com',
      status: 'active',
      age: 30,
      vip: true,
    })
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('应拒绝缺失必填字段', () => {
    const result = validateRecordData(customersTable, { phone: '138' })
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('name'))).toBe(true)
  })

  it('应拒绝类型不匹配的字段', () => {
    const result = validateRecordData(customersTable, { name: '张三', age: '三十' })
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('age'))).toBe(true)
  })

  it('应拒绝非法的 enum 值', () => {
    const result = validateRecordData(customersTable, { name: '张三', status: 'unknown' })
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('status'))).toBe(true)
  })

  it('应拒绝非法的日期字符串', () => {
    const dateTable: TableSchema = {
      id: 't',
      name: 'events',
      fields: [{ name: 'happenedAt', type: 'datetime', required: true }],
    }
    const bad = validateRecordData(dateTable, { happenedAt: 'not-a-date' })
    expect(bad.success).toBe(false)

    const good = validateRecordData(dateTable, { happenedAt: '2026-08-18T10:00:00Z' })
    expect(good.success).toBe(true)
  })

  it('undefined 非必填字段应通过校验', () => {
    const result = validateRecordData(customersTable, {
      name: '张三',
      age: undefined,
      vip: undefined,
    })
    expect(result.success).toBe(true)
  })
})

// ─── 查询逻辑 ────────────────────────────────────────────

const records: DataRecord[] = [
  makeRecord('r1', { name: '张三', phone: '138', status: 'active', age: 30 }, 1000),
  makeRecord('r2', { name: '李四', phone: '139', status: 'inactive', age: 25 }, 2000),
  makeRecord('r3', { name: '王五', phone: '138', status: 'active', age: 35 }, 3000),
]

describe('applyQuery 查询', () => {
  it('search 应在字符串字段中模糊匹配', () => {
    const result = applyQuery(records, { search: '张' }, customersTable)
    expect(result.total).toBe(1)
    expect(result.records[0].id).toBe('r1')
  })

  it('search 应支持数字字段匹配', () => {
    const result = applyQuery(records, { search: '25' }, customersTable)
    expect(result.total).toBe(1)
    expect(result.records[0].id).toBe('r2')
  })

  it('filter eq 应精确匹配', () => {
    const result = applyQuery(records, { filters: [{ field: 'status', op: 'eq', value: 'active' }] }, customersTable)
    expect(result.total).toBe(2)
    expect(result.records.map((r) => r.id).sort()).toEqual(['r1', 'r3'])
  })

  it('filter gt 应支持数值比较', () => {
    const result = applyQuery(records, { filters: [{ field: 'age', op: 'gt', value: 30 }] }, customersTable)
    expect(result.total).toBe(1)
    expect(result.records[0].id).toBe('r3')
  })

  it('filter contains 应模糊匹配字符串', () => {
    const result = applyQuery(records, { filters: [{ field: 'phone', op: 'contains', value: '38' }] }, customersTable)
    expect(result.total).toBe(2)
  })

  it('sort desc 应按字段降序', () => {
    const result = applyQuery(records, { sort: { field: 'age', order: 'desc' } }, customersTable)
    expect(result.records.map((r) => r.id)).toEqual(['r3', 'r1', 'r2'])
  })

  it('pagination 应正确分页', () => {
    const result = applyQuery(
      records,
      { pagination: { page: 2, pageSize: 2 } },
      customersTable,
    )
    expect(result.total).toBe(3)
    expect(result.page).toBe(2)
    expect(result.records.length).toBe(1)
  })

  it('默认应按创建时间倒序', () => {
    const result = applyQuery(records, {}, customersTable)
    expect(result.records[0].id).toBe('r3')
  })
})

// ─── JSON 序列化辅助 ─────────────────────────────────────

describe('JSON 序列化辅助函数', () => {
  it('parseFields / stringifyFields 应往返一致', () => {
    const fields = customersTable.fields
    const json = stringifyFields(fields)
    expect(parseFields(json)).toEqual(fields)
  })

  it('parseRecordData 应处理非法 JSON', () => {
    expect(parseRecordData('not-json')).toEqual({})
    expect(parseRecordData('[1,2,3]')).toEqual({})
    expect(parseRecordData('{"a":1}')).toEqual({ a: 1 })
  })
})
