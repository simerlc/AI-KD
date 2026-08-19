// ─── AI 应用生成链路 端到端测试 ───────────────────────────
//
// 覆盖需求文档第七节的三个测试案例：
//   测试1（简单）：个人博客网站
//   测试2（中等）：商城后台管理系统
//   测试3（复杂）：企业 CRM 系统
//
// 每个案例验证 5 件事：
//   1. 需求解析是否正确
//   2. Blueprint 是否完整（结构合法 + 需求覆盖）
//   3. 代码生成是否成功
//   4. 项目是否具备可运行结构（入口/依赖/路由齐全）
//   5. 是否存在隐藏 Bug（import 断裂 / 组件缺失 / 字段不一致）

import { describe, it, expect } from 'vitest'
import {
  MultiAgentOrchestrator,
  validateBlueprint,
  validateApplication,
  checkIntegrity,
} from '../multi-agent'
import type { LLMClient } from '../types'
import type { Blueprint } from '@aikd/shared'

// ─── 测试夹具：三个复杂度递增的 Blueprint ──────────────────

/** 测试1：个人博客（简单：3 页 / 1 表） */
const blogBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '个人博客',
  appType: 'web',
  pages: [
    { id: 'page_home', path: '/', title: '博客首页', layout: 'web', pageType: 'home', description: '展示最新文章列表', tableId: 'posts' },
    { id: 'page_posts', path: '/posts', title: '文章列表', layout: 'web', pageType: 'list', description: '全部文章，支持搜索', tableId: 'posts' },
    { id: 'page_post_detail', path: '/posts/:id', title: '文章详情', layout: 'web', pageType: 'detail', description: '阅读文章正文', tableId: 'posts' },
  ],
  pageComponents: [
    {
      pageId: 'page_home',
      components: [
        { id: 'blog_title', type: 'Heading', props: { text: '我的个人博客', level: 'h1' } },
        { id: 'blog_recent', type: 'Table', props: { dataSource: 'database.posts', searchable: false, actions: ['detail'] } },
      ],
    },
    {
      pageId: 'page_posts',
      components: [
        { id: 'posts_table', type: 'Table', props: { dataSource: 'database.posts', searchable: true, actions: ['detail', 'delete'] } },
      ],
    },
    {
      pageId: 'page_post_detail',
      components: [
        { id: 'post_detail', type: 'Detail', props: { dataSource: 'database.posts', paramId: ':id' } },
      ],
    },
  ],
  dataModel: {
    tables: [
      {
        id: 'posts',
        name: '文章',
        fields: [
          { name: 'title', type: 'string', required: true, description: '标题' },
          { name: 'content', type: 'string', description: '正文' },
          { name: 'author', type: 'string', description: '作者' },
          { name: 'publishedAt', type: 'string', description: '发布时间' },
        ],
      },
    ],
  },
  apiDesign: {
    endpoints: [
      { id: 'list_posts', method: 'GET', path: '/api/posts', description: '文章列表', crud: 'list', tableId: 'posts' },
      { id: 'get_post', method: 'GET', path: '/api/posts/:id', description: '文章详情', crud: 'get', tableId: 'posts' },
      { id: 'create_post', method: 'POST', path: '/api/posts', description: '发布文章', crud: 'create', tableId: 'posts' },
      { id: 'delete_post', method: 'DELETE', path: '/api/posts/:id', description: '删除文章', crud: 'delete', tableId: 'posts' },
    ],
  },
  userFlow: {
    flows: [
      {
        id: 'flow_read',
        name: '阅读文章',
        description: '访客浏览文章列表并阅读详情',
        steps: [
          { id: 's1', description: '进入博客首页查看最新文章', pageId: 'page_home', action: 'view' },
          { id: 's2', description: '搜索并浏览文章列表', pageId: 'page_posts', action: 'search' },
          { id: 's3', description: '阅读文章详情', pageId: 'page_post_detail', action: 'navigate', targetPageId: 'page_post_detail' },
        ],
      },
    ],
  },
}

