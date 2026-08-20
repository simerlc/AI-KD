// ─── Application Quality Evaluation Agent ────────────────
//
// 生成后增加产品完整度评分。从五个维度评估：
//   - Product completeness（产品完整度）
//   - UI quality（UI 质量）
//   - Feature richness（功能丰富度）
//   - User experience（用户体验）
//   - Technical quality（技术质量）
//
// 评分低于 85 自动进入增强阶段（Enhancement Agent）。

import type { Blueprint } from '@aikd/shared'
import type { GeneratedFile } from '../../types'
import type { AppPattern } from '../patterns'

/** 质量评分报告 */
export interface QualityEvaluationReport {
  /** 综合得分 0-100 */
  score: number
  /** 五个维度得分 */
  dimensions: {
    productCompleteness: number
    uiQuality: number
    featureRichness: number
    userExperience: number
    technicalQuality: number
  }
  /** 问题列表 */
  issues: string[]
  /** 缺失的能力（供 Enhancement Agent 补充） */
  missingCapabilities: string[]
  /** 是否通过（≥85） */
  passed: boolean
  /** 通过阈值 */
  threshold: number
}

export interface QualityEvaluationInput {
  blueprint: Blueprint
  files: GeneratedFile[]
  pattern?: AppPattern
}

export class QualityEvaluationAgent {
  readonly role = 'quality-evaluation' as const

  evaluate(input: QualityEvaluationInput): QualityEvaluationReport {
    const bp = input.blueprint
    const files = input.files
    const pattern = input.pattern

    const issues: string[] = []
    const missing: string[] = []

    // ── 1. 产品完整度（Product completeness）──
    let productCompleteness = 100
    const pageCount = bp.pages.length
    if (pageCount < 3) {
      issues.push(`页面数量过少（${pageCount} 个），产品结构过于简单`)
      productCompleteness -= 30
    } else if (pageCount < 5) {
      issues.push(`页面数量偏少（${pageCount} 个），建议补充完整业务流程页面`)
      productCompleteness -= 15
    }

    const tableCount = bp.dataModel.tables.length
    if (tableCount === 0) {
      issues.push('缺少数据模型，产品无数据支撑')
      productCompleteness -= 25
    }

    const flowCount = bp.userFlow.flows.length
    if (flowCount === 0) {
      issues.push('缺少用户流程定义')
      productCompleteness -= 20
    }

    // 检查是否停留在纯 CRUD
    const hasBusinessLogic = this.hasBusinessLogic(bp, files)
    if (!hasBusinessLogic) {
      issues.push('功能停留在 CRUD，缺少真实业务逻辑')
      productCompleteness -= 20
      missing.push('业务逻辑增强')
    }

    // ── 2. UI 质量（UI quality）──
    let uiQuality = 100
    const css = files.find((f) => f.path.replace(/\\/g, '/').endsWith('index.css'))
    if (!css || !css.content.includes('--ds-color-primary')) {
      issues.push('未使用 Design System（缺少 Design Tokens）')
      uiQuality -= 40
    }
    const dsUsage = /ds-(btn|card|table|badge|input|modal|navbar|sidebar)/.test(files.map((f) => f.content).join('\n'))
    if (!dsUsage) {
      issues.push('未使用 Design System 组件')
      uiQuality -= 30
    }

    // ── 3. 功能丰富度（Feature richness）──
    let featureRichness = 100
    const coreFeatures = bp.productPlan?.coreFeatures ?? []
    if (coreFeatures.length < 3) {
      issues.push(`核心功能过少（${coreFeatures.length} 个），产品功能单薄`)
      featureRichness -= 30
    }
    // 对照模式库：缺失的功能模块
    if (pattern) {
      const missingModules = pattern.modules.filter((m) => {
        const bpText = JSON.stringify(bp).toLowerCase()
        return !bpText.includes(m.toLowerCase())
      })
      if (missingModules.length > pattern.modules.length * 0.5) {
        issues.push(`缺失多个核心功能模块：${missingModules.slice(0, 3).join('、')}`)
        featureRichness -= Math.min(30, missingModules.length * 5)
        missing.push(...missingModules.slice(0, 5))
      }
      // 进阶能力缺失（供增强）
      const missingAdvanced = pattern.advancedCapabilities.filter((c) => {
        const bpText = JSON.stringify(bp).toLowerCase()
        return !bpText.includes(c.toLowerCase())
      })
      if (missingAdvanced.length > 0) {
        missing.push(...missingAdvanced.slice(0, 3))
      }
    }

    // ── 4. 用户体验（User experience）──
    let userExperience = 100
    const allContent = files.map((f) => f.content).join('\n')
    if (!/loading|ds-loading|ds-spinner/i.test(allContent)) {
      issues.push('缺少 Loading 状态')
      userExperience -= 20
    }
    if (!/ds-empty|暂无|empty/i.test(allContent)) {
      issues.push('缺少 Empty 空状态')
      userExperience -= 20
    }
    if (!/error|catch|ds-error/i.test(allContent)) {
      issues.push('缺少 Error 错误处理')
      userExperience -= 20
    }
    if (!/@media/i.test(css?.content ?? '')) {
      issues.push('缺少移动端响应式')
      userExperience -= 20
    }

    // ── 5. 技术质量（Technical quality）──
    let technicalQuality = 100
    const hasApi = files.some((f) => f.path.replace(/\\/g, '/').endsWith('api.ts') && f.content.trim().length > 0)
    if (!hasApi) {
      issues.push('缺少 API 数据访问层')
      technicalQuality -= 25
    }
    const hasUnresolved = this.hasUnresolvedImports(files)
    if (hasUnresolved) {
      issues.push('存在未解析的 import')
      technicalQuality -= 25
    }

    // 综合评分（权重：产品完整度 30%，UI 20%，功能 20%，体验 15%，技术 15%）
    const score = Math.round(
      productCompleteness * 0.3 +
      uiQuality * 0.2 +
      featureRichness * 0.2 +
      userExperience * 0.15 +
      technicalQuality * 0.15,
    )

    return {
      score,
      dimensions: { productCompleteness, uiQuality, featureRichness, userExperience, technicalQuality },
      issues,
      missingCapabilities: Array.from(new Set(missing)),
      passed: score >= 85,
      threshold: 85,
    }
  }

