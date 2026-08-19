// ─── 应用生成后自动全功能测试与自动修复机制 测试 ───────────────
//
// 覆盖需求：
//   第四节 统一测试结果结构（score>=95 放行）
//   第二节 ApplicationTestAgent / ErrorAnalyzerAgent / RepairAgent
//   第三节 五大维度（build/runtime/ui/feature/api）
//   第五节 自动修复闭环（最多 5 轮）
//   第七节 三个真实案例（博客 / 商城后台 / CRM）
//   第八节 任何未通过自动测试的应用都不能进入 Preview

import { describe, it, expect } from 'vitest'
import type { Blueprint } from '@aikd/shared'
import type { LLMClient, LLMMessage, GeneratedFile } from '../types'
import {
  ApplicationTestAgent,
  ErrorAnalyzerAgent,
  RepairAgent,
  buildRepairPrompt,
  composeTestResult,
  PREVIEW_PASS_SCORE,
  emptyDimension,
} from '../multi-agent'
import { BuilderAgent } from '../builder'
import { blueprintToAppModel } from '../multi-agent/blueprint/convert'

// ─── Mock LLM（Builder 为确定性生成，不依赖 LLM 实际输出）──
const dummyLlm: LLMClient = {
  async complete() {
    return '{}'
  },
  async stream() {
    return '{}'
  },
}

// 修复用 Mock LLM：删掉坏 import 行（模拟 LLM 最小补丁修复）
function makeRepairLlm(badImport: string): LLMClient {
  return {
    async complete(messages: LLMMessage[]) {
      const user = messages.find((m) => m.role === 'user')?.content ?? ''
      const seg = user.split('当前文件内容：\n```\n')[1]?.split('\n```')[0]
      if (!seg) return ''
      const fixed = seg
        .split('\n')
        .filter((l) => !l.includes(badImport))
        .join('\n')
      return '```\n' + fixed + '\n```'
    },
    async stream() {
      return '{}'
    },
  }
}

// 用 Builder 把 Blueprint 生成真实 React 文件
async function buildFiles(bp: Blueprint): Promise<GeneratedFile[]> {
  const builder = new BuilderAgent(dummyLlm)
  const appModel = blueprintToAppModel(bp, 'app-test-1')
  const { files } = await builder.build({ appModel })
  return files
}

// ─── 三个真实案例 Blueprint（精简但完整）─────────────────────

const blogBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '个人博客',
  appType: 'web',
  pages: [
    { id: 'page_home', path: '/', title: '博客首页', layout: 'web', pageType: 'home', description: '最新文章', tableId: 'posts' },
    { id: 'page_posts', path: '/posts', title: '文章列表', layout: 'web', pageType: 'list', description: '全部文章', tableId: 'posts' },
    { id: 'page_post_detail', path: '/posts/:id', title: '文章详情', layout: 'web', pageType: 'detail', description: '阅读正文', tableId: 'posts' },
  ],
  pageComponents: [
    { pageId: 'page_home', components: [{ id: 't', type: 'Heading', props: { text: '博客' } }, { id: 'tbl', type: 'Table', props: { dataSource: 'database.posts', searchable: false, actions: ['detail'] } }] },
    { pageId: 'page_posts', components: [{ id: 'tbl2', type: 'Table', props: { dataSource: 'database.posts', searchable: true, actions: ['detail', 'delete'] } }] },
    { pageId: 'page_post_detail', components: [{ id: 'd', type: 'Detail', props: { dataSource: 'database.posts', paramId: ':id' } }] },
  ],
  dataModel: { tables: [{ id: 'posts', name: '文章', fields: [{ name: 'title', type: 'string', required: true }, { name: 'content', type: 'string' }] }] },
  apiDesign: { endpoints: [
    { id: 'list_posts', method: 'GET', path: '/api/posts', description: '列表', crud: 'list', tableId: 'posts' },
    { id: 'get_post', method: 'GET', path: '/api/posts/:id', description: '详情', crud: 'get', tableId: 'posts' },
  ] },
  userFlow: { flows: [{ id: 'f1', name: '阅读文章', description: '浏览', steps: [
    { id: 's1', description: '首页', pageId: 'page_home', action: 'view' },
    { id: 's2', description: '列表', pageId: 'page_posts', action: 'search' },
    { id: 's3', description: '详情', pageId: 'page_post_detail', action: 'navigate', targetPageId: 'page_post_detail' },
  ] }] },
}

const mallBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '商城后台',
  appType: 'web',
  pages: [
    { id: 'page_dashboard', path: '/', title: '概览', layout: 'web', pageType: 'home', description: '统计' },
    { id: 'page_products', path: '/products', title: '商品管理', layout: 'web', pageType: 'list', description: '商品', tableId: 'products' },
    { id: 'page_product_form', path: '/products/edit/:id', title: '商品编辑', layout: 'web', pageType: 'form', description: '表单', tableId: 'products' },
    { id: 'page_orders', path: '/orders', title: '订单', layout: 'web', pageType: 'list', description: '订单', tableId: 'orders' },
  ],
  pageComponents: [
    { pageId: 'page_dashboard', components: [{ id: 't', type: 'Heading', props: { text: '概览' } }, { id: 'l', type: 'List', props: { items: ['a', 'b'] } }] },
    { pageId: 'page_products', components: [{ id: 'tbl', type: 'Table', props: { dataSource: 'database.products', searchable: true, actions: ['edit', 'delete'] } }] },
    { pageId: 'page_product_form', components: [{ id: 'f', type: 'Form', props: { dataSource: 'database.products', paramId: ':id' } }] },
    { pageId: 'page_orders', components: [{ id: 'otbl', type: 'Table', props: { dataSource: 'database.orders', searchable: true, actions: ['detail'] } }] },
  ],
  dataModel: { tables: [
    { id: 'products', name: '商品', fields: [{ name: 'name', type: 'string', required: true }, { name: 'price', type: 'number' }] },
    { id: 'orders', name: '订单', fields: [{ name: 'orderNo', type: 'string', required: true }, { name: 'amount', type: 'number' }] },
  ] },
  apiDesign: { endpoints: [
    { id: 'list_products', method: 'GET', path: '/api/products', description: '列表', crud: 'list', tableId: 'products' },
    { id: 'update_product', method: 'PUT', path: '/api/products/:id', description: '编辑', crud: 'update', tableId: 'products' },
    { id: 'list_orders', method: 'GET', path: '/api/orders', description: '订单', crud: 'list', tableId: 'orders' },
  ] },
  userFlow: { flows: [
    { id: 'fm', name: '商品管理', description: '管理', steps: [
      { id: 's1', description: '概览', pageId: 'page_dashboard', action: 'view' },
      { id: 's2', description: '搜索', pageId: 'page_products', action: 'search' },
      { id: 's3', description: '编辑', pageId: 'page_product_form', action: 'submit' },
    ] },
    { id: 'fo', name: '订单', description: '订单', steps: [{ id: 's4', description: '列表', pageId: 'page_orders', action: 'view' }] },
  ] },
}

const crmBlueprint: Blueprint = {
  schemaVersion: '1.0.0',
  appName: '企业CRM',
  appType: 'web',
  pages: [
    { id: 'page_dashboard', path: '/', title: '工作台', layout: 'web', pageType: 'home', description: '概览' },
    { id: 'page_customers', path: '/customers', title: '客户管理', layout: 'web', pageType: 'list', description: '客户', tableId: 'customers' },
    { id: 'page_customer_detail', path: '/customers/:id', title: '客户详情', layout: 'web', pageType: 'detail', description: '详情', tableId: 'customers' },
    { id: 'page_customer_form', path: '/customers/edit/:id', title: '客户编辑', layout: 'web', pageType: 'form', description: '表单', tableId: 'customers' },
  ],
  pageComponents: [
    { pageId: 'page_dashboard', components: [{ id: 't', type: 'Heading', props: { text: '工作台' } }, { id: 'l', type: 'List', props: { items: ['x'] } }] },
    { pageId: 'page_customers', components: [{ id: 'tbl', type: 'Table', props: { dataSource: 'database.customers', searchable: true, actions: ['detail', 'edit', 'delete'] } }] },
    { pageId: 'page_customer_detail', components: [{ id: 'd', type: 'Detail', props: { dataSource: 'database.customers', paramId: ':id' } }] },
    { pageId: 'page_customer_form', components: [{ id: 'f', type: 'Form', props: { dataSource: 'database.customers', paramId: ':id' } }] },
  ],
  dataModel: { tables: [{ id: 'customers', name: '客户', fields: [{ name: 'name', type: 'string', required: true }, { name: 'level', type: 'enum', enumOptions: ['A', 'B'] }] }] },
  apiDesign: { endpoints: [
    { id: 'list_customers', method: 'GET', path: '/api/customers', description: '列表', crud: 'list', tableId: 'customers' },
    { id: 'update_customer', method: 'PUT', path: '/api/customers/:id', description: '编辑', crud: 'update', tableId: 'customers' },
  ] },
  userFlow: { flows: [{ id: 'fc', name: '客户管理', description: '管理', steps: [
    { id: 's1', description: '列表', pageId: 'page_customers', action: 'search' },
    { id: 's2', description: '编辑', pageId: 'page_customer_form', action: 'edit' },
    { id: 's3', description: '详情', pageId: 'page_customer_detail', action: 'view' },
  ] }] },
}

// ─── 测试 ──────────────────────────────────────────────────

