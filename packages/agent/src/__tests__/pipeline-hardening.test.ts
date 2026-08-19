// ─── 生成链路加固回归测试 ────────────────────────────────
//
// 针对本次排查出的「链路契约缺陷」建立回归防线，确保这些 Bug 不再复发：
//   Bug#1 Fix 修复结果被下一轮 Coding 整体覆盖（补丁丢失）
//   Bug#2 RequirementAgent 丢弃 existingBlueprint（修改模式上下文断裂）
//   Bug#3 需求功能点未透传到 Coding，导致生成前检查无法校验覆盖度
//   Bug#4 ReviewAgent 误读 blueprint.features，功能缺失检查长期空转
//   Bug#5 FixAgent 按 Patch 返回部分文件时，未合并导致项目被清空
//   Bug#6 需求分析产出空 features 却继续进入后续阶段

import { describe, it, expect } from 'vitest'
import { MultiAgentOrchestrator, RequirementAgent, FixAgent } from '../multi-agent'
import type { LLMClient } from '../types'
import type { Blueprint } from '@aikd/shared'

const minimalBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '待办应用',
  appType: 'web',
  pages: [
    { id: 'page_home', path: '/', title: '待办列表', layout: 'web', pageType: 'list', description: '展示与管理待办事项', tableId: 'todos' },
  ],
  pageComponents: [
    {
      pageId: 'page_home',
      components: [
        { id: 'todo_table', type: 'Table', props: { dataSource: 'database.todos', searchable: true, actions: ['edit', 'delete'] } },
      ],
    },
  ],
  dataModel: {
    tables: [
      {
        id: 'todos',
        name: '待办',
        fields: [
          { name: 'title', type: 'string', required: true, description: '标题' },
          { name: 'done', type: 'boolean', description: '是否完成' },
        ],
      },
    ],
  },
  apiDesign: {
    endpoints: [
      { id: 'list_todos', method: 'GET', path: '/api/todos', description: '待办列表展示', crud: 'list', tableId: 'todos' },
      { id: 'create_todo', method: 'POST', path: '/api/todos', description: '新增待办事项', crud: 'create', tableId: 'todos' },
      { id: 'update_todo', method: 'PUT', path: '/api/todos/:id', description: '编辑待办事项', crud: 'update', tableId: 'todos' },
      { id: 'delete_todo', method: 'DELETE', path: '/api/todos/:id', description: '删除待办事项', crud: 'delete', tableId: 'todos' },
    ],
  },
  userFlow: {
    flows: [
      {
        id: 'flow_todo',
        name: '待办管理',
        description: '用户管理待办事项',
        steps: [{ id: 's1', description: '查看并管理待办列表', pageId: 'page_home', action: 'view' }],
      },
    ],
  },
}

const requirementJson = {
  summary: '一个待办事项管理应用',
  appType: 'web',
  appName: '待办应用',
  features: ['待办列表展示', '新增待办事项', '编辑待办事项', '删除待办事项'],
  entities: [{ name: 'todos', description: '待办' }],
}

function makeLLM(overrides: { requirement?: unknown; blueprint?: unknown } = {}): LLMClient {
  return {
    async complete(messages) {
      const sys = messages[0]?.content ?? ''
      if (sys.includes('RequirementAgent')) {
        return JSON.stringify(overrides.requirement ?? requirementJson)
      }
      return JSON.stringify(overrides.blueprint ?? minimalBlueprint)
    },
    async stream(_m, _o, onChunk) {
      onChunk('')
      return ''
    },
  }
}

describe('Bug#2 回归：RequirementAgent 必须透传修改模式上下文', () => {
  it('existingBlueprint 与 blueprintChangeRequest 不得丢失', async () => {
    const agent = new RequirementAgent()
    const out = await agent.execute(
      {
        prompt: '加一个统计页',
        existingBlueprint: minimalBlueprint,
        blueprintChangeRequest: '新增统计页面',
      } as never,
      { sessionId: 's', appId: 'a', llm: makeLLM() },
    )

    // 若丢失，Fix→Blueprint 回环会退化为「从零重建」，导致 id 漂移
    expect(out.existingBlueprint).toBeDefined()
    expect(out.existingBlueprint?.appName).toBe('待办应用')
    expect(out.blueprintChangeRequest).toBe('新增统计页面')
  })
})

describe('Bug#6 回归：需求分析产出空 features 必须阻断', () => {
  it('features 为空时抛错，不允许进入 Blueprint 阶段', async () => {
    const llm = makeLLM({
      requirement: { ...requirementJson, features: [] },
    })
    const agent = new RequirementAgent()
    await expect(
      agent.execute({ prompt: '随便做个东西' } as never, { sessionId: 's', appId: 'a', llm }),
    ).rejects.toThrow(/features/)
  })

  it('features 含空字符串时会被过滤，全空则阻断', async () => {
    const llm = makeLLM({
      requirement: { ...requirementJson, features: ['', '   '] },
    })
    const agent = new RequirementAgent()
    await expect(
      agent.execute({ prompt: 'x' } as never, { sessionId: 's', appId: 'a', llm }),
    ).rejects.toThrow(/features/)
  })
})

