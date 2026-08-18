import { describe, it, expect } from 'vitest'
import { ApplicationCopilot, type CopilotContext } from '../copilot'
import { CopilotHistory } from '../copilot-history'
import type { LLMClient, LLMMessage } from '../types'
import type { AppSchema } from '@aikd/shared'

// ─── 测试工具 ────────────────────────────────────────────

function makeSchema(): AppSchema {
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
          { id: 'heading', type: 'Heading', props: { text: '客户列表' } },
          { id: 'table', type: 'Table', props: { columns: [{ key: 'name', title: '客户名称' }], rows: [] } },
        ],
      },
    ],
    routes: [{ path: '/', pageId: 'page_list' }],
    theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
    data: { sources: [{ id: 'customers', name: '客户', type: 'static', data: [] }] },
    actions: [{ id: 'insert_customer', name: '新增客户', type: 'database.insert', params: { tableId: 'customers' } }],
    events: [{ id: 'save', name: '保存', trigger: 'interaction', event: 'click', actions: ['insert_customer'] }],
    workflows: [],
  }
}

function makeContext(): CopilotContext {
  return {
    schema: makeSchema(),
    databaseSchema: [{ id: 'customers', name: '客户', fields: [{ name: 'name', type: 'string' }, { name: 'phone', type: 'string' }] }],
    actions: makeSchema().actions,
    workflows: [],
    permissions: [],
    errorLogs: [],
  }
}

function makeLLM(plan: unknown): LLMClient {
  return {
    async complete(_messages: LLMMessage[]): Promise<string> {
      return '```json\n' + JSON.stringify(plan) + '\n```'
    },
    async stream(_m, _o, onChunk) {
      onChunk('')
      return ''
    },
  }
}

// ─── 多场景测试 ──────────────────────────────────────────

describe('ApplicationCopilot - 多种修改场景', () => {
  it('场景 1：增加字段（增加客户等级字段）', async () => {
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '增加客户等级字段 level',
        reason: '用户需要记录客户等级',
        changeType: 'addField',
        patch: {
          ops: [
            { op: 'update', path: '/pages/0/components/1/props/columns', value: [{ key: 'name', title: '客户名称' }, { key: 'level', title: '客户等级' }] },
          ],
        },
      }),
    )

    const result = await copilot.modify('增加客户等级字段', makeContext())

    expect(result.success).toBe(true)
    expect(result.changeType).toBe('addField')
    expect(result.change).toContain('客户等级')
    expect(result.reason).toBeTruthy()

    const columns = result.schema!.pages[0].components[1].props.columns as Array<{ key: string }>
    expect(columns.map((c) => c.key)).toContain('level')
  })

  it('场景 2：修改样式（修改主题颜色）', async () => {
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '修改主题色为红色',
        reason: '用户偏好红色主题',
        changeType: 'modifyStyle',
        patch: {
          ops: [{ op: 'update', path: '/theme/primaryColor', value: '#ff0000' }],
        },
      }),
    )

    const result = await copilot.modify('把主题改成红色', makeContext())

    expect(result.success).toBe(true)
    expect(result.changeType).toBe('modifyStyle')
    expect(result.schema!.theme.primaryColor).toBe('#ff0000')
  })

  it('场景 3：增加组件（增加搜索框）', async () => {
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '增加搜索框组件',
        reason: '用户需要搜索功能',
        changeType: 'addComponent',
        patch: {
          ops: [
            { op: 'add', path: '/pages/0/components/1', value: { id: 'search', type: 'Input', props: { placeholder: '搜索客户' } } },
          ],
        },
      }),
    )

    const result = await copilot.modify('给客户列表增加搜索', makeContext())

    expect(result.success).toBe(true)
    expect(result.changeType).toBe('addComponent')
    const components = result.schema!.pages[0].components
    expect(components.some((c) => c.id === 'search')).toBe(true)
  })

  it('场景 4：增加 Action', async () => {
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '增加删除客户动作',
        reason: '用户需要删除功能',
        changeType: 'addAction',
        patch: {
          ops: [
            { op: 'add', path: '/actions/-', value: { id: 'delete_customer', name: '删除客户', type: 'database.delete', params: { id: '{{record.id}}' } } },
          ],
        },
      }),
    )

    const result = await copilot.modify('增加删除客户功能', makeContext())

    expect(result.success).toBe(true)
    expect(result.changeType).toBe('addAction')
    expect(result.schema!.actions!.some((a) => a.id === 'delete_customer')).toBe(true)
  })

  it('场景 5：修复错误（修复事件引用）', async () => {
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '修复事件引用不存在的动作',
        reason: '事件引用了 ghost_action',
        changeType: 'fixError',
        patch: {
          ops: [{ op: 'update', path: '/events/0/actions', value: ['insert_customer'] }],
        },
      }),
    )

    const context = makeContext()
    context.errorLogs = [{ id: 'e1', kind: 'runtime', message: '事件引用了 ghost_action', timestamp: Date.now() }]

    const result = await copilot.modify('修复这个错误', context)

    expect(result.success).toBe(true)
    expect(result.changeType).toBe('fixError')
  })

  it('场景 6：增加 Workflow', async () => {
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '增加审批工作流',
        reason: '用户需要审批流程',
        changeType: 'addWorkflow',
        patch: {
          ops: [
            { op: 'add', path: '/workflows/-', value: { id: 'wf_approve', name: '审批', trigger: { type: 'form.submit' }, steps: [] } },
          ],
        },
      }),
    )

    const result = await copilot.modify('增加审批流程', makeContext())

    expect(result.success).toBe(true)
    expect(result.changeType).toBe('addWorkflow')
  })
})