describe('（统一结果结构）ApplicationTestResult 评分与放行规则', () => {
  it('score >= 95 且五维通过 → 放行 Preview', () => {
    const tests = {
      build: { ...emptyDimension('build'), status: 'passed' as const, score: 100 },
      runtime: { ...emptyDimension('runtime'), status: 'passed' as const, score: 100 },
      ui: { ...emptyDimension('ui'), status: 'passed' as const, score: 100 },
      feature: { ...emptyDimension('feature'), status: 'passed' as const, score: 100 },
      api: { ...emptyDimension('api'), status: 'passed' as const, score: 100 },
    }
    const r = composeTestResult(tests, { round: 1, durationMs: 0, realExecution: false, timestamp: Date.now() })
    expect(r.status).toBe('passed')
    expect(r.score).toBeGreaterThanOrEqual(PREVIEW_PASS_SCORE)
  })

  it('build 维度失败 → 即便分数够也不放行', () => {
    const tests = {
      build: { ...emptyDimension('build'), status: 'failed' as const, score: 0 },
      runtime: { ...emptyDimension('runtime'), status: 'passed' as const, score: 100 },
      ui: { ...emptyDimension('ui'), status: 'passed' as const, score: 100 },
      feature: { ...emptyDimension('feature'), status: 'passed' as const, score: 100 },
      api: { ...emptyDimension('api'), status: 'passed' as const, score: 100 },
    }
    const r = composeTestResult(tests, { round: 1, durationMs: 0, realExecution: false, timestamp: Date.now() })
    expect(r.status).toBe('failed')
  })

  it('score < 95 → 禁止 Preview', () => {
    const tests = {
      build: { ...emptyDimension('build'), status: 'warning' as const, score: 80 },
      runtime: { ...emptyDimension('runtime'), status: 'passed' as const, score: 80 },
      ui: { ...emptyDimension('ui'), status: 'passed' as const, score: 80 },
      feature: { ...emptyDimension('feature'), status: 'passed' as const, score: 80 },
      api: { ...emptyDimension('api'), status: 'passed' as const, score: 80 },
    }
    const r = composeTestResult(tests, { round: 1, durationMs: 0, realExecution: false, timestamp: Date.now() })
    expect(r.score).toBeLessThan(PREVIEW_PASS_SCORE)
    expect(r.status).toBe('failed')
  })
})

describe('（真实案例1）个人博客 —— 生成后自动全功能测试', () => {
  it('Builder 生成代码 → 五大维度测试通过、允许 Preview', async () => {
    const files = await buildFiles(blogBlueprint)
    const agent = new ApplicationTestAgent()
    const result = await agent.test(files, blogBlueprint)
    expect(result.status).toBe('passed')
    expect(result.score).toBeGreaterThanOrEqual(PREVIEW_PASS_SCORE)
    // 博客应覆盖首页 / 文章列表 / 文章详情 / 路由跳转
    expect(result.tests.feature.status).not.toBe('failed')
    expect(result.tests.build.status).not.toBe('failed')
  })
})

describe('（真实案例2）商城后台 —— 生成后自动全功能测试', () => {
  it('Dashboard / 商品管理 / 表格 / 表单 / 数据交互 测试通过', async () => {
    const files = await buildFiles(mallBlueprint)
    const agent = new ApplicationTestAgent()
    const result = await agent.test(files, mallBlueprint)
    expect(result.status).toBe('passed')
    // 商品管理流程：搜索 + 编辑提交
    expect(result.tests.feature.status).not.toBe('failed')
  })
})

describe('（真实案例3）企业CRM —— 生成后自动全功能测试', () => {
  it('客户列表 / 搜索 / 编辑 / 数据展示 测试通过', async () => {
    const files = await buildFiles(crmBlueprint)
    const agent = new ApplicationTestAgent()
    const result = await agent.test(files, crmBlueprint)
    expect(result.status).toBe('passed')
    expect(result.tests.feature.status).not.toBe('failed')
  })
})

describe('（错误定位）ErrorAnalyzerAgent 分析测试失败', () => {
  it('悬空 import → 定位到文件、归类为 import、标记 fatal', async () => {
    const files = await buildFiles(blogBlueprint)
    // 注入悬空 import
    const broken = files.map((f) =>
      f.path === 'src/pages/page_posts.tsx'
        ? { ...f, content: `import './missing-module'\n${f.content}` }
        : f,
    )
    const agent = new ApplicationTestAgent()
    const result = await agent.test(broken, blogBlueprint)
    expect(result.status).toBe('failed')
    expect(result.errors.length).toBeGreaterThan(0)

    const analyzer = new ErrorAnalyzerAgent()
    const ctx = analyzer.analyze(result, {
      requirement: '一个个人博客网站',
      blueprint: blogBlueprint,
      files: broken,
      round: 1,
    })
    expect(ctx).not.toBeNull()
    expect(ctx!.brokenFiles).toContain('src/pages/page_posts.tsx')
    expect(ctx!.categorySummary['import']).toBeGreaterThan(0)
    expect(ctx!.fatal).toBe(true) // build 失败
  })
})