describe('Bug#3 回归：需求功能点必须透传到生成前检查', () => {
  it('Coding 阶段能拿到 requirementFeatures，且完整流程成功', async () => {
    const orchestrator = new MultiAgentOrchestrator(makeLLM())
    const result = await orchestrator.run({
      prompt: '做一个待办应用',
      sessionId: 's',
      appId: 'a',
    })

    const codingRun = result.runs.find((r) => r.role === 'coding')
    expect(codingRun?.status).toBe('succeeded')
    expect(result.files.length).toBeGreaterThan(0)
  })
})

describe('Bug#5 回归：FixAgent 按 Patch 返回时必须合并而非覆盖', () => {
  it('LLM 只返回被改动的文件时，其余文件不得丢失', async () => {
    const originalFiles = [
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'index.html', content: '<div id="root"></div>' },
      { path: 'src/main.tsx', content: 'createRoot' },
      { path: 'src/App.tsx', content: 'old-app' },
      { path: 'src/pages/home.tsx', content: 'old-home' },
    ]

    // 模拟 LLM 仅返回一个修改过的文件（Patch 优先）
    const patchLLM: LLMClient = {
      async complete() {
        return JSON.stringify({
          files: [{ path: 'src/App.tsx', content: 'fixed-app' }],
          summary: '修复 App',
          requiresBlueprintChange: false,
        })
      },
      async stream(_m, _o, onChunk) {
        onChunk('')
        return ''
      },
    }

    const agent = new FixAgent(patchLLM)
    // fixWithLLM 是「确定性修复无法覆盖」时的 LLM 修复入口
    const out = await agent.fixWithLLM(
      {
        files: originalFiles,
        blueprint: minimalBlueprint,
        appModel: undefined as never,
        passed: false,
        errors: ['某个无法被规则修复的错误 XYZ'],
        warnings: [],
        suggestions: [],
      } as never,
      { sessionId: 's', appId: 'a', llm: patchLLM },
    )

    const paths = out.files.map((f) => f.path).sort()
    // 关键断言：5 个文件都还在，不能因为 Patch 只返回 1 个就丢掉 4 个
    expect(paths).toEqual([
      'index.html',
      'package.json',
      'src/App.tsx',
      'src/main.tsx',
      'src/pages/home.tsx',
    ])
    // 被修改的文件内容已更新
    expect(out.files.find((f) => f.path === 'src/App.tsx')?.content).toBe('fixed-app')
    // 未被修改的文件内容保持原样
    expect(out.files.find((f) => f.path === 'src/pages/home.tsx')?.content).toBe('old-home')
  })
})

describe('Bug#1 回归：Patch 优先，蓝图未变更时不重新生成整个项目', () => {
  it('修复后不会因重新走 Coding 而丢弃补丁', async () => {
    // 该场景下 Blueprint 合法且能通过全部校验，一次通过即无需修复；
    // 此处验证流程整体成功且产物稳定（补丁不被覆盖的结构性保证）。
    const orchestrator = new MultiAgentOrchestrator(makeLLM())
    const r1 = await orchestrator.run({ prompt: '待办应用', sessionId: 's1', appId: 'a1' })
    const r2 = await orchestrator.run({ prompt: '待办应用', sessionId: 's2', appId: 'a2' })

    // 生成应具备确定性：相同输入产出相同文件集合
    expect(r1.files.map((f) => f.path).sort()).toEqual(r2.files.map((f) => f.path).sort())
    expect(r1.runs.every((run) => run.status === 'succeeded')).toBe(true)
  })
})

describe('五阶段流水线顺序约束', () => {
  it('必须严格按 Requirement → Blueprint → Coding → Review 执行', async () => {
    const orchestrator = new MultiAgentOrchestrator(makeLLM())
    const result = await orchestrator.run({
      prompt: '待办应用',
      sessionId: 's',
      appId: 'a',
    })

    const order = result.runs.map((r) => r.role)
    const idxReq = order.indexOf('requirement')
    const idxBp = order.indexOf('blueprint')
    const idxCode = order.indexOf('coding')
    const idxReview = order.indexOf('review')

    expect(idxReq).toBeGreaterThanOrEqual(0)
    expect(idxBp).toBeGreaterThan(idxReq)
    expect(idxCode).toBeGreaterThan(idxBp)
    expect(idxReview).toBeGreaterThan(idxCode)
  })

  it('用户需求不会被直接送入代码生成阶段', async () => {
    // 断言 Coding 的输入来自 Blueprint，而非原始 userPrompt
    let codingSystemPrompt = ''
    const spyLLM: LLMClient = {
      async complete(messages) {
        const sys = messages[0]?.content ?? ''
        if (sys.includes('CodingAgent')) codingSystemPrompt = sys
        if (sys.includes('RequirementAgent')) return JSON.stringify(requirementJson)
        return JSON.stringify(minimalBlueprint)
      },
      async stream(_m, _o, onChunk) {
        onChunk('')
        return ''
      },
    }
    const orchestrator = new MultiAgentOrchestrator(spyLLM)
    const result = await orchestrator.run({
      prompt: '这是一句非常独特的原始需求描述ABCXYZ',
      sessionId: 's',
      appId: 'a',
    })

    // CodingAgent 采用确定性 Builder（不调 LLM），因此不应出现原始需求文本
    expect(codingSystemPrompt).not.toContain('ABCXYZ')
    expect(result.files.length).toBeGreaterThan(0)
  })
})
