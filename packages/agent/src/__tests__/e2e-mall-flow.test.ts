import { describe, it, expect } from 'vitest'
import { MultiAgentOrchestrator } from '../multi-agent/orchestrator'
import { validateBlueprint, blueprintToAppModel } from '../multi-agent'
import type { LLMClient } from '../types'
import type { Blueprint } from '@aikd/shared'

/** 模拟 LLM：返回合法的商城管理系统 Blueprint（模拟真实 LLM 生成） */
const mallBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '商城管理系统',
  appType: 'web',
  pages: [
    { id: 'page_home', path: '/', title: '商城首页', layout: 'web', pageType: 'home', description: '首页', tableId: 'products' },
    { id: 'page_products', path: '/products', title: '商品列表', layout: 'web', pageType: 'list', description: '商品列表', tableId: 'products' },
    { id: 'page_orders', path: '/orders', title: '订单管理', layout: 'web', pageType: 'list', description: '订单列表', tableId: 'orders' },
  ],
  pageComponents: [
    {
      pageId: 'page_home',
      components: [
        { id: 'c1', type: 'Heading', props: { text: '欢迎使用商城管理系统', level: 'h1' } },
        { id: 'c2', type: 'Dashboard', props: { title: '运营看板', cards: [{ label: '商品数', value: '100' }] } },
      ],
    },
    {
      pageId: 'page_products',
      components: [{ id: 'c3', type: 'Table', props: { dataSource: 'database.products', searchable: true, actions: ['detail', 'edit', 'delete'] } }],
    },
    {
      pageId: 'page_orders',
      components: [{ id: 'c4', type: 'Table', props: { dataSource: 'database.orders', searchable: true } }],
    },
  ],
  dataModel: {
    tables: [
      { id: 'products', name: '商品', fields: [{ name: 'name', type: 'string', required: true }, { name: 'price', type: 'number' }, { name: 'stock', type: 'number' }] },
      { id: 'orders', name: '订单', fields: [{ name: 'orderNo', type: 'string' }, { name: 'amount', type: 'number' }] },
    ],
  },
  apiDesign: {
    endpoints: [
      { id: 'list_products', method: 'GET', path: '/api/products', description: '商品列表', crud: 'list', tableId: 'products' },
      { id: 'list_orders', method: 'GET', path: '/api/orders', description: '订单列表', crud: 'list', tableId: 'orders' },
    ],
  },
  userFlow: {
    flows: [
      { id: 'flow1', name: '商品管理', description: '查看商品', steps: [{ id: 's1', description: '浏览商品列表', pageId: 'page_products', action: 'view' }] },
    ],
  },
}

const mockLLM: LLMClient = {
  async complete(messages) {
    const sys = messages[0]?.content ?? ''
    if (sys.includes('RequirementAgent')) {
      return JSON.stringify({
        summary: '商城管理系统，管理商品与订单',
        appType: 'web',
        appName: '商城管理系统',
        features: ['商品管理', '订单管理'],
        entities: [{ name: 'products', description: '商品' }, { name: 'orders', description: '订单' }],
      })
    }
    return JSON.stringify(mallBlueprint)
  },
  async stream(_m, _o, onChunk) {
    onChunk('')
    return ''
  },
}

describe('真实用户流程：创建一个简单的商城管理系统', () => {
  it('触发 Agent 流程并生成可运行代码', async () => {
    const orchestrator = new MultiAgentOrchestrator(mockLLM)
    const msgTypes: string[] = []

    const result = await orchestrator.run({
      prompt: '创建一个简单的商城管理系统',
      sessionId: 'e2e-mall',
      appId: 'app-mall',
      onMessage: (msg) => msgTypes.push(msg.type),
    })

    // 1. 成功触发 Agent 流程（Requirement/Blueprint/Coding/Review 都运行）
    const roles = result.runs.map((r) => r.role)
    expect(roles).toContain('requirement')
    expect(roles).toContain('blueprint')
    expect(roles).toContain('coding')
    expect(roles).toContain('review')

    // 2. Requirement 分析需求
    expect(result.appModel.name).toBe('商城管理系统')

    // 3. Blueprint 生成合法蓝图
    const blueprintValid = validateBlueprint(mallBlueprint)
    expect(blueprintValid.success).toBe(true)

    // 4. Coding 生成对应代码（含页面文件、api、package.json 等）
    expect(result.files.length).toBeGreaterThan(0)
    expect(result.files.some((f) => f.path === 'package.json')).toBe(true)
    expect(result.files.some((f) => f.path === 'src/App.tsx')).toBe(true)
    expect(result.files.some((f) => f.path === 'src/api.ts')).toBe(true)
    // 页面文件
    expect(result.files.some((f) => f.path === 'src/pages/page_home.tsx')).toBe(true)
    expect(result.files.some((f) => f.path === 'src/pages/page_products.tsx')).toBe(true)
    expect(result.files.some((f) => f.path === 'src/pages/page_orders.tsx')).toBe(true)

    // 5. 生成结果可运行（Review 通过）
    expect(result.passed).toBe(true)

    // 6. 消息通信日志（JSON 消息协议）
    expect(result.messages.length).toBeGreaterThan(0)
    // 包含各 Agent 的 execute/done 消息
    expect(msgTypes).toContain('requirement.execute')
    expect(msgTypes).toContain('blueprint.execute')
    expect(msgTypes).toContain('coding.execute')
    expect(msgTypes).toContain('review.execute')
  })

  it('Blueprint → AppModel 转换合法且包含全部页面', () => {
    const appModel = blueprintToAppModel(mallBlueprint, 'app-mall')
    expect(appModel.schema.pages).toHaveLength(3)
    expect(appModel.schema.routes.some((r) => r.path === '/')).toBe(true)
    expect(appModel.schema.dataSources.some((ds) => ds.id === 'products')).toBe(true)
  })
})
