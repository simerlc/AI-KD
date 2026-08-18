// ─── Debug History ───────────────────────────────────────
//
// 记录每次 AI Debugger 的调试过程：错误、诊断、结果。
// 内存实现，可序列化（供持久化到 DB）。

import type { DebugRecord, DebugResult, DebugDiagnosis, DebugError } from '@aikd/shared'

export class DebugHistory {
  private records: DebugRecord[] = []

  /**
   * 记录一次调试。
   */
  record(errors: DebugError[], diagnosis: DebugDiagnosis, result: DebugResult, createdBy?: string): DebugRecord {
    const record: DebugRecord = {
      id: `debug_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
      errors: [...errors],
      diagnosis,
      result,
      timestamp: Date.now(),
      createdBy,
    }
    this.records.push(record)
    return record
  }

  /** 获取所有历史记录（只读） */
  get history(): DebugRecord[] {
    return [...this.records]
  }

  /** 获取成功修复的记录数 */
  get successCount(): number {
    return this.records.filter((r) => r.result.success).length
  }

  /** 获取失败的记录数 */
  get failureCount(): number {
    return this.records.filter((r) => !r.result.success).length
  }

  /** 获取指定记录 */
  get(id: string): DebugRecord | null {
    return this.records.find((r) => r.id === id) ?? null
  }

  /** 清空历史 */
  clear(): void {
    this.records = []
  }
}
