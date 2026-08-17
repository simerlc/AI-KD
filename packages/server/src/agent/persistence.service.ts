import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type {
  CodeBuddyMessage,
  CodeBuddyContentBlock,
  UnifiedMessageRecord,
  UnifiedMessagePart,
  StreamEvent,
} from '@aikd/shared'
import { AGENT_ID } from '@aikd/shared'

const DATA_DIR = path.join(process.cwd(), 'data')
const MESSAGES_DIR = path.join(DATA_DIR, 'messages')
const STREAM_EVENTS_DIR = path.join(DATA_DIR, 'stream_events')

interface RecordLocation {
  userId: string
  conversationId: string
}

export class PersistenceService {
  private recordIndex = new Map<string, RecordLocation>()

  private getMessagesFilePath(userId: string, conversationId: string): string {
    return path.join(MESSAGES_DIR, userId, `${conversationId}.jsonl`)
  }

  private getStreamEventsFilePath(conversationId: string, turnId: string): string {
    return path.join(STREAM_EVENTS_DIR, conversationId, `${turnId}.jsonl`)
  }

  private async ensureDir(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
  }

  private indexRecord(recordId: string, loc: RecordLocation): void {
    this.recordIndex.set(recordId, loc)
  }

  private async readMessageRecords(userId: string, conversationId: string): Promise<UnifiedMessageRecord[]> {
    const filePath = this.getMessagesFilePath(userId, conversationId)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter(Boolean)
      const records: UnifiedMessageRecord[] = []
      for (const line of lines) {
        try {
          records.push(JSON.parse(line) as UnifiedMessageRecord)
        } catch {
          // skip malformed line
        }
      }
      for (const r of records) {
        this.indexRecord(r.recordId, { userId, conversationId })
      }
      return records
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      console.error('[Persistence] readMessageRecords failed')
      return []
    }
  }

  private async writeMessageRecords(
    userId: string,
    conversationId: string,
    records: UnifiedMessageRecord[],
  ): Promise<void> {
    const filePath = this.getMessagesFilePath(userId, conversationId)
    await this.ensureDir(filePath)
    const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n'
    await fs.writeFile(filePath, content, 'utf-8')
    for (const r of records) {
      this.indexRecord(r.recordId, { userId, conversationId })
    }
  }

  private async appendMessageRecord(
    userId: string,
    conversationId: string,
    record: UnifiedMessageRecord,
  ): Promise<void> {
    const filePath = this.getMessagesFilePath(userId, conversationId)
    await this.ensureDir(filePath)
    const line = JSON.stringify(record) + '\n'
    await fs.appendFile(filePath, line, 'utf-8')
    this.indexRecord(record.recordId, { userId, conversationId })
  }

  private async rewriteMessageRecords(
    userId: string,
    conversationId: string,
    records: UnifiedMessageRecord[],
  ): Promise<void> {
    await this.writeMessageRecords(userId, conversationId, records)
  }

  private async findRecordLocation(recordId: string): Promise<RecordLocation | null> {
    const cached = this.recordIndex.get(recordId)
    if (cached) return cached
    try {
      const users = await fs.readdir(MESSAGES_DIR)
      for (const userId of users) {
        const userDir = path.join(MESSAGES_DIR, userId)
        let stat
        try {
          stat = await fs.stat(userDir)
        } catch {
          continue
        }
        if (!stat.isDirectory()) continue
        const files = await fs.readdir(userDir)
        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue
          const conversationId = file.replace(/\.jsonl$/, '')
          const records = await this.readMessageRecords(userId, conversationId)
          if (records.some((r) => r.recordId === recordId)) {
            return { userId, conversationId }
          }
        }
      }
    } catch {
      // MESSAGES_DIR missing
    }
    return null
  }

  private async findConversationFile(conversationId: string): Promise<RecordLocation | null> {
    try {
      const users = await fs.readdir(MESSAGES_DIR)
      for (const userId of users) {
        const filePath = this.getMessagesFilePath(userId, conversationId)
        if (existsSync(filePath)) {
          return { userId, conversationId }
        }
      }
    } catch {
      // MESSAGES_DIR missing
    }
    return null
  }

  // ========== Stream Event Operations ==========

  async appendStreamEvents(events: StreamEvent[]): Promise<void> {
    if (events.length === 0) return
    const groups = new Map<string, StreamEvent[]>()
    for (const event of events) {
      const key = `${event.conversationId}\u0000${event.turnId}`
      let group = groups.get(key)
      if (!group) {
        group = []
        groups.set(key, group)
      }
      group.push(event)
    }
    for (const [key, groupEvents] of groups) {
      const [conversationId, turnId] = key.split('\u0000')
      const filePath = this.getStreamEventsFilePath(conversationId, turnId)
      try {
        await this.ensureDir(filePath)
        const lines = groupEvents.map((e) => JSON.stringify(e)).join('\n') + '\n'
        await fs.appendFile(filePath, lines, 'utf-8')
      } catch (error) {
        console.error('[Persistence] appendStreamEvents failed')
      }
    }
  }

  async getStreamEvents(
    conversationId: string,
    turnId: string,
    afterSeq: number = -1,
    limit: number = 500,
  ): Promise<StreamEvent[]> {
    const filePath = this.getStreamEventsFilePath(conversationId, turnId)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter(Boolean)
      const events: StreamEvent[] = []
      for (const line of lines) {
        try {
          events.push(JSON.parse(line) as StreamEvent)
        } catch {
          // skip malformed line
        }
      }
      return events
        .filter((e) => e.seq > afterSeq)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      console.error('[Persistence] getStreamEvents failed')
      return []
    }
  }

  async cleanupStreamEvents(conversationId: string, turnId: string): Promise<void> {
    const filePath = this.getStreamEventsFilePath(conversationId, turnId)
    try {
      await fs.unlink(filePath)
    } catch {
      // non-critical
    }
    const dir = path.dirname(filePath)
    try {
      const remaining = await fs.readdir(dir)
      if (remaining.length === 0) {
        await fs.rmdir(dir)
      }
    } catch {
      // ignore
    }
  }

  // ========== Cancelled Turn Filtering ==========

  private filterCancelledTurns(records: UnifiedMessageRecord[]): UnifiedMessageRecord[] {
    const cancelledUserRecordIds = new Set<string>()
    const cancelledAssistantRecordIds = new Set<string>()

    for (const record of records) {
      if (record.role === 'assistant' && record.status === 'cancel') {
        cancelledAssistantRecordIds.add(record.recordId)
        if (record.replyTo) {
          cancelledUserRecordIds.add(record.replyTo)
        }
      }
    }

    if (cancelledAssistantRecordIds.size === 0) {
      return records
    }

    return records.filter(
      (r) => !cancelledAssistantRecordIds.has(r.recordId) && !cancelledUserRecordIds.has(r.recordId),
    )
  }

  // ========== Message Conversion ==========

  private transformDBMessagesToCodeBuddyMessages(
    records: UnifiedMessageRecord[],
    sessionId: string,
  ): CodeBuddyMessage[] {
    const messages: CodeBuddyMessage[] = []

    for (const record of records) {
      const timestamp = record.createTime || Date.now()

      if (record.role === 'user') {
        this.restoreUserRecord(record, timestamp, sessionId, messages)
      } else if (record.role === 'assistant') {
        this.restoreAssistantRecord(record, timestamp, sessionId, messages)
      }
    }

    this.fixSelfReferencingParentIds(messages)

    return messages
  }

  private fixSelfReferencingParentIds(messages: CodeBuddyMessage[]): void {
    const idTypeMap = new Map<string, string>()

    for (const msg of messages) {
      if (msg.id) {
        idTypeMap.set(msg.id, msg.type)
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      let needsFix = false

      if (msg.parentId && msg.parentId === msg.id) {
        needsFix = true
      } else if (msg.parentId) {
        const parentType = idTypeMap.get(msg.parentId)
        if (!parentType || parentType === 'file-history-snapshot') {
          needsFix = true
        }
      } else if (!msg.parentId && i > 0) {
        needsFix = true
      }

      if (needsFix) {
        if (i === 0) {
          msg.parentId = undefined
        } else {
          for (let j = i - 1; j >= 0; j--) {
            const prevMsg = messages[j]
            if (prevMsg.id && prevMsg.type !== 'file-history-snapshot' && prevMsg.id !== prevMsg.parentId) {
              msg.parentId = prevMsg.id
              break
            }
          }
        }
      }
    }
  }

  private restoreUserRecord(
    record: UnifiedMessageRecord,
    _timestamp: number,
    _sessionId: string,
    messages: CodeBuddyMessage[],
  ): void {
    for (const part of record.parts || []) {
      const msg = this.restorePartToMessage(part)
      if (msg) messages.push(msg)
    }
  }

  private restoreAssistantRecord(
    record: UnifiedMessageRecord,
    _timestamp: number,
    _sessionId: string,
    messages: CodeBuddyMessage[],
  ): void {
    for (const part of record.parts || []) {
      const msg = this.restorePartToMessage(part)
      if (msg) messages.push(msg)
    }
  }

  private restorePartToMessage(part: UnifiedMessagePart): CodeBuddyMessage | null {
    const metadata = part.metadata as Record<string, unknown> | undefined
    if (!metadata) return null

    if (part.contentType === 'text') {
      const { contentBlocks, ...rest } = metadata as { contentBlocks?: unknown }
      if (contentBlocks) {
        return { ...rest, content: contentBlocks as CodeBuddyContentBlock[] } as CodeBuddyMessage
      }
      const blockType = (rest as { role?: string }).role === 'assistant' ? 'output_text' : 'input_text'
      return {
        ...rest,
        content: [{ type: blockType, text: part.content || '' }],
      } as CodeBuddyMessage
    }

    if (part.contentType === 'tool_call') {
      const { toolCallName, ...rest } = metadata as { toolCallName?: string }
      return {
        ...rest,
        name: toolCallName,
        callId: part.toolCallId,
        arguments: part.content,
      } as CodeBuddyMessage
    }

    if (part.contentType === 'tool_result') {
      let output: string | Record<string, unknown> = part.content || ''
      try {
        const parsed = JSON.parse(output as string)
        if (typeof parsed === 'object' && parsed !== null) output = parsed
      } catch {
        // Keep as string
      }
      return { ...metadata, callId: part.toolCallId, output } as CodeBuddyMessage
    }

    if (part.contentType === 'reasoning') {
      return {
        ...metadata,
        type: 'reasoning',
      } as unknown as CodeBuddyMessage
    }

    return { ...metadata } as unknown as CodeBuddyMessage
  }

  // ========== Database Operations ==========

  async loadDBMessages(
    conversationId: string,
    envId: string,
    userId: string,
    limit = 20,
  ): Promise<UnifiedMessageRecord[]> {
    const { records } = await this.loadDBMessagesPage(conversationId, envId, userId, { limit })
    const firstUserIdx = records.findIndex((r) => r.role === 'user')
    return firstUserIdx >= 0 ? records.slice(firstUserIdx) : records
  }

  async loadDBMessagesPage(
    conversationId: string,
    _envId: string,
    userId: string,
    options: { limit?: number; cursor?: string | null; sort?: 'ASC' | 'DESC' } = {},
  ): Promise<{ records: UnifiedMessageRecord[]; nextCursor: string | null }> {
    try {
      const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
      const offset = Math.max(Number.parseInt(options.cursor || '0', 10) || 0, 0)
      const sort = options.sort || 'DESC'

      const all = await this.readMessageRecords(userId, conversationId)
      all.sort((a, b) => a.createTime - b.createTime)

      const total = all.length
      const end = Math.min(offset + limit, total)
      const start = Math.max(0, end - limit)
      const pageRows = sort === 'DESC' ? all.slice(start, end).reverse() : all.slice(offset, end)

      const hasMore = sort === 'DESC' ? start > 0 : end < total
      const nextCursor = hasMore ? String(sort === 'DESC' ? start : end) : null

      return { records: pageRows, nextCursor }
    } catch {
      return { records: [], nextCursor: null }
    }
  }

  private async saveRecordToDB(
    userId: string,
    conversationId: string,
    record: Omit<UnifiedMessageRecord, 'createTime'> & { createTime?: number },
  ): Promise<UnifiedMessageRecord> {
    const now = Date.now()
    const fullRecord: UnifiedMessageRecord = {
      ...record,
      createTime: record.createTime || now,
    } as UnifiedMessageRecord
    await this.appendMessageRecord(userId, conversationId, fullRecord)
    return fullRecord
  }

  async updateRecordStatus(
    recordId: string,
    status: UnifiedMessageRecord['status'],
    context?: { userId?: string; conversationId?: string },
  ): Promise<void> {
    let loc: RecordLocation | null = null
    if (context?.userId && context?.conversationId) {
      loc = { userId: context.userId, conversationId: context.conversationId }
    } else {
      loc = await this.findRecordLocation(recordId)
    }
    if (!loc) {
      console.error('[Persistence] updateRecordStatus: record not found')
      return
    }
    const records = await this.readMessageRecords(loc.userId, loc.conversationId)
    let changed = false
    for (const r of records) {
      if (r.recordId === recordId) {
        ;(r as { status: UnifiedMessageRecord['status'] }).status = status
        changed = true
        break
      }
    }
    if (changed) {
      await this.rewriteMessageRecords(loc.userId, loc.conversationId, records)
    }
  }

  private async appendPartsToRecord(
    userId: string,
    conversationId: string,
    recordId: string,
    parts: UnifiedMessagePart[],
  ): Promise<void> {
    if (parts.length === 0) return
    const records = await this.readMessageRecords(userId, conversationId)
    for (const r of records) {
      if (r.recordId === recordId) {
        r.parts = [...(r.parts || []), ...parts]
        break
      }
    }
    await this.rewriteMessageRecords(userId, conversationId, records)
  }

  private async replacePartsInRecord(
    userId: string,
    conversationId: string,
    recordId: string,
    parts: UnifiedMessagePart[],
  ): Promise<void> {
    const records = await this.readMessageRecords(userId, conversationId)
    for (const r of records) {
      if (r.recordId === recordId) {
        r.parts = parts
        break
      }
    }
    await this.rewriteMessageRecords(userId, conversationId, records)
  }

  async setRecordParts(
    recordId: string,
    parts: UnifiedMessagePart[],
    context?: { userId?: string; conversationId?: string },
  ): Promise<void> {
    let loc: RecordLocation | null = null
    if (context?.userId && context?.conversationId) {
      loc = { userId: context.userId, conversationId: context.conversationId }
    } else {
      loc = await this.findRecordLocation(recordId)
    }
    if (!loc) {
      console.error('[Persistence] setRecordParts: record not found')
      return
    }
    await this.replacePartsInRecord(loc.userId, loc.conversationId, recordId, parts)
  }

  async getRecordParts(
    recordId: string,
    context?: { userId?: string; conversationId?: string },
  ): Promise<UnifiedMessagePart[]> {
    let loc: RecordLocation | null = null
    if (context?.userId && context?.conversationId) {
      loc = { userId: context.userId, conversationId: context.conversationId }
    } else {
      loc = await this.findRecordLocation(recordId)
    }
    if (!loc) return []
    const records = await this.readMessageRecords(loc.userId, loc.conversationId)
    const found = records.find((r) => r.recordId === recordId)
    return (found?.parts || []) as UnifiedMessagePart[]
  }

  // ========== Message Grouping ==========

  private groupMessages(messages: CodeBuddyMessage[]): CodeBuddyMessage[][] {
    const groups: CodeBuddyMessage[][] = []
    let currentGroup: CodeBuddyMessage[] = []

    for (const msg of messages) {
      if (msg.type !== 'message') {
        currentGroup.push(msg)
        continue
      }

      const isRealUserInput = msg.role === 'user' && this.isUserTextMessage(msg)
      if (isRealUserInput) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup)
          currentGroup = []
        }
        groups.push([msg])
      } else {
        currentGroup.push(msg)
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup)
    }

    return groups
  }

  private isUserTextMessage(msg: CodeBuddyMessage): boolean {
    if (!msg.content || msg.content.length === 0) return false
    const hasInputText = msg.content.some((b) => b.type === 'input_text')
    const onlyToolResult = msg.content.every((b) => b.type === 'tool_result')
    return hasInputText && !onlyToolResult
  }

  private isToolResultMessage(msg: CodeBuddyMessage): boolean {
    if (msg.type === 'file-history-snapshot') return false
    if (!msg.content || msg.content.length === 0) return false
    return msg.content.every((b) => b.type === 'tool_result')
  }

  private extractPartsFromMessage(msg: CodeBuddyMessage): UnifiedMessagePart[] {
    if (msg.type === 'message') {
      const { content: contentBlocks, ...messageMeta } = msg
      const blocks = contentBlocks || []

      const textBlocks = blocks.filter((b) => b.type === 'input_text' || b.type === 'output_text')
      const plainText = textBlocks.map((b) => b.text || '').join('\n')

      const isSimple =
        blocks.length === 1 &&
        textBlocks.length === 1 &&
        Object.keys(blocks[0]).filter((k) => k !== 'type' && k !== 'text').length === 0

      const metadata: Record<string, unknown> = { ...messageMeta }
      if (!isSimple) {
        metadata.contentBlocks = blocks
      }

      return [
        {
          partId: uuidv4(),
          contentType: 'text',
          content: plainText,
          metadata,
        },
      ]
    }

    if (msg.type === 'function_call') {
      const { arguments: _args, callId: _callId, name: _name, ...rest } = msg
      return [
        {
          partId: uuidv4(),
          contentType: 'tool_call',
          toolCallId: _callId,
          content: _args,
          metadata: { ...rest, toolCallName: _name } as Record<string, unknown>,
        },
      ]
    }

    if (msg.type === 'function_call_result') {
      const { output: _output, callId: _callId, ...rest } = msg
      return [
        {
          partId: uuidv4(),
          contentType: 'tool_result',
          toolCallId: _callId,
          content: typeof _output === 'string' ? _output : JSON.stringify(_output),
          metadata: rest as Record<string, unknown>,
        },
      ]
    }

    if (msg.type === 'reasoning') {
      const rawContent = msg.rawContent || []
      const reasoningText = rawContent
        .filter((block) => block.type === 'reasoning_text' && block.text)
        .map((block) => block.text || '')
        .join('')

      return [
        {
          partId: uuidv4(),
          contentType: 'reasoning',
          content: reasoningText,
          metadata: { ...msg } as Record<string, unknown>,
        },
      ]
    }

    return [
      {
        partId: uuidv4(),
        contentType: 'raw',
        metadata: { ...msg } as Record<string, unknown>,
      },
    ]
  }

  // ========== Public API ==========

  async restoreMessages(
    conversationId: string,
    _envId: string,
    userId: string,
    _cwd: string,
  ): Promise<{
    messages: CodeBuddyMessage[]
    lastRecordId: string | null
    lastAssistantRecordId: string | null
  }> {
    try {
      const dbRecords = await this.loadDBMessages(conversationId, _envId, userId)

      const filteredRecords = this.filterCancelledTurns(dbRecords)

      const lastRecordId = filteredRecords.length > 0 ? filteredRecords[filteredRecords.length - 1].recordId : null
      const lastAssistantRecord = [...filteredRecords]
        .reverse()
        .find((r) => r.role === 'assistant' && r.status !== 'cancel')
      const lastAssistantRecordId = lastAssistantRecord?.recordId ?? null

      if (filteredRecords.length === 0) {
        return { messages: [], lastRecordId: null, lastAssistantRecordId: null }
      }

      const messages = this.transformDBMessagesToCodeBuddyMessages(filteredRecords, conversationId)

      return { messages, lastRecordId, lastAssistantRecordId }
    } catch {
      return { messages: [], lastRecordId: null, lastAssistantRecordId: null }
    }
  }

  async syncMessages(
    conversationId: string,
    envId: string,
    userId: string,
    historicalMessages: CodeBuddyMessage[],
    lastRecordId: string | null,
    _cwd: string,
    assistantRecordId?: string,
    isResumeFromInterrupt?: boolean,
    preSavedUserRecordId?: string | null,
  ): Promise<void> {
    if (historicalMessages.length === 0 && !assistantRecordId && !preSavedUserRecordId) return
  }

  async appendMessagesToDB(
    conversationId: string,
    _envId: string,
    userId: string,
    newMessages: CodeBuddyMessage[],
    lastRecordId: string | null,
    assistantRecordId?: string,
    isResumeFromInterrupt?: boolean,
    preSavedUserRecordId?: string | null,
  ): Promise<void> {
    const groups = this.groupMessages(newMessages)
    let prevRecordId = lastRecordId
    let firstAssistantGroupHandled = false
    let preSavedUserRecordHandled = false

    for (const group of groups) {
      if (group.length === 0) continue

      const firstMsg = group.find((m) => !this.isToolResultMessage(m)) || group[0]
      const role = (firstMsg.role || 'assistant') as 'user' | 'assistant'

      const primaryMsg = group.find((m) => m.type === 'message')
      const recordId = role === 'assistant' && assistantRecordId ? assistantRecordId : primaryMsg?.id || uuidv4()

      const parts: UnifiedMessagePart[] = []
      for (const msg of group) {
        parts.push(...this.extractPartsFromMessage(msg))
      }

      if (parts.length === 0) continue

      if (
        (isResumeFromInterrupt || !!assistantRecordId) &&
        role === 'assistant' &&
        assistantRecordId &&
        !firstAssistantGroupHandled
      ) {
        await this.appendPartsToRecord(userId, conversationId, assistantRecordId, parts)
        await this.updateRecordStatus(assistantRecordId, 'done', { userId, conversationId })
        firstAssistantGroupHandled = true
        continue
      }

      if (preSavedUserRecordId && role === 'user' && !preSavedUserRecordHandled) {
        await this.replacePartsInRecord(userId, conversationId, preSavedUserRecordId, parts)
        await this.updateRecordStatus(preSavedUserRecordId, 'done', { userId, conversationId })
        preSavedUserRecordHandled = true
        prevRecordId = preSavedUserRecordId
        continue
      }

      const record = await this.saveRecordToDB(userId, conversationId, {
        recordId,
        conversationId,
        envId: _envId,
        userId,
        agentId: AGENT_ID,
        role,
        replyTo: role === 'assistant' ? (prevRecordId ?? undefined) : undefined,
        status: 'done',
        parts,
      })

      if (role === 'user') {
        prevRecordId = record.recordId
      }
    }
  }

  async preSavePendingRecords(params: {
    conversationId: string
    envId: string
    userId: string
    prompt: string
    prevRecordId: string | null
    assistantRecordId?: string
    lastAssistantRecordId?: string | null
    imageBlocks?: Array<{ data: string; mimeType: string }>
  }): Promise<{ userRecordId: string; assistantRecordId: string }> {
    const { conversationId, envId, userId, prompt, prevRecordId } = params
    const assistantRecordId = params.assistantRecordId || uuidv4()
    const userRecordId = uuidv4()

    const baseMetadata: Record<string, unknown> = {
      id: userRecordId,
      type: 'message',
      role: 'user',
      sessionId: conversationId,
      timestamp: Date.now(),
      ...(params.lastAssistantRecordId ? { parentId: params.lastAssistantRecordId } : {}),
    }

    const userParts: UnifiedMessagePart[] = [
      {
        partId: uuidv4(),
        contentType: 'text',
        content: prompt,
        metadata: baseMetadata,
      },
    ]

    await this.saveRecordToDB(userId, conversationId, {
      recordId: userRecordId,
      conversationId,
      envId,
      userId,
      agentId: AGENT_ID,
      role: 'user',
      replyTo: prevRecordId || undefined,
      status: 'done',
      parts: userParts,
    })

    await this.saveRecordToDB(userId, conversationId, {
      recordId: assistantRecordId,
      conversationId,
      envId,
      userId,
      agentId: AGENT_ID,
      role: 'assistant',
      replyTo: userRecordId,
      status: 'pending',
      parts: [],
    })

    return { userRecordId, assistantRecordId }
  }

  async getLatestRecordStatus(
    conversationId: string,
    userId: string,
    _envId: string,
  ): Promise<{ recordId: string; status: string } | null> {
    try {
      const records = await this.readMessageRecords(userId, conversationId)
      const assistantRecords = records.filter((r) => r.role === 'assistant').sort((a, b) => b.createTime - a.createTime)
      if (assistantRecords.length === 0) return null
      const latest = assistantRecords[0]
      return {
        recordId: latest.recordId,
        status: latest.status || 'done',
      }
    } catch {
      return null
    }
  }

  async conversationExists(conversationId: string, userId: string, _envId: string): Promise<boolean> {
    try {
      const records = await this.readMessageRecords(userId, conversationId)
      return records.length > 0
    } catch {
      return false
    }
  }

  async finalizePendingRecords(
    assistantRecordId: string,
    status: 'done' | 'error' | 'cancel',
    context?: { userId?: string; conversationId?: string },
  ): Promise<void> {
    await this.updateRecordStatus(assistantRecordId, status, context)
  }

  async updateToolResult(
    conversationId: string,
    recordId: string,
    callId: string,
    output: string | Record<string, unknown>,
    status: string = 'completed',
    extraMetadata?: Record<string, unknown>,
  ): Promise<void> {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output)

    try {
      const loc = await this.findConversationFile(conversationId)
      if (!loc) return

      const records = await this.readMessageRecords(loc.userId, conversationId)
      const record = records.find((r) => r.recordId === recordId)
      if (!record) return

      const parts = [...(record.parts || [])]
      const toolResultIndex = parts.findIndex((p) => p.contentType === 'tool_result' && p.toolCallId === callId)

      const mergeProviderData = (oldPd: unknown, extraPd: unknown): Record<string, unknown> | undefined => {
        const oldObj = oldPd && typeof oldPd === 'object' ? (oldPd as Record<string, unknown>) : {}
        const { skipRun: _skipRun, error: _error, ...restOldPd } = oldObj
        const extraObj = extraPd && typeof extraPd === 'object' ? (extraPd as Record<string, unknown>) : {}
        const merged = { ...restOldPd, ...extraObj }
        return Object.keys(merged).length > 0 ? merged : undefined
      }

      if (toolResultIndex >= 0) {
        const oldMetadata = (parts[toolResultIndex].metadata || {}) as Record<string, unknown>
        const { providerData: oldProviderData, ...restMetadata } = oldMetadata
        const { providerData: extraProviderData, ...restExtra } = extraMetadata || {}
        const mergedProviderData = mergeProviderData(oldProviderData, extraProviderData)
        const cleanedMetadata: Record<string, unknown> = { ...restMetadata, ...restExtra, status }
        if (mergedProviderData) {
          cleanedMetadata.providerData = mergedProviderData
        }
        parts[toolResultIndex] = {
          ...parts[toolResultIndex],
          content: outputStr,
          metadata: cleanedMetadata,
        }
      } else {
        const toolCallIndex = parts.findIndex((p) => p.contentType === 'tool_call' && p.toolCallId === callId)
        if (toolCallIndex >= 0) {
          const { providerData: extraProviderData, ...restExtra } = extraMetadata || {}
          const mergedProviderData = mergeProviderData(undefined, extraProviderData)
          const newMetadata: Record<string, unknown> = { ...restExtra, status }
          if (mergedProviderData) {
            newMetadata.providerData = mergedProviderData
          }
          parts.push({
            partId: uuidv4(),
            contentType: 'tool_result',
            toolCallId: callId,
            content: outputStr,
            metadata: newMetadata,
          })
        }
      }

      record.parts = parts
      await this.rewriteMessageRecords(loc.userId, conversationId, records)
    } catch (error) {
      console.error('[Persistence] updateToolResult failed')
    }
  }

  async getChatHistory(
    conversationId: string,
    _envId: string,
    userId: string,
  ): Promise<{
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>
    toolCalls: Array<{
      id: string
      name: string
      input: Record<string, unknown>
      output?: string
      status: 'completed' | 'error'
    }>
  }> {
    const records = await this.loadDBMessages(conversationId, _envId, userId)

    const messages: Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      timestamp: number
    }> = []
    const toolCallMap = new Map<
      string,
      {
        id: string
        name: string
        input: Record<string, unknown>
        output?: string
        status: 'completed' | 'error'
      }
    >()

    for (const record of records) {
      const role = record.role as 'user' | 'assistant'
      const timestamp = record.createTime || Date.now()

      for (const part of record.parts || []) {
        if (part.contentType === 'text') {
          const content = part.content || ''
          if (content) {
            messages.push({ id: record.recordId, role, content, timestamp })
          }
        } else if (part.contentType === 'tool_call' && part.toolCallId) {
          const metadata = part.metadata as Record<string, unknown> | undefined
          const toolName = (metadata?.toolCallName as string) || ''
          let input: Record<string, unknown> = {}
          if (part.content) {
            try {
              input = JSON.parse(part.content)
            } catch {
              // keep empty
            }
          }
          toolCallMap.set(part.toolCallId, {
            id: part.toolCallId,
            name: toolName,
            input,
            status: 'completed',
          })
        } else if (part.contentType === 'tool_result' && part.toolCallId) {
          const existing = toolCallMap.get(part.toolCallId)
          const metadata = part.metadata as Record<string, unknown> | undefined
          const isError = metadata?.status === 'error'
          if (existing) {
            existing.output = part.content || ''
            existing.status = isError ? 'error' : 'completed'
          } else {
            toolCallMap.set(part.toolCallId, {
              id: part.toolCallId,
              name: '',
              input: {},
              output: part.content || '',
              status: isError ? 'error' : 'completed',
            })
          }
        }
      }
    }

    return {
      messages,
      toolCalls: Array.from(toolCallMap.values()),
    }
  }

  async getToolCallInfo(
    conversationId: string,
    recordId: string,
    callId: string,
  ): Promise<{ toolName: string; input: Record<string, unknown>; metadata: Record<string, unknown> } | null> {
    try {
      const loc = await this.findConversationFile(conversationId)
      if (!loc) return null

      const records = await this.readMessageRecords(loc.userId, conversationId)
      const record = records.find((r) => r.recordId === recordId)
      if (!record) return null

      const parts = record.parts || []
      const toolCallPart = parts.find((p) => p.contentType === 'tool_call' && p.toolCallId === callId)
      if (!toolCallPart) return null

      const metadata = (toolCallPart.metadata || {}) as Record<string, unknown>
      const toolName = metadata.toolCallName as string | undefined
      const inputStr = toolCallPart.content
      let input: Record<string, unknown> = {}

      if (inputStr) {
        try {
          input = JSON.parse(inputStr)
        } catch {
          // keep empty
        }
      }

      return toolName ? { toolName, input, metadata } : null
    } catch {
      return null
    }
  }

  async deleteConversationMessages(conversationId: string, _envId: string, userId: string): Promise<void> {
    try {
      const filePath = this.getMessagesFilePath(userId, conversationId)
      await fs.unlink(filePath)
    } catch {
      console.error('[Persistence] deleteConversationMessages failed')
    }
    try {
      const streamDir = path.join(STREAM_EVENTS_DIR, conversationId)
      await fs.rm(streamDir, { recursive: true, force: true })
    } catch {
      // non-critical
    }
  }
}

export const persistenceService = new PersistenceService()
