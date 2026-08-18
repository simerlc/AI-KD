import { describe, it, expect } from 'vitest'
import { ActionEngine, type ActionRuntime } from '../action-engine'
import { WorkflowEngine, evaluateCondition, matchWorkflowTrigger } from '../workflow-engine'
import type { ActionContext, ActionSchema, WorkflowCondition, WorkflowSchema } from '@aikd/shared'

// ─── Mock Runtime ────────────────────────────────────────

function createMockRuntime() {
  const calls: string[] = []
  const db: Record<string, unknown>[] = []

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
    http: { async request(params) { calls.push(`http:${JSON.stringify(params)}`); return { ok: true } } },
    notification: {
      success: (m) => calls.push(`notify-success:${m}`),
      error: (m) => calls.push(`notify-error:${m}`),
    },
    navigation: { go: (p) => calls.push(`navigate:${p}`) },
    modal: { open: (p) => calls.push(`modal-open:${JSON.stringify(p)}`), close: () => calls.push('modal-close') },
    page: { refresh: () => calls.push('page-refresh') },
  }

  return { runtime, calls, db }
}

// ─── 条件求值测试 ────────────────────────────────────────

describe('evaluateCondition', () => {
  const context: ActionContext = {
    record: { status: 'approved', amount: 100, name: '张三' },
    form: { approved: true, days: 5 },
    user: { id: 'u1' },
  }

  it('应支持 == 比较', () => {
    expect(evaluateCondition({ field: '{{record.status}}', op: '==', value: 'approved' }, context)).toBe(true)
    expect(evaluateCondition({ field: '{{record.status}}', op: '==', value: 'rejected' }, context)).toBe(false)
  })

  it('应支持 != 比较', () => {
    expect(evaluateCondition({ field: '{{record.status}}', op: '!=', value: 'rejected' }, context)).toBe(true)
  })

  it('应支持 > < >= <= 数值比较', () => {
    expect(evaluateCondition({ field: '{{record.amount}}', op: '>', value: 50 }, context)).toBe(true)
    expect(evaluateCondition({ field: '{{record.amount}}', op: '<', value: 50 }, context)).toBe(false)
    expect(evaluateCondition({ field: '{{record.amount}}', op: '>=', value: 100 }, context)).toBe(true)
    expect(evaluateCondition({ field: '{{record.amount}}', op: '<=', value: 100 }, context)).toBe(true)
  })

  it('应支持布尔值比较', () => {
    expect(evaluateCondition({ field: '{{form.approved}}', op: '==', value: true }, context)).toBe(true)
    expect(evaluateCondition({ field: '{{form.approved}}', op: '==', value: false }, context)).toBe(false)
  })

  it('应支持 AND 逻辑', () => {
    const cond: WorkflowCondition = {
      logic: 'AND',
      conditions: [
        { field: '{{record.status}}', op: '==', value: 'approved' },
        { field: '{{record.amount}}', op: '>', value: 50 },
      ],
    }
    expect(evaluateCondition(cond, context)).toBe(true)
  })

  it('应支持 OR 逻辑', () => {
    expect(
      evaluateCondition(
        {
          logic: 'OR',
          conditions: [
            { field: '{{record.status}}', op: '==', value: 'rejected' },
            { field: '{{record.amount}}', op: '>', value: 50 },
          ],
        },
        context,
      ),
    ).toBe(true)
  })

  it('应支持 NOT 逻辑', () => {
    expect(
      evaluateCondition(
        { logic: 'NOT', conditions: [{ field: '{{record.status}}', op: '==', value: 'rejected' }] },
        context,
      ),
    ).toBe(true)
  })

  it('应支持嵌套逻辑组合', () => {
    expect(
      evaluateCondition(
        {
          logic: 'AND',
          conditions: [
            { field: '{{record.status}}', op: '==', value: 'approved' },
            {
              logic: 'OR',
              conditions: [
                { field: '{{record.amount}}', op: '>', value: 200 },
                { field: '{{form.approved}}', op: '==', value: true },
              ],
            },
          ],
        },
        context,
      ),
    ).toBe(true)
  })
})

// ─── 触发器匹配测试 ──────────────────────────────────────

