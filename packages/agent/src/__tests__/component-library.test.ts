import { describe, it, expect } from 'vitest'
import { registry } from '@aikd/component-registry'
import { BuilderAgent } from '../builder'
import type { LLMClient } from '../types'
import type { AppModel, Blueprint } from '@aikd/shared'
import { validateBlueprint } from '../multi-agent'
import { blueprintToAppModel } from '../multi-agent'

const mockLLM: LLMClient = {
  async complete() {
    return ''
  },
  async stream(_m, _o, onChunk) {
    onChunk('')
    return ''
  },
}

describe('Component Library 系统', () => {
  it('注册中心包含新组件 Dashboard / Chart / Login', () => {
    expect(registry.has('Dashboard')).toBe(true)
    expect(registry.has('Chart')).toBe(true)
    expect(registry.has('Login')).toBe(true)
    expect(registry.has('Table')).toBe(true)
    expect(registry.has('Form')).toBe(true)
    expect(registry.get('Dashboard')?.name).toBe('仪表盘')
    expect(registry.get('Chart')?.name).toBe('图表')
    expect(registry.get('Login')?.name).toBe('登录页')
  })

  it('每个组件都包含 name / description / propsSchema / usageExample', () => {
    const comps = registry.list()
    for (const comp of comps) {
      expect(typeof comp.name).toBe('string')
      expect(comp.name.length).toBeGreaterThan(0)
      expect(typeof comp.description).toBe('string')
      expect(Array.isArray(comp.propsSchema)).toBe(true)
      expect(Array.isArray(comp.usageExamples)).toBe(true)
    }
  })

  it('组件选择能力 recommend 能按页面类型推荐组件', () => {
    // 首页/看板 → 推荐 Dashboard/Chart
    const dash = registry.recommend({ pageType: 'home', limit: 3 })
    expect(dash.some((c) => c.type === 'Dashboard' || c.type === 'Chart')).toBe(true)

    // 列表页 → 推荐 Table/List
    const list = registry.recommend({ pageType: 'list', limit: 3 })
    expect(list.some((c) => c.type === 'Table' || c.type === 'List')).toBe(true)

    // 表单页 → 推荐 Form
    const form = registry.recommend({ pageType: 'form', limit: 3 })
    expect(form.some((c) => c.type === 'Form')).toBe(true)

    // 登录页 → 推荐 Login
    const login = registry.recommend({ pageType: 'login', limit: 3 })
    expect(login.some((c) => c.type === 'Login')).toBe(true)
  })

  it('组件系统可扩展：注册新组件后立即可用', () => {
    registry.register({
      type: 'TestWidget',
      name: '测试组件',
      category: 'display',
      description: '测试用自定义组件',
      acceptsChildren: false,
      defaultProps: {},
      propsSchema: [],
      usageExamples: [],
    })
    expect(registry.has('TestWidget')).toBe(true)
    expect(registry.get('TestWidget')?.name).toBe('测试组件')
    // 清理，避免影响其他测试
    registry.unregister('TestWidget')
  })

  it('toPromptDescription 包含用法示例（供 Blueprint 组件选择）', () => {
    const desc = registry.toPromptDescription()
    expect(desc).toContain('Dashboard')
    expect(desc).toContain('Chart')
    expect(desc).toContain('Login')
    // 包含示例片段
    expect(desc).toContain('示例')
  })

  it('Coding Agent 能复用 Dashboard/Chart/Login 组件生成代码', async () => {
    const blueprint: Blueprint = {
      schemaVersion: '1.0.0',
      appName: '商城管理后台',
      appType: 'web',
      pages: [
        { id: 'page_login', path: '/login', title: '登录', layout: 'web', pageType: 'login', description: '登录页' },
        { id: 'page_dash', path: '/', title: '数据看板', layout: 'web', pageType: 'home', description: '运营看板' },
      ],
      pageComponents: [
        {
          pageId: 'page_login',
          components: [{ id: 'c_login', type: 'Login', props: { title: '商城登录', redirectTo: '/dashboard' } }],
        },
        {
          pageId: 'page_dash',
          components: [
            { id: 'c_dash', type: 'Dashboard', props: { title: '运营看板', cards: [{ label: '销售额', value: '¥12万', trend: '+10%' }] } },
            { id: 'c_chart', type: 'Chart', props: { type: 'bar', dataSource: 'sales', title: '销售趋势' } },
          ],
        },
      ],
      dataModel: {
        tables: [{ id: 'sales', name: '销售', fields: [{ name: 'amount', type: 'number' }] }],
      },
      apiDesign: {
        endpoints: [{ id: 'list_sales', method: 'GET', path: '/api/sales', description: '销售数据', crud: 'list', tableId: 'sales' }],
      },
      userFlow: {
        flows: [
          { id: 'flow1', name: '登录查看看板', description: '登录后查看运营数据', steps: [{ id: 's1', description: '登录', pageId: 'page_login', action: 'submit' }] },
        ],
      },
    }

    // 校验合法
    const v = validateBlueprint(blueprint)
    expect(v.success).toBe(true)

    // 转 AppModel 并生成代码
    const appModel = blueprintToAppModel(blueprint, 'test-app')
    const builder = new BuilderAgent(mockLLM)
    const result = await builder.build({ appModel, appId: 'test-app' })
    const files = result.files

    const pageDash = files.find((f) => f.path === 'src/pages/page_dash.tsx')
    expect(pageDash).toBeDefined()
    // 确认 Dashboard / Chart 被渲染为真实代码
    expect(pageDash?.content).toContain('运营看板')
    expect(pageDash?.content).toContain('销售额')

    const pageLogin = files.find((f) => f.path === 'src/pages/page_login.tsx')
    expect(pageLogin).toBeDefined()
    expect(pageLogin?.content).toContain('登录')
  })
})
