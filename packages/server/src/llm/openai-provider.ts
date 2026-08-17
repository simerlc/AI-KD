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

export class OpenAICompatibleProvider implements LLMProvider {
  name = 'openai-compatible'
  private client: OpenAI
  private model: string

  constructor() {
    const config = getLLMConfig()
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
    this.model = config.model
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

let _provider: OpenAICompatibleProvider | null = null

export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    _provider = new OpenAICompatibleProvider()
  }
  return _provider
}

export type { LLMMessage, LLMToolCall, LLMProvider, LLMCompleteOptions, LLMStreamChunk }
