// ─── Copilot History ─────────────────────────────────────
//
// 记录 Application Copilot 的每次修改历史：
// 修改内容、修改原因、修改结果、是否成功。

import type { CopilotResult } from './copilot'

/** 修改历史记录 */
export interface CopilotHistoryEntry {
  /** 记录 ID */
  id: string
  /** 修改结果 */
  result: CopilotResult
  /** 记录时间 */
  timestamp: number
}

export class CopilotHistory {
  private entries: CopilotHistoryEntry[] = []

  /** 记录一次修改 */
  record(result: CopilotResult): CopilotHistoryEntry {
    const entry: CopilotHistoryEntry = {
      id: `copilot_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
      result,
      timestamp: Date.now(),
    }
    this.entries.push(entry)
    return entry
  }

  /** 获取所有历史（只读） */
  get history(): CopilotHistoryEntry[] {
    return [...this.entries]
  }

  /** 成功修改数 */
  get successCount(): number {
    return this.entries.filter((e) => e.result.success).length
  }

  /** 失败修改数 */
  get failureCount(): number {
    return this.entries.filter((e) => !e.result.success).length
  }

  /** 清空历史 */
  clear(): void {
    this.entries = []
  }
}
