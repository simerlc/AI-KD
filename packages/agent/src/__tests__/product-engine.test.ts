// ─── 产品化引擎升级测试 ─────────────────────────────────
//
// 覆盖：
//   1. Product Planning Agent（需求 → 产品规划，禁止直接生成代码）
//   2. Application Pattern Library（应用模式库 + 推荐）
//   3. Quality Evaluation Agent（产品完整度评分，<85 进入增强）
//   4. Enhancement Agent（自动增强缺失能力）
//   5. Application Memory（多轮应用进化）

import { describe, it, expect } from 'vitest'
import type { Blueprint, ProductPlan } from '@aikd/shared'
import type { LLMClient } from '../types'
import {
  APP_PATTERNS,
  getPattern,
  recommendPattern,
  patternsToPromptDescription,
} from '../multi-agent/patterns'
import { QualityEvaluationAgent } from '../multi-agent/agents/quality-evaluation'
import { EnhancementAgent } from '../multi-agent/agents/enhancement'
import { ApplicationMemoryManager, InMemoryApplicationMemoryStore } from '../multi-agent/application-memory'

// ─── 1. Application Pattern Library ─────────────────────
describe('Application Pattern Library', () => {
  it('包含文档要求的 7+ 类应用模式', () => {
    const ids = new Set(APP_PATTERNS.map((p) => p.id))
    expect(ids.has('knowledge-app')).toBe(true)
    expect(ids.has('crm-system')).toBe(true)
    expect(ids.has('erp-system')).toBe(true)
    expect(ids.has('dashboard')).toBe(true)
    expect(ids.has('community')).toBe(true)
    expect(ids.has('ecommerce')).toBe(true)
    expect(ids.has('saas-platform')).toBe(true)
  })

  it('每个模式定义了页面结构/功能模块/数据模型/推荐组件/用户流程', () => {
    for (const p of APP_PATTERNS) {
      expect(p.pages.length).toBeGreaterThan(0)
      expect(p.modules.length).toBeGreaterThan(0)
      expect(p.dataModels.length).toBeGreaterThan(0)
      expect(p.components.length).toBeGreaterThan(0)
      expect(p.userFlows.length).toBeGreaterThan(0)
    }
  })

  it('根据需求推荐匹配模式', () => {
    expect(recommendPattern({ prompt: '学习笔记应用' }).id).toBe('knowledge-app')
    expect(recommendPattern({ prompt: '客户关系管理' }).id).toBe('crm-system')
    expect(recommendPattern({ prompt: '在线商城' }).id).toBe('ecommerce')
    expect(recommendPattern({ prompt: '采购库存财务' }).id).toBe('erp-system')
    expect(recommendPattern({ prompt: '社区论坛' }).id).toBe('community')
  })

  it('生成模式清单描述（供 Prompt 注入）', () => {
    const desc = patternsToPromptDescription()
    expect(desc).toContain('知识管理应用')
    expect(desc).toContain('CRM 客户关系管理')
    expect(desc).toContain('推荐组件')
  })
})

// ─── 2. Quality Evaluation Agent ────────────────────────
describe('Quality Evaluation Agent', () => {
  const evaluator = new QualityEvaluationAgent()

  it('简单 CRUD 应用得低分（<85）', () => {
    const bp = makeMinimalBlueprint()
    const report = evaluator.evaluate({
      blueprint: bp,
      files: [{ path: 'src/index.css', content: 'body {}' }, { path: 'src/App.tsx', content: 'export default () => <div/>' }],
    })
    expect(report.score).toBeLessThan(85)
    expect(report.passed).toBe(false)
    expect(report.issues.length).toBeGreaterThan(0)
  })

  it('完整产品化应用得高分（≥85）', () => {
    const bp = makeRichBlueprint()
    const report = evaluator.evaluate({
      blueprint: bp,
      files: makeRichFiles(),
    })
    expect(report.score).toBeGreaterThanOrEqual(85)
    expect(report.passed).toBe(true)
  })

  it('输出五个维度得分', () => {
    const report = evaluator.evaluate({
      blueprint: makeRichBlueprint(),
      files: makeRichFiles(),
    })
    expect(report.dimensions.productCompleteness).toBeDefined()
    expect(report.dimensions.uiQuality).toBeDefined()
    expect(report.dimensions.featureRichness).toBeDefined()
    expect(report.dimensions.userExperience).toBeDefined()
    expect(report.dimensions.technicalQuality).toBeDefined()
  })

  it('识别缺失的生产级能力', () => {
    const bp = makeMinimalBlueprint()
    const report = evaluator.evaluate({
      blueprint: bp,
      files: [{ path: 'src/index.css', content: 'body {}' }],
      pattern: getPattern('knowledge-app'),
    })
    expect(report.missingCapabilities.length).toBeGreaterThan(0)
  })
})

