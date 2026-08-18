import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActionEngine, EventEngine } from '@aikd/agent'
import type { ActionSchema, AppSchema, EventSchema } from '@aikd/shared'
import { Runtime } from '../Runtime'
import { createMemoryDataClient, type DataClient } from '../data/data-client'
import type { RuntimeAdapter } from '../adapter'

// ─── 客户管理系统 Demo ───────────────────────────────────
//
// 完整验证：AppSchema → Runtime 渲染 + Event → Action → Data CRUD 闭环

function makeCrmSchema(): AppSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'crm_app',
    name: '客户管理系统',
    type: 'web',
    version: '0.1.0',
    pages: [
      {
        id: 'page_list',
        path: '/',
        title: '客户列表',
        layout: 'web',
        components: [
          { id: 'header', type: 'Header', props: { title: '客户管理系统' } },
          {
            id: 'form',
            type: 'Form',
            props: { title: '新增客户', submitText: '保存' },
            children: [
              { id: 'name', type: 'Input', props: { label: '客户名称', placeholder: '请输入客户名称' } },
              { id: 'phone', type: 'Input', props: { label: '手机号', placeholder: '请输入手机号' } },
              { id: 'email', type: 'Input', props: { label: '邮箱', placeholder: '请输入邮箱' } },
              {
                id: 'status',
                type: 'Select',
                props: { label: '状态', options: ['active', 'inactive'] },
              },
            ],
          },
        ],
      },
    ],
    routes: [{ path: '/', pageId: 'page_list' }],
    theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
    data: { sources: [] },
    actions: [
      {
        id: 'insert_customer',
        name: '新增客户',
        type: 'database.insert',
        params: {
          tableId: 'customers',
          data: {
            name: '{{form.name}}',
            phone: '{{form.phone}}',
            email: '{{form.email}}',
            status: '{{form.status}}',
          },
        },
      },
      { id: 'refresh', name: '刷新', type: 'page.refresh', params: {} },
      { id: 'notify_ok', name: '成功提示', type: 'notification.success', params: { message: '客户保存成功' } },
    ],
    events: [
      {
        id: 'save_customer',
        name: '保存客户',
        trigger: 'interaction',
        event: 'submit',
        actions: ['insert_customer', 'refresh', 'notify_ok'],
      },
    ],
  }
}

// ─── 测试：UI 渲染 ───────────────────────────────────────

describe('客户管理系统 Demo — UI 渲染', () => {
  it('应渲染客户管理系统的表单结构', () => {
    const schema = makeCrmSchema()
    const adapter = makeAdapter(createMemoryDataClient())
    const html = renderToStaticMarkup(<Runtime schema={schema} dataClient={adapter.dataClient} adapter={adapter} />)

    expect(html).toContain('客户管理系统')
    expect(html).toContain('新增客户')
    expect(html).toContain('客户名称')
    expect(html).toContain('手机号')
    expect(html).toContain('邮箱')
    expect(html).toContain('状态')
    expect(html).toContain('保存')
  })
})

// ─── 测试：Event → Action → Data CRUD 闭环 ───────────────

describe('客户管理系统 Demo — CRUD 闭环', () => {
  it('表单提交应触发 insert → refresh → notify，并真实写入数据', async () => {
    const schema = makeCrmSchema()
    const dataClient = createMemoryDataClient()
    const log: string[] = []

    // 构建真实的 ActionEngine（复用 Runtime 的组装逻辑，但手动验证闭环）
    const actionEngine = new ActionEngine({
      database: {
        query: (p) => dataClient.query(String(p.tableId ?? ''), (p.query as never) ?? {}),
        insert: (p) => dataClient.create(String(p.tableId ?? ''), (p.data as Record<string, unknown>) ?? {}),
        update: (p) => dataClient.update(String(p.id), (p.data as Record<string, unknown>) ?? {}),
        remove: (p) => dataClient.remove(String(p.id)),
      },
      http: { request: async () => ({ ok: true }) },
      notification: { success: (m) => log.push(`✅${m}`), error: (m) => log.push(`❌${m}`) },
      navigation: { go: (p) => log.push(`导航:${p}`) },
      modal: { open: () => {}, close: () => {} },
      page: { refresh: () => log.push('🔄刷新') },
    })
    const eventEngine = new EventEngine(actionEngine)

    const actions = schema.actions as ActionSchema[]
    const events = schema.events as EventSchema[]

    // 触发 submit 事件（模拟表单填入数据）
    const result = await eventEngine.trigger('submit', events, actions, {
      form: { name: '张三', phone: '13800000001', email: 'zhang@a.com', status: 'active' },
    })

    // 断言事件执行成功
    expect(result?.success).toBe(true)
    expect(result?.results.length).toBe(3)
    expect(log).toContain('🔄刷新')
    expect(log).toContain('✅客户保存成功')

    // 断言数据真实写入
    const queryResult = await dataClient.query('customers')
    expect(queryResult.total).toBe(1)
    expect(queryResult.records[0].data.name).toBe('张三')
    expect(queryResult.records[0].data.phone).toBe('13800000001')
    expect(queryResult.records[0].data.status).toBe('active')
  })

  it('应支持完整的增删改查流程', async () => {
    const dataClient: DataClient = createMemoryDataClient()

    // Create
    const c1 = await dataClient.create('customers', { name: '张三', phone: '138' })
    const c2 = await dataClient.create('customers', { name: '李四', phone: '139' })

    // Read
    let list = await dataClient.query('customers')
    expect(list.total).toBe(2)

    // Update
    await dataClient.update(c1.id, { phone: '13800000000' })
    list = await dataClient.query('customers', { filters: [{ field: 'name', op: 'eq', value: '张三' }] })
    expect(list.records[0].data.phone).toBe('13800000000')

    // Delete
    await dataClient.remove(c2.id)
    list = await dataClient.query('customers')
    expect(list.total).toBe(1)
    expect(list.records[0].data.name).toBe('张三')
  })
})

// ─── 辅助 ────────────────────────────────────────────────

function makeAdapter(dataClient: DataClient): RuntimeAdapter {
  return {
    dataClient,
    actionRuntime: {
      notification: { success: () => {}, error: () => {} },
      navigation: { go: () => {} },
      modal: { open: () => {}, close: () => {} },
      page: { refresh: () => {} },
    },
    http: { request: async () => ({ ok: true }) },
  }
}
