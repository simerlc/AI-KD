import { Hono } from 'hono'
import { requireAuth, type AppEnv } from '../middleware/auth'

const app = new Hono<AppEnv>()

// GET /api/health - 健康检查（已在 index.ts 注册 /health，这里保留兼容）
app.get('/health', (c) => c.json({ status: 'ok' }))

// GET /api/models - 返回可用模型列表
app.get('/models', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr

  // 支持从环境变量 LLM_MODELS 读取逗号分隔的已配置模型列表，优先使用该配置。
  // 格式示例: LLM_MODELS="gpt-4o-mini,gpt-4o-mini-vision"
  const raw = process.env.LLM_MODELS || ''
  const defaultModel = process.env.LLM_MODEL || 'gpt-4o-mini'
  const parsed: Array<{ id: string; name: string; provider?: string; isDefault?: boolean }> = []

  if (raw.trim()) {
    for (const item of raw.split(',')) {
      const id = item.trim()
      if (!id) continue
      parsed.push({ id, name: id, provider: 'openai-compatible' })
    }
  }

  if (parsed.length === 0) {
    parsed.push({ id: defaultModel, name: defaultModel, provider: 'openai-compatible', isDefault: true })
  } else if (!parsed.some((p) => p.id === defaultModel)) {
    // 确保默认模型存在于列表中
    parsed.unshift({ id: defaultModel, name: defaultModel, provider: 'openai-compatible', isDefault: true })
  }

  return c.json({ models: parsed })
})

export default app
