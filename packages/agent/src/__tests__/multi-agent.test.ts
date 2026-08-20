import { describe, it, expect } from 'vitest'
import { MultiAgentOrchestrator, AgentManager, MessageBus, validateBlueprint } from '../multi-agent'
import type { LLMClient, LLMMessage } from '../types'
import type { Blueprint } from '@aikd/shared'

/** 合法的商城应用 Blueprint（用于 mock LLM 返回） */
const mallBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '在线商城',
  appType: 'web',
  pages: [
    {
      id: 'page_home',
      path: '/',
      title: '商城首页',
      layout: 'web',
      pageType: 'home',
      description: '展示商品推荐与分类入口',
      tableId: 'products',
    },
    {
      id: 'page_products',
      path: '/products',
      title: '商品列表',
      layout: 'web',
      pageType: 'list',
      description: '商品列表，支持搜索与分类筛选',
      tableId: 'products',
    },
    {
      id: 'page_product_detail',
      path: '/products/:id',
      title: '商品详情',
      layout: 'web',
      pageType: 'detail',
      description: '展示商品详细信息',
      tableId: 'products',
    },
  ],
  pageComponents: [
    {
      pageId: 'page_home',
      components: [
        { id: 'home_heading', type: 'Heading', props: { text: '欢迎光临在线商城', level: 'h1' } },
        { id: 'home_list', type: 'List', props: { items: ['新品推荐', '热销爆款', '限时特惠'] } },
      ],
    },
    {
      pageId: 'page_products',
      components: [
        { id: 'prod_table', type: 'Table', props: { dataSource: 'database.products', searchable: true, actions: ['detail', 'delete'] } },
      ],
    },
    {
      pageId: 'page_product_detail',
      components: [
        { id: 'detail', type: 'Detail', props: { dataSource: 'database.products', paramId: ':id' } },
      ],
    },
  ],
  dataModel: {
    tables: [
      {
        id: 'products',
        name: '商品',
        fields: [
          { name: 'name', type: 'string', required: true, description: '商品名称' },
          { name: 'price', type: 'number', description: '价格' },
          { name: 'stock', type: 'number', description: '库存' },
          { name: 'category', type: 'enum', enumOptions: ['electronics', 'clothing', 'food'], description: '分类' },
        ],
      },
    ],
  },
  apiDesign: {
    endpoints: [
      { id: 'list_products', method: 'GET', path: '/api/products', description: '商品列表', crud: 'list', tableId: 'products' },
      { id: 'get_product', method: 'GET', path: '/api/products/:id', description: '商品详情', crud: 'get', tableId: 'products' },
      { id: 'create_product', method: 'POST', path: '/api/products', description: '新增商品', crud: 'create', tableId: 'products' },
      { id: 'delete_product', method: 'DELETE', path: '/api/products/:id', description: '删除商品', crud: 'delete', tableId: 'products' },
    ],
  },
  userFlow: {
    flows: [
      {
        id: 'flow_browse',
        name: '浏览购买',
        description: '用户从首页进入商品列表，查看详情',
        steps: [
          { id: 's1', description: '浏览首页', pageId: 'page_home', action: 'view' },
          { id: 's2', description: '查看商品列表', pageId: 'page_products', action: 'search' },
          { id: 's3', description: '查看商品详情', pageId: 'page_product_detail', action: 'navigate', targetPageId: 'page_product_detail' },
        ],
      },
    ],
  },
}

/** 构造一个返回合法 Blueprint 的 mock LLM */
function makeMockLLM(): { llm: LLMClient; calls: LLMMessage[][] } {
  const calls: LLMMessage[][] = []

  const llm: LLMClient = {
    async complete(messages) {
      calls.push(messages)
      const sys = messages[0]?.content ?? ''
      // RequirementAgent → 需求分析
      if (sys.includes('RequirementAgent')) {
        return JSON.stringify({
          summary: '在线商城，支持商品浏览、搜索与详情查看',
          appType: 'web',
          appName: '在线商城',
          features: ['商品列表', '商品详情', '分类筛选'],
          entities: [{ name: 'products', description: '商品' }],
        })
      }
      // BlueprintGenerator → 返回合法 Blueprint
      return JSON.stringify(mallBlueprint)
    },
    async stream(_m, _o, onChunk) {
      onChunk('')
      return ''
    },
  }

  return { llm, calls }
}

describe('BlueprintValidator', () => {
  it('商城 Blueprint 通过校验', () => {
    const result = validateBlueprint(mallBlueprint)
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('缺应用名称/缺首页时校验失败', () => {
    const bad = validateBlueprint({
      ...mallBlueprint,
      appName: '',
      pages: mallBlueprint.pages.filter((p) => p.path !== '/'),
    })
    expect(bad.success).toBe(false)
    expect(bad.errors.some((e) => e.includes('appName'))).toBe(true)
    expect(bad.errors.some((e) => e.includes('首页'))).toBe(true)
  })

  it('组件引用未注册类型时校验失败', () => {
    const bad = validateBlueprint({
      ...mallBlueprint,
      pageComponents: [
        ...mallBlueprint.pageComponents.map((pc) =>
          pc.pageId === 'page_products'
            ? {
                ...pc,
                components: [{ id: 'x', type: 'NotExistComponent', props: {} }],
              }
            : pc,
        ),
      ],
    })
    expect(bad.success).toBe(false)
    expect(bad.errors.some((e) => e.includes('未注册的组件类型'))).toBe(true)
  })
})

describe('MultiAgentOrchestrator', () => {
  it('完整流水线：Requirement → Blueprint → Coding → Review 通过', async () => {
    const { llm } = makeMockLLM()
    const orchestrator = new MultiAgentOrchestrator(llm)

    const messages: string[] = []
    const result = await orchestrator.run({
      prompt: '帮我做一个在线商城',
      sessionId: 'test-session',
      appId: 'test-app',
      onMessage: (msg) => messages.push(msg.type),
    })

    // 生成了代码文件
    expect(result.files.length).toBeGreaterThan(0)
    expect(result.appModel.name).toBe('在线商城')
    // 全部 5 个 Agent 都运行了
    const roles = result.runs.map((r) => r.role)
    expect(roles).toContain('requirement')
    expect(roles).toContain('blueprint')
    expect(roles).toContain('coding')
    expect(roles).toContain('review')
    // 有消息日志
    expect(result.messages.length).toBeGreaterThan(0)
    // 通过 onMessage 收到进度
    expect(messages.length).toBeGreaterThan(0)
  })

  it('AgentManager 注册/查找', () => {
    const bus = new MessageBus()
    const manager = new AgentManager(bus)
    expect(manager.listRoles()).toEqual([])

    const { llm } = makeMockLLM()
    const orchestrator = new MultiAgentOrchestrator(llm)
    expect(orchestrator.getManager().listRoles().length).toBe(7)
    expect(orchestrator.getManager().get('coding')).toBeDefined()
    expect(orchestrator.getManager().get('fix')).toBeDefined()
    expect(orchestrator.getManager().get('product-planning')).toBeDefined()
    expect(orchestrator.getManager().get('enhancement')).toBeDefined()
  })
})
