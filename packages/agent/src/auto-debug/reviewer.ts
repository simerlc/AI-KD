// ─── 增强版 Review Agent ─────────────────────────────────
//
// 覆盖四类检查：
//   1. TypeScript 错误：必需文件、import 引用、括号/引号平衡、常见语法错误
//   2. 运行异常：接入 Runtime Agent 的 RuntimeErrorReport（编译/运行/构建错误）
//   3. 页面结构：每页组件树完整、路由一致、组件注册合法、必需 prop
//   4. 功能缺失：需求功能点 ↔ 页面/组件/API 的覆盖度
//
// 输出 ReviewReport（含四类分类的明细与统计），供 Fix 生成 Patch。

import type { AppModel } from '@aikd/shared'
import { registry } from '@aikd/component-registry'
import type { DebugIssue, IssueCategory, ReviewReport } from './types'

export interface ReviewerInput {
  /** 代码文件 */
  files: Array<{ path: string; content: string }>
  /** 应用模型/蓝图（结构检查用） */
  appModel?: AppModel
  /** 需求功能点（功能缺失检查用） */
  features?: string[]
  /** 运行时错误报告（Run 阶段产物） */
  runtimeErrors?: {
    hasErrors: boolean
    errors: Array<{ kind: string; message: string; file?: string; line?: number; stack?: string; context?: string }>
  }
}

export class Reviewer {
  /**
   * 执行四类检查。
   */
  review(input: ReviewerInput): ReviewReport {
    const issues: DebugIssue[] = []

    this.checkTypescript(input.files, issues)
    this.checkRuntime(input.runtimeErrors, issues)
    this.checkStructure(input.files, input.appModel, issues)
    this.checkFeatures(input.features, input.appModel, issues)

    return this.buildReport(issues)
  }

