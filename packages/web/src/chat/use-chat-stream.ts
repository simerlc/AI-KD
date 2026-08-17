import { useCallback, useEffect, useRef, useState } from 'react'
import { AcpClient, isAcpNotification } from './acp-client'
import type {
  AcpWireMessage,
  ExtendedSessionUpdate,
  HistoryMessage,
  HistoryMessagePart,
  JsonRpcNotification,
} from '@aikd/shared'

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  parts?: HistoryMessagePart[]
  status?: string
  createdAt: number
}

export interface UseChatStreamOptions {
  onStreamComplete?: () => void
}

export interface SendMessageOptions {
  isAutoFix?: boolean
}

export interface UseChatStreamReturn {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  sessionId: string | null
  sendPrompt: (text: string, onDone?: () => void) => Promise<void>
  sendMessage: (
    text: string,
    onDone: () => void,
    images?: Array<{ data: string; mimeType: string }>,
    opts?: SendMessageOptions,
  ) => Promise<void>
  sendInitialPrompt: (text: string, images?: Array<{ data: string; mimeType: string }>) => Promise<void>
  cancel: () => Promise<void>
  canFetchMessages: () => boolean
  clearError: () => void
}

interface PendingTurn {
  onDone?: () => void
  assistantBuffer: string
  assistantId: string
}

