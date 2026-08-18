// 内置 Provider 的模型选项（与后端 builtin.ts 保持一致的静态映射）
export const BUILTIN_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
  anthropic: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro'],
  qwen: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
}

export function getBuiltinModels(providerId: string): string[] | undefined {
  return BUILTIN_MODELS[providerId]
}
