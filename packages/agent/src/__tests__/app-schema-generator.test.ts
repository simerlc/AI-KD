import { describe, it, expect } from 'vitest'
import { generateAppSchema } from '../app-schema-generator'
import { validateAppPlan } from '@aikd/app-engine'
import { validateAppSchema } from '@aikd/app-engine'
import type { AppPlan } from '@aikd/shared'

// ─── 客户管理系统 App Plan ───────────────────────────────

const crmPlan: AppPlan = {
  schemaVersion: '1.0.0',
  app: {
    name: '客户管理系统',
    type: 'web',
    description: '管理客户信息，支持增删改查、搜索和筛选',
  },
  pages: [
    {
      id: 'page_list',
      path: '/',
      title: '客户列表',
      layout: 'web',
      description: '展示所有客户，支持搜索和筛选',
      tableId: 'customers',
      pageType: 'list',
    },
    {
      id: 'page_form',
      path: '/new',
      title: '新增客户',
      layout: 'web',
      description: '新增客户表单',
      tableId: 'customers',
      pageType: 'form',
    },
  ],
  tables: [
    {
      id: 'customers',
      name: '客户',
      fields: [
        { name: 'name', type: 'string', required: true, label: '客户名称' },
        { name: 'phone', type: 'string', label: '手机号' },
        { name: 'email', type: 'string', label: '邮箱' },
        { name: 'status', type: 'enum', enumOptions: ['active', 'inactive'], label: '状态' },
      ],
    },
  ],
  actions: [
    {
      id: 'insert_customer',
      name: '新增客户',
      type: 'database.insert',
      params: { tableId: 'customers', data: { name: '{{form.name}}', phone: '{{form.phone}}' } },
    },
    { id: 'refresh', name: '刷新', type: 'page.refresh', params: {} },
    { id: 'notify_ok', name: '提示', type: 'notification.success', params: { message: '保存成功' } },
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

describe('generateAppSchema', () => {
  it('应将 AppPlan 转换为 AppSchema 并通过验证', () => {
    const { schema, warnings } = generateAppSchema(crmPlan)

    // 验证 Plan 本身
    const planResult = validateAppPlan(crmPlan)
    expect(planResult.success).toBe(true)

    // 验证生成的 Schema
    const schemaResult = validateAppSchema(schema)
    expect(schemaResult.success).toBe(true)
    expect(schemaResult.errors).toEqual([])
  })

  it('应正确映射表 → data.sources', () => {
    const { schema } = generateAppSchema(crmPlan)
    expect(schema.data.sources).toHaveLength(1)
    expect(schema.data.sources[0].id).toBe('customers')
    expect(schema.data.sources[0].name).toBe('客户')
  })

  it('应正确映射 pages → routes', () => {
    const { schema } = generateAppSchema(crmPlan)
    expect(schema.routes).toHaveLength(2)
    expect(schema.routes[0]).toEqual({ path: '/', pageId: 'page_list' })
    expect(schema.routes[1]).toEqual({ path: '/new', pageId: 'page_form' })
  })

  it('列表页应生成 Table 组件', () => {
    const { schema } = generateAppSchema(crmPlan)
    const listPage = schema.pages.find((p) => p.id === 'page_list')!
    expect(listPage.components.some((c) => c.type === 'Table')).toBe(true)

    const table = listPage.components.find((c) => c.type === 'Table')!
    const columns = table.props.columns as Array<{ key: string; title: string }>
    expect(columns).toHaveLength(4)
    expect(columns[0]).toEqual({ key: 'name', title: '客户名称' })
  })

  it('表单页应根据字段生成输入组件', () => {
    const { schema } = generateAppSchema(crmPlan)
    const formPage = schema.pages.find((p) => p.id === 'page_form')!
    expect(formPage.components.some((c) => c.type === 'Form')).toBe(true)

    const form = formPage.components.find((c) => c.type === 'Form')!
    const inputs = form.children ?? []
    // name/phone/email 为 string → Input，status 为 enum → Select
    expect(inputs.some((c) => c.type === 'Input')).toBe(true)
    expect(inputs.some((c) => c.type === 'Select')).toBe(true)
  })

  it('应透传 actions 和 events', () => {
    const { schema } = generateAppSchema(crmPlan)
    expect(schema.actions).toHaveLength(3)
    expect(schema.events).toHaveLength(1)
    expect(schema.actions![0].type).toBe('database.insert')
    expect(schema.events![0].actions).toEqual(['insert_customer', 'refresh', 'notify_ok'])
  })

  it('应保留变量表达式 {{form.name}}', () => {
    const { schema } = generateAppSchema(crmPlan)
    const insertAction = schema.actions!.find((a) => a.id === 'insert_customer')!
    expect(insertAction.params.data).toMatchObject({ name: '{{form.name}}', phone: '{{form.phone}}' })
  })
})

describe('validateAppPlan', () => {
  it('应接受合法 Plan', () => {
    const result = validateAppPlan(crmPlan)
    expect(result.success).toBe(true)
  })

  it('应拒绝引用不存在表的页面', () => {
    const badPlan: AppPlan = {
      ...crmPlan,
      pages: [{ ...crmPlan.pages[0], tableId: 'ghost_table' }],
    }
    const result = validateAppPlan(badPlan)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('ghost_table'))).toBe(true)
  })

  it('应拒绝引用不存在动作的事件', () => {
    const badPlan: AppPlan = {
      ...crmPlan,
      events: [{ ...crmPlan.events![0], actions: ['ghost_action'] }],
    }
    const result = validateAppPlan(badPlan)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('ghost_action'))).toBe(true)
  })
})