/** 测试2：商城后台管理系统（中等：5 页 / 3 表） */
const mallAdminBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '商城后台管理系统',
  appType: 'web',
  pages: [
    { id: 'page_dashboard', path: '/', title: '数据概览', layout: 'web', pageType: 'home', description: '销售数据统计概览' },
    { id: 'page_products', path: '/products', title: '商品管理', layout: 'web', pageType: 'list', description: '商品列表管理，支持搜索与增删改', tableId: 'products' },
    { id: 'page_product_form', path: '/products/edit/:id', title: '商品编辑', layout: 'web', pageType: 'form', description: '新增或编辑商品信息', tableId: 'products' },
    { id: 'page_orders', path: '/orders', title: '订单管理', layout: 'web', pageType: 'list', description: '订单列表与状态管理', tableId: 'orders' },
    { id: 'page_users', path: '/users', title: '用户管理', layout: 'web', pageType: 'list', description: '会员用户管理', tableId: 'users' },
  ],
  pageComponents: [
    {
      pageId: 'page_dashboard',
      components: [
        { id: 'dash_title', type: 'Heading', props: { text: '商城数据概览', level: 'h1' } },
        { id: 'dash_stats', type: 'List', props: { items: ['今日订单 128 笔', '今日销售额 ¥45,600', '待发货 32 笔'] } },
      ],
    },
    {
      pageId: 'page_products',
      components: [
        { id: 'prod_table', type: 'Table', props: { dataSource: 'database.products', searchable: true, actions: ['edit', 'delete'] } },
      ],
    },
    {
      pageId: 'page_product_form',
      components: [
        { id: 'prod_form', type: 'Form', props: { dataSource: 'database.products', paramId: ':id' } },
      ],
    },
    {
      pageId: 'page_orders',
      components: [
        { id: 'order_table', type: 'Table', props: { dataSource: 'database.orders', searchable: true, actions: ['detail'] } },
      ],
    },
    {
      pageId: 'page_users',
      components: [
        { id: 'user_table', type: 'Table', props: { dataSource: 'database.users', searchable: true, actions: ['detail'] } },
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
          { name: 'price', type: 'number', description: '售价' },
          { name: 'stock', type: 'number', description: '库存' },
          { name: 'status', type: 'enum', enumOptions: ['on', 'off'], description: '上下架状态' },
        ],
      },
      {
        id: 'orders',
        name: '订单',
        fields: [
          { name: 'orderNo', type: 'string', required: true, description: '订单号' },
          { name: 'amount', type: 'number', description: '订单金额' },
          { name: 'status', type: 'enum', enumOptions: ['pending', 'paid', 'shipped', 'done'], description: '订单状态' },
        ],
      },
      {
        id: 'users',
        name: '会员',
        fields: [
          { name: 'nickname', type: 'string', required: true, description: '昵称' },
          { name: 'phone', type: 'string', description: '手机号' },
          { name: 'level', type: 'enum', enumOptions: ['normal', 'vip'], description: '会员等级' },
        ],
      },
    ],
  },
  apiDesign: {
    endpoints: [
      { id: 'list_products', method: 'GET', path: '/api/products', description: '商品列表', crud: 'list', tableId: 'products' },
      { id: 'create_product', method: 'POST', path: '/api/products', description: '新增商品', crud: 'create', tableId: 'products' },
      { id: 'update_product', method: 'PUT', path: '/api/products/:id', description: '编辑商品', crud: 'update', tableId: 'products' },
      { id: 'delete_product', method: 'DELETE', path: '/api/products/:id', description: '删除商品', crud: 'delete', tableId: 'products' },
      { id: 'list_orders', method: 'GET', path: '/api/orders', description: '订单列表', crud: 'list', tableId: 'orders' },
      { id: 'update_order', method: 'PUT', path: '/api/orders/:id', description: '更新订单状态', crud: 'update', tableId: 'orders' },
      { id: 'list_users', method: 'GET', path: '/api/users', description: '用户列表管理', crud: 'list', tableId: 'users' },
    ],
  },
  userFlow: {
    flows: [
      {
        id: 'flow_manage_product',
        name: '商品管理',
        description: '管理员管理商品的增删改查',
        steps: [
          { id: 's1', description: '查看数据概览统计', pageId: 'page_dashboard', action: 'view' },
          { id: 's2', description: '搜索商品列表', pageId: 'page_products', action: 'search' },
          { id: 's3', description: '新增或编辑商品', pageId: 'page_product_form', action: 'submit' },
        ],
      },
      {
        id: 'flow_manage_order',
        name: '订单管理',
        description: '管理员处理订单状态与用户管理',
        steps: [
          { id: 's4', description: '查看订单列表并更新状态', pageId: 'page_orders', action: 'view' },
          { id: 's5', description: '管理会员用户', pageId: 'page_users', action: 'view' },
        ],
      },
    ],
  },
}