describe('（自动修复闭环）测试失败 → RepairAgent Patch → 重测通过', () => {
  it('坏 import 被 LLM 最小补丁修复后，重测通过', async () => {
    const files = await buildFiles(blogBlueprint)
    const badImport = './missing-module'
    const broken = files.map((f) =>
      f.path === 'src/pages/page_posts.tsx'
        ? { ...f, content: `import '${badImport}'\n${f.content}` }
        : f,
    )
    const agent = new ApplicationTestAgent()
    const analyzer = new ErrorAnalyzerAgent()
    const repairLlm = makeRepairLlm(badImport)
    const repair = new RepairAgent(repairLlm)

    let result = await agent.test(broken, blogBlueprint)
    expect(result.status).toBe('failed')

    let rounds = 0
    const max = 5
    let current = broken
    while (result.status === 'failed' && rounds < max) {
      rounds++
      const ctx = analyzer.analyze(result, { requirement: '博客', blueprint: blogBlueprint, files: current, round: rounds })
      if (!ctx) break
      const rep = await repair.repair(ctx, current)
      current = rep.files
      result = await agent.test(current, blogBlueprint)
    }
    expect(rounds).toBeLessThanOrEqual(max)
    expect(result.status).toBe('passed')
    expect(result.score).toBeGreaterThanOrEqual(PREVIEW_PASS_SCORE)
  })

  it('修复策略为 Patch-first：未出错文件内容保持不变', async () => {
    const files = await buildFiles(blogBlueprint)
    const badImport = './missing-module'
    const broken = files.map((f) =>
      f.path === 'src/pages/page_posts.tsx'
        ? { ...f, content: `import '${badImport}'\n${f.content}` }
        : f,
    )
    const analyzer = new ErrorAnalyzerAgent()
    const repair = new RepairAgent(makeRepairLlm(badImport))
    const result = await new ApplicationTestAgent().test(broken, blogBlueprint)
    const ctx = analyzer.analyze(result, { requirement: '博客', blueprint: blogBlueprint, files: broken, round: 1 })!
    const rep = await repair.repair(ctx, broken)

    const homeBefore = files.find((f) => f.path === 'src/pages/page_home.tsx')!.content
    const homeAfter = rep.files.find((f) => f.path === 'src/pages/page_home.tsx')!.content
    expect(homeAfter).toBe(homeBefore) // 未出错文件原样保留
    expect(rep.changedFiles).toContain('src/pages/page_posts.tsx')
  })
})

describe('（修复上限）最多自动修复 5 轮', () => {
  it('无法修复时在第 5 轮后停止，禁止 Preview', async () => {
    const files = await buildFiles(blogBlueprint)
    // 注入一个 mock LLM 无法修复的坏 import（修复 LLM 直接返回空，不修复）
    const broken = files.map((f) =>
      f.path === 'src/pages/page_posts.tsx'
        ? { ...f, content: `import './never-fix'\n${f.content}` }
        : f,
    )
    const agent = new ApplicationTestAgent()
    const analyzer = new ErrorAnalyzerAgent()
    const repair = new RepairAgent(dummyLlm) // dummy：不修复

    let result = await agent.test(broken, blogBlueprint)
    let rounds = 0
    const max = 5
    let current = broken
    while (result.status === 'failed' && rounds < max) {
      rounds++
      const ctx = analyzer.analyze(result, { requirement: '博客', blueprint: blogBlueprint, files: current, round: rounds })
      if (!ctx) break
      const rep = await repair.repair(ctx, current)
      current = rep.files
      result = await agent.test(current, blogBlueprint)
    }
    expect(rounds).toBe(max)
    expect(result.status).toBe('failed') // 仍未通过
  })
})

describe('（修复 Prompt）buildRepairPrompt 包含错误日志与需求', () => {
  it('Prompt 含需求、错误日志与 brokenFiles 信息', () => {
    const ctx = {
      requirement: '一个个人博客网站',
      errorLog: '[import] src/pages/PagePosts.tsx: 悬空 import',
      brokenFiles: ['src/pages/PagePosts.tsx'],
      round: 1,
      blueprint: blogBlueprint,
    }
    const prompt = buildRepairPrompt(ctx, 'src/pages/PagePosts.tsx', 'export default function PagePosts(){}')
    expect(prompt).toContain('一个个人博客网站')
    expect(prompt).toContain('悬空 import')
    expect(prompt).toContain('src/pages/PagePosts.tsx')
  })
})
