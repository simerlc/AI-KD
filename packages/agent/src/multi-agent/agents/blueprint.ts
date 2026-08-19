// ─── BlueprintAgent ───────────────────────────────────────
//
// 负责根据需求分析结果生成「应用蓝图」（Application Blueprint）。
// 核心原则：用户需求不能直接进入代码生成，必须先产出合法 Blueprint。
// 使用 BlueprintGenerator（LLM）+ BlueprintValidator 保证输出合法。

import type { Agent, AgentContext, BlueprintProducedPayload, RequirementAnalyzedPayload } from '../types'
import type { Blueprint } from '@aikd/shared'
import { BlueprintGenerator } from '../blueprint/generator'
import { validateBlueprint } from '../blueprint/validator'
import type { LLMClient } from '../../types'

export class BlueprintAgent implements Agent<BlueprintProducedPayload> {
  readonly role = 'blueprint' as const
  readonly promptKey = 'blueprint'
  private generator: BlueprintGenerator | null = null

  constructor(llm?: LLMClient) {
    if (llm) this.generator = new BlueprintGenerator(llm)
  }

  /** 运行时注入 LLM */
  setLLM(llm: LLMClient): void {
    this.generator = new BlueprintGenerator(llm)
  }

  async execute(
    input: RequirementAnalyzedPayload,
    ctx: AgentContext,
  ): Promise<BlueprintProducedPayload> {
    if (ctx.signal?.aborted) throw new Error('BlueprintAgent aborted')
    if (!this.generator) throw new Error('BlueprintAgent: 未注入 LLM')

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'blueprint',
      to: '*',
      payload: { phase: 'blueprint', message: '正在生成应用蓝图（Blueprint）...' },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    const genResult = await this.generator.generate({
      prompt: input.prompt,
      requirement: {
        summary: input.summary || input.prompt,
        appType: input.appType,
        appName: input.appName,
        features: input.features,
        entities: input.entities,
      },
      existingBlueprint: input.existingBlueprint,
      changeRequest: input.blueprintChangeRequest,
      signal: ctx.signal,
    })

    // 二次校验，确保返回的 Blueprint 一定是合法的
    const validation = validateBlueprint(genResult.blueprint)
    if (!validation.success || !validation.data) {
      throw new Error(`BlueprintAgent: 生成的 Blueprint 未通过校验：${validation.errors.join('; ')}`)
    }
    const blueprint: Blueprint = validation.data

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'blueprint',
      to: '*',
      payload: {
        phase: 'blueprint',
        message: `应用蓝图生成完成（${blueprint.appName}，${blueprint.pages.length} 页）`,
        data: blueprint,
      },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    return {
      blueprint,
      notes: `基于 ${input.features.length} 个功能点生成，共 ${blueprint.pages.length} 个页面`,
      // 透传需求上下文，供 CodingAgent 做「生成前检查」的覆盖度校验
      requirementFeatures: input.features,
      requirementEntities: input.entities,
    }
  }
}

/** 便捷工厂 */
export function createBlueprintAgent(llm: LLMClient): BlueprintAgent {
  return new BlueprintAgent(llm)
}
