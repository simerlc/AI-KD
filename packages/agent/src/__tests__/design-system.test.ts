// ─── AI Native Design System 测试 ────────────────────────
//
// 覆盖：
//   1. Design Tokens（颜色/排版/间距/圆角/阴影）与 CSS 变量生成
//   2. 基础组件库元数据完整性
//   3. 页面模板系统（5 类模板 + 推荐）
//   4. Design Review Agent（视觉/组件/体验审查 + 评分 <90 判定）
//   5. Builder 生成应用使用 Design System（ds-* 类名 + token 注入）
//   6. 五类应用（企业官网/Dashboard/CRM/电商/数据管理后台）生成验证

import { describe, it, expect } from 'vitest'
import type { Blueprint } from '@aikd/shared'
import type { LLMClient } from '../types'
import {
  DEFAULT_TOKENS,
  deriveTokens,
  tokensToCssVariables,
  generateDesignSystemCss,
  DESIGN_SYSTEM_COMPONENTS,
  isDesignSystemComponent,
  getDSComponent,
  PAGE_TEMPLATES,
  recommendTemplate,
  getTemplatesByCategory,
  DesignReviewAgent,
  type DesignReviewReport,
} from '../design-system'
import { BuilderAgent } from '../builder'
import { blueprintToAppModel } from '../multi-agent/blueprint/convert'

const dummyLlm: LLMClient = {
  async complete() { return '{}' },
  async stream() { return '{}' },
}

