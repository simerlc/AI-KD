// 内置 Provider 定义
import type { ModelProvider } from './types'

interface BuiltinSpec {
  id: string
  name: string
  displayName: string
  baseUrl: string
  models: Array<{ id: string; displayName?: string }>
}

export const BUILTIN_SPECS: BuiltinSpec[] = [
  {
    id: 'deepseek',
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', displayName: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner' },
    ],
  },
  {
    id: 'openai',
    name: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4.1', displayName: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini' },
      { id: 'gpt-4o', displayName: 'GPT-4o' },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
    ],
  },
  {
    id: 'anthropic',
    name: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-3-7-sonnet-latest', displayName: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-haiku-latest', displayName: 'Claude 3.5 Haiku' },
    ],
  },
  {
    id: 'gemini',
    name: 'gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
    ],
  },
  {
    id: 'qwen',
    name: 'qwen',
    displayName: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-plus', displayName: 'Qwen Plus' },
      { id: 'qwen-max', displayName: 'Qwen Max' },
      { id: 'qwen-turbo', displayName: 'Qwen Turbo' },
    ],
  },
]

/** 将内置 spec 初始化为 ModelProvider（无 apiKey） */
export function createBuiltinProvider(spec: BuiltinSpec, now = new Date().toISOString()): ModelProvider {
  return {
    id: spec.id,
    name: spec.name,
    displayName: spec.displayName,
    type: 'builtin',
    baseUrl: spec.baseUrl,
    models: spec.models.map((m) => ({
      id: m.id,
      providerId: spec.id,
      name: m.id,
      displayName: m.displayName,
      enabled: true,
      capabilities: { chat: true, streaming: true },
    })),
    enabled: true,
    status: 'inactive',
    createdAt: now,
    updatedAt: now,
  }
}

export function getAllBuiltinSpecs(): BuiltinSpec[] {
  return BUILTIN_SPECS
}

export function getBuiltinSpec(id: string): BuiltinSpec | undefined {
  return BUILTIN_SPECS.find((s) => s.id === id)
}