/** 测试3：企业 CRM 系统（复杂：7 页 / 4 表） */
const crmBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '企业CRM系统',
  appType: 'web',
  pages: [
    { id: 'page_dashboard', path: '/', title: '工作台', layout: 'web', pageType: 'home', description: '销售业绩与待办概览' },
    { id: 'page_customers', path: '/customers', title: '客户管理', layout: 'web', pageType: 'list', description: '客户列表，支持搜索与分级', tableId: 'customers' },
    { id: 'page_customer_detail', path: '/customers/:id', title: '客户详情', layout: 'web', pageType: 'detail', description: '客户完整档案与跟进记录', tableId: 'customers' },
    { id: 'page_customer_form', path: '/customers/edit/:id', title: '客户编辑', layout: 'web', pageType: 'form', description: '新增或编辑客户资料', tableId: 'customers' },
    { id: 'page_leads', path: '/leads', title: '销售线索', layout: 'web', pageType: 'list', description: '线索池管理与分配', tableId: 'leads' },
    { id: 'page_opportunities', path: '/opportunities', title: '商机管理', layout: 'web', pageType: 'list', description: '商机漏斗与阶段推进', tableId: 'opportunities' },
    { id: 'page_contracts', path: '/contracts', title: '合同管理', layout: 'web', pageType: 'list', description: '合同列表与回款跟踪', tableId: 'contracts' },
  ],
  pageComponents: [
    {
      pageId: 'page_dashboard',
      components: [
        { id: 'crm_title', type: 'Heading', props: { text: '销售工作台', level: 'h1' } },
        { id: 'crm_stats', type: 'List', props: { items: ['本月新增客户 56 家', '进行中商机 23 个', '本月回款 ¥1,280,000'] } },
      ],
    },
    {
      pageId: 'page_customers',
      components: [
        { id: 'cust_table', type: 'Table', props: { dataSource: 'database.customers', searchable: true, actions: ['detail', 'edit', 'delete'] } },
      ],
    },
    {
      pageId: 'page_customer_detail',
      components: [
        { id: 'cust_detail', type: 'Detail', props: { dataSource: 'database.customers', paramId: ':id' } },
      ],
    },
    {
      pageId: 'page_customer_form',
      components: [
        { id: 'cust_form', type: 'Form', props: { dataSource: 'database.customers', paramId: ':id' } },
      ],
    },
    {
      pageId: 'page_leads',
      components: [
        { id: 'lead_table', type: 'Table', props: { dataSource: 'database.leads', searchable: true, actions: ['edit', 'delete'] } },
      ],
    },
    {
      pageId: 'page_opportunities',
      components: [
        { id: 'oppo_table', type: 'Table', props: { dataSource: 'database.opportunities', searchable: true, actions: ['edit'] } },
      ],
    },
    {
      pageId: 'page_contracts',
      components: [
        { id: 'contract_table', type: 'Table', props: { dataSource: 'database.contracts', searchable: true, actions: ['detail'] } },
      ],
    },
  ],
  dataModel: {
    tables: [
      {
        id: 'customers',
        name: '客户',
        fields: [
          { name: 'name', type: 'string', required: true, description: '客户名称' },
          { name: 'industry', type: 'string', description: '所属行业' },
          { name: 'contact', type: 'string', description: '联系人' },
          { name: 'phone', type: 'string', description: '联系电话' },
          { name: 'level', type: 'enum', enumOptions: ['A', 'B', 'C'], description: '客户分级' },
        ],
      },
      {
        id: 'leads',
        name: '销售线索',
        fields: [
          { name: 'source', type: 'string', required: true, description: '线索来源' },
          { name: 'contact', type: 'string', description: '联系人' },
          { name: 'status', type: 'enum', enumOptions: ['new', 'following', 'converted', 'invalid'], description: '线索状态' },
        ],
      },
      {
        id: 'opportunities',
        name: '商机',
        fields: [
          { name: 'title', type: 'string', required: true, description: '商机名称' },
          { name: 'amount', type: 'number', description: '预计金额' },
          { name: 'stage', type: 'enum', enumOptions: ['initial', 'proposal', 'negotiation', 'won', 'lost'], description: '销售阶段' },
        ],
      },
      {
        id: 'contracts',
        name: '合同',
        fields: [
          { name: 'contractNo', type: 'string', required: true, description: '合同编号' },
          { name: 'amount', type: 'number', description: '合同金额' },
          { name: 'receivedAmount', type: 'number', description: '已回款金额' },
          { name: 'signedAt', type: 'string', description: '签约日期' },
        ],
      },
    ],
  },
  apiDesign: {
    endpoints: [
      { id: 'list_customers', method: 'GET', path: '/api/customers', description: '客户列表', crud: 'list', tableId: 'customers' },
      { id: 'get_customer', method: 'GET', path: '/api/customers/:id', description: '客户详情', crud: 'get', tableId: 'customers' },
      { id: 'create_customer', method: 'POST', path: '/api/customers', description: '新增客户', crud: 'create', tableId: 'customers' },
      { id: 'update_customer', method: 'PUT', path: '/api/customers/:id', description: '编辑客户', crud: 'update', tableId: 'customers' },
      { id: 'delete_customer', method: 'DELETE', path: '/api/customers/:id', description: '删除客户', crud: 'delete', tableId: 'customers' },
      { id: 'list_leads', method: 'GET', path: '/api/leads', description: '销售线索列表', crud: 'list', tableId: 'leads' },
      { id: 'update_lead', method: 'PUT', path: '/api/leads/:id', description: '更新线索状态', crud: 'update', tableId: 'leads' },
      { id: 'list_oppo', method: 'GET', path: '/api/opportunities', description: '商机列表与阶段推进', crud: 'list', tableId: 'opportunities' },
      { id: 'update_oppo', method: 'PUT', path: '/api/opportunities/:id', description: '更新商机阶段', crud: 'update', tableId: 'opportunities' },
      { id: 'list_contracts', method: 'GET', path: '/api/contracts', description: '合同管理列表与回款跟踪', crud: 'list', tableId: 'contracts' },
    ],
  },
  userFlow: {
    flows: [
      {
        id: 'flow_customer',
        name: '客户全生命周期',
        description: '从线索到客户到商机到合同的完整销售流程',
        steps: [
          { id: 's1', description: '查看工作台业绩概览', pageId: 'page_dashboard', action: 'view' },
          { id: 's2', description: '管理销售线索并转化', pageId: 'page_leads', action: 'submit' },
          { id: 's3', description: '维护客户资料与分级', pageId: 'page_customers', action: 'search' },
          { id: 's4', description: '查看客户详情与跟进记录', pageId: 'page_customer_detail', action: 'view' },
          { id: 's5', description: '新增编辑客户档案', pageId: 'page_customer_form', action: 'submit' },
          { id: 's6', description: '推进商机阶段', pageId: 'page_opportunities', action: 'submit' },
          { id: 's7', description: '管理合同与回款', pageId: 'page_contracts', action: 'view' },
        ],
      },
    ],
  },
}