// ─── 3. Enhancement Agent ───────────────────────────────
describe('Enhancement Agent', () => {
  const mockLlm: LLMClient = {
    async complete() { return JSON.stringify(makeEnhancedBlueprint()) },
    async stream() { return '' },
  }

  it('基于质量报告自动增强，产出增强后的 Blueprint', async () => {
    const agent = new EnhancementAgent()
    const evaluator = new QualityEvaluationAgent()
    const bp = makeMinimalBlueprint()
    const report = evaluator.evaluate({
      blueprint: bp,
      files: [{ path: 'src/index.css', content: 'body {}' }],
      pattern: getPattern('knowledge-app'),
    })

    const result = await agent.execute(
      {
        blueprint: bp,
        report,
        pattern: getPattern('knowledge-app'),
        prompt: '学习笔记应用',
      } as never,
      { sessionId: 's', llm: mockLlm },
    )

    expect(result.enhanced).toBe(true)
    expect(result.addedCapabilities.length).toBeGreaterThan(0)
    expect(result.blueprint.productPlan?.advancedFeatures.length).toBeGreaterThan(0)
  })

  it('无待增强能力时返回未增强', async () => {
    const agent = new EnhancementAgent()
    const report = {
      score: 95,
      dimensions: { productCompleteness: 95, uiQuality: 95, featureRichness: 95, userExperience: 95, technicalQuality: 95 },
      issues: [],
      missingCapabilities: [],
      passed: true,
      threshold: 85,
    }
    const result = await agent.execute(
      {
        blueprint: makeRichBlueprint(),
        report,
        pattern: undefined,
        prompt: '测试',
      } as never,
      { sessionId: 's', llm: mockLlm },
    )
    expect(result.enhanced).toBe(false)
    expect(result.addedCapabilities.length).toBe(0)
  })
})

// ─── 4. Application Memory ─────────────────────────────
describe('Application Memory（多轮进化）', () => {
  it('保存并读取应用记忆', () => {
    const store = new InMemoryApplicationMemoryStore()
    const manager = new ApplicationMemoryManager(store)
    const bp = makeRichBlueprint()

    manager.remember({
      appId: 'app-1',
      appName: '学习笔记',
      blueprint: bp,
      features: ['笔记创建', 'Markdown'],
      skills: ['knowledge-app', 'frontend'],
      prompt: '生成学习笔记应用',
      summary: '学习笔记系统',
    })

    const mem = manager.get('app-1')
    expect(mem).toBeDefined()
    expect(mem!.appName).toBe('学习笔记')
    expect(mem!.features).toContain('笔记创建')
    expect(mem!.skills).toContain('knowledge-app')
    expect(mem!.history.length).toBe(1)
  })

  it('生成多轮进化上下文（禁止重新生成整个项目）', () => {
    const store = new InMemoryApplicationMemoryStore()
    const manager = new ApplicationMemoryManager(store)
    manager.remember({
      appId: 'app-1',
      appName: '学习笔记',
      blueprint: makeRichBlueprint(),
      features: ['笔记创建'],
      skills: ['knowledge-app'],
      prompt: '生成学习笔记应用',
      summary: '学习笔记系统',
    })

    const ctx = manager.buildEvolutionContext('app-1')
    expect(ctx).toBeDefined()
    expect(ctx!).toContain('禁止重新生成整个项目')
    expect(ctx!).toContain('已有应用记忆')
    expect(ctx!).toContain('数据模型')
  })

  it('多轮更新会累积功能和历史', () => {
    const store = new InMemoryApplicationMemoryStore()
    const manager = new ApplicationMemoryManager(store)
    const bp = makeRichBlueprint()

    manager.remember({
      appId: 'app-1', appName: '学习笔记', blueprint: bp,
      features: ['笔记创建'], skills: ['knowledge-app'],
      prompt: '生成学习笔记应用', summary: 'v1',
    })
    manager.remember({
      appId: 'app-1', appName: '学习笔记', blueprint: bp,
      features: ['AI总结'], skills: ['ai-feature'],
      prompt: '增加AI总结功能', summary: 'v2',
    })

    const mem = manager.get('app-1')!
    expect(mem.features).toContain('笔记创建')
    expect(mem.features).toContain('AI总结')
    expect(mem.history.length).toBe(2)
  })
})

