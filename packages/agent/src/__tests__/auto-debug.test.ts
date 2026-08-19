import { describe, it, expect } from 'vitest'
import type { AppModel } from '@aikd/shared'
import { Reviewer } from '../auto-debug/reviewer'
import { Fixer } from '../auto-debug/fixer'
import { runDebugLoop } from '../auto-debug/debug-loop'

/** 构造一个有效的商城 AppModel（两个页面） */
function makeAppModel(): AppModel {
  return {
    id: 'app_mall',
    name: '在线商城',
    type: 'web',
    version: '0.1.0',
    schema: {
      pages: [
        { id: 'page_home', path: '/', title: '首页', layout: 'web', components: [{ id: 'c1', type: 'Heading', props: { text: '欢迎光临', level: 'h1' } }] },
        { id: 'page_products', path: '/products', title: '商品列表', layout: 'web', components: [{ id: 'c2', type: 'Table', props: { dataSource: 'database.products', searchable: true } }] },
      ],
      routes: [
        { path: '/', pageId: 'page_home' },
        { path: '/products', pageId: 'page_products' },
      ],
      theme: { primaryColor: '#1677ff', fontFamily: 'Inter, sans-serif' },
      dataSources: [{ id: 'products', name: 'products', type: 'mock', data: [] }],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('Auto-Debug · Reviewer（四类检查）', () => {
  it('识别 TypeScript 错误（缺必需文件 + 括号不平衡）', () => {
    const reviewer = new Reviewer()
    const report = reviewer.review({
      files: [
        { path: 'src/App.tsx', content: 'export default function App() { return <div>hi' }, // 括号不平衡
      ],
      appModel: makeAppModel(),
    })
    expect(report.passed).toBe(false)
    // 缺必需文件
    expect(report.issues.some((i) => i.category === 'typescript' && i.message.includes('缺少必需文件'))).toBe(true)
    // 括号不平衡
    expect(report.issues.some((i) => i.category === 'typescript' && i.message.includes('花括号不匹配'))).toBe(true)
  })

  it('识别页面结构错误（缺页面文件 + 页面无组件）', () => {
    const reviewer = new Reviewer()
    const report = reviewer.review({
      files: [
        { path: 'package.json', content: JSON.stringify({ dependencies: { react: '^18', 'react-dom': '^18' } }) },
        { path: 'index.html', content: '<html></html>' },
        { path: 'src/main.tsx', content: 'import React from "react"' },
        { path: 'src/App.tsx', content: 'import React from "react"' },
      ],
      appModel: makeAppModel(),
    })
    expect(report.issues.some((i) => i.category === 'structure' && i.message.includes('缺少页面文件'))).toBe(true)
  })

  it('识别运行异常（来自 Runtime 错误报告）', () => {
    const reviewer = new Reviewer()
    const report = reviewer.review({
      files: [],
      appModel: makeAppModel(),
      runtimeErrors: {
        hasErrors: true,
        errors: [{ kind: 'compile', message: 'TS2304: Cannot find name "x"', file: 'src/App.tsx', line: 5 }],
      },
    })
    expect(report.issues.some((i) => i.category === 'typescript' && i.message.includes('TS2304'))).toBe(true)
    expect(report.issues.some((i) => i.category === 'runtime')).toBe(false) // compile → typescript 分类
  })

  it('识别功能缺失（需求功能点未体现）', () => {
    const reviewer = new Reviewer()
    const report = reviewer.review({
      files: [],
      appModel: makeAppModel(),
      features: ['商品列表', '购物车结算', '用户登录'],
    })
    // 商品列表被 Table/页面标题覆盖；购物车/登录未体现
    const missing = report.issues.filter((i) => i.category === 'feature' && i.message.includes('可能未'))
    expect(missing.length).toBeGreaterThan(0)
    const msgs = missing.map((i) => i.message)
    expect(msgs.some((m) => m.includes('购物车') || m.includes('登录'))).toBe(true)
  })

  it('输出四类分类统计', () => {
    const reviewer = new Reviewer()
    const report = reviewer.review({ files: [], appModel: makeAppModel() })
    expect(report.checks).toHaveLength(5)
    const cats = report.checks.map((c) => c.category)
    expect(cats).toContain('typescript')
    expect(cats).toContain('structure')
    expect(cats).toContain('feature')
  })
})

describe('Auto-Debug · Fixer（Patch 生成）', () => {
  it('生成 Patch 并补齐缺失文件', () => {
    const fixer = new Fixer(makeAppModel())
    const { report, files } = fixer.fix(
      [{ path: 'src/App.tsx', content: 'import React from "react"' }],
      [],
    )
    expect(report.patches.length).toBeGreaterThan(0)
    // package.json / index.html / main.tsx / App.tsx + 2 页面文件
    expect(files.some((f) => f.path === 'package.json')).toBe(true)
    expect(files.some((f) => f.path === 'src/pages/page_home.tsx')).toBe(true)
    expect(report.changedFiles).toBeGreaterThan(0)
  })
})

describe('Auto-Debug · DebugLoop（完整闭环）', () => {
  it('从残缺代码修复到通过：Generate → Run → Review → Fix → Run Again', async () => {
    const appModel = makeAppModel()
    // Generate 阶段产出残缺代码：缺少必需文件与页面文件
    const generatedFiles = [{ path: 'src/App.tsx', content: 'import React from "react"' }]

    const result = await runDebugLoop({ files: generatedFiles, appModel, features: ['商品列表'] })

    // 最终成功
    expect(result.success).toBe(true)
    // 最终文件补全
    expect(result.files.some((f) => f.path === 'package.json')).toBe(true)
    expect(result.files.some((f) => f.path === 'src/pages/page_home.tsx')).toBe(true)
    expect(result.files.some((f) => f.path === 'src/pages/page_products.tsx')).toBe(true)
    // 有详细日志
    expect(result.log.length).toBeGreaterThan(0)
    expect(result.logText).toContain('GENERATE')
    expect(result.logText).toContain('REVIEW')
    expect(result.logText).toContain('FIX')
    expect(result.logText).toContain('RUN_AGAIN')
  })

  it('日志包含各阶段与问题明细', async () => {
    const result = await runDebugLoop({ files: [], appModel: makeAppModel() })
    expect(result.logText).toContain('审查完成')
    expect(result.logText).toContain('TypeScript 错误检查')
    expect(result.logText).toContain('页面结构检查')
  })
})
