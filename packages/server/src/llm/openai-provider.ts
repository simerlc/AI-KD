import OpenAI from 'openai'
import type {
  LLMProvider,
  LLMCompleteOptions,
  LLMStreamChunk,
  LLMMessage,
  LLMToolCall,
  LLMCompleteResult,
} from './types'
import { getLLMConfig } from './types'

export interface ProviderRuntimeConfig {
  apiKey: string
  baseUrl: string
  model: string
  supportsImages?: boolean
}

export class OpenAICompatibleProvider implements LLMProvider {
  name = 'openai-compatible'
  private client: OpenAI
  private model: string

  constructor(config?: Partial<ProviderRuntimeConfig>) {
    const envConfig = getLLMConfig()
    const resolved = {
      apiKey: config?.apiKey || envConfig.apiKey,
      baseUrl: config?.baseUrl || envConfig.baseUrl,
      model: config?.model || envConfig.model,
    }
    this.client = new OpenAI({
      apiKey: resolved.apiKey,
      baseURL: resolved.baseUrl,
    })
    this.model = resolved.model
  }

  /** 切换模型（保持 client 不变） */
  setModel(model: string) {
    this.model = model
  }

  async chatStream(options: LLMCompleteOptions, onChunk: (chunk: LLMStreamChunk) => void): Promise<void> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: options.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens,
        stream: true,
      },
      { signal: options.signal },
    )

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      const finishReason = chunk.choices[0]?.finish_reason

      const streamChunk: LLMStreamChunk = {
        delta: {
          content: delta?.content,
          tool_calls: delta.tool_calls?.map((tc) => ({
            index: tc.index,
            id: tc.id,
            function: {
              name: tc.function?.name,
              arguments: tc.function?.arguments,
            },
          })),
        },
        finish_reason: finishReason ?? null,
      }

      onChunk(streamChunk)
    }
  }

  async chatComplete(options: LLMCompleteOptions): Promise<LLMCompleteResult> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: options.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens,
        stream: false,
      },
      { signal: options.signal },
    )

    const choice = response.choices[0]
    return {
      content: choice.message.content || '',
      tool_calls: choice.message.tool_calls as LLMToolCall[] | undefined,
      finish_reason: choice.finish_reason ?? undefined,
    }
  }
}

// ─── 按 Provider 配置动态创建 ──────────────────────────────

/**
 * 根据已保存的 ModelProvider 配置创建一个 LLMProvider 实例。
 * 如果找不到或未配置，回退到 env 默认 provider。
 */
export async function createProviderFromModel(modelRef?: {
  providerId?: string
  modelId?: string
}): Promise<LLMProvider> {
  try {
    // 动态 import providers 模块，避免循环依赖（sync 调用由调用方 await）
    const { getProvider } = await import('../providers/storage')
    const providerId = modelRef?.providerId
    if (providerId) {
      const provider = getProvider(providerId)
      if (provider && provider.enabled && provider.apiKey) {
        const modelId = modelRef.modelId || provider.models[0]?.id
        if (modelId) {
          return new OpenAICompatibleProvider({
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl,
            model: modelId,
          })
        }
      }
    }
  } catch {
    // ignore: fall back to env provider
  }
  return new OpenAICompatibleProvider()
}

let _provider: OpenAICompatibleProvider | null = null

/** 兼容：使用 env 配置的默认 provider */
export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    _provider = new OpenAICompatibleProvider()
  }
  return _provider
}

export type { LLMMessage, LLMToolCall, LLMProvider, LLMCompleteOptions, LLMStreamChunk }
