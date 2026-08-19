// ─── ReviewAgent ─────────────────────────────────────────
//
// 负责代码质量检查（增强版，接入 Auto-Debug 系统）：
//   1. TypeScript 错误检查
//   2. 运行异常检查（来自 Runtime Agent）
//   3. 页面结构检查
//   4. 功能缺失检查
// 输出结构化问题清单（错误/警告/建议），供 FixAgent 修复。
// 复用 Auto-Debug 的 Reviewer 与既有 TesterAgent 静态校验逻辑。

import type {
  Agent,
  AgentContext,
  CodingProducedPayload,
  ReviewOutput,
  ReviewPassedPayload,
  ReviewFailedPayload,
} from '../types'
import type { GeneratedFile, LLMClient, TestResult } from '../../types'
import { TesterAgent } from '../../tester'
import { Reviewer } from '../../auto-debug/reviewer'

export type { ReviewOutput } from '../types'

export class ReviewAgent implements Agent<ReviewOutput> {
  readonly role = 'review' as const
  readonly promptKey = 'review'
  private tester: TesterAgent
  private reviewer = new Reviewer()

  constructor(llm: LLMClient) {
    this.tester = new TesterAgent(llm)
  }

  setLLM(llm: LLMClient): void {
    this.tester = new TesterAgent(llm)
  }

  async execute(input: CodingProducedPayload, ctx: AgentContext): Promise<ReviewOutput> {
    if (ctx.signal?.aborted) throw new Error('ReviewAgent aborted')

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'review',
      to: '*',
      payload: { phase: 'review', message: '正在审查代码...' },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    const files: GeneratedFile[] = input.files.map((f) => ({ path: f.path, content: f.content }))

    // 增强版四类检查（TypeScript / 运行异常 / 页面结构 / 功能缺失）
    // 注意：Blueprint 本身没有 features 字段，功能点来自需求分析阶段的透传。
    // 此前误读 input.blueprint.features 导致「功能缺失检查」长期空转。
    const reviewReport = this.reviewer.review({
      files,
      appModel: input.appModel,
      features: input.requirementFeatures,
    })

    // 同时保留既有 TesterAgent 的静态校验，二者问题合并
    const testResult: TestResult = await this.tester.test({
      appModel: input.appModel,
      files,
      signal: ctx.signal,
    })

    // 并入 CodingAgent 的生成后完整性检查结果（import / 路径 / 组件缺失）。
    // 这些问题是确定性的，必须进入修复闭环，否则会在 build 阶段才暴露。
    const integrityIssues = input.integrity?.issues ?? []
    const integrityErrors = integrityIssues
      .filter((i) => i.severity === 'error')
      .map((i) => i.message)
    const integrityWarnings = integrityIssues
      .filter((i) => i.severity === 'warning')
      .map((i) => i.message)
    const integritySuggestions = integrityIssues
      .map((i) => i.suggestion)
      .filter((s): s is string => !!s)

    const errors = [
      ...integrityErrors,
      ...reviewReport.issues.filter((i) => i.severity === 'error').map((i) => i.message),
      ...testResult.errors,
    ]
    const warnings = [
      ...integrityWarnings,
      ...reviewReport.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
      ...testResult.warnings,
    ]
    const suggestions = [
      ...integritySuggestions,
      ...reviewReport.issues.map((i) => i.suggestion).filter((s): s is string => !!s),
      ...testResult.suggestions,
    ]

    if (errors.length === 0) {
      ctx.onProgress?.({
        id: '',
        type: 'progress',
        from: 'review',
        to: '*',
        payload: { phase: 'review', message: '代码审查通过' },
        timestamp: Date.now(),
        sessionId: ctx.sessionId,
      })
      return { passed: true, summary: '代码审查通过' }
    }

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'review',
      to: '*',
      payload: {
        phase: 'review',
        message: `审查发现 ${errors.length} 个错误，准备修复...`,
      },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    return {
      passed: false,
      errors,
      warnings,
      suggestions,
      files,
    }
  }
}

/** 便捷工厂 */
export function createReviewAgent(llm: LLMClient): ReviewAgent {
  return new ReviewAgent(llm)
}
