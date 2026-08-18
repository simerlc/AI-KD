import { describe, it, expect } from 'vitest'
import { inferFields, extractRows } from '../backend-init.service'

describe('backend-init - 字段推断', () => {
  it('应从数组数据推断字段类型', () => {
    const data = [
      { id: 1, name: '张三', phone: '138', vip: true, age: 30 },
    ]
    const fields = inferFields(data)
    expect(fields).toHaveLength(5)
    const byName = Object.fromEntries(fields.map((f) => [f.name, f.type]))
    expect(byName.id).toBe('number')
    expect(byName.name).toBe('string')
    expect(byName.phone).toBe('string')
    expect(byName.vip).toBe('boolean')
    expect(byName.age).toBe('number')
  })

  it('应从对象数据推断字段', () => {
    const data = { name: '张三', status: 'active' }
    const fields = inferFields(data)
    expect(fields).toHaveLength(2)
    expect(fields.map((f) => f.name)).toEqual(['name', 'status'])
  })

  it('空数据应返回空字段', () => {
    expect(inferFields([])).toEqual([])
    expect(inferFields(null)).toEqual([])
    expect(inferFields('string')).toEqual([])
  })

  it('应识别日期字符串为 datetime', () => {
    const data = [{ name: 'x', createdAt: '2026-08-18' }]
    const fields = inferFields(data)
    const createdAt = fields.find((f) => f.name === 'createdAt')
    expect(createdAt?.type).toBe('datetime')
  })
})

describe('backend-init - 行数据提取', () => {
  it('数组数据应提取为行数组', () => {
    const data = [
      { id: 1, name: '张三' },
      { id: 2, name: '李四' },
    ]
    const rows = extractRows(data)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ id: 1, name: '张三' })
  })

  it('对象数据应提取为单行', () => {
    const data = { id: 1, name: '张三' }
    const rows = extractRows(data)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ id: 1, name: '张三' })
  })

  it('非对象元素应被过滤', () => {
    const data = [{ id: 1 }, 'string', null, 42, { id: 2 }]
    const rows = extractRows(data)
    expect(rows).toHaveLength(2)
  })

  it('空数据应返回空数组', () => {
    expect(extractRows(null)).toEqual([])
    expect(extractRows([])).toEqual([])
  })
})
