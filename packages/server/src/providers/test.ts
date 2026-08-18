// 测试连接：服务端发起 OpenAI Compatible API 请求
// 不在前端暴露 API Key，所有请求由服务端发起
import type { TestConnectionRequest } from './types'

export interface TestConnectionResult {
  ok: boolean
  message: string
  /** 测试耗时（ms） */
  latencyMs?: number
}

const DEFAULT_TIMEOUT = 15000

/**
 * 测试 OpenAI Compatible /chat/completions 连接
 * 通过发送最小请求（"Hello"）判断 baseUrl / apiKey / model 是否可用。
 */
export async function testConnection(input: TestConnectionRequest): Promise<TestConnectionResult> {
  const baseUrl = (input.baseUrl || '').trim().replace(/\/+$/, '')
  const apiKey = (input.apiKey || '').trim()
  const model = (input.model || '').trim()

  if (!baseUrl) {
    return { ok: false, message: 'Base URL 不能为空' }
  }
  if (!apiKey) {
    return { ok: false, message: 'API Key 不能为空' }
  }
  if (!model) {
    return { ok: false, message: '模型名称不能为空' }
  }

  // 校验 URL 格式
  try {
    const u = new URL(baseUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, message: 'Base URL 格式错误' }
    }
  } catch {
    return { ok: false, message: 'Base URL 格式错误' }
  }

  const url = `${baseUrl}/chat/completions`
  const startedAt = Date.now()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 8,
        stream: false,
      }),
      signal: controller.signal,
    })

    const latencyMs = Date.now() - startedAt

    // 非 JSON 响应
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return { ok: false, message: 'Base URL 无法访问（响应不是 JSON）', latencyMs }
    }

    let body: Record<string, unknown>
    try {
      body = await res.json()
    } catch {
      return { ok: false, message: 'API 返回了无法解析的内容', latencyMs }
    }

    if (!res.ok) {
      return { ok: false, message: extractApiError(body, res.status), latencyMs }
    }

    // 校验返回结构
    if (!body.choices || !Array.isArray(body.choices)) {
      return { ok: false, message: 'API 返回结构异常', latencyMs }
    }

    return { ok: true, message: '连接成功', latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    const isAbort = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
    if (isAbort) {
      return { ok: false, message: '连接超时', latencyMs }
    }
    if (err instanceof TypeError) {
      return { ok: false, message: 'Base URL 无法访问（网络错误）', latencyMs }
    }
    return { ok: false, message: (err as Error).message || '连接失败', latencyMs }
  } finally {
    clearTimeout(timer)
  }
}

/** 从 API 错误响应中提取友好错误信息（不泄露 API Key） */
function extractApiError(body: Record<string, unknown>, status: number): string {
  const err = body.error as Record<string, unknown> | undefined
  if (err && typeof err.message === 'string') {
    const msg = err.message
    if (msg.toLowerCase().includes('invalid api key') || msg.toLowerCase().includes('unauthorized') || status === 401) {
      return 'API Key 无效'
    }
    if (msg.toLowerCase().includes('model')) {
      return 'Model 不存在或不可用'
    }
    if (msg.toLowerCase().includes('not found') || status === 404) {
      return 'Base URL 无法访问'
    }
    if (msg.toLowerCase().includes('rate limit') || status === 429) {
      return '请求过于频繁（限流）'
    }
    return `API 返回错误: ${msg}`
  }
  return `连接失败 (HTTP ${status})`
}