export function useChatStream(taskId: string, opts: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const clientRef = useRef<AcpClient | null>(null)
  const pendingTurnRef = useRef<PendingTurn | null>(null)
  const initializedRef = useRef(false)
  const onStreamCompleteRef = useRef(opts.onStreamComplete)
  onStreamCompleteRef.current = opts.onStreamComplete

  const ensureClient = useCallback(() => {
    if (!clientRef.current) {
      const client = new AcpClient()
      client.onMessage((msg) => handleWireMessage(msg))
      clientRef.current = client
    }
    return clientRef.current
  }, [])

  const handleWireMessage = useCallback((msg: AcpWireMessage) => {
    if (!isAcpNotification(msg)) {
      // Requests (e.g. ask_user, tool_confirm) are not handled in this simplified client
      return
    }
    const notification = msg as JsonRpcNotification
    if (notification.method !== 'session/update') return
    const params = notification.params as { sessionId?: string; update?: ExtendedSessionUpdate }
    const update = params.update
    if (!update) return
    handleSessionUpdate(update)
  }, [])

  const handleSessionUpdate = useCallback((update: ExtendedSessionUpdate) => {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const chunk = (update as { content: { text: string } }).content?.text ?? ''
        if (!pendingTurnRef.current) {
          pendingTurnRef.current = {
            assistantBuffer: '',
            assistantId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          }
        }
        pendingTurnRef.current.assistantBuffer += chunk
        // Capture values in local variables to avoid race condition:
        // finalizeTurn() may null out pendingTurnRef.current before React runs the setMessages callback
        const assistantId = pendingTurnRef.current.assistantId
        const assistantBuffer = pendingTurnRef.current.assistantBuffer
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === assistantId)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = {
              ...next[idx],
              content: assistantBuffer,
              status: 'streaming',
            }
            return next
          }
          return [
            ...prev,
            {
              id: assistantId,
              role: 'agent',
              content: assistantBuffer,
              status: 'streaming',
              createdAt: Date.now(),
            },
          ]
        })
        break
      }
      case 'history_page': {
        const page = update as unknown as { messages: HistoryMessage[] }
        if (Array.isArray(page.messages)) {
          const mapped: ChatMessage[] = page.messages.map((m) => ({
            id: m.id,
            role: m.role === 'user' ? 'user' : 'agent',
            content: m.content,
            parts: m.parts,
            status: m.status,
            createdAt: m.createdAt,
          }))
          setMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id))
            const merged = [...prev]
            for (const m of mapped) {
              if (!existing.has(m.id)) merged.push(m)
            }
            return merged.sort((a, b) => a.createdAt - b.createdAt)
          })
        }
        break
      }
      default:
        // other update kinds (tool_call, log, agent_phase, etc.) are ignored here
        break
    }
  }, [])

  const finalizeTurn = useCallback(() => {
    const turn = pendingTurnRef.current
    pendingTurnRef.current = null
    if (turn) {
      setMessages((prev) => prev.map((m) => (m.id === turn.assistantId ? { ...m, status: 'done' } : m)))
    }
    setIsLoading(false)
    onStreamCompleteRef.current?.()
    turn?.onDone?.()
  }, [])

  const mountedRef = useRef(true)

  const initSession = useCallback(async () => {
    if (initializedRef.current) return
    initializedRef.current = true
    const client = ensureClient()
    try {
      const result = await client.newSession({
        conversationId: taskId,
        meta: { mode: 'coding' },
      })
      if (!mountedRef.current) return
      setSessionId(result.sessionId)
      if (result.hasHistory) {
        await client.loadSession({ sessionId: result.sessionId, replay: true })
      }
    } catch (err) {
      if (!mountedRef.current) return
      // Silently ignore network errors (server restart, StrictMode unmount, etc.)
      if (err instanceof TypeError) return
      setError(err instanceof Error ? err.message : 'Failed to init session')
      initializedRef.current = false
    }
  }, [taskId, ensureClient])

  useEffect(() => {
    mountedRef.current = true
    void initSession()
    return () => {
      mountedRef.current = false
      if (clientRef.current) {
        clientRef.current.close()
        clientRef.current = null
      }
      initializedRef.current = false
    }
  }, [initSession])

  const sendPrompt = useCallback(
    async (text: string, onDone?: () => void) => {
      const client = ensureClient()
      if (!sessionId) {
        setError('Session not ready')
        return
      }
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: text,
        createdAt: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      pendingTurnRef.current = {
        onDone,
        assistantBuffer: '',
        assistantId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }
      try {
        const result = await client.prompt({ sessionId, prompt: text })
        if (result.stopReason === 'error') {
          setError('Agent 返回错误，请重试')
        }
        finalizeTurn()
      } catch (err) {
        if (!mountedRef.current) return
        // Silently ignore network errors (server restart, ERR_ABORTED, etc.)
        if (err instanceof TypeError) {
          finalizeTurn()
          return
        }
        setError(err instanceof Error ? err.message : 'Prompt failed')
        finalizeTurn()
      }
    },
    [ensureClient, sessionId, finalizeTurn],
  )

  const sendMessage = useCallback(
    async (
      text: string,
      onDone: () => void,
      images?: Array<{ data: string; mimeType: string }>,
      _opts?: SendMessageOptions,
    ) => {
      const client = ensureClient()
      if (!sessionId) {
        setError('Session not ready')
        onDone()
        return
      }
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: text,
        createdAt: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      pendingTurnRef.current = {
        onDone,
        assistantBuffer: '',
        assistantId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }
      try {
        await client.prompt({ sessionId, prompt: text, imageBlocks: images })
        finalizeTurn()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Prompt failed')
        finalizeTurn()
      }
    },
    [ensureClient, sessionId, finalizeTurn],
  )

  const sendInitialPrompt = useCallback(
    async (text: string, images?: Array<{ data: string; mimeType: string }>) => {
      await sendMessage(text, () => {}, images)
    },
    [sendMessage],
  )

  const cancel = useCallback(async () => {
    if (!sessionId) return
    const client = ensureClient()
    await client.cancel(sessionId)
    finalizeTurn()
  }, [ensureClient, sessionId, finalizeTurn])

  const canFetchMessages = useCallback(() => !isLoading, [isLoading])

  const clearError = useCallback(() => setError(null), [])

  return {
    messages,
    isLoading,
    error,
    sessionId,
    sendPrompt,
    sendMessage,
    sendInitialPrompt,
    cancel,
    canFetchMessages,
    clearError,
  }
}