  /** 判断是否有真实业务逻辑（非纯 CRUD） */
  private hasBusinessLogic(bp: Blueprint, files: GeneratedFile[]): boolean {
    // 检查 userFlow 是否有超过纯 CRUD 的操作
    const hasComplexFlow = bp.userFlow.flows.some((f) => f.steps.length >= 3)
    // 检查代码中是否有业务判断逻辑（如状态流转、筛选、统计）
    const code = files.map((f) => f.content).join('\n')
    const hasStatusLogic = /status|filter|统计|筛选|状态|审批|流程/i.test(code)
    return hasComplexFlow || hasStatusLogic
  }

  /** 检查是否有未解析的 import（简单启发式：项目内 import 指向不存在的文件） */
  private hasUnresolvedImports(files: GeneratedFile[]): boolean {
    const paths = new Set(files.map((f) => f.path.replace(/\\/g, '/')))
    for (const f of files) {
      const imports = f.content.match(/from\s+['"](\.[^'"]+)['"]/g) ?? []
      for (const imp of imports) {
        const target = imp.replace(/from\s+['"]/, '').replace(/['"]/, '')
        const resolved = this.resolveRelativeImport(f.path, target)
        if (resolved && !paths.has(resolved) && !paths.has(resolved + '.tsx') && !paths.has(resolved + '.ts') && !paths.has(resolved + '/index.ts')) {
          return true
        }
      }
    }
    return false
  }

  private resolveRelativeImport(from: string, target: string): string {
    const fromDir = from.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const parts = (fromDir + '/' + target).split('/')
    const stack: string[] = []
    for (const p of parts) {
      if (p === '.' || p === '') continue
      if (p === '..') stack.pop()
      else stack.push(p)
    }
    return stack.join('/')
  }
}
