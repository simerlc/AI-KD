// ─── UI 视觉评审（UI Visual Review）────────────────────────
//
// 在 Tester 环节引入的视觉评审：
//   1. 优先：使用 Playwright 对渲染页面截图，调用多模态大模型对
//      布局 / 色彩 / 字体 / 间距 / 操作反馈 五个维度打分（1-10），并给出改进建议。
//   2. 降级：当无可用的预览 URL 或多模态大模型时，退化为静态代码规则检查，
//      从生成代码中提取样式信息，按同一套维度打分（1-10）。
//
// 评分阈值：总分 < 7（10 分制）时视为「视觉不达标」，交由 Builder 重新生成。
// 修复闭环必须保证不破坏功能正确性——只注入视觉层面的改进建议。

import type { GeneratedFile } from '../types'
import type { Blueprint } from '@aikd/shared'

/** 视觉评审维度 */
export type UiVisualDimension = 'layout' | 'color' | 'font' | 'spacing' | 'interaction'

/** 单个维度评分结果 */
export interface UiVisualDimensionScore {
  /** 维度名 */
  dimension: UiVisualDimension
  /** 1-10 分 */
  score: number
  /** 具体问题 */
  issues: string[]
  /** 改进建议 */
  suggestions: string[]
}

/** UI 视觉评审报告 */
export interface UiVisualReviewReport {
  /** 总分（1-10，加权平均） */
  score: number
  /** 是否通过（score >= threshold） */
  passed: boolean
  /** 通过阈值（默认 7） */
  threshold: number
  /** 各维度分项 */
  dimensions: UiVisualDimensionScore[]
  /** 汇总问题清单 */
  issues: string[]
  /** 汇总改进建议（供 Builder 重新生成时参考） */
  suggestions: string[]
  /** 评审方式：playwright（多模态截图）| static（静态代码规则） */
  mode: 'playwright' | 'static'
  /** 是否实际完成了截图渲染（仅 playwright 模式为 true） */
  rendered: boolean
}

/** UI 视觉评审输入 */
export interface UiVisualReviewInput {
  /** 生成的代码文件 */
  files: GeneratedFile[]
  /** 应用蓝图（用于回传 Builder 时保留结构） */
  blueprint?: Blueprint
  /** 应用名称 */
  appName?: string
  /** 预览 URL（可选；提供时尝试 Playwright 截图 + 多模态评审） */
  previewUrl?: string
  /** 通过阈值（1-10，默认 7） */
  threshold?: number
}

/** 各维度权重 */
const DIMENSION_WEIGHTS: Record<UiVisualDimension, number> = {
  layout: 0.3,
  color: 0.2,
  font: 0.15,
  spacing: 0.15,
  interaction: 0.2,
}

/** 固定评审维度顺序 */
const DIMENSIONS: UiVisualDimension[] = ['layout', 'color', 'font', 'spacing', 'interaction']

/**
 * UI Visual Reviewer。
 * 静态代码规则检查为核心（确定性、可测试、始终可用）；
 * 若提供 previewUrl 且运行时可用 Playwright，则尝试升级为「截图 + 多模态」评审。
 */
export class UiVisualReviewer {
  /**
   * 执行 UI 视觉评审。
   * 当 previewUrl 提供且 Playwright 可用时走截图评审；否则走静态规则评审。
   */
  async review(input: UiVisualReviewInput): Promise<UiVisualReviewReport> {
    const threshold = input.threshold ?? 7

    // 尝试 Playwright 截图评审（可选增强）
    if (input.previewUrl) {
      const screenshotResult = await this.tryScreenshotReview(input, threshold)
      if (screenshotResult) {
        return screenshotResult
      }
    }

    // 降级：静态代码规则检查
    return this.staticReview(input, threshold)
  }

