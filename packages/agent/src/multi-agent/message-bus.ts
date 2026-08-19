// ─── Agent 消息总线（JSON 通信）──────────────────────────
//
// 所有 Agent 之间的通信都通过 MessageBus 传递 JSON 消息（AgentMessage）。
// - 记录全部消息（messages[]），便于审计 / 重放 / 日志
// - 支持订阅（subscribe）实时处理消息（如进度上报、持久化）
// - 生成消息唯一 id 与时间戳

import type { AgentMessage, AgentMessagePayload, AgentRole } from './types'
import { generateId } from '../utils'

export interface MessageBusOptions {
  /** 会话/任务 ID，写入每条消息 */
  sessionId?: string
  /** 是否打印消息日志 */
  verbose?: boolean
}

export class MessageBus {
  private messages: AgentMessage[] = []
  private listeners: Array<(msg: AgentMessage) => void> = []
  private sessionId?: string
  private verbose: boolean

  constructor(options: MessageBusOptions = {}) {
    this.sessionId = options.sessionId
    this.verbose = options.verbose ?? false
  }

  /** 发布一条消息（from → to，携带 payload），返回创建的消息 */
  send(
    from: AgentRole,
    to: AgentRole | '*',
    type: AgentMessage['type'],
    payload: AgentMessagePayload,
    replyTo?: string,
  ): AgentMessage {
    const msg: AgentMessage = {
      id: generateId('msg'),
      type,
      from,
      to,
      payload,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      ...(replyTo ? { replyTo } : {}),
    }
    this.messages.push(msg)
    if (this.verbose) {
      console.log(`[MessageBus] ${from} → ${to}: ${type}`)
    }
    for (const listener of this.listeners) {
      try {
        listener(msg)
      } catch (err) {
        console.error('[MessageBus] listener error', err)
      }
    }
    return msg
  }

  /** 订阅所有消息 */
  subscribe(listener: (msg: AgentMessage) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  /** 获取全部已发布的消息 */
  getAll(): AgentMessage[] {
    return this.messages.slice()
  }

  /** 获取发送给指定 role（或广播）的消息 */
  getFor(role: AgentRole): AgentMessage[] {
    return this.messages.filter((m) => m.to === role || m.to === '*')
  }

  /** 清空消息（用于新会话） */
  clear(): void {
    this.messages = []
  }
}
