// LLM Provider 类型定义

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | LLMContentPart[]
  tool_call_id?: string
  tool_calls?: LLMToolCall[]
}

export type LLMContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface LLMToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LLMTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMStreamChunk {
  delta?: {
    content?: string
    tool_calls?: Array<{
      index: number
      id?: string
      function?: { name?: string; arguments?: string }
    }>
  }
  finish_reason?: string | null
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export interface LLMCompleteOptions {
  messages: LLMMessage[]
  tools?: LLMTool[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  signal?: AbortSignal
}

export interface LLMCompleteResult {
  content: string
  tool_calls?: LLMToolCall[]
  finish_reason?: string
}

export interface LLMProvider {
  name: string
  chatStream(options: LLMCompleteOptions, onChunk: (chunk: LLMStreamChunk) => void): Promise<void>
  chatComplete(options: LLMCompleteOptions): Promise<LLMCompleteResult>
}

export function getLLMConfig() {
  const apiKey = process.env.LLM_API_KEY || 'ollama'
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const supportsImages = process.env.LLM_SUPPORTS_IMAGES === 'true'

  return { apiKey, baseUrl, model, supportsImages }
}
