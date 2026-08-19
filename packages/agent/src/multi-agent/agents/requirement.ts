// ─── RequirementAgent ─────────────────────────────────────
//
// 负责理解用户需求：将自然语言需求解析为结构化需求分析，
// 供 BlueprintAgent 生成应用蓝图。

import type { Agent, AgentContext, RequirementAnalyzedPayload } from '../types'
import type { LLMMessage } from '../../types'
import { buildSystemPrompt } from '../prompts'
import { extractJson } from '../../utils'

export class RequirementAgent implements Agent<RequirementAnalyzedPayload> {
  readonly role = 'requirement' as const
  readonly promptKey = 'requirement'

  async execute(
    input: RequirementAnalyzedPayload,
    ctx: AgentContext,
  ): Promise<RequirementAnalyzedPayload> {
    if (ctx.signal?.aborted) throw new Error('RequirementAgent aborted')

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'requirement',
      to: '*',
      payload: { phase: 'requirement', message: '正在理解需求...' },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    // 若已有解析结果（修改模式直接复用 existing），可直接透传
    const messages = this.buildMessages(input, ctx)
    const response = await ctx.llm.complete(messages, {
      temperature: 0.3,
      max_tokens: 8192,
      signal: ctx.signal,
    })

    const parsed = extractJson(response) as Partial<RequirementAnalyzedPayload> | null
    if (!parsed) {
      throw new Error('RequirementAgent: 无法解析 LLM 需求分析结果')
    }

    const result: RequirementAnalyzedPayload = {
      prompt: input.prompt,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : input.prompt,
      appType: this.normalizeAppType(parsed.appType ?? input.appType),
      appName: typeof parsed.appName === 'string' ? parsed.appName : input.appName,
      features: Array.isArray(parsed.features)
        ? parsed.features.map((f) => String(f)).filter((f) => f.trim().length > 0)
        : [],
      entities: Array.isArray(parsed.entities)
        ? parsed.entities
            .map((e) => ({
              name: String((e as { name?: unknown }).name ?? '').trim(),
              description: String((e as { description?: unknown }).description ?? '').trim(),
            }))
            .filter((e) => e.name.length > 0)
        : [],
      // 关键契约：修改模式上下文必须完整透传，否则 Fix→Blueprint 回环会丢失上下文
      existingAppModel: input.existingAppModel,
      existingBlueprint: input.existingBlueprint,
      blueprintChangeRequest: input.blueprintChangeRequest,
      history: input.history,
    }

    // ── 输出契约校验：需求分析不完整则不允许进入 Blueprint 阶段 ──
    if (result.features.length === 0) {
      throw new Error(
        'RequirementAgent: 需求分析缺少 features（关键功能点），无法进入 Blueprint 阶段',
      )
    }

    return result
  }

  private buildMessages(input: RequirementAnalyzedPayload, ctx: AgentContext): LLMMessage[] {
    const system = buildSystemPrompt(this.promptKey)
    const messages: LLMMessage[] = [{ role: 'system', content: system }]

    // 注入多轮历史（仅用户消息，最多最近 6 条）
    if (input.history && input.history.length > 0) {
      const userHistory = input.history.filter((m) => m.role === 'user').slice(-6)
      if (userHistory.length > 0) {
        messages.push({
          role: 'user',
          content: `以下是本次对话中用户之前提出的需求（按时间先后顺序）：\n\n${userHistory
            .map((m, i) => `${i + 1}. ${m.content}`)
            .join('\n\n')}\n\n请结合这些上下文理解用户的当前需求。`,
        })
      }
    }

    // 已有 App Model：修改模式上下文
    let body = ''
    if (input.existingAppModel) {
      body += `## 已有 App Model（当前应用状态，修改模式）\n\n\`\`\`json\n${JSON.stringify(
        input.existingAppModel,
        null,
        2,
      )}\n\`\`\`\n\n`
    }

    body += `## 用户当前需求\n\n${input.prompt}\n\n请输出结构化的需求分析 JSON。`
    messages.push({ role: 'user', content: body })
    return messages
  }

  private normalizeAppType(type: unknown): 'web' | 'h5' | 'static' {
    if (type === 'h5' || type === 'static' || type === 'web') return type
    return 'web'
  }
}
