import { describe, it, expect } from 'vitest'
import { UiVisualReviewer, createUiVisualReviewer } from '../design-system/ui-visual-review'
import type { GeneratedFile } from '../types'

/** 样式欠佳的应用：无 h1、无按钮、硬编码颜色多、无字体、无间距 */
function makePoorFiles(): GeneratedFile[] {
  return [
    { path: 'src/App.tsx', content: "import { Routes, Route } from 'react-router-dom'; import Home from './pages/page_list'; export default function App(){ return <Routes><Route path='/' element={<Home/>} /></Routes>; }" },
    {
      path: 'src/pages/page_list.tsx',
      content:
        "export default function Page(){ return <div style={{color:'#f00', background:'#0f0', color:'#00f', color:'#123456', color:'#abcdef', color:'#ff0000', color:'#00ff00'}}><p>内容</p></div>; }",
    },
    { path: 'src/api.ts', content: 'export async function get(){ return []; }' },
  ]
}

/** 样式良好的应用：含 h1、按钮、主题变量、间距 */
function makeGoodFiles(): GeneratedFile[] {
  return [
    { path: 'src/App.tsx', content: "import { Routes, Route } from 'react-router-dom'; import Home from './pages/page_list'; export default function App(){ return <Routes><Route path='/' element={<Home/>} /></Routes>; }" },
    {
      path: 'src/pages/page_list.tsx',
      content:
        "import { Button } from 'antd'; import styled from 'styled-components'; const Wrapper = styled.div`padding:16px; margin:8px; font-family: Inter; gap: 8px;`; export default function Page(){ return <Wrapper><h1>标题</h1><Button loading>提交</Button></Wrapper>; }",
    },
    { path: 'src/theme.ts', content: 'export const theme = { primaryColor:"#1677ff", fontFamily:"Inter", spacing:8 };' },
    { path: 'src/api.ts', content: 'export async function get(){ return []; }' },
  ]
}

describe('UiVisualReviewer - 静态代码规则评审', () => {
  it('应识别样式欠佳的应用并给出低分与改进建议', async () => {
    const reviewer = new UiVisualReviewer()
    const report = await reviewer.review({ files: makePoorFiles(), threshold: 7 })

    expect(report.mode).toBe('static')
    expect(report.passed).toBe(false)
    expect(report.score).toBeLessThan(7)
    // 五个维度都应存在
    expect(report.dimensions.map((d) => d.dimension)).toEqual([
      'layout',
      'color',
      'font',
      'spacing',
      'interaction',
    ])
    // 应识别出缺少 h1 / 硬编码颜色 / 无按钮等问题
    const allText = report.issues.join(' ') + report.suggestions.join(' ')
    expect(allText).toMatch(/h1|标题/)
    expect(allText).toMatch(/硬编码颜色|颜色|色彩/)
    expect(report.suggestions.length).toBeGreaterThan(0)
  })

  it('应识别样式良好的应用并给出通过', async () => {
    const reviewer = createUiVisualReviewer()
    const report = await reviewer.review({ files: makeGoodFiles(), threshold: 7 })

    expect(report.passed).toBe(true)
    expect(report.score).toBeGreaterThanOrEqual(7)
  })

  it('样式欠佳 → 修复建议 → 重新生成后评分应提升', async () => {
    const reviewer = new UiVisualReviewer()

    const poor = await reviewer.review({ files: makePoorFiles(), threshold: 7 })
    // 模拟 Builder 依据建议修复后的代码
    const good = await reviewer.review({ files: makeGoodFiles(), threshold: 7 })

    expect(good.score).toBeGreaterThan(poor.score)
    expect(good.passed).toBe(true)
  })
})
