// ─── UIValidator：UI 渲染质量检查 ─────────────────────────
//
// 静态分析生成页面的渲染代码，识别常见的"白屏/空页面/无效渲染"风险：
//   - 页面组件是否导出了有效 React 组件（含 return JSX）
//   - 是否存在明显空渲染（return null / 空 fragment 且无条件分支）
//   - 是否直接渲染 undefined / null 字面量（会导致页面显示空白或报错）
//   - 组件是否正确被加载（App.tsx 中路由指向的页面组件存在）
//
// 真实运行时模式下可结合 dev 服务器抓取首页 HTML 做"空页面"判定。

import type { DimensionResult, TestIssue } from '../result'
import { buildFileMap, hasFile, readFile, toDimension, type ValidationContext } from './base'
import { pageFilePath, pageComponentName } from './naming'

export class UIValidator {
  async validate(ctx: ValidationContext): Promise<DimensionResult> {
    const fileMap = buildFileMap(ctx.files)
    const issues: TestIssue[] = []
    let checked = 0

    // 1. 每个页面组件必须导出且含 JSX 返回
    for (const page of ctx.blueprint.pages) {
      const pageFile = pageFilePath(page.id)
      checked++
      const content = readFile(fileMap, pageFile)
      if (!content) {
        issues.push(errUI(`页面组件缺失：${pageFile}`, pageFile, 'component'))
        continue
      }
      const r = inspectRender(content)
      if (!r.hasReturn) {
        issues.push(errUI(`页面 ${page.title} 无有效 JSX 返回（可能白屏）`, pageFile, 'render'))
      }
      if (r.returnsUndefinedOrNull) {
        issues.push(
          errUI(`页面 ${page.title} 直接返回 undefined/null 字面量（空白风险）`, pageFile, 'render'),
        )
      }
      if (r.isEmptyRender) {
        issues.push(
          errUI(`页面 ${page.title} 返回空渲染（无可展示内容）`, pageFile, 'render', 'warning'),
        )
      }
    }

    // 2. App.tsx 路由是否都指向已存在的页面组件
    const app = readFile(fileMap, 'src/App.tsx')
    if (app) {
      for (const page of ctx.blueprint.pages) {
        checked++
        const compName = pageComponentName(page.id)
        if (!app.includes(compName) && !app.includes(`element={`))
          issues.push(
            errUI(`路由未挂载页面组件 ${compName}`, 'src/App.tsx', 'route', 'warning'),
          )
      }
    }

    const summary =
      issues.length === 0
        ? `UI 渲染检查通过：所有页面均渲染有效内容（检查 ${checked} 项）`
        : `UI 渲染发现 ${issues.length} 处问题（检查 ${checked} 项）`
    return toDimension('ui', issues, checked, summary)
  }
}

interface RenderInspection {
  hasReturn: boolean
  returnsUndefinedOrNull: boolean
  isEmptyRender: boolean
}

function inspectRender(content: string): RenderInspection {
  const hasReturn = /return\s*\(|<[A-Z][A-Za-z0-9]*\s/.test(content) || /return\s*</.test(content)
  // 直接 return 字面量 undefined/null
  const returnsUndefinedOrNull =
    /return\s+undefined\s*;?/.test(content) || /return\s+null\s*;?/.test(content)
  // 空渲染：return 空 fragment 或空字符串，并且没有条件/映射分支
  const isEmptyRender =
    /return\s*\(\s*<>\s*<\/>\s*\)/.test(content) ||
    /return\s*\(\s*''\s*\)/.test(content) ||
    (/return\s*\(\s*\)/.test(content) && !/\.map\(/.test(content))
  return { hasReturn, returnsUndefinedOrNull, isEmptyRender }
}

function errUI(
  message: string,
  file: string,
  category: TestIssue['category'],
  severity: TestIssue['severity'] = 'error',
): TestIssue {
  return { dimension: 'ui', severity, message, file, category }
}

export { hasFile }
