// ─── Runtime Agent Adapter（Multi-Agent 适配器）──────────
//
// 将 RuntimeAgent 适配为多 Agent 系统中的 Agent 角色 'runtime'，
// 使其能通过 AgentManager 统一管理，并通过 JSON 消息协议参与流水线。
//
// 能力：创建项目文件 / 修改代码 / npm install / 启动 Vite / 获取运行错误。

import type { Agent, AgentContext, AgentMessagePayload, RuntimeProducedPayload } from '../types'
import { RuntimeAgent, type RuntimeAgentOptions, type RuntimeInput } from '../../runtime-agent'
import type { RuntimeOutput } from '../../runtime-agent'

export interface RuntimeInputPayload extends RuntimeInput {}

export class RuntimeAgentAdapter implements Agent<RuntimeProducedPayload> {
  readonly role = 'runtime' as const
  readonly promptKey = 'runtime'
  private runtime: RuntimeAgent

  constructor(options: RuntimeAgentOptions = {}) {
    this.runtime = new RuntimeAgent(options)
  }

  async execute(input: AgentMessagePayload, ctx: AgentContext): Promise<RuntimeProducedPayload> {
    if (ctx.signal?.aborted) throw new Error('RuntimeAgent aborted')
    // 窄化输入为 RuntimeInputPayload
    const runtimeInput = input as unknown as RuntimeInputPayload
    if (!runtimeInput.appId) {
      throw new Error('RuntimeAgent: 缺少必需的 appId')
    }

    const result = await this.runtime.run({
      appId: runtimeInput.appId,
      files: runtimeInput.files,
      steps: runtimeInput.steps,
      install: runtimeInput.install,
      startServer: runtimeInput.startServer,
      collectErrors: runtimeInput.collectErrors,
    })

    const payload: RuntimeProducedPayload = {
      appId: result.appId,
      success: result.success,
      ...(result.url ? { url: result.url } : {}),
      ...(result.runtimeErrors ? { runtimeErrors: result.runtimeErrors } : {}),
      steps: result.steps,
      toolCalls: result.toolCalls,
    }

    return payload
  }

  /** 获取底层 RuntimeAgent */
  getRuntimeAgent(): RuntimeAgent {
    return this.runtime
  }
}

/** 便捷工厂 */
export function createRuntimeAgentAdapter(options: RuntimeAgentOptions = {}): RuntimeAgentAdapter {
  return new RuntimeAgentAdapter(options)
}

export type { RuntimeOutput, RuntimeAgentOptions }
