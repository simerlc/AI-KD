import { describe, it, expect } from 'vitest'
import { ActionEngine, type ActionRuntime } from '../action-engine'
import { EventEngine } from '../event-engine'
import type { ActionSchema, EventSchema } from '@aikd/shared'

// ─── Mock Runtime ────────────────────────────────────────

function createMockRuntime() {
  const calls: string[] = []
  const db: Array<Record<string, unknown>> = []

  const runtime: ActionRuntime = {
    database: {
      async query(params) {
        calls.push(`query:${JSON.stringify(params)}`)
        return db
      },
      async insert(params) {
        calls.push(`insert:${JSON.stringify(params)}`)
        db.push(params)
        return { id: 'new-id' }
      },
      async update(params) {
        calls.push(`update:${JSON.stringify(params)}`)
        return { affected: 1 }
      },
      async remove(params) {
        calls.push(`delete:${JSON.stringify(params)}`)
        return { affected: 1 }
      },
    },
    http: {
      async request(params) {
        calls.push(`http:${JSON.stringify(params)}`)
        return { ok: true }
      },
    },
    notification: {
      success(msg) {
        calls.push(`notify-success:${msg}`)
      },
      error(msg) {
        calls.push(`notify-error:${msg}`)
      },
    },
    navigation: {
      go(path) {
        calls.push(`navigate:${path}`)
      },
    },
    modal: {
      open(params) {
        calls.push(`modal-open:${JSON.stringify(params)}`)
      },
      close() {
        calls.push('modal-close')
      },
    },
    page: {
      refresh() {
        calls.push('page-refresh')
      },
    },
  }

  return { runtime, calls, db }
}

// ─── Action Engine 测试 ─────────────────────────────────

describe('ActionEngine', () => {
  it('应执行 database.insert 并解析变量表达式', async () => {
    const { runtime, calls } = createMockRuntime()
    const engine = new ActionEngine(runtime)

    const action: ActionSchema = {
      id: 'a1',
      name: '插入客户',
      type: 'database.insert',
      params: { name: '{{form.name}}', phone: '{{form.phone}}' },
    }

    const result = await engine.execute(action, { form: { name: '张三', phone: '138' } })
    expect(result.success).toBe(true)
    expect(calls.some((c) => c.includes('insert'))).toBe(true)
    expect(calls.some((c) => c.includes('张三'))).toBe(true)
  })

  it('应执行 notification.success', async () => {
    const { runtime, calls } = createMockRuntime()
    const engine = new ActionEngine(runtime)

    const action: ActionSchema = { id: 'a2', name: '成功提示', type: 'notification.success', params: { message: '保存成功' } }
    const result = await engine.execute(action)
    expect(result.success).toBe(true)
    expect(calls).toContain('notify-success:保存成功')
  })

  it('应执行 navigation.go 和 page.refresh', async () => {
    const { runtime, calls } = createMockRuntime()
    const engine = new ActionEngine(runtime)

    await engine.execute({ id: 'a3', name: '跳转', type: 'navigation.go', params: { path: '/list' } })
    await engine.execute({ id: 'a4', name: '刷新', type: 'page.refresh', params: {} })
    expect(calls).toContain('navigate:/list')
    expect(calls).toContain('page-refresh')
  })

  it('应处理未知 Action 类型的错误', async () => {
    const { runtime } = createMockRuntime()
    const engine = new ActionEngine(runtime)

    const result = await engine.execute({ id: 'a5', name: '坏动作', type: 'bad.type' as never, params: {} })
    expect(result.success).toBe(false)
    expect(result.error).toContain('未知的 Action 类型')
  })

  it('应捕获 handler 抛出的错误', async () => {
    const runtime: ActionRuntime = {
      ...createMockRuntime().runtime,
      database: {
        ...createMockRuntime().runtime.database,
        query: async () => {
          throw new Error('DB 连接失败')
        },
      },
    }
    const engine = new ActionEngine(runtime)
    const result = await engine.execute({ id: 'a6', name: '查询', type: 'database.query', params: {} })
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB 连接失败')
  })
})

// ─── Event Engine 测试 ───────────────────────────────────

describe('EventEngine', () => {
  it('应按顺序执行事件绑定的多个 Action（CRUD demo 场景）', async () => {
    const { runtime, calls } = createMockRuntime()
    const actionEngine = new ActionEngine(runtime)
    const eventEngine = new EventEngine(actionEngine)

    // 模拟"按钮点击 → database.insert → page.refresh → notification.success"
    const actions: ActionSchema[] = [
      { id: 'ins', name: '新增客户', type: 'database.insert', params: { name: '{{form.name}}' } },
      { id: 'refresh', name: '刷新', type: 'page.refresh', params: {} },
      { id: 'notify', name: '提示', type: 'notification.success', params: { message: '保存成功' } },
    ]

    const event: EventSchema = {
      id: 'evt_save',
      name: '保存',
      trigger: 'interaction',
      event: 'click',
      actions: ['ins', 'refresh', 'notify'],
    }

    const result = await eventEngine.dispatch(event, actions, { form: { name: '张三' } })
    expect(result.success).toBe(true)
    expect(result.results.length).toBe(3)
    expect(calls).toContain('page-refresh')
    expect(calls).toContain('notify-success:保存成功')
  })

  it('trigger 应根据触发名匹配事件', async () => {
    const { runtime, calls } = createMockRuntime()
    const engine = new EventEngine(new ActionEngine(runtime))

    const events: EventSchema[] = [
      { id: 'e1', name: '点击', trigger: 'interaction', event: 'click', actions: ['a1'] },
      { id: 'e2', name: '页面加载', trigger: 'lifecycle', lifecycle: 'pageLoad', actions: ['a2'] },
    ]
    const actions: ActionSchema[] = [
      { id: 'a1', name: '点击动作', type: 'notification.success', params: { message: 'clicked' } },
      { id: 'a2', name: '加载动作', type: 'page.refresh', params: {} },
    ]

    const clickResult = await engine.trigger('click', events, actions)
    expect(clickResult?.success).toBe(true)
    expect(calls).toContain('notify-success:clicked')

    const pageLoadResult = await engine.trigger('pageLoad', events, actions)
    expect(pageLoadResult?.success).toBe(true)
    expect(calls).toContain('page-refresh')
  })

  it('trigger 无匹配事件时应返回 null', async () => {
    const { runtime } = createMockRuntime()
    const engine = new EventEngine(new ActionEngine(runtime))

    const result = await engine.trigger('change', [], [])
    expect(result).toBeNull()
  })

  it('事件引用不存在的动作时应返回错误结果', async () => {
    const { runtime } = createMockRuntime()
    const engine = new EventEngine(new ActionEngine(runtime))

    const event: EventSchema = { id: 'e', name: '坏事件', trigger: 'interaction', event: 'click', actions: ['ghost'] }
    const result = await engine.dispatch(event, [])
    expect(result.success).toBe(false)
    expect(result.results[0].error).toContain('不存在的动作')
  })
})