  // ── 1. TypeScript 错误检查 ────────────────────────────
  private checkTypescript(files: Array<{ path: string; content: string }>, issues: DebugIssue[]): void {
    const REQUIRED = ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx']
    const filePaths = new Set(files.map((f) => f.path))

    // 必需文件
    for (const required of REQUIRED) {
      if (!filePaths.has(required)) {
        issues.push({
          category: 'typescript',
          severity: 'error',
          message: `缺少必需文件: ${required}`,
          file: required,
          suggestion: `请创建 ${required} 文件`,
        })
      }
    }

    // package.json 有效性
    const pkg = files.find((f) => f.path === 'package.json')
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg.content)
        if (!parsed?.dependencies?.react) {
          issues.push({ category: 'dependency', severity: 'warning', message: 'package.json 缺少 react 依赖', file: 'package.json', suggestion: '添加 "react" 到 dependencies' })
        }
        if (!parsed?.dependencies?.['react-dom']) {
          issues.push({ category: 'dependency', severity: 'warning', message: 'package.json 缺少 react-dom 依赖', file: 'package.json', suggestion: '添加 "react-dom" 到 dependencies' })
        }
      } catch {
        issues.push({ category: 'typescript', severity: 'error', message: 'package.json 不是有效的 JSON', file: 'package.json', suggestion: '修复 package.json 格式' })
      }
    }

    // 每个 TS/TSX 文件的语法检查（括号/引号平衡 + import 引用）
    for (const file of files) {
      if (!file.path.endsWith('.tsx') && !file.path.endsWith('.ts')) continue
      const { balanced, message } = this.checkBalance(file.content)
      if (!balanced) {
        issues.push({ category: 'typescript', severity: 'error', message: `${file.path}: ${message}`, file: file.path, suggestion: '修复括号/引号平衡' })
      }
      // 检查 import 引用的本地模块是否存在（相对导入）
      for (const m of file.content.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
        const base = this.resolveImport(file.path, m[1])
        if (base && !this.importExists(filePaths, base)) {
          issues.push({
            category: 'typescript',
            severity: 'error',
            message: `${file.path}: import "${m[1]}" 引用了不存在的模块 ${base}`,
            file: file.path,
            suggestion: `创建 ${base}.ts(x) 或修正 import 路径`,
          })
        }
      }
    }
  }

  /** 简易 import 路径解析：返回去扩展名的基础路径（如 src/pages/../api → src/api），由调用方检查各扩展名 */
  private resolveImport(fromPath: string, importPath: string): string {
    // 起始目录：fromPath 去掉文件名（如 src/pages/page_products.tsx → src/pages）
    const dirParts = fromPath.split('/').slice(0, -1)
    const importParts = importPath.split('/')

    // 处理 .. 向上跳转、. 保持当前目录
    for (const part of importParts) {
      if (part === '..') {
        if (dirParts.length > 0) dirParts.pop()
      } else if (part === '.' || part === '') {
        // 忽略
      } else {
        dirParts.push(part)
      }
    }

    return dirParts.join('/')
  }

  /** 检查 import 是否解析到已存在的文件（尝试各扩展名） */
  private importExists(filePaths: Set<string>, base: string): boolean {
    const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}/index.tsx`, `${base}/index.ts`]
    return candidates.some((c) => filePaths.has(c))
  }

  // ── 2. 运行异常检查 ───────────────────────────────────
  private checkRuntime(
    runtimeErrors?: ReviewerInput['runtimeErrors'],
    issues: DebugIssue[] = [],
  ): void {
    if (!runtimeErrors) return
    if (runtimeErrors.hasErrors && Array.isArray(runtimeErrors.errors)) {
      for (const err of runtimeErrors.errors) {
        const category: IssueCategory =
          err.kind === 'lint' || err.kind === 'compile' ? 'typescript' : err.kind === 'build' ? 'typescript' : 'runtime'
        issues.push({
          category,
          severity: 'error',
          message: `[${err.kind}] ${err.message}`,
          file: err.file,
          line: err.line,
          suggestion: err.stack ?? err.context ?? '请检查该运行/编译错误',
        })
      }
    }
  }

  // ── 3. 页面结构检查 ───────────────────────────────────
  private checkStructure(
    files: Array<{ path: string; content: string }>,
    appModel?: AppModel,
    issues: DebugIssue[] = [],
  ): void {
    const filePaths = new Set(files.map((f) => f.path))

    // 缺少 App.tsx / main.tsx 时无法判断页面结构
    if (!appModel) {
      if (!filePaths.has('src/App.tsx')) {
        issues.push({ category: 'structure', severity: 'error', message: '缺少 src/App.tsx，页面无法挂载', file: 'src/App.tsx' })
      }
      return
    }

    const pages = appModel.schema.pages
    const routes = appModel.schema.routes
    const pageIds = new Set(pages.map((p) => p.id))

    // 页面文件存在性
    for (const page of pages) {
      const pagePath = `src/pages/${page.id}.tsx`
      if (!filePaths.has(pagePath)) {
        issues.push({ category: 'structure', severity: 'error', message: `缺少页面文件: ${pagePath}`, file: pagePath, suggestion: `创建页面 ${page.id}` })
      }
      // 页面必须有组件
      if (!page.components || page.components.length === 0) {
        issues.push({ category: 'structure', severity: 'error', message: `页面 "${page.title}"(${page.id}) 没有任何组件`, file: pagePath, suggestion: `为页面 ${page.id} 添加组件` })
      }
    }

    // 路由一致性
    for (const route of routes) {
      if (!pageIds.has(route.pageId)) {
        issues.push({ category: 'structure', severity: 'error', message: `路由 "${route.path}" 引用了不存在的页面: ${route.pageId}`, suggestion: `修正路由指向有效页面` })
      }
    }
    if (!routes.some((r) => r.path === '/')) {
      issues.push({ category: 'structure', severity: 'error', message: '应用必须包含首页路由 (path: "/")', suggestion: '添加首页路由' })
    }

    // 组件引用合法 + 必需 prop
    const validateNode = (node: import('@aikd/shared').ComponentNode, location: string): void => {
      if (!registry.has(node.type)) {
        issues.push({ category: 'structure', severity: 'error', message: `${location}: 使用了未注册的组件类型 "${node.type}"`, suggestion: `改用 ${registry.list().map((c) => c.type).slice(0, 10).join('/')} 等已注册组件` })
      } else {
        const def = registry.get(node.type)!
        for (const prop of def.propsSchema) {
          if (prop.required && !(prop.name in (node.props ?? {}))) {
            issues.push({ category: 'structure', severity: 'warning', message: `${location} → ${node.type}: 缺少必需 prop "${prop.name}"`, suggestion: `为 ${node.type} 添加 ${prop.name}` })
          }
        }
      }
      node.children?.forEach((c, i) => validateNode(c, `${location} → ${node.type}[${i}]`))
    }
    for (const page of pages) {
      page.components?.forEach((c, i) => validateNode(c, `页面 ${page.id}[${i}]`))
    }
  }

  // ── 4. 功能缺失检查 ───────────────────────────────────
  private checkFeatures(features?: string[], appModel?: AppModel, issues: DebugIssue[] = []): void {
    if (!features || features.length === 0 || !appModel) return

    // 收集已表达的语义关键词（页面标题 + 组件 + 数据表）
    const expressed = new Set<string>()
    for (const page of appModel.schema.pages) {
      expressed.add(page.title.toLowerCase())
      expressed.add(page.id.toLowerCase())
      for (const comp of page.components ?? []) {
        expressed.add(comp.type.toLowerCase())
        const text = (comp.props?.text as string) ?? (comp.props?.title as string) ?? ''
        if (text) text.toLowerCase().split(/\s+/).forEach((w) => expressed.add(w))
      }
    }
    for (const ds of appModel.schema.dataSources ?? []) {
      expressed.add(ds.name.toLowerCase())
    }

    // 功能点是否覆盖
    for (const feature of features) {
      const f = feature.toLowerCase()
      const covered = Array.from(expressed).some((e) => e.includes(f) || f.includes(e))
      if (!covered && f.length > 1) {
        issues.push({
          category: 'feature',
          severity: 'warning',
          message: `需求功能「${feature}」可能未在应用中体现`,
          suggestion: `为「${feature}」增加对应页面或组件`,
        })
      }
    }
  }

  // ── 结果聚合 ──────────────────────────────────────────
  private buildReport(issues: DebugIssue[]): ReviewReport {
    const summary = {
      typescript: 0,
      runtime: 0,
      structure: 0,
      feature: 0,
      dependency: 0,
      other: 0,
    }
    for (const issue of issues) {
      summary[issue.category] = (summary[issue.category] ?? 0) + 1
    }

    const checkMeta: Array<{ category: IssueCategory; title: string }> = [
      { category: 'typescript', title: 'TypeScript 错误检查' },
      { category: 'runtime', title: '运行异常检查' },
      { category: 'structure', title: '页面结构检查' },
      { category: 'feature', title: '功能缺失检查' },
      { category: 'dependency', title: '依赖检查' },
    ]

    const checks = checkMeta.map((meta) => {
      const catIssues = issues.filter((i) => i.category === meta.category)
      return {
        category: meta.category,
        title: meta.title,
        passed: catIssues.filter((i) => i.severity === 'error').length === 0,
        details: catIssues.map((i) => `[${i.severity}] ${i.message}`),
      }
    })

    return {
      passed: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
      summary,
      checks,
    }
  }

  /** 检查括号/引号平衡 */
  private checkBalance(code: string): { balanced: boolean; message: string } {
    let depth = 0
    let inString: false | '"' | "'" | '`' = false
    for (let i = 0; i < code.length; i++) {
      const char = code[i]
      if (inString) {
        if (char === inString && code[i - 1] !== '\\') inString = false
        continue
      }
      if (char === '"' || char === "'" || char === '`') {
        inString = char
        continue
      }
      if (char === '{') depth++
      if (char === '}') depth--
      if (depth < 0) return { balanced: false, message: '花括号不匹配：多余的 "}"' }
    }
    if (depth !== 0) return { balanced: false, message: `花括号不匹配：剩余 ${depth} 个未闭合的 "{"` }
    return { balanced: true, message: '' }
  }
}
