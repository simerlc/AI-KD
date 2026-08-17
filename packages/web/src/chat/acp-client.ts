import type {
  AcpWireMessage,
  JsonRpcRequestPayload,
  JsonRpcNotification,
  SessionNewParams,
  SessionNewResult,
  SessionPromptParams,
  SessionPromptResult,
  SessionLoadParams,
  SessionLoadResult,
  SessionCancelParams,
} from '@aikd/shared'

export type AcpMessageHandler = (msg: AcpWireMessage) => void

export interface SendPromptOptions {
  sessionId: string
  prompt: string
  imageBlocks?: Array<{ data: string; mimeType: string }>
  runtime?: string
  signal?: AbortSignal
}

export class AcpClient {
  private endpoint = '/api/agent/acp'
  private sseSource: EventSource | null = null
  private listeners = new Set<AcpMessageHandler>()
  private sessionId: string | null = null

  onMessage(handler: AcpMessageHandler): () => void {
    this.listeners.add(handler)
    return () => {
      this.listeners.delete(handler)
    }
  }

  private dispatch(msg: AcpWireMessage) {
    for (const handler of this.listeners) {
      try {
        handler(msg)
      } catch {
        // listener errors should not break the loop
      }
    }
  }

  async newSession(params: SessionNewParams, signal?: AbortSignal): Promise<SessionNewResult> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'session/new',
        params,
      }),
      signal,
    })
    if (!res.ok) {
      throw new Error(`session/new failed: ${res.status}`)
    }
    const data = await res.json()
    if (data.error) {
      throw new Error(data.error.message || 'session/new error')
    }
    const result = data.result as SessionNewResult
    this.sessionId = result.sessionId
    return result
  }

  async loadSession(params: SessionLoadParams, signal?: AbortSignal): Promise<SessionLoadResult> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'session/load',
        params,
      }),
      signal,
    })
    if (!res.ok) {
      throw new Error(`session/load failed: ${res.status}`)
    }

    // replay 模式后端返回 SSE 流（逐条回放历史 session/update），
    // 需要像 prompt() 一样按帧解析，而不是 res.json()（否则会把
    // "data: {...}" 整串当 JSON 解析，报 "Unexpected token 'd'"）。
    if (params?.replay) {
      await this.consumeSseStream(res)
      if (params.sessionId) {
        this.sessionId = params.sessionId
      }
      return { sessionId: params.sessionId } as SessionLoadResult
    }

    const data = await res.json()
    if (data.error) {
      throw new Error(data.error.message || 'session/load error')
    }
    const result = data.result as SessionLoadResult
    if (params.sessionId) {
      this.sessionId = params.sessionId
    }
    return result
  }

  /** 读取并解析 SSE 流，将每个 data: 帧 dispatch 给监听器 */
  private async consumeSseStream(res: Response): Promise<void> {
    const reader = res.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''
      for (const frame of frames) {
        const line = frame.trim()
        if (!line.startsWith('data: ')) continue
        let data = line.slice(6)
        while (data.startsWith('data:')) {
          data = data.replace(/^data:\s*/, '')
        }
        if (data === '[DONE]') continue
        try {
          this.dispatch(JSON.parse(data) as AcpWireMessage)
        } catch {
          // 忽略非法帧
        }
      }
    }
  }

  async prompt(opts: SendPromptOptions): Promise<SessionPromptResult> {
    const content: SessionPromptParams['prompt'] = [
      { type: 'text', text: opts.prompt },
      ...(opts.imageBlocks ?? []).map((img) => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.mimeType,
      })),
    ]
    const params: SessionPromptParams = {
      sessionId: opts.sessionId,
      prompt: content,
      ...(opts.runtime ? { runtime: opts.runtime } : {}),
    }
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'session/prompt',
        params,
      }),
      signal: opts.signal,
    })
    if (!res.ok) {
      throw new Error(`session/prompt failed: ${res.status}`)
    }

    // session/prompt 返回 SSE 流，逐帧解析
    const reader = res.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let result: SessionPromptResult = { stopReason: 'end_turn' }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 帧以双换行分隔
      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''

      for (const frame of frames) {
        const line = frame.trim()
        if (!line.startsWith('data: ')) continue
        // 兼容极少数情况下 data: 值仍带前缀（或存在重复前缀）的情况
        let data = line.slice(6)
        while (data.startsWith('data:')) {
          data = data.replace(/^data:\s*/, '')
        }
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          // JSON-RPC response（含 result.stopReason）是最终结果
          if (parsed.result && parsed.result.stopReason) {
            result = parsed.result
          }
          // 分发所有消息给监听器（session/update 等）
          this.dispatch(parsed)
        } catch {
          // 忽略非 JSON 帧；仅保留 keepalive 或非法数据时不中断主流程
        }
      }
    }

    return result
  }

  async cancel(sessionId: string): Promise<void> {
    const params: SessionCancelParams = { sessionId }
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId(),
          method: 'session/cancel',
          params,
        }),
      })
    } catch {
      // best-effort cancel
    }
  }

  private openSse(sessionId: string) {
    if (this.sseSource) {
      this.sseSource.close()
    }
    const url = `${this.endpoint}/sse?sessionId=${encodeURIComponent(sessionId)}`
    const source = new EventSource(url, { withCredentials: true })
    source.onmessage = (ev) => {
      try {
        // EventSource 规范会去掉 "data: " 前缀，但为兼容异常实现做一次剥离防御
        let raw = ev.data
        while (raw.startsWith('data:')) {
          raw = raw.replace(/^data:\s*/, '')
        }
        const parsed = JSON.parse(raw) as AcpWireMessage
        this.dispatch(parsed)
      } catch {
        // ignore non-JSON keepalive frames
      }
    }
    source.onerror = () => {
      // EventSource auto-reconnects; nothing to do here
    }
    this.sseSource = source
  }

  close() {
    if (this.sseSource) {
      this.sseSource.close()
      this.sseSource = null
    }
    this.listeners.clear()
    this.sessionId = null
  }

  private nextId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}

export function isAcpNotification(msg: AcpWireMessage): msg is JsonRpcNotification {
  return msg.jsonrpc === '2.0' && !('id' in msg)
}

export function isAcpRequest(msg: AcpWireMessage): msg is JsonRpcRequestPayload {
  return msg.jsonrpc === '2.0' && 'id' in msg
}
