// ─── Design Review Agent ─────────────────────────────────
//
// UI 自动审查流程。应用生成后自动检查：
//   1. 视觉：布局是否合理、色彩是否统一、信息层级是否清晰
//   2. 组件：是否重复创建组件、是否正确使用 Design System
//   3. 体验：是否响应式、是否存在交互问题
//
// 输出 Design Review Report（score / issues / suggestions）。
// score < 90 时触发优化流程。

import type { Blueprint } from '@aikd/shared'
import type { GeneratedFile } from '../types'
import { DESIGN_SYSTEM_COMPONENTS, getDSComponent, isDesignSystemComponent } from './components'
import { DEFAULT_TOKENS, type ColorTokens } from './tokens'
import { getTemplate, recommendTemplate } from './templates'

/** Design Review Report（对齐需求第五节输出结构） */
export interface DesignReviewReport {
  /** 综合得分 0-100 */
  score: number
  /** 问题列表 */
  issues: string[]
  /** 优化建议列表 */
  suggestions: string[]
  /** 通过阈值（< 90 进入优化流程） */
  passThreshold: number
  /** 是否通过 */
  passed: boolean
  /** 三个维度的分项结果 */
  dimensions: {
    visual: { score: number; issues: string[] }
    component: { score: number; issues: string[] }
    experience: { score: number; issues: string[] }
  }
}

/** Design Review 输入 */
export interface DesignReviewInput {
  files: GeneratedFile[]
  blueprint: Blueprint
  appName?: string
  appDescription?: string
  features?: string[]
}

/** 设计系统合法颜色（十六进制小写） */
const TOKEN_COLORS: Set<string> = new Set(
  Object.values(DEFAULT_TOKENS.colors).map((c) => c.toLowerCase()),
)

/** 硬编码颜色的检测正则（内联样式中的十六进制 / rgb） */
const HARDCODED_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g

/**
 * Design Review Agent。
 * 静态分析生成应用的代码文件，产出 Design Review Report。
 */
export class DesignReviewAgent {
  readonly role = 'design-review' as const

  /**
   * 审查生成的应用代码，产出设计审查报告。
   */
  review(input: DesignReviewInput): DesignReviewReport {
    const files = input.files
    const visual = this.reviewVisual(files)
    const component = this.reviewComponent(files, input.blueprint)
    const experience = this.reviewExperience(files)

    const score = Math.round(visual.score * 0.4 + component.score * 0.35 + experience.score * 0.25)
    const issues = [...visual.issues, ...component.issues, ...experience.issues]
    const suggestions = this.buildSuggestions(issues, input)

    return {
      score,
      issues,
      suggestions,
      passThreshold: 90,
      passed: score >= 90,
      dimensions: { visual, component, experience },
    }
  }

  // ── 1. 视觉审查 ──────────────────────────────────────
  private reviewVisual(files: GeneratedFile[]): { score: number; issues: string[] } {
    const issues: string[] = []
    let score = 100

    // 检查是否注入了 Design System CSS（token 变量）
    const css = files.find((f) => f.path.replace(/\\/g, '/').endsWith('index.css'))
    if (!css || !css.content.includes('--ds-color-primary')) {
      issues.push('缺少 Design System 样式注入（index.css 未包含 --ds-color-* token 变量）')
      score -= 30
    }

    // 检查硬编码颜色（内联样式中出现非 token 颜色）
    const hardcodedColors = new Set<string>()
    for (const f of files) {
      if (!f.path.endsWith('.tsx') && !f.path.endsWith('.ts')) continue
      const matches = f.content.match(HARDCODED_COLOR_RE) ?? []
      for (const m of matches) {
        const normalized = m.toLowerCase()
        if (!TOKEN_COLORS.has(normalized) && !normalized.startsWith('rgba(0,0,0') && !normalized.startsWith('rgba(0, 0, 0')) {
          hardcodedColors.add(normalized)
        }
      }
    }
    if (hardcodedColors.size > 0) {
      issues.push(`存在 ${hardcodedColors.size} 处硬编码颜色，未使用 Design Token（如 ${Array.from(hardcodedColors).slice(0, 3).join(', ')}）`)
      score -= Math.min(30, hardcodedColors.size * 5)
    }

    // 检查信息层级：单个页面文件内 h1 不应超过 1 个（跨页面各有一个 h1 是正常的）
    const pageFiles = files.filter((f) => f.path.endsWith('.tsx'))
    const pagesWithMultipleH1 = pageFiles
      .map((f) => (f.content.match(/<h1[\s>]/g)?.length ?? 0))
      .filter((count) => count > 1)
    if (pagesWithMultipleH1.length > 0) {
      const total = pagesWithMultipleH1.reduce((a, b) => a + b, 0)
      issues.push(`${pagesWithMultipleH1.length} 个页面存在多个 h1（共 ${total} 个），信息层级不清晰（每页应至多一个主标题）`)
      score -= 10
    }

    return { score: Math.max(0, score), issues }
  }

