import { describe, it, expect } from 'vitest'
import { createMemoryDataClient } from '../data/data-client'

describe('createMemoryDataClient', () => {
  it('应支持完整的 CRUD 流程', async () => {
    const client = createMemoryDataClient()

    // Create
    const created = await client.create('customers', { name: '张三', phone: '138' })
    expect(created.id).toBeTruthy()
    expect(created.data.name).toBe('张三')

    // Read（query）
    const result = await client.query('customers')
    expect(result.total).toBe(1)
    expect(result.records[0].data.name).toBe('张三')

    // Update
    const updated = await client.update(created.id, { phone: '139' })
    expect(updated.data.phone).toBe('139')

    // Delete
    await client.remove(created.id)
    const after = await client.query('customers')
    expect(after.total).toBe(0)
  })

  it('应支持 search / sort / pagination', async () => {
    const client = createMemoryDataClient()
    await client.create('customers', { name: '张三', age: 30 })
    await client.create('customers', { name: '李四', age: 25 })
    await client.create('customers', { name: '王五', age: 35 })

    // search
    const s = await client.query('customers', { search: '李' })
    expect(s.total).toBe(1)

    // sort
    const sorted = await client.query('customers', { sort: { field: 'age', order: 'desc' } })
    expect(sorted.records[0].data.name).toBe('王五')

    // pagination
    const paged = await client.query('customers', { pagination: { page: 1, pageSize: 2 } })
    expect(paged.total).toBe(3)
    expect(paged.records.length).toBe(2)
  })

  it('应支持 filter eq', async () => {
    const client = createMemoryDataClient()
    await client.create('customers', { name: '张三', status: 'active' })
    await client.create('customers', { name: '李四', status: 'inactive' })

    const result = await client.query('customers', { filters: [{ field: 'status', op: 'eq', value: 'active' }] })
    expect(result.total).toBe(1)
    expect(result.records[0].data.name).toBe('张三')
  })
})
