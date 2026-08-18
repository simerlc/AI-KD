// Provider 管理路由：/api/providers
import { Hono } from 'hono'
import { requireAuth, type AppEnv } from '../middleware/auth'
import {
  listProviders,
  getProvider,
  saveProvider,
  deleteProvider,
  toPublicProvider,
} from '../providers/storage'
import { getBuiltinSpec, getAllBuiltinSpecs } from '../providers/builtin'
import { testConnection } from '../providers/test'
import type { ModelProvider, ProviderInput, TestConnectionRequest } from '../providers/types'

const app = new Hono<AppEnv>()

// GET /api/providers - 获取所有 Provider（脱敏）
app.get('/', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const providers = listProviders().map(toPublicProvider)
  return c.json({ providers })
})

// GET /api/providers/builtin - 获取内置 Provider 定义（必须在 /:id 之前注册）
app.get('/builtin', (c) => {
  const specs = getAllBuiltinSpecs().map((s) => ({
    id: s.id,
    name: s.name,
    displayName: s.displayName,
    baseUrl: s.baseUrl,
    models: s.models.map((m) => m.id),
  }))
  return c.json({ builtin: specs })
})

// GET /api/providers/:id - 获取单个 Provider（脱敏）
app.get('/:id', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const id = c.req.param('id')
  const provider = getProvider(id)
  if (!provider) return c.json({ error: 'Provider not found' }, 404)
  return c.json({ provider: toPublicProvider(provider) })
})

// POST /api/providers - 新增或更新（内置 Provider 用 PUT 更新配置；自定义用 POST 创建）
app.post('/', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr

  const input = await c.req.json().catch(() => null) as ProviderInput | null
  if (!input) return c.json({ error: 'Invalid request body' }, 400)

  const existing = input.type === 'builtin' && input.name ? getProvider(input.name) : undefined

  // 自定义 Provider：name 作为 id
  const id = input.type === 'builtin' ? (input.name || '') : (input.name || '')

  if (!id) return c.json({ error: 'name is required' }, 400)

  // 内置 Provider 检查
  if (input.type === 'builtin') {
    const spec = getBuiltinSpec(id)
    if (!spec) return c.json({ error: `Unknown builtin provider: ${id}` }, 400)
    const base = existing || createBuiltinFromSpec(id)
    const now = new Date().toISOString()
    const merged: ModelProvider = {
      ...base,
      baseUrl: input.baseUrl || base.baseUrl,
      apiKey: input.apiKey !== undefined && input.apiKey !== '' ? input.apiKey : base.apiKey,
      enabled: input.enabled ?? base.enabled,
      updatedAt: now,
      models: normalizeModels(base.id, input.models),
    }
    saveProvider(merged)
    return c.json({ provider: toPublicProvider(merged) })
  }

  // 自定义 Provider：不允许与内置同名
  if (getBuiltinSpec(id)) {
    return c.json({ error: '该名称与内置 Provider 冲突，请更换名称' }, 400)
  }

  const now = new Date().toISOString()
  const provider: ModelProvider = {
    id,
    name: input.name,
    displayName: input.displayName || input.name,
    type: 'custom',
    baseUrl: input.baseUrl || '',
    apiKey: input.apiKey || undefined,
    models: normalizeModels(id, input.models),
    enabled: input.enabled ?? true,
    status: 'inactive',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  saveProvider(provider)
  return c.json({ provider: toPublicProvider(provider) })
})

// PUT /api/providers/:id - 更新 Provider 配置（内置或自定义）
app.put('/:id', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr

  const id = c.req.param('id')
  const existing = getProvider(id)
  if (!existing) return c.json({ error: 'Provider not found' }, 404)

  const input = await c.req.json().catch(() => null) as Partial<ProviderInput> | null
  if (!input) return c.json({ error: 'Invalid request body' }, 400)

  const now = new Date().toISOString()
  const merged: ModelProvider = {
    ...existing,
    displayName: input.displayName ?? existing.displayName,
    name: input.name ?? existing.name,
    baseUrl: input.baseUrl !== undefined ? input.baseUrl : existing.baseUrl,
    apiKey: input.apiKey !== undefined && input.apiKey !== '' ? input.apiKey : existing.apiKey,
    enabled: input.enabled ?? existing.enabled,
    models: input.models ? normalizeModels(existing.id, input.models) : existing.models,
    updatedAt: now,
  }
  saveProvider(merged)
  return c.json({ provider: toPublicProvider(merged) })
})

// DELETE /api/providers/:id - 删除自定义 Provider（内置不允许删除）
app.delete('/:id', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const id = c.req.param('id')
  const provider = getProvider(id)
  if (!provider) return c.json({ error: 'Provider not found' }, 404)
  if (provider.type === 'builtin') {
    return c.json({ error: '内置 Provider 不允许删除' }, 400)
  }
  deleteProvider(id)
  return c.json({ success: true })
})

// POST /api/providers/test - 测试连接（不持久化）
app.post('/test', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr

  const input = await c.req.json().catch(() => null) as TestConnectionRequest | null
  if (!input) return c.json({ error: 'Invalid request body' }, 400)

  const result = await testConnection(input)
  return c.json({ ok: result.ok, message: result.message, latencyMs: result.latencyMs })
})

// POST /api/providers/:id/test - 测试已保存的 Provider（用其配置）
app.post('/:id/test', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const id = c.req.param('id')
  const provider = getProvider(id)
  if (!provider) return c.json({ error: 'Provider not found' }, 404)

  const input = await c.req.json().catch(() => null) as { model?: string } | null
  const model = input?.model || provider.models[0]?.id

  if (!provider.apiKey) {
    return c.json({ ok: false, message: '请先配置 API Key' })
  }

  const result = await testConnection({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model })

  // 更新状态
  const now = new Date().toISOString()
  const updated: ModelProvider = {
    ...provider,
    status: result.ok ? 'active' : 'error',
    updatedAt: now,
  }
  saveProvider(updated)

  return c.json({ ...result, provider: toPublicProvider(updated) })
})

function createBuiltinFromSpec(id: string): ModelProvider {
  const spec = getBuiltinSpec(id)!
  const now = new Date().toISOString()
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

function normalizeModels(providerId: string, models?: ProviderInput['models']): ModelProvider['models'] {
  if (!models || !Array.isArray(models) || models.length === 0) {
    return []
  }
  return models.map((m) => ({
    id: m.id,
    providerId,
    name: m.name || m.id,
    displayName: m.displayName || m.name || m.id,
    enabled: m.enabled ?? true,
    capabilities: { chat: true, streaming: true },
  }))
}

export default app
