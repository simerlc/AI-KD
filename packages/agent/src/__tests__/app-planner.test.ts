import { describe, it, expect } from 'vitest'
import { AppPlannerAgent } from '../app-planner'
import type { LLMClient, LLMMessage } from '../types'

// ─── Mock LLM：返回客户管理系统的 App Plan JSON ──────────

const crmPlanJson = {
  schemaVersion: '1.0.0',
  app: {
    name: '客户管理系统',
    type: 'web',
    description: '管理客户信息',
  },
  pages: [
    {
      id: 'page_list',
      path: '/',
      title: '客户列表',
      layout: 'web',
      description: '展示客户列表',
      tableId: 'customers',
      pageType: 'list',
    },
  ],
  tables: [
    {
      id: 'customers',
      name: '客户',
      fields: [
        { name: 'name', type: 'string', required: true, label: '客户名称' },
        { name: 'phone', type: 'string', label: '手机号' },
        { name: 'status', type: 'enum', enumOptions: ['active', 'inactive'], label: '状态' },
      ],
    },
  ],
  actions: [
    { id: 'insert_customer', name: '新增客户', type: 'database.insert', params: { tableId: 'customers', data: { name: '{{form.name}}' } } },
    { id: 'refresh', name: '刷新', type: 'page.refresh', params: {} },
  ],
  events: [
    { id: 'save_customer', name: '保存客户', trigger: 'interaction', event: 'submit', actions: ['insert_customer', 'refresh'] },
  ],
}

function makeMockLLM(response: string): LLMClient {
  return {
    async complete(_messages: LLMMessage[]): Promise<string> {
      return response
    },
    async stream(_messages: LLMMessage[], _opts, onChunk): Promise<string> {
      onChunk(response)
      return response
    },
  }
}

describe('AppPlannerAgent', () => {
  it('应将用户需求转换为 AppPlan', async () => {
    const llm = makeMockLLM('```json\n' + JSON.stringify(crmPlanJson) + '\n```')
    const planner = new AppPlannerAgent(llm)

    const result = await planner.plan({ prompt: '创建一个客户管理系统' })
    expect(result.plan.app.name).toBe('客户管理系统')
    expect(result.plan.tables).toHaveLength(1)
    expect(result.plan.tables[0].id).toBe('customers')
    expect(result.plan.tables[0].fields).toHaveLength(3)
    expect(result.plan.actions).toHaveLength(2)
    expect(result.plan.events).toHaveLength(1)
    expect(result.retries).toBe(0)
  })

  it('应从纯文本中提取 JSON（带无关文字）', async () => {
    const llm = makeMockLLM('好的，我来规划：\n```json\n' + JSON.stringify(crmPlanJson) + '\n```\n以上就是规划结果。')
    const planner = new AppPlannerAgent(llm)

    const result = await planner.plan({ prompt: '创建客户管理' })
    expect(result.plan.tables[0].id).toBe('customers')
  })

  it('首次验证失败后应重试', async () => {
    let callCount = 0
    const llm: LLMClient = {
      async complete(): Promise<string> {
        callCount++
        if (callCount === 1) {
          // 第一次返回非法 JSON（缺 pages）
          return '```json\n{"schemaVersion":"1.0.0","app":{"name":"x","type":"web","description":""},"tables":[]}\n```'
        }
        // 第二次返回合法
        return '```json\n' + JSON.stringify(crmPlanJson) + '\n```'
      },
      async stream(_m, _o, onChunk) {
        onChunk('')
        return ''
      },
    }
    const planner = new AppPlannerAgent(llm)

    const result = await planner.plan({ prompt: '创建客户管理' })
    expect(result.retries).toBe(1)
    expect(result.plan.tables[0].id).toBe('customers')
  })

  it('多次失败应抛出错误', async () => {
    const llm = makeMockLLM('这不是 JSON')
    const planner = new AppPlannerAgent(llm)

    await expect(planner.plan({ prompt: '创建应用', maxRetries: 2 })).rejects.toThrow('AppPlanner 生成失败')
  })

  it('应补充默认应用类型', async () => {
    const planWithoutType = { ...crmPlanJson, app: { ...crmPlanJson.app, type: undefined } }
    const llm = makeMockLLM('```json\n' + JSON.stringify(planWithoutType) + '\n```')
    const planner = new AppPlannerAgent(llm)

    const result = await planner.plan({ prompt: '创建应用', appType: 'h5' })
    expect(result.plan.app.type).toBe('h5')
  })
})