  // ── 2. 组件审查 ──────────────────────────────────────
  private reviewComponent(files: GeneratedFile[], blueprint: Blueprint): { score: number; issues: string[] } {
    const issues: string[] = []
    let score = 100

    // 收集 Blueprint 中实际使用的组件类型
    const usedTypes = new Set<string>()
    const walk = (nodes: Array<{ type: string; children?: unknown[] }>): void => {
      for (const n of nodes) {
        usedTypes.add(n.type)
        if (n.children) walk(n.children as Array<{ type: string; children?: unknown[] }>)
      }
    }
    for (const pc of blueprint.pageComponents) {
      walk(pc.components as Array<{ type: string; children?: unknown[] }>)
    }

    // 检查是否使用了 Design System 组件（通过 ds- 类名）
    const allContent = files.map((f) => f.content).join('\n')
    const dsClassUsage = DESIGN_SYSTEM_COMPONENTS.filter((c) => allContent.includes(c.className)).length
    if (dsClassUsage === 0) {
      issues.push('未使用任何 Design System 组件（代码中无 ds-* 类名），组件复用率低')
      score -= 40
    }

    // 检查重复创建组件：非 Design System 的原始 HTML 元素（button/table/input）被大量直接使用
    const rawButtonCount = (allContent.match(/<button(?![^>]*ds-btn)/g) ?? []).length
    const rawTableCount = (allContent.match(/<table(?![^>]*ds-table)/g) ?? []).length
    if (rawButtonCount > 2) {
      issues.push(`存在 ${rawButtonCount} 个未使用 Design System 的原生 <button>，应统一用 ds-btn`)
      score -= Math.min(20, rawButtonCount * 3)
    }
    if (rawTableCount > 1) {
      issues.push(`存在 ${rawTableCount} 个未使用 Design System 的原生 <table>，应统一用 ds-table`)
      score -= Math.min(20, rawTableCount * 5)
    }

    // 检查是否引用了未注册的组件（蓝图中的 type 是否是 Design System 或 registry 组件）
    const unknownTypes = Array.from(usedTypes).filter(
      (t) => !isDesignSystemComponent(t) && !this.isKnownRegistryComponent(t),
    )
    if (unknownTypes.length > 0) {
      issues.push(`使用了未在设计体系/组件注册表中的组件类型：${unknownTypes.join(', ')}`)
      score -= Math.min(20, unknownTypes.length * 5)
    }

    return { score: Math.max(0, score), issues }
  }

