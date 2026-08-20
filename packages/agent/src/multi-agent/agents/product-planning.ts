// ─── Product Planning Agent ──────────────────────────────
//
// 产品规划 Agent：禁止 LLM 直接生成代码。用户需求必须先经过产品规划，
// 产出结构化的产品规划信息（目标用户 / 核心功能 / 进阶功能 / 推荐模式），
// 然后才能进入 Application Blueprint 阶段。
//
// 流程：用户需求 → Product Planning Agent → Application Blueprint → UI → 架构 → 代码生成

import type { Agent, AgentContext, AgentMessagePayload } from '../types'
import type { LLMMessage } from '../../types'
import type { ProductPlan } from '@aikd/shared'
import { extractJson } from '../../utils'
import { recommendPattern, type AppPattern } from '../patterns'

/** Product Planning Agent 输出 */
export interface ProductPlanningPayload {
  /** 原始需求 */
  prompt: string
  /** 产品规划信息 */
  plan: ProductPlan
  /** 推荐的模式 ID */
  patternId: string
  /** 推荐的应用模式 */
  pattern: AppPattern
}

/** Product Planning Agent 输入（复用 RequirementAnalyzedPayload 的字段） */
export interface ProductPlanningInput {
  prompt: string
  summary: string
  appName?: string
  features: string[]
  entities: Array<{ name: string; description: string }>
  /** 修改模式：已有 Blueprint 的产品规划 */
  existingPlan?: ProductPlan
}

export class ProductPlanningAgent implements Agent<ProductPlanningPayload> {
  readonly role = 'product-planning' as const
  readonly promptKey = 'product-planning'

  async execute(
    input: AgentMessagePayload,
    ctx: AgentContext,
  ): Promise<ProductPlanningPayload> {
    if (ctx.signal?.aborted) throw new Error('ProductPlanningAgent aborted')

    const req = input as unknown as ProductPlanningInput

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'product-planning' as never,
      to: '*',
      payload: { phase: 'product-planning', message: '正在进行产品规划...' },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    const messages = this.buildMessages(req, ctx)
    const response = await ctx.llm.complete(messages, {
      temperature: 0.4,
      max_tokens: 4096,
      signal: ctx.signal,
    })

    const parsed = extractJson(response) as Partial<ProductPlan> | null
    const plan: ProductPlan = {
      targetUsers: this.toStringArray((parsed as Record<string, unknown> | null)?.target_users ?? (parsed as Record<string, unknown> | null)?.targetUsers),
      coreFeatures: this.toStringArray((parsed as Record<string, unknown> | null)?.core_features ?? (parsed as Record<string, unknown> | null)?.coreFeatures),
      advancedFeatures: this.toStringArray((parsed as Record<string, unknown> | null)?.advanced_features ?? (parsed as Record<string, unknown> | null)?.advancedFeatures),
      valueProposition: typeof (parsed as Record<string, unknown> | null)?.value_proposition === 'string'
        ? (parsed as Record<string, unknown> | null)?.value_proposition as string
        : undefined,
    }

    // 兜底：LLM 未产出完整规划时，从需求 features/entities 派生
    if (plan.coreFeatures.length === 0) {
      plan.coreFeatures = req.features.length > 0 ? req.features : ['数据管理', '列表查询']
    }
    if (plan.targetUsers.length === 0) {
      plan.targetUsers = ['企业用户']
    }

    // 推荐应用模式（Pattern Library）
    const pattern = recommendPattern({
      prompt: req.prompt,
      summary: req.summary,
      appName: req.appName,
      features: [...plan.coreFeatures, ...plan.advancedFeatures],
    })

    plan.pattern = pattern.id

    return {
      prompt: req.prompt,
      plan,
      patternId: pattern.id,
      pattern,
    }
  }

  private buildMessages(input: ProductPlanningInput, ctx: AgentContext): LLMMessage[] {
    const system = `你是 AI快搭 的产品规划专家（Product Planning Agent）。
你的职责：将用户需求转化为结构化的产品规划，而不是直接生成代码。

你必须输出 JSON，格式如下：
{
  "target_users": ["目标用户1", "目标用户2"],
  "core_features": ["核心功能1", "核心功能2"],   // MVP 必须有的功能
  "advanced_features": ["进阶功能1"],             // 可后续增强的功能
  "value_proposition": "一句话产品价值主张"
}

规划原则：
1. 核心功能必须是真实业务能力（如笔记的 Markdown 编辑、CRM 的客户跟进），禁止停留在"增删改查"
2. 进阶功能体现行业经验（如 AI 总结、知识关联、数据分析）
3. 目标用户要具体（学生/开发者/销售团队等），不要笼统
4. 禁止输出空功能、placeholder、默认 CRUD 模板`

    const body = `## 需求概述
${input.summary}

## 推断的应用名
${input.appName ?? '（未确定）'}

## 已识别功能点
${input.features.join('、') || '（无）'}

## 已识别数据实体
${input.entities.map((e) => `${e.name}（${e.description}）`).join('、') || '（无）'}

## 用户原始需求
${input.prompt}

请输出产品规划 JSON。`

    return [
      { role: 'system', content: system },
      { role: 'user', content: body },
    ]
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.map((v) => String(v).trim()).filter((s) => s.length > 0)
  }
}
