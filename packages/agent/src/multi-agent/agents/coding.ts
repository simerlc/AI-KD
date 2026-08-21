// ─── CodingAgent ─────────────────────────────────────────
//
// 负责根据「合法 Blueprint」生成代码。
// 强约束：CodingAgent 只能读取通过 validateBlueprint 校验的合法 Blueprint，
// 用户需求从不直接进入这里——必须先由 BlueprintAgent 产出合法 Blueprint。
//
// 实现：将合法 Blueprint 转换为 AppModel，复用确定性 BuilderAgent 生成稳定代码。

import type {
  Agent,
  AgentContext,
  BlueprintProducedPayload,
  CodingProducedPayload,
} from '../types'
import type { GeneratedFile, LLMClient } from '../../types'
import { BuilderAgent } from '../../builder'
import { blueprintToAppModel } from '../blueprint/convert'
import { validateBlueprint } from '../blueprint/validator'
import { validateApplication } from '../blueprint/application-validator'
import { checkIntegrity } from '../blueprint/integrity-checker'

export class CodingAgent implements Agent<CodingProducedPayload> {
  readonly role = 'coding' as const
  readonly promptKey = 'coding'
  private builder: BuilderAgent

  constructor(llm: LLMClient) {
    this.builder = new BuilderAgent(llm)
  }

  setLLM(llm: LLMClient): void {
    this.builder = new BuilderAgent(llm)
  }

  async execute(
    input: BlueprintProducedPayload,
    ctx: AgentContext,
  ): Promise<CodingProducedPayload> {
    if (ctx.signal?.aborted) throw new Error('CodingAgent aborted')

    // ── 强制约束：只读取合法 Blueprint ─────────────────
    const validation = validateBlueprint(input.blueprint)
    if (!validation.success || !validation.data) {
      throw new Error(
        `CodingAgent: 拒绝编码——Blueprint 未通过校验：${validation.errors.join('; ')}`,
      )
    }
    const legalBlueprint = validation.data

    // ── 生成前检查（ApplicationValidator）─────────────────
    // Blueprint 结构合法 ≠ 覆盖了用户需求。此处校验语义完整性，
    // 不完整则禁止进入代码生成阶段。
    const appCheck = validateApplication({
      blueprint: legalBlueprint,
      features: input.requirementFeatures,
      entities: input.requirementEntities,
    })
    if (!appCheck.success) {
      throw new Error(
        `CodingAgent: 拒绝编码——生成前检查未通过：${appCheck.errors.join('; ')}`,
      )
    }
    if (appCheck.warnings.length > 0) {
      ctx.onProgress?.({
        id: '',
        type: 'progress',
        from: 'coding',
        to: '*',
        payload: {
          phase: 'coding',
          message: `生成前检查通过（含 ${appCheck.warnings.length} 项提示）`,
          data: { warnings: appCheck.warnings },
        },
        timestamp: Date.now(),
        sessionId: ctx.sessionId,
      })
    }

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'coding',
      to: '*',
      payload: { phase: 'coding', message: '正在根据合法 Blueprint 生成代码...' },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    // Blueprint → AppModel（供确定性 Builder 消费）
    const appModel = blueprintToAppModel(legalBlueprint, ctx.appId)

    const buildResult: { files: GeneratedFile[] } = await this.builder.build({
      appModel,
      appId: ctx.appId,
      signal: ctx.signal,
      uiVisualSuggestions: input.uiVisualSuggestions,
    })

    const files = buildResult.files.map((f) => ({ path: f.path, content: f.content }))

    // ── 生成后检查（文件完整性）──────────────────────────
    // 在交给 Review / build / dev 之前，先做确定性静态检查：
    // import 可解析、入口齐全、JSX 组件均已声明。
    const integrity = checkIntegrity(files)

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'coding',
      to: '*',
      payload: {
        phase: 'coding',
        message: integrity.passed
          ? `代码生成完成，共 ${files.length} 个文件，完整性检查通过`
          : `代码生成完成，共 ${files.length} 个文件，完整性检查发现 ${integrity.errorCount} 个问题`,
        data: integrity.passed ? undefined : { issues: integrity.issues },
      },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    return {
      files,
      blueprint: legalBlueprint,
      appModel,
      integrity,
      // 继续向 Review 透传需求功能点，供「功能缺失检查」使用
      requirementFeatures: input.requirementFeatures,
    }
  }
}

/** 便捷工厂 */
export function createCodingAgent(llm: LLMClient): CodingAgent {
  return new CodingAgent(llm)
}
