// Provider API 客户端：所有后端调用集中在此，组件不直接 fetch
import type { ModelProvider, ProviderInput, ProviderStatus } from './types'

const BASE = '/api/providers'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error('服务器返回了无法解析的内容')
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `请求失败 (${res.status})`
    throw new Error(msg)
  }
  return data as T
}

export const providersApi = {
  async list(): Promise<ModelProvider[]> {
    const data = await request<{ providers: ModelProvider[] }>('')
    return data.providers || []
  },

  async get(id: string): Promise<ModelProvider> {
    const data = await request<{ provider: ModelProvider }>(`/${encodeURIComponent(id)}`)
    return data.provider
  },

  async create(input: ProviderInput): Promise<ModelProvider> {
    const data = await request<{ provider: ModelProvider }>('', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return data.provider
  },

  async update(id: string, input: Partial<ProviderInput>): Promise<ModelProvider> {
    const data = await request<{ provider: ModelProvider }>(`/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    return data.provider
  },

  async remove(id: string): Promise<void> {
    await request<{ success: boolean }>(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  async test(input: { baseUrl: string; apiKey: string; model: string }): Promise<{
    ok: boolean
    message: string
    latencyMs?: number
  }> {
    return request<{ ok: boolean; message: string; latencyMs?: number }>('/test', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async testSaved(id: string, model?: string): Promise<{
    ok: boolean
    message: string
    latencyMs?: number
    provider?: ModelProvider
  }> {
    return request<{ ok: boolean; message: string; latencyMs?: number; provider?: ModelProvider }>(
      `/${encodeURIComponent(id)}/test`,
      { method: 'POST', body: JSON.stringify(model ? { model } : {}) },
    )
  },
}

export type { ProviderStatus }
