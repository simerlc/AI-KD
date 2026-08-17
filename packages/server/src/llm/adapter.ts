import type { LLMClient, LLMMessage as AgentLLMMessage } from '@aikd/agent'
import type { LLMProvider, LLMCompleteOptions } from './types'

// ─── LLM Client Adapter ──────────────────────────────────
//
// 将 server 端的 LLMProvider 适配为 agent 包的 LLMClient 接口。
// Orchestrator 通过此适配器调用 LLM，无需直接依赖 openai SDK。

export class LLMClientAdapter implements LLMClient {
  constructor(private provider: LLMProvider) {}

  async complete(
    messages: AgentLLMMessage[],
    options?: { temperature?: number; max_tokens?: number; signal?: AbortSignal },
  ): Promise<string> {
    const llmOptions: LLMCompleteOptions = {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.max_tokens,
      signal: options?.signal,
      stream: false,
    }

    const result = await this.provider.chatComplete(llmOptions)
    return result.content
  }

  async stream(
    messages: AgentLLMMessage[],
    options: { temperature?: number; max_tokens?: number; signal?: AbortSignal },
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    let accumulated = ''

    const llmOptions: LLMCompleteOptions = {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      signal: options.signal,
      stream: true,
    }

    await this.provider.chatStream(llmOptions, (chunk) => {
      const content = chunk.delta?.content
      if (content) {
        accumulated += content
        onChunk(content)
      }
    })

    return accumulated
  }
}

/** 创建 LLM Client 适配器实例 */
export function createLLMClient(provider: LLMProvider): LLMClient {
  return new LLMClientAdapter(provider)
}