// ─── 1. Design Tokens ──────────────────────────────────
describe('Design Tokens', () => {
  it('颜色令牌覆盖全部语义色', () => {
    const c = DEFAULT_TOKENS.colors
    expect(c.primary).toMatch(/^#/)
    expect(c.background).toMatch(/^#/)
    expect(c.surface).toMatch(/^#/)
    expect(c.border).toMatch(/^#/)
    expect(c.text).toMatch(/^#/)
    expect(c.success).toMatch(/^#/)
    expect(c.warning).toMatch(/^#/)
    expect(c.error).toMatch(/^#/)
  })

  it('间距遵循 4px 栅格', () => {
    const s = DEFAULT_TOKENS.spacing
    expect(s['1']).toBe('4px')
    expect(s['2']).toBe('8px')
    expect(s['3']).toBe('12px')
    expect(s['4']).toBe('16px')
    expect(s['6']).toBe('24px')
    expect(s['8']).toBe('32px')
    expect(s['12']).toBe('48px')
  })

  it('圆角规范：small/medium/large/xl', () => {
    const r = DEFAULT_TOKENS.radius
    expect(r.small).toBeTruthy()
    expect(r.medium).toBeTruthy()
    expect(r.large).toBeTruthy()
    expect(r.xl).toBeTruthy()
    expect(r.full).toBeTruthy()
  })

  it('阴影规范：card/modal/floating', () => {
    const sh = DEFAULT_TOKENS.shadows
    expect(sh.card).toBeTruthy()
    expect(sh.modal).toBeTruthy()
    expect(sh.floating).toBeTruthy()
  })

  it('生成 CSS 变量包含 --ds-color-primary', () => {
    const css = tokensToCssVariables()
    expect(css).toContain('--ds-color-primary')
    expect(css).toContain('--ds-color-surface')
    expect(css).toContain('--ds-radius-medium')
    expect(css).toContain('--ds-shadow-card')
  })

  it('deriveTokens 根据主色派生出品牌色板', () => {
    const t = deriveTokens('#10b981')
    expect(t.colors.primary).toBe('#10b981')
    expect(t.colors.primaryHover).toMatch(/^#/)
    expect(t.colors.primarySubtle).toMatch(/^#/)
  })
})

// ─── 2. 基础组件库 ──────────────────────────────────────
describe('Design System 基础组件库', () => {
  it('包含全部 14 个基础组件', () => {
    const required = ['Button', 'Card', 'Input', 'Select', 'Modal', 'Table', 'Form', 'Tabs', 'Dropdown', 'Badge', 'Avatar', 'Navbar', 'Sidebar', 'Layout']
    for (const name of required) {
      expect(isDesignSystemComponent(name), `${name} 缺失`).toBe(true)
    }
  })

  it('Button 支持 variant/size/loading/disabled/responsive', () => {
    const btn = getDSComponent('Button')!
    expect(btn.variants.map((v) => v.name)).toEqual(expect.arrayContaining(['primary', 'secondary', 'outline', 'ghost', 'danger']))
    expect(btn.sizes).toEqual(expect.arrayContaining(['small', 'medium', 'large']))
    expect(btn.states.loading).toBe(true)
    expect(btn.states.disabled).toBe(true)
    expect(btn.states.responsive).toBe(true)
    expect(btn.className).toBe('ds-btn')
  })

  it('所有组件都有 className 前缀 ds-', () => {
    for (const c of DESIGN_SYSTEM_COMPONENTS) {
      expect(c.className.startsWith('ds-'), `${c.type} 缺少 ds- 前缀`).toBe(true)
    }
  })
})

// ─── 3. 页面模板系统 ────────────────────────────────────
describe('页面模板系统', () => {
  it('包含 5 类模板：Dashboard/Admin/CRM/E-commerce/Landing', () => {
    const cats = new Set(PAGE_TEMPLATES.map((t) => t.category))
    expect(cats.has('dashboard')).toBe(true)
    expect(cats.has('admin')).toBe(true)
    expect(cats.has('crm')).toBe(true)
    expect(cats.has('ecommerce')).toBe(true)
    expect(cats.has('landing')).toBe(true)
  })

  it('推荐模板：根据需求关键词匹配', () => {
    expect(recommendTemplate({ appName: '客户管理系统' }).category).toBe('crm')
    expect(recommendTemplate({ appName: '电商商城' }).category).toBe('ecommerce')
    expect(recommendTemplate({ appName: '企业官网' }).category).toBe('landing')
    expect(recommendTemplate({ appName: '数据分析看板' }).category).toBe('dashboard')
    expect(recommendTemplate({ appName: '订单管理后台' }).category).toBe('admin')
  })

  it('按分类获取模板', () => {
    expect(getTemplatesByCategory('landing').length).toBeGreaterThan(0)
  })
})

// ─── 4. Design Review Agent ────────────────────────────
describe('Design Review Agent', () => {
  const reviewer = new DesignReviewAgent()

  it('审查缺失 Design System 的代码会得低分', () => {
    const report = reviewer.review({
      files: [
        { path: 'src/App.tsx', content: `export default function App() { return <div><button style={{color:'#ff0000'}}>click</button></div> }` },
        { path: 'src/index.css', content: 'body {}' },
      ],
      blueprint: makeMinimalBlueprint(),
    })
    expect(report.score).toBeLessThan(90)
    expect(report.passed).toBe(false)
    expect(report.issues.length).toBeGreaterThan(0)
  })

  it('审查使用 Design System 的代码会得高分', () => {
    const report = reviewer.review({
      files: [
        { path: 'src/index.css', content: generateDesignSystemCss() },
        { path: 'src/App.tsx', content: goodAppTsx },
      ],
      blueprint: makeMinimalBlueprint(),
    })
    expect(report.score).toBeGreaterThanOrEqual(90)
    expect(report.passed).toBe(true)
  })

  it('输出结构包含 score/issues/suggestions/passed', () => {
    const report = reviewer.review({
      files: [{ path: 'src/index.css', content: generateDesignSystemCss() }, { path: 'src/App.tsx', content: goodAppTsx }],
      blueprint: makeMinimalBlueprint(),
    })
    expect(typeof report.score).toBe('number')
    expect(Array.isArray(report.issues)).toBe(true)
    expect(Array.isArray(report.suggestions)).toBe(true)
    expect(typeof report.passed).toBe('boolean')
  })
})

// ─── 5. Builder 使用 Design System ─────────────────────
describe('Builder 集成 Design System', () => {
  it('生成的应用 index.css 注入 Design Tokens', async () => {
    const files = await buildFiles(makeMinimalBlueprint())
    const css = files.find((f) => f.path === 'src/index.css')!
    expect(css.content).toContain('--ds-color-primary')
    expect(css.content).toContain('--ds-radius-medium')
    expect(css.content).toContain('.ds-btn')
    expect(css.content).toContain('.ds-card')
    expect(css.content).toContain('.ds-empty')
    expect(css.content).toContain('.ds-error')
    expect(css.content).toContain('@media (max-width: 768px)')
  })

  it('生成按钮使用 ds-btn 类名', async () => {
    const bp = makeBlueprintWithButton()
    const files = await buildFiles(bp)
    const page = files.find((f) => f.path === 'src/pages/page_home.tsx')!
    expect(page.content).toContain('ds-btn')
    expect(page.content).not.toContain('className="btn btn-')
  })
})

// ─── 6. 五类应用生成验证 ───────────────────────────────
describe('五类应用生成验证', () => {
  const cases: Array<{ name: string; blueprint: Blueprint; expectTemplate: string }> = [
    { name: '企业官网', blueprint: landingBlueprint(), expectTemplate: 'landing' },
    { name: 'Dashboard', blueprint: dashboardBlueprint(), expectTemplate: 'dashboard' },
    { name: 'CRM系统', blueprint: crmBlueprint(), expectTemplate: 'crm' },
    { name: '电商系统', blueprint: ecommerceBlueprint(), expectTemplate: 'ecommerce' },
    { name: '数据管理后台', blueprint: adminBlueprint(), expectTemplate: 'admin' },
  ]

  for (const c of cases) {
    it(`${c.name}：生成应用通过 Design Review 且推荐模板正确`, async () => {
      const files = await buildFiles(c.blueprint)
      // 模板推荐
      expect(recommendTemplate({ appName: c.name }).category).toBe(c.expectTemplate)
      // 生成结果注入 Design System
      const css = files.find((f) => f.path === 'src/index.css')
      expect(css).toBeDefined()
      expect(css!.content).toContain('--ds-color-primary')
      // Design Review 应通过（Builder 已强制使用 Design System）
      const reviewer = new DesignReviewAgent()
      const report = reviewer.review({ files, blueprint: c.blueprint, appName: c.name })
      expect(report.score).toBeGreaterThanOrEqual(90)
      expect(report.passed).toBe(true)
    })
  }
})

// ─── 辅助 ──────────────────────────────────────────────
async function buildFiles(bp: Blueprint) {
  const builder = new BuilderAgent(dummyLlm)
  const appModel = blueprintToAppModel(bp, 'app-ds-test')
  const { files } = await builder.build({ appModel })
  return files
}

function makeMinimalBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0',
    appName: '测试应用',
    appType: 'web',
    pages: [{ id: 'page_home', path: '/', title: '首页', layout: 'web', pageType: 'home', description: '首页' }],
    pageComponents: [{ pageId: 'page_home', components: [{ id: 'h1', type: 'Heading', props: { text: '欢迎' } }] }],
    dataModel: { tables: [] },
    apiDesign: { endpoints: [] },
    userFlow: { flows: [] },
  }
}

function makeBlueprintWithButton(): Blueprint {
  return {
    schemaVersion: '1.0.0',
    appName: '按钮测试',
    appType: 'web',
    pages: [{ id: 'page_home', path: '/', title: '首页', layout: 'web', pageType: 'home', description: '首页' }],
    pageComponents: [{ pageId: 'page_home', components: [{ id: 'b1', type: 'Button', props: { text: '点击', variant: 'primary' } }] }],
    dataModel: { tables: [] },
    apiDesign: { endpoints: [] },
    userFlow: { flows: [] },
  }
}

function landingBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0', appName: '企业官网', appType: 'web',
    pages: [{ id: 'page_home', path: '/', title: '首页', layout: 'web', pageType: 'home', description: '企业官网首页' }],
    pageComponents: [{ pageId: 'page_home', components: [
      { id: 'h', type: 'Heading', props: { text: '我们的产品' } },
      { id: 'c1', type: 'Card', props: { title: '特性一' } },
      { id: 'c2', type: 'Card', props: { title: '特性二' } },
      { id: 'btn', type: 'Button', props: { text: '立即开始', variant: 'primary' } },
    ] }],
    dataModel: { tables: [] }, apiDesign: { endpoints: [] }, userFlow: { flows: [] },
  }
}

function dashboardBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0', appName: '数据看板', appType: 'web',
    pages: [{ id: 'page_home', path: '/', title: '总览', layout: 'web', pageType: 'dashboard', description: '指标总览' }],
    pageComponents: [{ pageId: 'page_home', components: [
      { id: 'd', type: 'Dashboard', props: { title: '总览', cards: [{ label: '用户数', value: '100' }] } },
    ] }],
    dataModel: { tables: [] }, apiDesign: { endpoints: [] }, userFlow: { flows: [] },
  }
}

function crmBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0', appName: '客户管理系统', appType: 'web',
    pages: [{ id: 'page_home', path: '/', title: '客户列表', layout: 'web', pageType: 'list', description: '客户', tableId: 'customers' }],
    pageComponents: [{ pageId: 'page_home', components: [
      { id: 't', type: 'Table', props: { dataSource: 'database.customers', searchable: true, actions: ['detail'] } },
    ] }],
    dataModel: { tables: [{ id: 'customers', name: '客户', fields: [{ name: 'name', type: 'string', required: true }] }] },
    apiDesign: { endpoints: [{ path: '/api/data/customers', method: 'GET', crud: 'list', tableId: 'customers', description: '客户列表' }] },
    userFlow: { flows: [] },
  }
}

function ecommerceBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0', appName: '电商商城', appType: 'web',
    pages: [{ id: 'page_home', path: '/', title: '商品', layout: 'web', pageType: 'home', description: '商品', tableId: 'products' }],
    pageComponents: [{ pageId: 'page_home', components: [
      { id: 't', type: 'Table', props: { dataSource: 'database.products', searchable: false } },
      { id: 'btn', type: 'Button', props: { text: '加入购物车', variant: 'primary' } },
    ] }],
    dataModel: { tables: [{ id: 'products', name: '商品', fields: [{ name: 'title', type: 'string', required: true }] }] },
    apiDesign: { endpoints: [{ path: '/api/data/products', method: 'GET', crud: 'list', tableId: 'products', description: '商品列表' }] },
    userFlow: { flows: [] },
  }
}

function adminBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0', appName: '数据管理后台', appType: 'web',
    pages: [{ id: 'page_home', path: '/', title: '数据列表', layout: 'web', pageType: 'list', description: '数据', tableId: 'records' }],
    pageComponents: [{ pageId: 'page_home', components: [
      { id: 't', type: 'Table', props: { dataSource: 'database.records', searchable: true, actions: ['edit', 'delete'] } },
    ] }],
    dataModel: { tables: [{ id: 'records', name: '记录', fields: [{ name: 'title', type: 'string', required: true }] }] },
    apiDesign: { endpoints: [{ path: '/api/data/records', method: 'GET', crud: 'list', tableId: 'records', description: '记录列表' }] },
    userFlow: { flows: [] },
  }
}

// 一个使用 Design System 的高质量 App.tsx 示例（供 Design Review 通过测试）
const goodAppTsx = `
import React, { useState, useEffect } from 'react'

export default function App() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      // 模拟加载
      setTimeout(() => { setData([]); setLoading(false) }, 100)
    } catch (e) {
      setError('加载失败')
      setLoading(false)
    }
  }, [])

  if (loading) return <div className="ds-loading"><span className="ds-spinner"></span>加载中...</div>
  if (error) return <div className="ds-error"><div className="ds-error-title">出错了</div><div className="ds-error-message">{error}</div><button className="ds-btn ds-btn-primary ds-btn-medium" onClick={() => window.location.reload()}>重试</button></div>

  return (
    <div className="ds-layout-content">
      {data.length === 0 ? (
        <div className="ds-empty">
          <div className="ds-empty-icon">📄</div>
          <div className="ds-empty-title">暂无数据</div>
          <div className="ds-empty-desc">这里还没有内容</div>
          <button className="ds-btn ds-btn-primary ds-btn-medium">新建</button>
        </div>
      ) : (
        <div className="ds-card"><div className="ds-card-title">数据列表</div></div>
      )}
    </div>
  )
}
`