describe('matchWorkflowTrigger', () => {
  const workflow: WorkflowSchema = {
    id: 'wf1',
    name: '请假审批',
    trigger: { type: 'form.submit' },
    steps: [],
  }

  it('应匹配相同触发器类型', () => {
    expect(matchWorkflowTrigger(workflow, 'form.submit')).toBe(true)
  })

  it('不应匹配不同触发器类型', () => {
    expect(matchWorkflowTrigger(workflow, 'button.click')).toBe(false)
  })

  it('应匹配 record.created 触发器', () => {
    const wf: WorkflowSchema = { ...workflow, trigger: { type: 'record.created', tableId: 'leaves' } }
    expect(matchWorkflowTrigger(wf, 'record.created', 'leaves')).toBe(true)
    expect(matchWorkflowTrigger(wf, 'record.created', 'other')).toBe(false)
  })
})

// ─── 完整 Workflow 执行测试 ──────────────────────────────

describe('WorkflowEngine - 请假审批场景', () => {
  const actions: ActionSchema[] = [
    { id: 'update_leave', name: '更新请假状态', type: 'database.update', params: { tableId: 'leaves', id: '{{record.id}}', data: { status: '{{record.status}}' } } },
    { id: 'notify_approved', name: '审批通过通知', type: 'notification.success', params: { message: '请假已批准' } },
    { id: 'notify_rejected', name: '审批拒绝通知', type: 'notification.error', params: { message: '请假已拒绝' } },
  ]

  const workflow: WorkflowSchema = {
    id: 'wf_leave',
    name: '请假审批流程',
    trigger: { type: 'form.submit' },
    steps: [
      {
        condition: {
          logic: 'AND',
          conditions: [{ field: '{{form.approved}}', op: '==', value: true }],
        },
        then: [
          { action: 'update_leave' },
          { action: 'notify_approved' },
        ],
        else: [
          { action: 'update_leave' },
          { action: 'notify_rejected' },
        ],
      },
    ],
  }

  it('approved 分支：更新数据库 + 成功通知', async () => {
    const { runtime, calls } = createMockRuntime()
    const engine = new WorkflowEngine(new ActionEngine(runtime))

    const result = await engine.execute(workflow, actions, {
      form: { approved: true },
      record: { id: 'rec_1', status: 'approved' },
    })

    expect(result.success).toBe(true)
    expect(calls.some((c) => c.includes('update'))).toBe(true)
    expect(calls).toContain('notify-success:请假已批准')
    expect(calls).not.toContain('notify-error:请假已拒绝')
  })

  it('rejected 分支：更新数据库 + 拒绝通知', async () => {
    const { runtime, calls } = createMockRuntime()
    const engine = new WorkflowEngine(new ActionEngine(runtime))

    const result = await engine.execute(workflow, actions, {
      form: { approved: false },
      record: { id: 'rec_1', status: 'rejected' },
    })

    expect(result.success).toBe(true)
    expect(calls.some((c) => c.includes('update'))).toBe(true)
    expect(calls).toContain('notify-error:请假已拒绝')
    expect(calls).not.toContain('notify-success:请假已批准')
  })

  it('应支持多步顺序执行（无分支）', async () => {
    const { runtime, calls } = createMockRuntime()
    const engine = new WorkflowEngine(new ActionEngine(runtime))

    const simpleWf: WorkflowSchema = {
      id: 'wf_simple',
      name: '简单流程',
      trigger: { type: 'button.click' },
      steps: [
        { action: 'update_leave' },
        { action: 'notify_approved' },
      ],
    }

    const result = await engine.execute(simpleWf, actions, {
      record: { id: 'rec_1', status: 'approved' },
    })

    expect(result.success).toBe(true)
    expect(result.stepResults).toHaveLength(2)
    expect(calls.some((c) => c.includes('update'))).toBe(true)
    expect(calls).toContain('notify-success:请假已批准')
  })

  it('应处理引用不存在的动作', async () => {
    const { runtime } = createMockRuntime()
    const engine = new WorkflowEngine(new ActionEngine(runtime))

    const badWf: WorkflowSchema = {
      id: 'wf_bad',
      name: '坏流程',
      trigger: { type: 'button.click' },
      steps: [{ action: 'ghost_action' }],
    }

    const result = await engine.execute(badWf, actions, {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('ghost_action')
  })
})
