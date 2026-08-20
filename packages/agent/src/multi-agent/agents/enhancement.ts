// ─── Enhancement Agent ──────────────────────────────────
//
// 生成基础版本后，不要直接结束。自动分析应用还缺少哪些生产级能力，
// 然后自动完善。例如学习笔记应用，当前只有 CRUD，建议增加：
//   + Markdown 编辑
//   + 标签系统
//   + 全文搜索
//   + AI 总结
//   + 收藏
//   + 历史记录
//
// Enhancement Agent 读取质量评分报告，产出增强后的 Blueprint（增量），
// 而不是重新生成整个项目。

import type { Agent, AgentContext, AgentMessagePayload } from '../types'
import type { LLMMessage } from '../../types'
import type { Blueprint, ProductPlan } from '@aikd/shared'
import { extractJson } from '../../utils'
import type { QualityEvaluationReport } from './quality-evaluation'
import type { AppPattern } from '../patterns'

/** Enhancement Agent 输入 */
export interface EnhancementInput {
  blueprint: Blueprint
  report: QualityEvaluationReport
  pattern?: AppPattern
  prompt: string
  /** 增强的最大能力数（默认 3） */
  maxCapabilities?: number
}

/** Enhancement Agent 输出 */
export interface EnhancementPayload {
  /** 增强后的 Blueprint（在原蓝图上增量扩展） */
  blueprint: Blueprint
  /** 本次增强新增的能力 */
  addedCapabilities: string[]
  /** 增强说明 */
  summary: string
  /** 是否实际发生了增强 */
  enhanced: boolean
}

export class EnhancementAgent implements Agent<EnhancementPayload> {
  readonly role = 'enhancement' as const
  readonly promptKey = 'enhancement'

  async execute(input: AgentMessagePayload, ctx: AgentContext): Promise<EnhancementPayload> {
    if (ctx.signal?.aborted) throw new Error('EnhancementAgent aborted')

    const req = input as unknown as EnhancementInput
    const maxCapabilities = req.maxCapabilities ?? 3

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'enhancement' as never,
      to: '*',
      payload: { phase: 'enhancement', message: '正在分析缺失的生产级能力并自动增强...' },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    // 收集待增强的能力（从报告 + 模式库进阶能力）
    const candidates = req.report.missingCapabilities
    if (req.pattern) {
      for (const cap of req.pattern.advancedCapabilities) {
        if (!candidates.includes(cap)) candidates.push(cap)
      }
    }

    // 去重 + 截断
    const targetCapabilities = Array.from(new Set(candidates)).slice(0, maxCapabilities)

    // 无待增强能力则直接返回原蓝图
    if (targetCapabilities.length === 0) {
      return {
        blueprint: req.blueprint,
        addedCapabilities: [],
        summary: '应用已具备完整的生产级能力，无需增强',
        enhanced: false,
      }
    }

    const messages = this.buildMessages(req, targetCapabilities)
    const response = await ctx.llm.complete(messages, {
      temperature: 0.4,
      max_tokens: 8192,
      signal: ctx.signal,
    })

    const parsed = extractJson(response) as Partial<Blueprint> | null
    if (!parsed) {
      // LLM 未产出合法蓝图，退化为「仅扩展 productPlan.advancedFeatures」
      return this.fallbackEnhancement(req, targetCapabilities)
    }

    // 增量合并：保留原蓝图结构，仅追加增强内容
    const enhanced: Blueprint = {
      ...req.blueprint,
      pages: Array.isArray(parsed.pages) && parsed.pages.length > req.blueprint.pages.length
        ? parsed.pages
        : req.blueprint.pages,
      pageComponents: Array.isArray(parsed.pageComponents)
        ? parsed.pageComponents
        : req.blueprint.pageComponents,
      dataModel: parsed.dataModel?.tables
        ? { tables: [...req.blueprint.dataModel.tables, ...parsed.dataModel.tables] }
        : req.blueprint.dataModel,
      apiDesign: parsed.apiDesign?.endpoints
        ? { endpoints: [...req.blueprint.apiDesign.endpoints, ...parsed.apiDesign.endpoints] }
        : req.blueprint.apiDesign,
      userFlow: parsed.userFlow?.flows
        ? { flows: [...req.blueprint.userFlow.flows, ...parsed.userFlow.flows] }
        : req.blueprint.userFlow,
      productPlan: {
        ...(req.blueprint.productPlan ?? { targetUsers: [], coreFeatures: [], advancedFeatures: [] }),
        advancedFeatures: Array.from(new Set([
          ...(req.blueprint.productPlan?.advancedFeatures ?? []),
          ...targetCapabilities,
        ])),
      },
    }

    return {
      blueprint: enhanced,
      addedCapabilities: targetCapabilities,
      summary: `增强完成：新增 ${targetCapabilities.join('、')}`,
      enhanced: true,
    }
  }

  private buildMessages(input: EnhancementInput, capabilities: string[]): LLMMessage[] {
    const system = `你是 AI快搭 的增强专家（Enhancement Agent）。
你的职责：基于现有 Blueprint，增量补充缺失的生产级能力，而不是重新生成整个项目。

你必须输出增强后的完整 Blueprint JSON（在原有基础上增量扩展，保留已有 pages/dataModel 结构）。

本次需要补充的能力：
${capabilities.map((c) => `- ${c}`).join('\n')}

增强原则：
1. 保留原有页面与数据模型，只追加增强所需的新页面/字段/接口
2. 新增页面必须符合 Blueprint 规范（pageType/tableId/组件规划）
3. 新能力必须有对应的数据模型与 API 支持
4. 禁止删除已有功能，禁止整体重写`

    const body = `## 当前 Blueprint
\`\`\`json
${JSON.stringify(input.blueprint, null, 2)}
\`\`\`

## 质量评分报告
${JSON.stringify(input.report, null, 2)}

## 原始需求
${input.prompt}

请输出增强后的完整 Blueprint JSON。`

    return [
      { role: 'system', content: system },
      { role: 'user', content: body },
    ]
  }

  /** LLM 失败时的降级增强：仅扩展 productPlan */
  private fallbackEnhancement(input: EnhancementInput, capabilities: string[]): EnhancementPayload {
    const plan: ProductPlan = input.blueprint.productPlan ?? {
      targetUsers: [],
      coreFeatures: [],
      advancedFeatures: [],
    }
    return {
      blueprint: {
        ...input.blueprint,
        productPlan: {
          ...plan,
          advancedFeatures: Array.from(new Set([...plan.advancedFeatures, ...capabilities])),
        },
      },
      addedCapabilities: capabilities,
      summary: `增强完成（降级）：新增 ${capabilities.join('、')}`,
      enhanced: true,
    }
  }
}
