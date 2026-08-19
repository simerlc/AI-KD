// ─── Auto-Debug 系统类型定义 ─────────────────────────────
//
// 形成完整闭环：
//   Generate → Run → Review → Fix → Run Again
//
// Review 覆盖四类检查：
//   1. TypeScript 错误（ts errors）
//   2. 运行异常（runtime exceptions）
//   3. 页面结构（page structure）
//   4. 功能缺失（missing features）
//
// Fix 产出 Patch（文件级修改），应用后再 Run Again 验证。

// ─── Review 问题分类 ─────────────────────────────────────

/** 问题严重级别 */
export type IssueSeverity = 'error' | 'warning'

/** 问题来源分类 */
export type IssueCategory =
  | 'typescript' // TypeScript 编译错误
  | 'runtime' // 运行异常
  | 'structure' // 页面结构问题
  | 'feature' // 功能缺失
  | 'dependency' // 依赖问题
  | 'other'

/** 单个审查问题 */
export interface DebugIssue {
  /** 分类 */
  category: IssueCategory
  /** 严重级别 */
  severity: IssueSeverity
  /** 问题消息 */
  message: string
  /** 相关文件（可选） */
  file?: string
  /** 行号（可选） */
  line?: number
  /** 修复建议 */
  suggestion?: string
}

/** Review 输出：四类检查聚合结果 */
export interface ReviewReport {
  passed: boolean
  /** 全部问题 */
  issues: DebugIssue[]
  /** 按分类统计 */
  summary: Record<IssueCategory, number>
  /** 各分类检查明细（供日志输出） */
  checks: Array<{
    category: IssueCategory
    title: string
    passed: boolean
    details: string[]
  }>
}

// ─── Patch 定义 ──────────────────────────────────────────

/**
 * Patch：FixAgent 产出的文件级修改。
 * 通过 applyPatch 应用到代码文件，产出修改后的完整文件内容。
 */
export interface Patch {
  /** 目标文件路径 */
  file: string
  /** 操作类型 */
  op: 'create' | 'modify' | 'delete'
  /** 修改/创建后的完整内容（op 为 create/modify 时） */
  content?: string
  /** 删除时的确认信息（op 为 delete 时） */
  reason?: string
  /** 该补丁针对的问题分类 */
  category?: IssueCategory
}

/** Fix 输出 */
export interface FixReport {
  success: boolean
  /** 生成的 Patch 列表 */
  patches: Patch[]
  /** 修改的文件数 */
  changedFiles: number
  /** 针对的问题数 */
  addressedIssues: number
  /** 修复说明 */
  summary: string
}

// ─── Debug 日志 ──────────────────────────────────────────

/** 调试流程步骤 */
export type DebugPhase = 'generate' | 'run' | 'review' | 'fix' | 'runAgain' | 'done' | 'error'

/** 调试流程日志条目 */
export interface DebugLogEntry {
  /** 时间戳 */
  timestamp: number
  /** 阶段 */
  phase: DebugPhase
  /** 级别 */
  level: 'info' | 'success' | 'warning' | 'error'
  /** 消息 */
  message: string
  /** 附加数据 */
  data?: unknown
}

/** Debug 循环完整日志 */
export interface DebugLog {
  /** 会话/任务 ID */
  sessionId: string
  /** 全部日志条目 */
  entries: DebugLogEntry[]
  /** 追加日志 */
  log(phase: DebugPhase, level: DebugLogEntry['level'], message: string, data?: unknown): void
  /** 获取全部日志文本 */
  toText(): string
  /** 获取全部日志（JSON 数组） */
  toJSON(): DebugLogEntry[]
}

// ─── Debug 循环输入/输出 ─────────────────────────────────

/** Debug 循环输入 */
export interface DebugLoopInput {
  /** 用户需求（用于功能缺失检查） */
  prompt?: string
  /** 需求功能点（Blueprint features，用于功能缺失检查） */
  features?: string[]
  /** 已生成的代码文件（Generate 产物） */
  files: Array<{ path: string; content: string }>
  /** 应用模型/蓝图（用于结构检查） */
  appModel?: import('@aikd/shared').AppModel
  /** 运行时错误（Run 阶段产物，可选） */
  runtimeErrors?: {
    hasErrors: boolean
    errors: Array<{ kind: string; message: string; file?: string; line?: number; stack?: string; context?: string }>
  }
  /** 最大 Fix 轮数（默认 3） */
  maxFixRounds?: number
  /** 会话/任务 ID */
  sessionId?: string
  /** 中止信号 */
  signal?: AbortSignal
}

/** Debug 循环单轮结果 */
export interface DebugRound {
  /** 轮次（0 开始） */
  round: number
  /** Review 报告 */
  review: ReviewReport
  /** Fix 报告（若该轮执行了 Fix） */
  fix?: FixReport
  /** 修复后的文件 */
  files: Array<{ path: string; content: string }>
  /** 该轮是否通过 */
  passed: boolean
}

/** Debug 循环输出 */
export interface DebugLoopResult {
  /** 最终是否成功（所有问题修复） */
  success: boolean
  /** 最终文件 */
  files: Array<{ path: string; content: string }>
  /** 执行的轮次 */
  rounds: DebugRound[]
  /** 最终 Review 报告 */
  finalReview: ReviewReport
  /** 完整日志 */
  log: DebugLogEntry[]
  /** 日志文本 */
  logText: string
}
