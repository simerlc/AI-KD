import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  ACP_PROTOCOL_VERSION,
  NEX_AGENT_INFO,
  JSON_RPC_ERRORS,
  normalizeStreamEvent,
  type JsonRpcResponse,
  type InitializeResult,
  type SessionNewParams,
  type SessionNewResult,
  type SessionLoadParams,
  type SessionLoadResult,
  type SessionPromptParams,
  type SessionPromptResult,
  type SessionListParams,
  type SessionListResult,
  type SessionDeleteParams,
  type SessionDeleteResult,
  type ModelInfo,
} from '@aikd/shared'
import { getLLMProvider } from '../llm/index.js'
import type { LLMMessage, LLMProvider } from '../llm/types.js'
import { createLLMClient } from '../llm/adapter.js'
import { Orchestrator } from '@aikd/agent'
import type { AppType } from '@aikd/shared'
import { writeWorkspaceFiles } from '../lib/workspace.js'
import { getSandbox } from '../sandbox/index.js'
import { loadTaskMessagesPage } from '../agent/message-history.service.js'
import { toSessionInfo } from '../agent/session-projection.service.js'
import { persistenceService } from '../agent/persistence.service.js'
import { registerAgent, completeAgent, getAgentRun, removeAgent, type StopReason } from '../agent/agent-registry.js'
import { getDb } from '../db/index.js'
import { nanoid } from 'nanoid'
import { requireAuth, type AppEnv } from '../middleware/auth.js'

const acp = new Hono<AppEnv>()

const SYSTEM_PROMPT =
  '你是 AI快搭助手（Nex AI 助手），一个 AI 驱动的轻应用工厂助手，帮助用户创建、管理轻应用和数据。请根据用户的需求提供帮助，使用中文回答。'

acp.use('/*', async (c, next) => {
  const p = c.req.path
  if (p.endsWith('/health') || p.endsWith('/config') || p.endsWith('/runtimes')) {
    return next()
  }

  const scopes = c.get('apiKeyScopes')
  if (scopes !== undefined && !scopes.includes('acp')) {
    return c.json({ error: 'API key does not have ACP scope' }, 403)
  }

  const authErr = requireAuth(c)
  if (authErr) return authErr
  return next()
})

function rpcOk<T>(id: number | string, result: T): JsonRpcResponse<T> {
  return { jsonrpc: '2.0', id, result }
}

function rpcErr(id: number | string | null, code: number, message: string): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  }
}

function resolveStopReason(run: { status?: string; stopReason?: StopReason } | undefined): StopReason {
  if (run?.stopReason) return run.stopReason
  if (run?.status === 'cancelled') return 'cancelled'
  if (run?.status === 'error') return 'refusal'
  return 'end_turn'
}

function serializeSseEvent(event: unknown, sessionId: string): string {
  return JSON.stringify(normalizeStreamEvent(event, sessionId))
}

function getSessionUserId(c: { get: (key: 'session') => AppEnv['Variables']['session'] }): string {
  const session = c.get('session')
  return session?.user?.id || ''
}

// ─── Health Check ──────────────────────────────────────────────────────────

acp.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'acp' })
})

// ─── ACP JSON-RPC 2.0 Endpoint ─────────────────────────────────────────────

