// ─── Debug 闭环（Generate → Run → Review → Fix → Run Again）──
//
// 自动 Debug 系统核心：把一次生成到最终可用串成完整闭环。
//
//   Generate  →  Run  →  Review  →  Fix  →  Run Again
//      │                              │
//      │◄─────────────────────────────┘（仍有错误则继续 Fix 轮）
//
// 每轮：Review 发现四类问题 → Fix 生成 Patch 应用 → Run Again 复验。
// 所有过程输出详细日志（DebugLog）。

import type { DebugLoopInput, DebugLoopResult, DebugRound, ReviewReport } from './types'
import { Reviewer } from './reviewer'
import { Fixer } from './fixer'
import { DebugLogger } from './logger'

export class DebugLoop {
  /** 执行完整 Debug 闭环 */
  async run(input: DebugLoopInput): Promise<DebugLoopResult> {
    const sessionId = input.sessionId ?? 'debug-session'
    const logger = new DebugLogger(sessionId)
    const maxFixRounds = input.maxFixRounds ?? 3
    const reviewer = new Reviewer()

    let files = input.files.map((f) => ({ path: f.path, content: f.content }))
    const rounds: DebugRound[] = []
    let finalReview: ReviewReport | undefined

    logger.log('generate', 'info', `开始 Debug 闭环，共 ${files.length} 个文件，最大修复轮数 ${maxFixRounds}`)

    for (let round = 0; round <= maxFixRounds; round++) {
      if (input.signal?.aborted) {
        logger.log('error', 'error', 'Debug 循环被中止')
        break
      }

      // ── Run：运行（收集运行时错误作为 Review 输入）─────
      logger.log('run', 'info', `第 ${round + 1} 轮：运行阶段`)
      const runtimeErrors = input.runtimeErrors

      // ── Review ─────────────────────────────────────────
      logger.log('review', 'info', `第 ${round + 1} 轮：审查阶段`)
      const review = reviewer.review({
        files,
        appModel: input.appModel,
        features: input.features,
        runtimeErrors,
      })
      const errorCount = review.issues.filter((i) => i.severity === 'error').length
      const warnCount = review.issues.filter((i) => i.severity === 'warning').length
      logger.log('review', errorCount === 0 ? 'success' : 'warning', `审查完成：${errorCount} 个错误，${warnCount} 个警告`)
      for (const check of review.checks) {
        logger.log('review', check.passed ? 'success' : 'warning', `${check.title}：${check.passed ? '通过' : '发现问题'}`, check.details)
      }

      // ── 通过则结束 ─────────────────────────────────────
      if (review.passed) {
        logger.log('done', 'success', `第 ${round + 1} 轮审查通过，Debug 闭环完成`)
        finalReview = review
        rounds.push({ round, review, files, passed: true })
        break
      }

      // 修复轮数用尽但仍未通过
      if (round >= maxFixRounds) {
        logger.log('error', 'error', `已修复 ${maxFixRounds} 轮仍未通过，Debug 闭环停止`)
        finalReview = review
        rounds.push({ round, review, files, passed: false })
        break
      }

      // ── Fix：生成 Patch 并应用 ──────────────────────────
      logger.log('fix', 'info', `第 ${round + 1} 轮：修复阶段（处理 ${errorCount} 个错误）`)
      const fixer = new Fixer(input.appModel)
      const { report, files: fixedFiles } = fixer.fix(files, review.issues)
      logger.log('fix', report.success ? 'success' : 'warning', report.summary)
      for (const patch of report.patches) {
        logger.log('fix', 'info', `  Patch: ${patch.op} ${patch.file}`, patch.content?.slice(0, 200))
      }
      files = fixedFiles

      // ── Run Again ───────────────────────────────────────
      logger.log('runAgain', 'info', `第 ${round + 1} 轮：修复后复验（Run Again）`)

      rounds.push({ round, review, fix: report, files, passed: false })
    }

    // 兜底：若循环正常结束但未 break（不可能发生，因必有 break），用最后结果
    if (!finalReview) {
      finalReview = reviewer.review({ files, appModel: input.appModel, features: input.features })
      logger.log('error', 'error', 'Debug 循环未正常收敛')
    }

    logger.log('done', 'info', 'Debug 闭环结束')
    const logEntries = logger.toJSON()

    return {
      success: finalReview.passed,
      files,
      rounds,
      finalReview,
      log: logEntries,
      logText: logger.toText(),
    }
  }
}

/** 便捷入口 */
export function runDebugLoop(input: DebugLoopInput): Promise<DebugLoopResult> {
  return new DebugLoop().run(input)
}