// ─── 辅助构造 ──────────────────────────────────────────
function makeMinimalBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0',
    appName: '简单应用',
    appType: 'web',
    pages: [{ id: 'page_home', path: '/', title: '首页', layout: 'web', pageType: 'home', description: '首页' }],
    pageComponents: [{ pageId: 'page_home', components: [{ id: 'c1', type: 'Heading', props: { text: '标题' } }] }],
    dataModel: { tables: [] },
    apiDesign: { endpoints: [] },
    userFlow: { flows: [] },
  }
}

function makeRichBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0',
    appName: '学习笔记系统',
    appType: 'web',
    productPlan: {
      targetUsers: ['学生', '开发者'],
      coreFeatures: ['笔记创建', 'Markdown编辑', '分类', '标签', '搜索'],
      advancedFeatures: ['AI总结'],
      pattern: 'knowledge-app',
    },
    pages: [
      { id: 'page_home', path: '/', title: '首页', layout: 'web', pageType: 'home', description: '首页' },
      { id: 'page_list', path: '/notes', title: '笔记列表', layout: 'web', pageType: 'list', description: '列表', tableId: 'notes' },
      { id: 'page_detail', path: '/notes/:id', title: '笔记详情', layout: 'web', pageType: 'detail', description: '详情', tableId: 'notes' },
      { id: 'page_form', path: '/notes/new', title: '新建笔记', layout: 'web', pageType: 'form', description: '表单', tableId: 'notes' },
      { id: 'page_stats', path: '/stats', title: '统计', layout: 'web', pageType: 'dashboard', description: '统计' },
    ],
    pageComponents: [
      { pageId: 'page_home', components: [{ id: 'c1', type: 'Heading', props: { text: '欢迎' } }] },
      { pageId: 'page_list', components: [{ id: 'c2', type: 'Table', props: { dataSource: 'database.notes' } }] },
      { pageId: 'page_detail', components: [{ id: 'c3', type: 'Detail', props: { dataSource: 'database.notes' } }] },
      { pageId: 'page_form', components: [{ id: 'c4', type: 'Form', props: { dataSource: 'database.notes' } }] },
      { pageId: 'page_stats', components: [{ id: 'c5', type: 'Dashboard', props: {} }] },
    ],
    dataModel: {
      tables: [{ id: 'notes', name: '笔记', fields: [{ name: 'title', type: 'string', required: true }, { name: 'content', type: 'string' }] }],
    },
    apiDesign: {
      endpoints: [{ id: 'list_notes', method: 'GET', path: '/api/notes', description: '列表', crud: 'list', tableId: 'notes' }],
    },
    userFlow: {
      flows: [{
        id: 'flow1', name: '记笔记', description: '创建笔记流程',
        steps: [
          { id: 's1', description: '打开首页', pageId: 'page_home', action: 'view' },
          { id: 's2', description: '新建笔记', pageId: 'page_form', action: 'create' },
          { id: 's3', description: '查看列表', pageId: 'page_list', action: 'view' },
        ],
      }],
    },
  }
}

function makeEnhancedBlueprint(): Blueprint {
  return {
    schemaVersion: '1.0.0',
    appName: '学习笔记系统',
    appType: 'web',
    productPlan: {
      targetUsers: ['学生'],
      coreFeatures: ['笔记创建', 'Markdown编辑', '标签'],
      advancedFeatures: ['AI总结', '知识关联'],
    },
    pages: [
      { id: 'page_home', path: '/', title: '首页', layout: 'web', pageType: 'home', description: '首页' },
      { id: 'page_search', path: '/search', title: '搜索', layout: 'web', pageType: 'list', description: '搜索' },
    ],
    pageComponents: [{ pageId: 'page_home', components: [] }],
    dataModel: { tables: [{ id: 'notes', name: '笔记', fields: [{ name: 'title', type: 'string', required: true }] }] },
    apiDesign: { endpoints: [{ id: 'e1', method: 'GET', path: '/api/ai/summary', description: 'AI总结', crud: 'list' }] },
    userFlow: { flows: [] },
  }
}

function makeRichFiles(): Array<{ path: string; content: string }> {
  return [
    { path: 'src/index.css', content: ':root{--ds-color-primary:#2563eb} .ds-btn{} .ds-card{} .ds-table{} .ds-badge{} .ds-input{} .ds-modal{} .ds-navbar{} .ds-sidebar{} @media(max-width:768px){}' },
    { path: 'src/api.ts', content: 'export async function list() { return [] }' },
    { path: 'src/App.tsx', content: 'loading ds-spinner ds-empty error catch status filter 统计 筛选 状态 审批 流程' },
  ]
}