  // ── 3. 体验审查 ──────────────────────────────────────
  private reviewExperience(files: GeneratedFile[]): { score: number; issues: string[] } {
    const issues: string[] = []
    let score = 100
    const allContent = files.map((f) => f.content).join('\n')

    // 响应式：检查是否有 media query（移动端适配）
    const css = files.find((f) => f.path.replace(/\\/g, '/').endsWith('index.css'))
    const hasMediaQuery = css ? /@media\s*\(max-width/.test(css.content) : false
    if (!hasMediaQuery) {
      issues.push('缺少移动端响应式适配（无 @media 断点）')
      score -= 20
    }

    // Loading 状态：检查是否有 loading 相关处理
    const hasLoading = /loading|ds-loading|ds-spinner|isLoading/i.test(allContent)
    if (!hasLoading) {
      issues.push('缺少 Loading 状态处理（数据加载无反馈）')
      score -= 20
    }

    // Empty 状态：检查是否有空态处理
    const hasEmpty = /ds-empty|暂无数据|暂无内容|empty|isEmpty/i.test(allContent)
    if (!hasEmpty) {
      issues.push('缺少 Empty 空状态处理（无数据时无反馈）')
      score -= 15
    }

    // Error 状态：检查是否有错误处理
    const hasError = /ds-error|catch\s*\(|error|try\s*\{/i.test(allContent)
    if (!hasError) {
      issues.push('缺少 Error 错误状态处理（接口失败无反馈）')
      score -= 15
    }

    // 交互：检查是否有确认对话框 / 重试按钮（体验完整性）
    const hasConfirm = /confirm\(|确认|ds-modal/i.test(allContent)
    const hasRetry = /重试|retry/i.test(allContent)
    if (!hasConfirm && !hasRetry) {
      issues.push('交互反馈不完整（缺少确认/重试等交互）')
      score -= 10
    }

    return { score: Math.max(0, score), issues }
  }

  // ── 建议生成 ──────────────────────────────────────
  private buildSuggestions(issues: string[], input: DesignReviewInput): string[] {
    const suggestions: string[] = []
    const template = recommendTemplate({
      appName: input.appName ?? input.blueprint.appName,
      description: input.appDescription,
      features: input.features,
    })

    if (issues.some((i) => i.includes('硬编码颜色'))) {
      suggestions.push('将所有硬编码颜色替换为 Design Token（var(--ds-color-*)）')
    }
    if (issues.some((i) => i.includes('原生 <button>'))) {
      suggestions.push('将原生 <button> 替换为 Design System 的 Button 组件（ds-btn）')
    }
    if (issues.some((i) => i.includes('原生 <table>'))) {
      suggestions.push('将原生 <table> 替换为 Design System 的 Table 组件（ds-table）')
    }
    if (issues.some((i) => i.includes('缺少移动端'))) {
      suggestions.push('补充移动端响应式断点（@media max-width: 768px）')
    }
    if (issues.some((i) => i.includes('Loading'))) {
      suggestions.push('为所有数据请求添加 Loading 状态（ds-loading / ds-spinner）')
    }
    if (issues.some((i) => i.includes('Empty'))) {
      suggestions.push('为列表/数据区域添加 Empty 空状态（ds-empty：图标 + 描述 + 操作）')
    }
    if (issues.some((i) => i.includes('Error'))) {
      suggestions.push('为所有 API 调用添加 Error 错误处理（错误信息 + 重试按钮）')
    }
    if (issues.some((i) => i.includes('信息层级'))) {
      suggestions.push('优化信息层级：每页至多一个 h1 主标题，其余用 h2/h3')
    }

    // 基于模板建议
    if (suggestions.length > 0 || issues.length > 0) {
      suggestions.push(`参考「${template.name}」模板优化页面结构，优先复用成熟组件组合`)
    }

    // 去重
    return Array.from(new Set(suggestions))
  }

  /** 已知的 component-registry 组件（与 @aikd/component-registry 保持同步） */
  private isKnownRegistryComponent(type: string): boolean {
    const known = new Set([
      'Container', 'Grid', 'Flex', 'Section',
      'Heading', 'Text', 'Paragraph',
      'Button', 'Link',
      'Input', 'Textarea', 'Select', 'Checkbox', 'Form',
      'Image', 'Card', 'List', 'Table', 'Detail',
      'Header', 'Footer', 'NavBar', 'Tabs',
      'Alert', 'Badge', 'Modal',
      'Dashboard', 'StatCard', 'Chart', 'Login',
    ])
    return known.has(type)
  }
}

/** 便捷工厂 */
export function createDesignReviewAgent(): DesignReviewAgent {
  return new DesignReviewAgent()
}

/** 复用导出（供外部判断颜色合法性） */
export function isTokenColor(color: string): boolean {
  return TOKEN_COLORS.has(color.toLowerCase())
}

export type { ColorTokens }
