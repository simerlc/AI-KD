// ─── ErrorAnalyzerAgent：测试错误分析定位 ──────────────────
//
// 职责（对应需求第五节"Analyze Error"）：
//   接收 ApplicationTestResult.errors，分析并归类，定位到具体文件/行号/上下文，
//   产出 RepairContext（修复上下文）供 RepairAgent 使用。
//
// 分析策略：
//   - 按 category 聚合（import/type/jsx/route/component/api/render/runtime/feature/dependency）
//   - 统计每个文件的问题数，确定"优先修复文件"
//   - 提取每条 error 的 file/line/context 形成可直接贴给 LLM 的错误日志
//   - 区分致命（build/runtime error）与次要（ui/feature/api warning）

import type { Blueprint } from '@aikd/shared'
import type { GeneratedFile } from '../../types'
import type { ApplicationTestResult, TestIssue } from './result'

export interface RepairContext {
  /** 用户原始需求（用于约束修复不偏离目标） */
  requirement: string
  /** 应用 Blueprint */
  blueprint: Blueprint
  /** 当前项目结构（path→content 摘要，供 LLM 定位） */
  projectStructure: { path: string; lineCount: number }[]
  /** 完整错误日志（可读文本，直接发给 LLM） */
  errorLog: string
  /** 出错文件清单（去重） */
  brokenFiles: string[]
  /** 最近修改记录（上一轮修复改了哪些文件，用于诊断回归） */
  recentChanges: string[]
  /** 错误分类统计 */
  categorySummary: Record<string, number>
  /** 是否致命（存在 build/runtime error） */
  fatal: boolean
  /** 修复轮次 */
  round: number
}

export class ErrorAnalyzerAgent {
  /**
   * 分析测试结果，产出结构化修复上下文。
   * 若测试通过（无 error），返回 null（无需修复）。
   */
  analyze(
    testResult: ApplicationTestResult,
    input: {
      requirement: string
      blueprint: Blueprint
      files: GeneratedFile[]
      recentChanges?: string[]
      round: number
    },
  ): RepairContext | null {
    const errors: TestIssue[] = testResult.errors
    if (errors.length === 0) return null

    const brokenFiles = Array.from(new Set(errors.map((e) => e.file).filter(Boolean) as string[]))
    const categorySummary: Record<string, number> = {}
    for (const e of errors) {
      const c = e.category ?? 'other'
      categorySummary[c] = (categorySummary[c] ?? 0) + 1
    }
    const fatal =
      testResult.tests.build.status === 'failed' || testResult.tests.runtime.status === 'failed'

    const projectStructure = input.files.map((f) => ({
      path: f.path,
      lineCount: f.content.split('\n').length,
    }))

    const errorLog = formatErrorLog(errors, testResult)

    return {
      requirement: input.requirement,
      blueprint: input.blueprint,
      projectStructure,
      errorLog,
      brokenFiles,
      recentChanges: input.recentChanges ?? [],
      categorySummary,
      fatal,
      round: input.round,
    }
  }
}

/** 把错误列表格式化为可读日志（贴给 LLM） */
export function formatErrorLog(errors: TestIssue[], result: ApplicationTestResult): string {
  const lines: string[] = []
  lines.push(`=== 应用自动测试失败报告 ===`)
  lines.push(`综合得分：${result.score} / 100（进入 Preview 需 ≥ 95）`)
  lines.push(`维度状态：build=${result.tests.build.status} runtime=${result.tests.runtime.status} ui=${result.tests.ui.status} feature=${result.tests.feature.status} api=${result.tests.api.status}`)
  lines.push(`错误总数：${errors.length}`)
  lines.push('')
  lines.push('--- 错误明细 ---')
  errors.forEach((e, i) => {
    const loc = e.file ? `${e.file}${e.line ? ':' + e.line : ''}` : '（全局）'
    lines.push(
      `[${i + 1}] (${e.category ?? 'other'}) ${loc}\n    ${e.message}` +
        (e.context ? `\n    上下文：${e.context}` : ''),
    )
  })
  return lines.join('\n')
}
