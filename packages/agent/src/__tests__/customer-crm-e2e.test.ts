import { describe, it, expect } from 'vitest'
import { AppPlannerAgent } from '../app-planner'
import { generateAppSchema } from '../app-schema-generator'
import { validateAppSchema, validateAppPlan } from '@aikd/app-engine'
import type { LLMClient, LLMMessage } from '../types'

// ─── 完整流程验证 ────────────────────────────────────────
//
// User Prompt → AppPlanner → AppPlan → AppSchemaGenerator → AppSchema
// → SchemaValidator → 验证通过
//
// 模拟用户输入「创建一个客户管理系统」，验证 AI 生成完整的
// 客户管理规划（表 + 字段 + 动作 + 事件），并转换为可运行的 AppSchema。

// Mock LLM：模拟 AI 对"创建一个客户管理系统"的规划输出
const llmOutput = {
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
      description: '展示所有客户，支持搜索、筛选、分页',
      tableId: 'customers',
      pageType: 'list',
    },
    {
      id: 'page_new',
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
    { id: 'insert_customer', name: '新增客户', type: 'database.insert', params: { tableId: 'customers', data: { name: '{{form.name}}', phone: '{{form.phone}}', email: '{{form.email}}', status: '{{form.status}}' } } },
    { id: 'delete_customer', name: '删除客户', type: 'database.delete', params: { id: '{{record.id}}' } },
    { id: 'update_customer', name: '编辑客户', type: 'database.update', params: { id: '{{record.id}}', data: { name: '{{form.name}}' } } },
    { id: 'refresh', name: '刷新列表', type: 'page.refresh', params: {} },
    { id: 'notify_ok', name: '成功提示', type: 'notification.success', params: { message: '操作成功' } },
  ],
  events: [
    { id: 'save_customer', name: '保存客户', trigger: 'interaction', event: 'submit', actions: ['insert_customer', 'refresh', 'notify_ok'] },
    { id: 'delete_row', name: '删除行', trigger: 'interaction', event: 'rowClick', actions: ['delete_customer', 'refresh', 'notify_ok'] },
  ],
  workflows: [
    { id: 'wf_save', name: '保存客户流程', trigger: 'save_customer', steps: ['insert_customer', 'refresh', 'notify_ok'], description: '点击保存后新增客户并刷新列表' },
  ],
  permissions: [
    { role: 'admin', pages: ['*'], actions: ['*'], tables: ['*'] },
    { role: 'user', pages: ['/'], actions: ['refresh'], tables: ['customers'] },
  ],
}

function makeLLM(): LLMClient {
  return {
    async complete(_messages: LLMMessage[]): Promise<string> {
      return '```json\n' + JSON.stringify(llmOutput) + '\n```'
    },
    async stream(_m, _o, onChunk) {
      onChunk('')
      return ''
    },
  }
}

describe('客户管理系统 完整流程（Plan → Schema → 验证）', () => {
  it('User Prompt → AppPlan → AppSchema → 验证，全链路通过', async () => {
    // 1. User Prompt → AppPlanner → AppPlan
    const planner = new AppPlannerAgent(makeLLM())
    const { plan } = await planner.plan({ prompt: '创建一个客户管理系统' })

    // 2. 验证 AppPlan
    const planValidation = validateAppPlan(plan)
    expect(planValidation.success).toBe(true)

    // 3. 验证 Plan 内容（表 + 字段）
    expect(plan.tables[0].id).toBe('customers')
    expect(plan.tables[0].fields).toHaveLength(4)
    expect(plan.tables[0].fields.map((f) => f.name)).toEqual(['name', 'phone', 'email', 'status'])

    // 4. AppPlan → AppSchemaGenerator → AppSchema
    const { schema } = generateAppSchema(plan)

    // 5. SchemaValidator 验证
    const schemaValidation = validateAppSchema(schema)
    expect(schemaValidation.success).toBe(true)
    expect(schemaValidation.errors).toEqual([])

    // 6. 验证 Schema 内容
    expect(schema.pages).toHaveLength(2)
    expect(schema.actions).toHaveLength(5)
    expect(schema.events).toHaveLength(2)
    expect(schema.data.sources[0].id).toBe('customers')

    // 7. 验证 CRUD 动作完整（增删改查）
    const actionTypes = schema.actions!.map((a) => a.type)
    expect(actionTypes).toContain('database.insert')
    expect(actionTypes).toContain('database.update')
    expect(actionTypes).toContain('database.delete')
  })

  it('AI 不生成 HTML/React 代码，只生成结构化 AppPlan', async () => {
    const planner = new AppPlannerAgent(makeLLM())
    const { plan } = await planner.plan({ prompt: '创建一个客户管理系统' })

    // AppPlan 是纯 JSON 结构，不含代码
    expect(JSON.stringify(plan)).not.toContain('import React')
    expect(JSON.stringify(plan)).not.toContain('<div>')
    expect(JSON.stringify(plan)).not.toContain('function App')
  })
})