// ─── 失败场景 ────────────────────────────────────────────

describe('ApplicationCopilot - 失败处理', () => {
  it('Patch 验证失败时应返回失败结果', async () => {
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '非法修改',
        reason: '测试',
        changeType: 'modifyPage',
        patch: { ops: [{ op: 'invalid' as never, path: '/x' }] },
      }),
    )

    const result = await copilot.modify('非法请求', makeContext())
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('Patch 应用到不存在路径时应返回失败', async () => {
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '修改不存在字段',
        reason: '测试',
        changeType: 'modifyPage',
        patch: { ops: [{ op: 'update', path: '/pages/999/title', value: 'x' }] },
      }),
    )

    const result = await copilot.modify('修改', makeContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('Patch 应用失败')
  })

  it('LLM 返回非法 JSON 时应返回失败', async () => {
    const copilot = new ApplicationCopilot({
      async complete(): Promise<string> {
        return '这不是 JSON'
      },
      async stream(_m, _o, onChunk) {
        onChunk('')
        return ''
      },
    })

    const result = await copilot.modify('修改', makeContext())
    expect(result.success).toBe(false)
    expect(result.error).toContain('无法从响应中提取 JSON')
  })
})

// ─── Copilot History ─────────────────────────────────────

describe('CopilotHistory', () => {
  it('应记录每次修改（内容/原因/结果/成功）', async () => {
    const history = new CopilotHistory()
    const copilot = new ApplicationCopilot(
      makeLLM({
        change: '修改主题色',
        reason: '用户偏好',
        changeType: 'modifyStyle',
        patch: { ops: [{ op: 'update', path: '/theme/primaryColor', value: '#ff0000' }] },
      }),
    )

    const result = await copilot.modify('改主题', makeContext())
    const entry = history.record(result)

    expect(history.history).toHaveLength(1)
    expect(entry.result.success).toBe(true)
    expect(entry.result.change).toContain('主题色')
    expect(history.successCount).toBe(1)
    expect(history.failureCount).toBe(0)
  })

  it('应统计成功和失败', () => {
    const history = new CopilotHistory()

    const successResult = { change: '成功', reason: '', changeType: 'modifyPage' as const, success: true }
    const failResult = { change: '失败', reason: '', changeType: 'modifyPage' as const, success: false, error: 'x' }

    history.record(successResult)
    history.record(failResult)

    expect(history.successCount).toBe(1)
    expect(history.failureCount).toBe(1)
    expect(history.history).toHaveLength(2)
  })
})
