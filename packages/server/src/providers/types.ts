// AI Provider 类型定义（服务端）

export type ProviderType = 'builtin' | 'custom'
export type ProviderStatus = 'active' | 'inactive' | 'error'

export interface ModelCapabilities {
  chat?: boolean
  vision?: boolean
  tools?: boolean
  reasoning?: boolean
  streaming?: boolean
}

export interface ModelConfig {
  id: string
  providerId: string
  name: string
  displayName?: string
  enabled: boolean
  contextWindow?: number
  capabilities?: ModelCapabilities
}

export interface ModelProvider {
  id: string
  name: string
  displayName: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  models: ModelConfig[]
  enabled: boolean
  status: ProviderStatus
  createdAt: string
  updatedAt: string
}

/** 对外暴露时隐藏 apiKey */
export type PublicModelProvider = Omit<ModelProvider, 'apiKey'> & {
  apiKey?: string
  hasApiKey: boolean
}

/** 前端提交的 Provider 配置（apiKey 可省略以保留旧值） */
export interface ProviderInput {
  name: string
  displayName: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  models: Array<{
    id: string
    name: string
    displayName?: string
    enabled?: boolean
  }>
  enabled?: boolean
}

/** 测试连接请求 */
export interface TestConnectionRequest {
  baseUrl: string
  apiKey: string
  model: string
}