acp.post('/acp', async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>

  if (!body || body.jsonrpc !== '2.0') {
    return c.json(
      rpcErr((body?.id as number | string) ?? null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid JSON-RPC 2.0'),
      400,
    )
  }

  if (!body.method || typeof body.method !== 'string') {
    return c.json(rpcErr((body.id as number | string) ?? null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Method required'), 400)
  }

  const { id, method, params } = body as {
    id?: number | string | null
    method: string
    params?: Record<string, unknown>
  }
  const isNotification = id === undefined || id === null

  switch (method) {
    case 'initialize':
      return handleInitialize(c, id!)

    case 'session/new':
      return handleSessionNew(c, id!, params as unknown as SessionNewParams)

    case 'session/load':
      return handleSessionLoad(c, id!, params as unknown as SessionLoadParams)

    case 'session/list':
      return handleSessionList(c, id!, params as unknown as SessionListParams)

    case 'session/delete':
      return handleSessionDelete(c, id!, params as unknown as SessionDeleteParams)

    case 'session/prompt':
      return handleSessionPrompt(c, id!, params as unknown as SessionPromptParams)

    case 'session/cancel':
      return handleSessionCancel(c, id ?? null, params, isNotification)

    default:
      if (isNotification) {
        return c.text('', 200)
      }
      return c.json(rpcErr(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method '${method}' not found`))
  }
})

// ─── ACP Method Handlers ───────────────────────────────────────────────────

async function handleInitialize(c: { json: (data: unknown) => Response }, id: number | string) {
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const models: ModelInfo[] = [
    {
      id: model,
      name: model,
      supportsImages: process.env.LLM_SUPPORTS_IMAGES === 'true',
      supportsToolCall: true,
    },
  ]

  const result: InitializeResult = {
    protocolVersion: ACP_PROTOCOL_VERSION,
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: {
        image: process.env.LLM_SUPPORTS_IMAGES === 'true',
        audio: false,
        embeddedContext: false,
      },
      sessionCapabilities: {
        list: true,
      },
    },
    agentInfo: NEX_AGENT_INFO,
    authMethods: [],
    supportedModels: models,
  }
  return c.json(rpcOk(id, result))
}

async function handleSessionNew(
  c: { json: (data: unknown) => Response; get: (key: 'session') => AppEnv['Variables']['session'] },
  id: number | string,
  params: SessionNewParams | undefined,
) {
  const userId = getSessionUserId(c)
  const sessionId = params?.conversationId || nanoid()

  try {
    const existingTask = await getDb().tasks.findById(sessionId)
    if (existingTask) {
      if (existingTask.userId !== userId) {
        return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_REQUEST, 'Session belongs to another user'))
      }
      const messages = await persistenceService.loadDBMessages(sessionId, '', userId, 1)
      const result: SessionNewResult = { sessionId, hasHistory: messages.length > 0 }
      return c.json(rpcOk(id, result))
    }

    const exists = await persistenceService.conversationExists(sessionId, userId, '')
    if (exists) {
      const messages = await persistenceService.loadDBMessages(sessionId, '', userId, 1)
      const result: SessionNewResult = { sessionId, hasHistory: messages.length > 0 }
      return c.json(rpcOk(id, result))
    }

    const meta = params?.meta ?? {}
    const now = Date.now()

    await getDb().tasks.create({
      id: sessionId,
      userId,
      prompt: '',
      title: meta.title ?? null,
      appType: null,
      selectedModel: meta.selectedModel ?? null,
      status: 'created',
      progress: null,
      logs: '[]',
      error: null,
      agentSessionId: null,
      sandboxUrl: null,
      previewUrl: null,
      appModelId: null,
      currentVersion: null,
      createdAt: now,
      updatedAt: now,
    })

    const result: SessionNewResult = { sessionId, hasHistory: false }
    return c.json(rpcOk(id, result))
  } catch (error) {
    console.error('[ACP] session/new failed')
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INTERNAL, (error as Error).message))
  }
}

async function handleSessionLoad(
  c: { json: (data: unknown) => Response; get: (key: 'session') => AppEnv['Variables']['session'] },
  id: number | string,
  params: SessionLoadParams | undefined,
) {
  const sessionId = params?.sessionId
  if (!sessionId) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'sessionId is required'))
  }

  const userId = getSessionUserId(c)

  const task = await getDb().tasks.findById(sessionId)
  if (task && task.userId !== userId) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_REQUEST, 'Session belongs to another user'))
  }

  const exists = !!task || (await persistenceService.conversationExists(sessionId, userId, ''))
  if (!exists) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, `Session not found`))
  }

  if (params?.replay) {
    return replaySessionHistory(c, id, sessionId, userId, params)
  }

  const result: SessionLoadResult = { sessionId }
  return c.json(rpcOk(id, result))
}

async function replaySessionHistory(
  c: { json: (data: unknown) => Response },
  id: number | string,
  sessionId: string,
  userId: string,
  params: SessionLoadParams,
) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100)
  const cursor = params.cursor ?? '0'
  const sort = params.sort ?? 'DESC'

  return streamSSE(c, async (stream) => {
    const { messages, nextCursor } = await loadTaskMessagesPage({
      taskId: sessionId,
      envId: '',
      userId,
      limit,
      cursor,
      sort,
    })

    await stream.writeSSE({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId,
          update: {
            sessionUpdate: 'history_page',
            messages,
            cursor,
            nextCursor,
          },
        },
      }),
    })

    const result: SessionLoadResult = { sessionId, nextCursor }
    await stream.writeSSE({ data: JSON.stringify(rpcOk(id, result)) })
    await stream.writeSSE({ data: '[DONE]' })
  })
}

async function handleSessionList(
  c: { json: (data: unknown) => Response; get: (key: 'session') => AppEnv['Variables']['session'] },
  id: number | string,
  params: SessionListParams | undefined,
) {
  const userId = getSessionUserId(c)

  try {
    const tasks = await getDb().tasks.findByUserId(userId, 20)
    const sessions = tasks.map(toSessionInfo)
    void params

    const result: SessionListResult = {
      sessions,
      nextCursor: null,
    }
    return c.json(rpcOk(id, result))
  } catch (error) {
    console.error('[ACP] session/list failed')
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INTERNAL, (error as Error).message))
  }
}

async function handleSessionDelete(
  c: { json: (data: unknown) => Response; get: (key: 'session') => AppEnv['Variables']['session'] },
  id: number | string,
  params: SessionDeleteParams | undefined,
) {
  const sessionId = params?.sessionId
  if (!sessionId) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'sessionId is required'))
  }

  const userId = getSessionUserId(c)

  try {
    const task = await getDb().tasks.findById(sessionId)
    if (!task || task.deletedAt || task.userId !== userId) {
      const result: SessionDeleteResult = { sessionId, deleted: false }
      return c.json(rpcOk(id, result))
    }

    await getDb().tasks.softDelete(sessionId)
    await persistenceService.deleteConversationMessages(sessionId, '', userId)
    const result: SessionDeleteResult = { sessionId, deleted: true }
    return c.json(rpcOk(id, result))
  } catch (error) {
    console.error('[ACP] session/delete failed')
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INTERNAL, (error as Error).message))
  }
}

async function handleSessionPrompt(
  c: {
    json: (data: unknown) => Response
    get: (key: 'session') => AppEnv['Variables']['session']
  },
  id: number | string,
  params: SessionPromptParams,
) {
  const sessionId = params?.sessionId
  if (!sessionId) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'sessionId is required'))
  }

  const userId = getSessionUserId(c)

  const task = await getDb().tasks.findByIdAndUserId(sessionId, userId)
  if (!task) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'Session not found'))
  }

  // 兼容两种 prompt 格式：块数组 [{type:'text',text}] 或纯字符串
  const rawPrompt = params?.prompt
  const promptBlocks: Array<{ type: string; text?: string }> = Array.isArray(rawPrompt)
    ? (rawPrompt as Array<{ type: string; text?: string }>)
    : typeof rawPrompt === 'string'
      ? [{ type: 'text', text: rawPrompt }]
      : []
  const prompt: string = promptBlocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('')

  if (!prompt.trim()) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'prompt must contain at least one text block'))
  }

  const existingRun = getAgentRun(sessionId)
  if (existingRun && existingRun.status === 'running') {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_REQUEST, 'A prompt turn is already in progress'))
  }

  const latestStatus = await persistenceService.getLatestRecordStatus(sessionId, userId, '')
  if (latestStatus && (latestStatus.status === 'pending' || latestStatus.status === 'streaming')) {
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INVALID_REQUEST, 'A prompt turn is already in progress'))
  }

  let provider: LLMProvider
  try {
    provider = getLLMProvider()
  } catch (error) {
    console.error('[ACP] LLM provider not configured')
    return c.json(rpcErr(id, JSON_RPC_ERRORS.INTERNAL, (error as Error).message))
  }

  const history = await persistenceService.getChatHistory(sessionId, '', userId)

  // ─── Orchestrator 设置 ────────────────────────────────
  // 创建 LLM 适配器和 Orchestrator，替代直接 LLM 调用
  const llmClient = createLLMClient(provider)
  const orchestrator = new Orchestrator(llmClient)

  // 检查是否有已存在的 App Model（修改模式）
  let existingAppModel: AppModel | undefined
  if (task.appModelId) {
    const record = await getDb().appModels.findById(task.appModelId)
    if (record) {
      try {
        existingAppModel = JSON.parse(record.modelJson) as AppModel
      } catch {
        // JSON 解析失败，忽略
      }
    } else {
      console.error('[ACP] App model record not found')
    }
  }

  const assistantRecordId = nanoid()
  const prevRecordId = history.messages.length > 0 ? history.messages[history.messages.length - 1].id : null
  const lastAssistant = [...history.messages].reverse().find((m) => m.role === 'assistant')

  await persistenceService.preSavePendingRecords({
    conversationId: sessionId,
    envId: '',
    userId,
    prompt,
    prevRecordId,
    assistantRecordId,
    lastAssistantRecordId: lastAssistant?.id ?? null,
  })

  const abortController = new AbortController()
  registerAgent({
    conversationId: sessionId,
    turnId: assistantRecordId,
    envId: '',
    userId,
    abortController,
  })

  getDb()
    .tasks.update(sessionId, { status: 'pending', updatedAt: Date.now() })
    .catch(() => {})

  return streamSSE(c, async (stream) => {
    let accumulatedText = ''
    let streamError: string | null = null
    let streamClosed = false

    stream.onAbort(() => {
      streamClosed = true
      abortController.abort()
    })

    /** 向前端发送文本块 */
    const sendChunk = (text: string) => {
      if (streamClosed || stream.closed || stream.aborted) return
      const sseData = JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text },
          },
        },
      })
      stream.writeSSE({ data: sseData }).catch(() => {
        streamClosed = true
      })
    }

    try {
      const result = await orchestrator.run({
        prompt,
        appType: (task.appType as AppType) || undefined,
        appName: task.title || undefined,
        existingAppModel,
        history: history.messages.map((m) => ({ role: m.role, content: m.content })),
        onProgress: (progress) => {
          accumulatedText += `[${progress.phase}] ${progress.message}\n`
          sendChunk(`\n[${progress.phase}] ${progress.message}\n`)
        },
        config: {
          signal: abortController.signal,
        },
      })

      // 保存生成的 App Model 到数据库（upsert：存在则更新，不存在则创建）
      const appModelId = result.appModel.id
      const appModelJson = JSON.stringify(result.appModel)
      const existingRecord = await getDb().appModels.findById(appModelId)
      if (existingRecord) {
        await getDb().appModels.update(appModelId, {
          modelJson: appModelJson,
          version: result.appModel.version,
        })
      } else {
        await getDb().appModels.create({
          id: appModelId,
          appId: sessionId,
          modelJson: appModelJson,
          version: result.appModel.version,
        })
      }

      // 更新 task 关联
      await getDb().tasks.update(sessionId, {
        appModelId,
        currentVersion: result.appModel.version,
        appType: result.appModel.type,
      })

      // 将代码文件写入工作区
      try {
        await writeWorkspaceFiles(sessionId, result.files)
      } catch {
        // 文件写入失败不阻塞流程
      }

      // 启动/重建沙箱容器，提供实时预览。
      // 每次生成完成后都销毁旧沙箱并重新启动，确保预览加载的是最新生成的代码，
      // 避免复用旧沙箱导致浏览器/HMR 缓存显示上一版的旧内容。
      let previewUrl = ''
      const sandbox = getSandbox()
      const existing = sandbox.get(sessionId)
      if (existing && existing.status === 'running') {
        sendChunk('\n[Preview] 检测到代码更新，重启预览容器...\n')
        try {
          await sandbox.destroy(sessionId)
        } catch {
          // 忽略销毁失败
        }
      }
      sendChunk('\n[Preview] 正在启动预览容器...\n')
      try {
        const instance = await sandbox.create({ appId: sessionId })
        previewUrl = instance.url
        sendChunk(`[Preview] 预览已就绪: ${instance.url}\n`)
      } catch {
        sendChunk('[Preview] 预览启动失败，请稍后重试\n')
        console.error('[ACP] Sandbox start failed')
      }

      // 更新 task 关联（含 previewUrl 与标题/提示词，避免侧边栏显示"未命名"）
      const appName = result.appModel.name || null
      await getDb().tasks.update(sessionId, {
        appModelId,
        currentVersion: result.appModel.version,
        appType: result.appModel.type,
        ...(appName && { title: appName }),
        ...(previewUrl && { previewUrl, sandboxUrl: previewUrl }),
      })

      // 发送摘要
      const summary = `\n✅ 应用生成完成！\n- 应用名称: ${result.appModel.name}\n- 应用类型: ${result.appModel.type}\n- 页面数量: ${result.appModel.schema.pages.length}\n- 代码文件: ${result.files.length} 个\n- 验证结果: ${result.testResult.passed ? '通过' : '有警告'}\n- 重试次数: ${result.retries}\n${previewUrl ? `- 预览地址: ${previewUrl}\n` : ''}`
      accumulatedText += summary
      sendChunk(summary)
    } catch (err) {
      if (abortController.signal.aborted) {
        streamError = null
      } else {
        streamError = err instanceof Error ? err.message : 'Orchestrator failed'
        console.error('[ACP] Orchestrator error', err)
        // 生成失败时为任务回填一个基于提示词的标题，避免侧边栏出现空标题/“未命名”
        try {
          const current = await getDb().tasks.findById(sessionId)
          if (current && !(current.title || '').trim()) {
            const fallback = (prompt || '').trim().slice(0, 50) || '生成失败的应用'
            await getDb().tasks.update(sessionId, { title: fallback })
          }
        } catch {
          // 忽略回退标题写入失败
        }
      }
    }

    if (streamClosed && !abortController.signal.aborted) {
      return
    }

    if (accumulatedText) {
      const parts = [
        {
          partId: nanoid(),
          contentType: 'text' as const,
          content: accumulatedText,
          metadata: {
            id: assistantRecordId,
            type: 'message',
            role: 'assistant',
            sessionId,
            timestamp: Date.now(),
          },
        },
      ]
      await persistenceService.setRecordParts(assistantRecordId, parts, {
        userId,
        conversationId: sessionId,
      })
    }

    const wasCancelled = abortController.signal.aborted
    const finalStatus: 'done' | 'error' | 'cancel' = wasCancelled ? 'cancel' : streamError ? 'error' : 'done'
    await persistenceService.finalizePendingRecords(assistantRecordId, finalStatus, {
      userId,
      conversationId: sessionId,
    })

    if (wasCancelled) {
      completeAgent(sessionId, 'cancelled', undefined, 'cancelled')
    } else if (streamError) {
      completeAgent(sessionId, 'error', streamError, 'refusal')
    } else {
      completeAgent(sessionId, 'completed', undefined, 'end_turn')
    }

    try {
      const taskStatus = wasCancelled ? 'stopped' : streamError ? 'error' : 'done'
      await getDb().tasks.update(sessionId, { status: taskStatus, updatedAt: Date.now() })
    } catch {
      // non-critical
    }

    if (streamError) {
      await stream.writeSSE({
        data: JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: `\n\n⚠️ ${streamError}\n` },
            },
          },
        }),
      })
    }

    const run = getAgentRun(sessionId)
    const rawStopReason = resolveStopReason(run)
    // Map server-internal StopReason to SessionPromptResult.stopReason
    const promptStopReason: SessionPromptResult['stopReason'] =
      rawStopReason === 'cancelled' ? 'cancelled' : rawStopReason === 'end_turn' ? 'end_turn' : 'error'
    const promptResult: SessionPromptResult = { stopReason: promptStopReason }
    await stream.writeSSE({ data: JSON.stringify(rpcOk(id, promptResult)) })
    await stream.writeSSE({ data: '[DONE]' })

    persistenceService.cleanupStreamEvents(sessionId, assistantRecordId).catch(() => {})
    removeAgent(sessionId, assistantRecordId)
  })
}

async function handleSessionCancel(
  c: {
    json: (data: unknown) => Response
    text: (data: string, status?: number) => Response
    get: (key: 'session') => AppEnv['Variables']['session']
  },
  id: number | string | null,
  params: Record<string, unknown> | undefined,
  isNotification: boolean,
) {
  const sessionId = params?.sessionId as string
  const userId = getSessionUserId(c)

  if (sessionId) {
    const run = getAgentRun(sessionId)
    if (run && run.status === 'running') {
      run.abortController.abort()
      run.status = 'cancelled'
      run.stopReason = 'cancelled'
    }

    const latestStatus = await persistenceService.getLatestRecordStatus(sessionId, userId, '')
    if (latestStatus && (latestStatus.status === 'pending' || latestStatus.status === 'streaming')) {
      await persistenceService.updateRecordStatus(latestStatus.recordId, 'cancel', {
        userId,
        conversationId: sessionId,
      })
    }

    try {
      await getDb().tasks.update(sessionId, { status: 'stopped', updatedAt: Date.now() })
    } catch {
      // non-critical
    }
  }

  if (isNotification) {
    return c.text('', 200)
  }

  return c.json(rpcOk(id ?? '', null))
}

// ─── Observe Stream (SSE replay) ───────────────────────────────────────────

acp.get('/observe/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const userId = getSessionUserId(c)

  let turnId = c.req.query('turnId') || undefined
  if (!turnId) {
    const latest = await persistenceService.getLatestRecordStatus(sessionId, userId, '')
    if (!latest || (latest.status !== 'pending' && latest.status !== 'streaming')) {
      return c.json({ error: 'No active turn to observe' }, 404)
    }
    turnId = latest.recordId
  }

  return streamSSE(c, async (stream) => {
    let lastSeq = -1
    const POLL_INTERVAL = 500

    try {
      const existingEvents = await persistenceService.getStreamEvents(sessionId, turnId)
      for (const evt of existingEvents) {
        await stream.writeSSE({ data: serializeSseEvent(evt.event, sessionId) })
        lastSeq = Math.max(lastSeq, evt.seq)
      }
    } catch {
      // non-fatal
    }

    let agentDone = false
    while (true) {
      if (stream.closed || stream.aborted) {
        console.log('[SSE observe] stream closed')
        break
      }

      const run = getAgentRun(sessionId)
      const isDone = !run || run.status !== 'running'

      try {
        const newEvents = await persistenceService.getStreamEvents(sessionId, turnId, lastSeq)
        for (const evt of newEvents) {
          await stream.writeSSE({ data: serializeSseEvent(evt.event, sessionId) })
          lastSeq = Math.max(lastSeq, evt.seq)
        }

        if (isDone && newEvents.length === 0) {
          agentDone = true
          break
        }
      } catch {
        if (isDone) {
          agentDone = true
          break
        }
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    }

    if (!agentDone) {
      return
    }

    const run = getAgentRun(sessionId)
    const stopReason = resolveStopReason(run)
    await stream.writeSSE({ data: JSON.stringify(rpcOk(0, { stopReason })) })
    await stream.writeSSE({ data: '[DONE]' })

    const runAfterDone = getAgentRun(sessionId)
    if (!runAfterDone || runAfterDone.status !== 'running') {
      persistenceService.cleanupStreamEvents(sessionId, turnId).catch(() => {})
      removeAgent(sessionId, turnId)
    }
  })
})

// ─── LLM Config Endpoint ───────────────────────────────────────────────────

acp.get('/config', (c) => {
  return c.json({
    configured: !!process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
  })
})

acp.get('/runtimes', (c) => {
  return c.json({
    default: 'aikd',
    runtimes: [{ id: 'aikd', name: 'AI快搭', available: true }],
  })
})

export default acp