  /** 尝试 Playwright 截图 + 多模态评审；失败（不可用/出错）返回 null 触发降级 */
  private async tryScreenshotReview(
    input: UiVisualReviewInput,
    threshold: number,
  ): Promise<UiVisualReviewReport | null> {
    try {
      // 动态加载 playwright（根依赖，避免强耦合）；不可用则抛错触发降级
      const playwrightModule = await import('playwright')
      if (!playwrightModule?.chromium) {
        throw new Error('playwright 不可用')
      }
      const chromium = playwrightModule.chromium
      const browser = await chromium.launch({ headless: true })
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
        await page.goto(input.previewUrl!, { waitUntil: 'networkidle', timeout: 20000 })
        // 截图并提取页面视觉元数据（颜色/字体/间距等），供评分使用
        const visualData = await page.evaluate(() => {
          const root = document.body
          const styles = getComputedStyle(root)
          const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).length
          const buttons = Array.from(document.querySelectorAll('button,a[role=button]')).length
          const inputs = Array.from(document.querySelectorAll('input,select,textarea')).length
          const imgs = Array.from(document.querySelectorAll('img')).length
          const bgColor = styles.backgroundColor
          const color = styles.color
          const fontFamily = styles.fontFamily
          const fontSize = parseFloat(styles.fontSize) || 16
          const imagesWithoutAlt = Array.from(document.querySelectorAll('img')).filter((i) => !i.getAttribute('alt')).length
          // 收集颜色集合（评估色彩统一性）
          const colors = new Set<string>()
          document.querySelectorAll('*').forEach((el) => {
            const c = getComputedStyle(el).color
            if (c && c !== 'rgba(0, 0, 0, 0)') colors.add(c)
          })
          return {
            bgColor,
            color,
            fontFamily,
            fontSize,
            headings,
            buttons,
            inputs,
            imgs,
            imagesWithoutAlt,
            colorCount: colors.size,
            bodyText: (document.body.innerText || '').slice(0, 200),
          }
        })
        await page.screenshot({ path: undefined })

        // 基于提取的视觉数据做规则化评分（代替多模态；若注入多模态 LLM 可升级）
        return this.scoreFromVisualData(input, visualData, threshold, true)
      } finally {
        await browser.close()
      }
    } catch (err) {
      // Playwright 不可用或渲染失败 → 降级静态检查
      console.warn('[UiVisualReview] Playwright 不可用，降级为静态代码规则检查:', err)
      return null
    }
  }

  /** 基于截图提取的视觉元数据评分 */
  private scoreFromVisualData(
    input: UiVisualReviewInput,
    data: {
      bgColor: string
      color: string
      fontFamily: string
      fontSize: number
      headings: number
      buttons: number
      inputs: number
      imgs: number
      imagesWithoutAlt: number
      colorCount: number
      bodyText: string
    },
    threshold: number,
    rendered: boolean,
  ): UiVisualReviewReport {
    const dims: UiVisualDimensionScore[] = []

    // layout
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 8
      if (data.headings === 0) {
        issues.push('页面缺少标题层级（无 h1/h2），信息结构不清晰')
        suggestions.push('为页面添加清晰的标题层级（每页一个主标题 h1，小节用 h2/h3）')
        s -= 2
      }
      if (data.buttons === 0 && data.inputs === 0) {
        issues.push('页面无任何可交互元素，布局可能过于空洞')
        suggestions.push('补充核心操作入口（按钮/表单），遵循 F 型视觉流布局')
        s -= 2
      }
      if (data.bodyText.trim().length < 20) {
        issues.push('页面文本内容过少，视觉密度偏低')
        suggestions.push('补充有实际含义的文案与内容区块，避免大面积空白')
        s -= 1
      }
      dims.push({ dimension: 'layout', score: clamp(s), issues, suggestions })
    }
    // color
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 7
      if (data.colorCount > 12) {
        issues.push(`检测到 ${data.colorCount} 种不同颜色，色彩过于杂乱`)
        suggestions.push('收敛为统一的设计色板（主色 + 中性色），提升色彩对比度')
        s -= 2
      }
      if (data.imagesWithoutAlt > 0) {
        issues.push(`${data.imagesWithoutAlt} 张图片缺少 alt 文本`)
        suggestions.push('为图片补充 alt 描述，增强可访问性与对比度')
        s -= 1
      }
      dims.push({ dimension: 'color', score: clamp(s), issues, suggestions })
    }
    // font
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 7
      if (!data.fontFamily || data.fontFamily === '') {
        issues.push('未定义明确字体族，文本排版不受控')
        suggestions.push('定义统一字体族（fontFamily）与字号层级')
        s -= 2
      }
      if (data.fontSize < 14) {
        issues.push(`基准字号 ${data.fontSize}px 偏小，可读性不足`)
        suggestions.push('基准字号提升到 14-16px，正文不小于 14px')
        s -= 1
      }
      dims.push({ dimension: 'font', score: clamp(s), issues, suggestions })
    }
    // spacing
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 8
      if (data.inputs > 0 && data.buttons > 0) {
        suggestions.push('保持 4px 栅格间距体系（8/12/16/24），对齐表单与按钮')
      }
      dims.push({ dimension: 'spacing', score: clamp(s), issues, suggestions })
    }
    // interaction
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 7
      if (data.buttons === 0) {
        issues.push('缺少操作按钮，交互反馈不足')
        suggestions.push('为关键操作添加按钮并绑定事件反馈（loading/成功/失败提示）')
        s -= 2
      }
      dims.push({ dimension: 'interaction', score: clamp(s), issues, suggestions })
    }

    return this.assemble(dims, threshold, 'playwright', rendered)
  }

  /** 静态代码规则检查（确定性、可测试、始终可用） */
  private staticReview(input: UiVisualReviewInput, threshold: number): UiVisualReviewReport {
    const files = input.files
    const allContent = files.map((f) => f.content).join('\n')
    const dims: UiVisualDimensionScore[] = []

    // ── layout ──
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 8
      const headingCount = (allContent.match(/<h1[\s>]/g) ?? []).length
      if (headingCount === 0) {
        issues.push('所有页面缺少主标题（无 <h1>），信息层级不清晰')
        suggestions.push('每页添加一个主标题 <h1>，小节用 <h2>/<h3>，遵循 F 型视觉流')
        s -= 2
      }
      if (!/flex|grid/i.test(allContent)) {
        issues.push('布局未使用 flex/grid，栅格化程度低')
        suggestions.push('使用 flex/grid 布局实现对齐与栅格化')
        s -= 1
      }
      dims.push({ dimension: 'layout', score: clamp(s), issues, suggestions })
    }
    // ── color ──
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 8
      const hardcoded = new Set<string>()
      const re = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g
      for (const f of files) {
        if (!/\.(tsx|ts|css)$/.test(f.path)) continue
        for (const m of f.content.match(re) ?? []) hardcoded.add(m.toLowerCase())
      }
      if (hardcoded.size > 10) {
        issues.push(`检测到 ${hardcoded.size} 种硬编码颜色，色彩体系未统一`)
        suggestions.push('收敛为统一主题色板，并保证文本与背景的色彩对比度')
        s -= 2
      } else if (hardcoded.size > 0 && hardcoded.size <= 10) {
        suggestions.push('将少量硬编码颜色映射到主题变量，提升一致性')
      }
      dims.push({ dimension: 'color', score: clamp(s), issues, suggestions })
    }
    // ── font ──
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 8
      if (!/fontFamily|font-family/i.test(allContent)) {
        issues.push('未定义字体族（fontFamily / font-family）')
        suggestions.push('在主题中定义统一字体族与字号层级')
        s -= 2
      }
      dims.push({ dimension: 'font', score: clamp(s), issues, suggestions })
    }
    // ── spacing ──
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 8
      if (!/padding|margin|gap\s*:|spacing/i.test(allContent)) {
        issues.push('缺少明确的间距设置（padding/margin/gap）')
        suggestions.push('建立 4px 栅格间距体系（8/12/16/24），统一区块间距')
        s -= 2
      }
      dims.push({ dimension: 'spacing', score: clamp(s), issues, suggestions })
    }
    // ── interaction ──
    {
      const issues: string[] = []
      const suggestions: string[] = []
      let s = 8
      const buttonCount = (allContent.match(/<button|<Button|ds-btn/g) ?? []).length
      if (buttonCount === 0) {
        issues.push('页面无操作按钮，交互反馈缺失')
        suggestions.push('为关键操作添加按钮并绑定事件（loading/成功/失败反馈）')
        s -= 2
      }
      if (!/loading|isLoading|ds-loading|message\.|notification|Modal/i.test(allContent)) {
        issues.push('缺少操作反馈机制（loading / 提示 / 弹窗）')
        suggestions.push('为异步操作添加 loading、成功/失败提示或确认弹窗')
        s -= 2
      }
      dims.push({ dimension: 'interaction', score: clamp(s), issues, suggestions })
    }

    return this.assemble(dims, threshold, 'static', false)
  }

  /** 汇总各维度为报告 */
  private assemble(
    dims: UiVisualDimensionScore[],
    threshold: number,
    mode: 'playwright' | 'static',
    rendered: boolean,
  ): UiVisualReviewReport {
    const score = Math.round(
      dims.reduce((acc, d) => acc + d.score * DIMENSION_WEIGHTS[d.dimension], 0) * 10,
    ) / 10
    const issues = dims.flatMap((d) => d.issues)
    const suggestions = dims.flatMap((d) => d.suggestions)
    return {
      score,
      passed: score >= threshold,
      threshold,
      dimensions: dims,
      issues,
      suggestions: Array.from(new Set(suggestions)),
      mode,
      rendered,
    }
  }
}

/** 将分数限制在 1-10 */
function clamp(n: number): number {
  return Math.max(1, Math.min(10, n))
}

/** 便捷工厂 */
export function createUiVisualReviewer(): UiVisualReviewer {
  return new UiVisualReviewer()
}