// ─── 测试用例定义 ────────────────────────────────────────

interface Scenario {
  label: string
  prompt: string
  blueprint: Blueprint
  requirement: {
    summary: string
    appType: string
    appName: string
    features: string[]
    entities: Array<{ name: string; description: string }>
  }
  /** 期望的最少页面数 */
  minPages: number
  /** 期望的最少数据表数 */
  minTables: number
}

const scenarios: Scenario[] = [
  {
    label: '测试1｜简单应用：个人博客网站',
    prompt: '生成一个个人博客网站',
    blueprint: blogBlueprint,
    requirement: {
      summary: '个人博客网站，支持文章发布、列表浏览与详情阅读',
      appType: 'web',
      appName: '个人博客',
      features: ['文章列表展示', '文章详情阅读', '文章搜索', '发布文章', '删除文章'],
      entities: [{ name: 'posts', description: '文章' }],
    },
    minPages: 3,
    minTables: 1,
  },
  {
    label: '测试2｜中等复杂应用：商城后台管理系统',
    prompt: '生成一个商城后台管理系统',
    blueprint: mallAdminBlueprint,
    requirement: {
      summary: '商城后台管理系统，支持商品、订单、用户管理与数据概览',
      appType: 'web',
      appName: '商城后台管理系统',
      features: [
        '数据概览统计',
        '商品管理',
        '商品编辑',
        '订单管理',
        '用户管理',
        '商品搜索',
      ],
      entities: [
        { name: 'products', description: '商品' },
        { name: 'orders', description: '订单' },
        { name: 'users', description: '会员用户' },
      ],
    },
    minPages: 5,
    minTables: 3,
  },
  {
    label: '测试3｜复杂应用：企业CRM系统',
    prompt: '生成一个企业CRM系统',
    blueprint: crmBlueprint,
    requirement: {
      summary: '企业 CRM 系统，覆盖线索、客户、商机、合同全流程',
      appType: 'web',
      appName: '企业CRM系统',
      features: [
        '客户管理',
        '客户详情',
        '客户编辑',
        '销售线索管理',
        '商机管理',
        '合同管理',
        '业绩概览',
      ],
      entities: [
        { name: 'customers', description: '客户' },
        { name: 'leads', description: '销售线索' },
        { name: 'opportunities', description: '商机' },
        { name: 'contracts', description: '合同' },
      ],
    },
    minPages: 7,
    minTables: 4,
  },
]

