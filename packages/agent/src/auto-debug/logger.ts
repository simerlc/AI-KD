// ─── Debug 日志记录器 ─────────────────────────────────────
//
// 记录完整调试闭环的详细日志，支持文本与 JSON 两种输出。

import type { DebugLog, DebugLogEntry, DebugPhase } from './types'

const PHASE_LABEL: Record<DebugPhase, string> = {
  generate: 'GENERATE',
  run: 'RUN',
  review: 'REVIEW',
  fix: 'FIX',
  runAgain: 'RUN_AGAIN',
  done: 'DONE',
  error: 'ERROR',
}

export class DebugLogger implements DebugLog {
  readonly sessionId: string
  entries: DebugLogEntry[] = []

  constructor(sessionId = 'debug-session') {
    this.sessionId = sessionId
  }

  log(phase: DebugPhase, level: DebugLogEntry['level'], message: string, data?: unknown): void {
    this.entries.push({ timestamp: Date.now(), phase, level, message, ...(data !== undefined ? { data } : {}) })
  }

  /** 获取全部日志文本（带时间、阶段、级别、消息） */
  toText(): string {
    const lines: string[] = []
    lines.push(`===== AI快搭 Debug Log (${this.sessionId}) =====`)
    for (const entry of this.entries) {
      const time = new Date(entry.timestamp).toISOString()
      const phase = PHASE_LABEL[entry.phase] ?? entry.phase
      const level = entry.level.toUpperCase().padEnd(7)
      lines.push(`[${time}] [${phase}] [${level}] ${entry.message}`)
      if (entry.data !== undefined && entry.data !== null) {
        try {
          lines.push(`    data: ${typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}`)
        } catch {
          lines.push(`    data: (unserializable)`)
        }
      }
    }
    return lines.join('\n')
  }

  toJSON(): DebugLogEntry[] {
    return this.entries.map((e) => ({ ...e }))
  }
}
