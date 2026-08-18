import { describe, it, expect } from 'vitest'
import { AIDebugger } from '../debugger'
import { DebugHistory } from '../debug-history'
import { applyPatch } from '@aikd/app-engine'
import type { LLMClient, LLMMessage } from '../types'
import type { AppSchema, DebugContext, DebugError } from '@aikd/shared'

// ─── 测试工具 ────────────────────────────────────────────

function makeSchema(): AppSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'app_test',
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
          { id: 'btn_add', type: 'Button', props: { text: '新增客户' } },
        ],
      },
    ],
    routes: [{ path: '/', pageId: 'page_list' }],
    theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
    data: { sources: [{ id: 'customers', name: '客户', type: 'static', data: [] }] },
    actions: [
      { id: 'insert_customer', name: '新增客户', type: 'database.insert', params: { tableId: 'customers' } },
    ],
    events: [
      { id: 'save', name: '保存', trigger: 'interaction', event: 'click', actions: ['insert_customer', 'ghost_action'] },
    ],
  }
}

function makeError(kind: DebugError['kind'], message: string): DebugError {
  return { id: `err_${kind}`, kind, message, timestamp: Date.now() }
}

// ─── 场景 1：事件引用不存在的动作 ────────────────────────

const diagnosisFixEvent = {
  rootCause: {
    category: 'event',
    description: '事件 save 引用了不存在的动作 ghost_action',
    location: '/events/0/actions',
    requiresSourceChange: false,
  },
  patch: {
    ops: [
      { op: 'update', path: '/events/0/actions', value: ['insert_customer'] },
    ],
  },
  explanation: '移除事件中对不存在动作 ghost_action 的引用',
  confidence: 0.95,
}

function makeLLM(response: unknown): LLMClient {
  return {
    async complete(_messages: LLMMessage[]): Promise<string> {
      return '```json\n' + JSON.stringify(response) + '\n```'
    },
    async stream(_m, _o, onChunk) {
      onChunk('')
      return ''
    },
  }
}

describe('AIDebugger - 诊断', () => {
  it('应分析错误并生成根因 + Patch', async () => {
    const schema = makeSchema()
    const context: DebugContext = {
      schema,
      errors: [makeError('runtime', '事件引用了不存在的动作: ghost_action')],
    }

    const aiDebugger = new AIDebugger(makeLLM(diagnosisFixEvent))
    const diagnosis = await aiDebugger.diagnose({ context })

    expect(diagnosis.rootCause.category).toBe('event')
    expect(diagnosis.rootCause.description).toContain('ghost_action')
    expect(diagnosis.rootCause.requiresSourceChange).toBe(false)
    expect(diagnosis.patch?.ops).toHaveLength(1)
    expect(diagnosis.confidence).toBe(0.95)
  })

  it('应处理需要修改源代码的情况', async () => {
    const schema = makeSchema()
    const context: DebugContext = {
      schema,
      errors: [makeError('runtime', '底层 React 组件崩溃')],
    }

    const sourceChangeDiagnosis = {
      rootCause: {
        category: 'source',
        description: '底层组件存在内存泄漏',
        requiresSourceChange: true,
        sourceChangeReason: 'Schema Patch 无法修复组件内部实现',
      },
      explanation: '需要修改组件源代码',
      confidence: 0.8,
    }

    const aiDebugger = new AIDebugger(makeLLM(sourceChangeDiagnosis))
    const diagnosis = await aiDebugger.diagnose({ context })

    expect(diagnosis.rootCause.requiresSourceChange).toBe(true)
    expect(diagnosis.rootCause.sourceChangeReason).toBeTruthy()
  })
})

describe('AIDebugger - 完整调试循环（诊断 → Patch → 验证 → 应用 → 重测）', () => {
  it('应修复事件引用错误并重测通过', async () => {
    const schema = makeSchema()
    const context: DebugContext = {
      schema,
      errors: [makeError('runtime', '事件引用了不存在的动作')],
    }

    const aiDebugger = new AIDebugger(makeLLM(diagnosisFixEvent))

    const result = await aiDebugger.debug(
      context,
      (patch) => {
        const applied = applyPatch(schema, patch)
        return applied.schema
      },
      async (newSchema) => {
        // 重测：检查是否还有错误
        const errors: DebugError[] = []
        for (const event of newSchema.events ?? []) {
          for (const actionId of event.actions) {
            if (!(newSchema.actions ?? []).some((a) => a.id === actionId)) {
              errors.push(makeError('runtime', `事件引用了不存在的动作: ${actionId}`))
            }
          }
        }
        return errors
      },
    )

    expect(result.success).toBe(true)
    expect(result.retestPassed).toBe(true)
    expect(result.schema!.events![0].actions).toEqual(['insert_customer'])
  })

  it('修复后仍有错误时返回失败', async () => {
    const schema = makeSchema()
    const context: DebugContext = {
      schema,
      errors: [makeError('runtime', '事件引用了不存在的动作')],
    }

    const aiDebugger = new AIDebugger(makeLLM(diagnosisFixEvent))

    const result = await aiDebugger.debug(
      context,
      (patch) => {
        const applied = applyPatch(schema, patch)
        return applied.schema
      },
      async () => {
        // 重测：模拟仍然失败
        return [makeError('runtime', '仍存在其他错误')]
      },
    )

    expect(result.success).toBe(false)
    expect(result.retestPassed).toBe(false)
    expect(result.error).toContain('仍有 1 个错误')
  })

  it('无 Patch 且需改源码时返回失败', async () => {
    const schema = makeSchema()
    const context: DebugContext = {
      schema,
      errors: [makeError('runtime', '底层崩溃')],
    }

    const noPatchDiagnosis = {
      rootCause: {
        category: 'source',
        description: '底层崩溃',
        requiresSourceChange: true,
        sourceChangeReason: '必须修改源码',
      },
      explanation: '需改源码',
      confidence: 0.7,
    }

    const aiDebugger = new AIDebugger(makeLLM(noPatchDiagnosis))
    const result = await aiDebugger.debug(
      context,
      () => undefined,
      async () => [],
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('需要修改源代码')
  })
})

describe('DebugHistory', () => {
  it('应记录调试历史', async () => {
    const history = new DebugHistory()
    const schema = makeSchema()

    const aiDebugger = new AIDebugger(makeLLM(diagnosisFixEvent))
    const context: DebugContext = {
      schema,
      errors: [makeError('runtime', '事件错误')],
    }

    const diagnosis = await aiDebugger.diagnose({ context })
    const result = await aiDebugger.debug(
      context,
      (patch) => applyPatch(schema, patch).schema,
      async () => [],
    )

    const record = history.record(context.errors, diagnosis, result, 'user1')

    expect(history.history).toHaveLength(1)
    expect(history.successCount).toBe(1)
    expect(history.failureCount).toBe(0)
    expect(record.id).toContain('debug_')
    expect(record.createdBy).toBe('user1')
    expect(history.get(record.id)).toBe(record)
  })

  it('应统计成功和失败', () => {
    const history = new DebugHistory()
    const schema = makeSchema()
    const diagnosis = { ...diagnosisFixEvent, patch: undefined } as never

    const successResult = { success: true, diagnosis, retestPassed: true, schema }
    const failResult = { success: false, diagnosis, retestPassed: false }

    history.record([makeError('runtime', 'e1')], diagnosis, successResult)
    history.record([makeError('runtime', 'e2')], diagnosis, failResult)

    expect(history.successCount).toBe(1)
    expect(history.failureCount).toBe(1)
    expect(history.history).toHaveLength(2)
  })
})