/** 构造按场景返回的 mock LLM */
function makeScenarioLLM(scenario: Scenario): LLMClient {
  return {
    async complete(messages) {
      const sys = messages[0]?.content ?? ''
      if (sys.includes('RequirementAgent')) {
        return JSON.stringify(scenario.requirement)
      }
      return JSON.stringify(scenario.blueprint)
    },
    async stream(_m, _o, onChunk) {
      onChunk('')
      return ''
    },
  }
}

// ─── 三大测试案例 ────────────────────────────────────────

describe('AI 应用生成链路 · 三大测试案例', () => {
  for (const scenario of scenarios) {
    describe(scenario.label, () => {
      it('阶段1｜需求解析正确：产出结构化需求且功能点非空', async () => {
        const llm = makeScenarioLLM(scenario)
        const orchestrator = new MultiAgentOrchestrator(llm)
        const result = await orchestrator.run({
          prompt: scenario.prompt,
          sessionId: `s-${scenario.label}`,
          appId: `app-${scenario.label}`,
        })

        const reqRun = result.runs.find((r) => r.role === 'requirement')
        expect(reqRun).toBeDefined()
        expect(result.appModel.name).toBe(scenario.requirement.appName)
        // 需求必须包含可落地的功能点
        expect(scenario.requirement.features.length).toBeGreaterThanOrEqual(3)
      })

      it('阶段2｜Blueprint 完整：结构合法', () => {
        const res = validateBlueprint(scenario.blueprint)
        expect(res.errors).toEqual([])
        expect(res.success).toBe(true)
      })

      it('阶段2｜Blueprint 完整：通过生成前检查（需求覆盖 / 数据模型 / 组件 / API）', () => {
        const res = validateApplication({
          blueprint: scenario.blueprint,
          features: scenario.requirement.features,
          entities: scenario.requirement.entities,
        })
        expect(res.errors).toEqual([])
        expect(res.success).toBe(true)
        expect(res.checks.pages).toBe(true)
        expect(res.checks.features).toBe(true)
        expect(res.checks.dataModel).toBe(true)
        expect(res.checks.components).toBe(true)
        expect(res.checks.api).toBe(true)
      })

      it('阶段2｜Blueprint 规模符合应用复杂度', () => {
        expect(scenario.blueprint.pages.length).toBeGreaterThanOrEqual(scenario.minPages)
        expect(scenario.blueprint.dataModel.tables.length).toBeGreaterThanOrEqual(
          scenario.minTables,
        )
        // 每个页面都必须有组件规划
        for (const p of scenario.blueprint.pages) {
          const pc = scenario.blueprint.pageComponents.find((x) => x.pageId === p.id)
          expect(pc, `页面 ${p.id} 缺少组件规划`).toBeDefined()
          expect(pc!.components.length).toBeGreaterThan(0)
        }
      })

      it('阶段3｜代码生成成功：产出完整工程文件', async () => {
        const llm = makeScenarioLLM(scenario)
        const orchestrator = new MultiAgentOrchestrator(llm)
        const result = await orchestrator.run({
          prompt: scenario.prompt,
          sessionId: `s2-${scenario.label}`,
          appId: `app2-${scenario.label}`,
        })

        expect(result.files.length).toBeGreaterThan(0)
        const paths = result.files.map((f) => f.path)
        // 必备工程文件
        expect(paths).toContain('package.json')
        expect(paths).toContain('index.html')
        expect(paths.some((p) => /^src\/main\.(t|j)sx?$/.test(p))).toBe(true)
        expect(paths.some((p) => /^src\/App\.(t|j)sx?$/.test(p))).toBe(true)
        // 每个页面都要有对应文件
        expect(
          paths.filter((p) => p.startsWith('src/pages/')).length,
        ).toBeGreaterThanOrEqual(scenario.blueprint.pages.length)
      })

      it('阶段4｜项目可运行：入口挂载、路由齐全、依赖声明完整', async () => {
        const llm = makeScenarioLLM(scenario)
        const orchestrator = new MultiAgentOrchestrator(llm)
        const result = await orchestrator.run({
          prompt: scenario.prompt,
          sessionId: `s3-${scenario.label}`,
          appId: `app3-${scenario.label}`,
        })

        const byPath = new Map(result.files.map((f) => [f.path, f.content]))

        // package.json 必须声明 react/react-dom 与 dev/build 脚本
        const pkgRaw = byPath.get('package.json')
        expect(pkgRaw).toBeDefined()
        const pkg = JSON.parse(pkgRaw as string) as {
          dependencies?: Record<string, string>
          scripts?: Record<string, string>
        }
        expect(pkg.dependencies?.react).toBeDefined()
        expect(pkg.dependencies?.['react-dom']).toBeDefined()
        expect(pkg.scripts?.dev).toBeDefined()
        expect(pkg.scripts?.build).toBeDefined()

        // 入口必须挂载根节点
        const mainKey = [...byPath.keys()].find((p) => /^src\/main\.(t|j)sx?$/.test(p))
        const mainSrc = byPath.get(mainKey as string) ?? ''
        expect(mainSrc).toMatch(/createRoot|ReactDOM\.render/)

        // App.tsx 必须为每个页面建立可达路径（Builder 采用自有路径匹配逻辑，
        // 而非 <Route path="..."> 字面量，因此校验「路径字符串 + 页面组件引用」是否存在）
        const appKey = [...byPath.keys()].find((p) => /^src\/App\.(t|j)sx?$/.test(p))
        const appSrc = byPath.get(appKey as string) ?? ''
        for (const page of scenario.blueprint.pages) {
          // 页面组件必须被 App 引入
          expect(
            appSrc.includes(`./pages/${page.id}`),
            `App 未引入页面组件 ${page.id}`,
          ).toBe(true)
          // 页面必须在路由匹配逻辑中被渲染。
          // 注意：动态路由（/posts/:id）会被编译为「按 segment 匹配」的代码，
          // 路径字面量不会出现，因此这里校验页面组件是否被实际渲染。
          // Builder 命名规则：'Page' + PascalCase(pageId)，如 page_home → PagePageHome
          const compName =
            'Page' +
            page.id
              .split('_')
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
              .join('')
          expect(
            appSrc.includes(`<${compName}`),
            `App 未在路由中渲染页面组件 ${compName}（页面 ${page.path}）`,
          ).toBe(true)
          // 静态路径应出现路径字面量；动态路径校验静态前缀
          const staticPrefix = page.path.split('/:')[0] as string
          if (staticPrefix && staticPrefix !== '/') {
            expect(
              appSrc.includes(staticPrefix.replace(/^\//, '')),
              `App 路由缺少路径前缀 ${staticPrefix}`,
            ).toBe(true)
          }
        }
      })

      it('阶段5｜无隐藏 Bug：import 可解析、无缺失组件、无空文件', async () => {
        const llm = makeScenarioLLM(scenario)
        const orchestrator = new MultiAgentOrchestrator(llm)
        const result = await orchestrator.run({
          prompt: scenario.prompt,
          sessionId: `s4-${scenario.label}`,
          appId: `app4-${scenario.label}`,
        })

        const report = checkIntegrity(result.files)
        const errors = report.issues.filter((i) => i.severity === 'error')
        expect(
          errors.map((e) => `[${e.kind}] ${e.message}`),
          '生成后完整性检查发现错误',
        ).toEqual([])
        expect(report.passed).toBe(true)
      })

      it('阶段5｜数据一致性：页面字段均来自蓝图定义的数据表', async () => {
        const llm = makeScenarioLLM(scenario)
        const orchestrator = new MultiAgentOrchestrator(llm)
        const result = await orchestrator.run({
          prompt: scenario.prompt,
          sessionId: `s5-${scenario.label}`,
          appId: `app5-${scenario.label}`,
        })

        // 所有引用的数据表必须真实存在于蓝图
        const tableIds = new Set(scenario.blueprint.dataModel.tables.map((t) => t.id))
        for (const page of scenario.blueprint.pages) {
          if (page.tableId) {
            expect(tableIds.has(page.tableId), `页面 ${page.id} 引用了不存在的表`).toBe(true)
          }
        }
        // 生成的 AppModel 数据源应与蓝图数据表一致
        const dsIds = new Set((result.appModel.schema.dataSources ?? []).map((d) => d.id))
        for (const t of tableIds) {
          expect(dsIds.has(t), `AppModel 缺少数据源 ${t}`).toBe(true)
        }
      })
    })
  }
})

// ─── 校验关卡的负向测试（确保关卡真的会拦截）──────────────

describe('生成前检查 · ApplicationValidator 拦截能力', () => {
  const baseFeatures = scenarios[0]!.requirement.features
  const baseEntities = scenarios[0]!.requirement.entities

  it('页面无组件规划 → 拦截（防止空白页）', () => {
    const bad: Blueprint = {
      ...blogBlueprint,
      pageComponents: blogBlueprint.pageComponents.filter(
        (pc) => pc.pageId !== 'page_posts',
      ),
    }
    const res = validateApplication({ blueprint: bad, features: baseFeatures, entities: baseEntities })
    expect(res.success).toBe(false)
    expect(res.checks.pages).toBe(false)
    expect(res.errors.some((e) => e.includes('没有组件规划'))).toBe(true)
  })

  it('数据表无字段 → 拦截（防止 Table/Form 渲染异常）', () => {
    const bad: Blueprint = {
      ...blogBlueprint,
      dataModel: { tables: [{ id: 'posts', name: '文章', fields: [] }] },
    }
    const res = validateApplication({ blueprint: bad, features: baseFeatures, entities: baseEntities })
    expect(res.success).toBe(false)
    expect(res.checks.dataModel).toBe(false)
  })

  it('有数据表但无 API → 拦截（防止数据读写断裂）', () => {
    const bad: Blueprint = { ...blogBlueprint, apiDesign: { endpoints: [] } }
    const res = validateApplication({ blueprint: bad, features: baseFeatures, entities: baseEntities })
    expect(res.success).toBe(false)
    expect(res.checks.api).toBe(false)
  })

  it('页面绑定表但缺对应接口 → 拦截', () => {
    const bad: Blueprint = {
      ...blogBlueprint,
      apiDesign: {
        endpoints: [
          { id: 'x', method: 'GET', path: '/api/other', description: '无关接口', crud: 'list', tableId: 'other' },
        ],
      },
    }
    const res = validateApplication({ blueprint: bad, features: baseFeatures, entities: baseEntities })
    expect(res.success).toBe(false)
    expect(res.checks.api).toBe(false)
  })

  it('引用未注册组件 → 拦截（防止运行时找不到组件）', () => {
    const bad: Blueprint = {
      ...blogBlueprint,
      pageComponents: blogBlueprint.pageComponents.map((pc) =>
        pc.pageId === 'page_posts'
          ? { ...pc, components: [{ id: 'ghost', type: 'GhostComponent', props: {} }] }
          : pc,
      ),
    }
    const res = validateApplication({ blueprint: bad, features: baseFeatures, entities: baseEntities })
    expect(res.success).toBe(false)
    expect(res.checks.components).toBe(false)
  })

  it('需求功能大面积未覆盖 → 拦截', () => {
    const res = validateApplication({
      blueprint: blogBlueprint,
      features: ['库存盘点', '财务对账', '工资结算', '生产排程', '设备巡检'],
      entities: baseEntities,
    })
    expect(res.success).toBe(false)
    expect(res.checks.features).toBe(false)
  })

  it('缺少首页 → 拦截', () => {
    const bad: Blueprint = {
      ...blogBlueprint,
      pages: blogBlueprint.pages.filter((p) => p.path !== '/'),
      pageComponents: blogBlueprint.pageComponents.filter((pc) => pc.pageId !== 'page_home'),
    }
    const res = validateApplication({ blueprint: bad, features: baseFeatures, entities: baseEntities })
    expect(res.success).toBe(false)
    expect(res.checks.pages).toBe(false)
  })
})

// ─── 生成后完整性检查的负向测试 ───────────────────────────

describe('生成后检查 · IntegrityChecker 拦截能力', () => {
  const validProject = [
    { path: 'package.json', content: '{"name":"x"}' },
    { path: 'index.html', content: '<div id="root"></div>' },
    { path: 'src/main.tsx', content: `import App from './App'\nimport { createRoot } from 'react-dom/client'\ncreateRoot(document.getElementById('root')!).render(<App />)` },
    { path: 'src/App.tsx', content: `import Home from './pages/home'\nexport default function App() { return <Home /> }` },
    { path: 'src/pages/home.tsx', content: `export default function Home() { return <div>首页</div> }` },
  ]

  it('完整项目 → 通过', () => {
    const report = checkIntegrity(validProject)
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(report.passed).toBe(true)
  })

  it('import 指向不存在的文件 → 报错', () => {
    const files = [
      ...validProject,
      { path: 'src/Broken.tsx', content: `import Missing from './pages/not-exist'\nexport default function Broken() { return <Missing /> }` },
    ]
    const report = checkIntegrity(files)
    expect(report.passed).toBe(false)
    expect(report.issues.some((i) => i.kind === 'import')).toBe(true)
  })

  it('JSX 使用未 import 的组件 → 报错', () => {
    const files = validProject.map((f) =>
      f.path === 'src/pages/home.tsx'
        ? { ...f, content: `export default function Home() { return <UndefinedWidget /> }` }
        : f,
    )
    const report = checkIntegrity(files)
    expect(report.passed).toBe(false)
    expect(report.issues.some((i) => i.kind === 'component')).toBe(true)
  })

  it('缺少入口文件 → 报错', () => {
    const files = validProject.filter((f) => f.path !== 'src/main.tsx')
    const report = checkIntegrity(files)
    expect(report.passed).toBe(false)
    expect(report.issues.some((i) => i.kind === 'entry')).toBe(true)
  })

  it('文件内容为空 → 报错', () => {
    const files = [...validProject, { path: 'src/Empty.tsx', content: '   ' }]
    const report = checkIntegrity(files)
    expect(report.passed).toBe(false)
    expect(report.issues.some((i) => i.kind === 'path')).toBe(true)
  })

  it('HTML 原生标签不会被误判为缺失组件', () => {
    const files = validProject.map((f) =>
      f.path === 'src/pages/home.tsx'
        ? {
            ...f,
            content: `export default function Home() { return <div><table><tbody><tr><td>x</td></tr></tbody></table><svg><path d="M0 0" /></svg></div> }`,
          }
        : f,
    )
    const report = checkIntegrity(files)
    expect(report.issues.filter((i) => i.kind === 'component')).toEqual([])
  })

  it('别名导入 import { A as B } 可被正确识别', () => {
    const files = validProject.map((f) =>
      f.path === 'src/pages/home.tsx'
        ? {
            ...f,
            content: `import { Fragment as Wrap } from 'react'\nexport default function Home() { return <Wrap>内容</Wrap> }`,
          }
        : f,
    )
    const report = checkIntegrity(files)
    expect(report.issues.filter((i) => i.kind === 'component')).toEqual([])
  })
})
