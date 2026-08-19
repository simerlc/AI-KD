// ─── 增强版 Fix Agent ────────────────────────────────────
//
// 根据 Review 的 DebugIssue 生成 Patch，并应用到代码文件。
// 修复策略（确定性，不依赖 LLM）：
//   1. 结构修复：补齐必需文件、页面文件（空占位可运行）
//   2. 依赖修复：为缺失依赖补充 package.json 占位
//   3. 其余问题：标记为需要人工/LLM 修复（生成 placeholder patch）
//
// 输出 FixReport（patches + changedFiles + addressedIssues）。

import type { AppModel } from '@aikd/shared'
import type { DebugIssue, FixReport, Patch } from './types'
import { registry } from '@aikd/component-registry'

const REQUIRED_FILES = ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx']

export class Fixer {
  constructor(private appModel?: AppModel) {}

  /**
   * 根据 Review 问题生成 Patch 并应用，返回修复后的文件。
   * @param files 当前代码文件
   * @param issues Review 发现的问题
   * @returns 修复报告 + 修复后的文件
   */
  fix(files: Array<{ path: string; content: string }>, issues: DebugIssue[]): { report: FixReport; files: Array<{ path: string; content: string }> } {
    const fileMap = new Map(files.map((f) => [f.path, f.content]))
    const patches: Patch[] = []
    let addressed = 0

    // 1. 补齐必需文件
    for (const required of REQUIRED_FILES) {
      if (!fileMap.has(required)) {
        const content = this.placeholderFor(required)
        fileMap.set(required, content)
        patches.push({ file: required, op: 'create', content, category: 'structure' })
        addressed++
      }
    }

    // 2. 补齐页面文件（基于 appModel）
    if (this.appModel) {
      for (const page of this.appModel.schema.pages) {
        const pagePath = `src/pages/${page.id}.tsx`
        if (!fileMap.has(pagePath)) {
          const content = this.pagePlaceholder(page)
          fileMap.set(pagePath, content)
          patches.push({ file: pagePath, op: 'create', content, category: 'structure' })
          addressed++
        }
      }
    }

    // 3. 依赖修复：为"缺少 react/react-dom"补 package.json
    const depIssue = issues.find(
      (i) => i.category === 'dependency' && (i.message.includes('react') || i.message.includes('react-dom')),
    )
    if (depIssue && fileMap.has('package.json')) {
      try {
        const pkg = JSON.parse(fileMap.get('package.json')!)
        pkg.dependencies = pkg.dependencies ?? {}
        if (depIssue.message.includes('react')) pkg.dependencies.react = '^18.3.0'
        if (depIssue.message.includes('react-dom')) pkg.dependencies['react-dom'] = '^18.3.0'
        const content = JSON.stringify(pkg, null, 2)
        fileMap.set('package.json', content)
        patches.push({ file: 'package.json', op: 'modify', content, category: 'dependency' })
        addressed++
      } catch {
        // 若 package.json 非 JSON，跳过（已由 Review 报错）
      }
    }

    // 4. 针对"未注册组件"的问题：若能在 registry 找到近似组件，产出修改建议 patch
    for (const issue of issues) {
      if (issue.category === 'structure' && issue.message.includes('未注册的组件类型')) {
        const match = issue.message.match(/组件类型 "([^"]+)"/)
        if (match) {
          const unknownType = match[1]
          const lower = unknownType.toLowerCase()
          const found = registry.list().find((c) => c.type.toLowerCase() === lower)
          if (found) {
            patches.push({
              file: issue.file ?? '',
              op: 'modify',
              content: `// 建议：将 "${unknownType}" 替换为已注册组件 "${found.type}"`,
              category: 'structure',
              reason: `未注册组件 ${unknownType} → 建议替换为 ${found.type}`,
            })
            addressed++
          }
        }
      }
    }

    const changedFiles = new Set(patches.map((p) => p.file)).size
    return {
      report: {
        success: patches.length > 0,
        patches,
        changedFiles,
        addressedIssues: addressed,
        summary: `生成 ${patches.length} 个 Patch，修改 ${changedFiles} 个文件，处理 ${addressed} 个问题`,
      },
      files: Array.from(fileMap.entries()).map(([path, content]) => ({ path, content })),
    }
  }

  /** 必需文件占位 */
  private placeholderFor(path: string): string {
    switch (path) {
      case 'package.json':
        return JSON.stringify(
          {
            name: 'aikd-app',
            private: true,
            version: '0.1.0',
            type: 'module',
            scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' },
            dependencies: { react: '^18.3.0', 'react-dom': '^18.3.0' },
            devDependencies: { vite: '^5.4.0', typescript: '^5.5.0' },
          },
          null,
          2,
        )
      case 'index.html':
        return `<!DOCTYPE html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>AI快搭应用</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
      case 'src/main.tsx':
        return `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)`
      case 'src/App.tsx':
        return `import React from 'react'
export default function App() {
  return <div>AI快搭应用</div>
}`
      default:
        return ''
    }
  }

  /** 页面占位（含页面标题） */
  private pagePlaceholder(page: { id: string; title: string }): string {
    const title = (page.title ?? page.id).replace(/['"]/g, '')
    return `import React from 'react'

export default function ${this.sanitizeId(page.id)}() {
  return <div><h1>${title}</h1></div>
}`
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_$]/g, '_')
  }
}
