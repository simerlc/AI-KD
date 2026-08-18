// AI Provider 前端类型定义

export type ProviderType = 'builtin' | 'custom'
export type ProviderStatus = 'active' | 'inactive' | 'error'

export interface ModelConfig {
  id: string
  providerId: string
  name: string
  displayName?: string
  enabled: boolean
}

export interface ModelProvider {
  id: string
  name: string
  displayName: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  hasApiKey: boolean
  models: ModelConfig[]
  enabled: boolean
  status: ProviderStatus
  createdAt: string
  updatedAt: string
}

/** 前端提交的 Provider 配置 */
export interface ProviderInput {
  name: string
  displayName: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  models: Array<{ id: string; name: string; displayName?: string }>
  enabled?: boolean
}

/** 模型选择（providerId + modelId） */
export interface SelectedModel {
  providerId: string
  modelId: string
}

export function toSelectedKey(sel: SelectedModel): string {
  return `${sel.providerId}::${sel.modelId}`
}

export function fromSelectedKey(key: string): SelectedModel | null {
  const parts = key.split('::')
  if (parts.length === 2) return { providerId: parts[0], modelId: parts[1] }
  return null
}
