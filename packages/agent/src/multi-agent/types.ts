// ─── Multi-Agent 核心类型与消息协议 ────────────────────────
//
// AI快搭 Agent Engine V2：将单 Agent 代码生成升级为 Multi-Agent 架构。
//
// 核心设计：
// - 5 个 Agent 分工：Requirement / Blueprint / Coding / Review / Fix
// - Agent 之间通过「JSON 消息」（AgentMessage）通信，不直接共享内部状态
// - 每条消息包含 from / to / type / payload，可被记录、审计、重放
// - 所有 Prompt 独立管理（见 ./prompts），Agent 通过类型引用
// - 统一使用 LLMClient（OpenAI 兼容），见 @aikd/agent 的 types

import type { LLMClient } from '../types'
import type { AppModel, AppType, Blueprint } from '@aikd/shared'
import type { IntegrityReport } from './blueprint/integrity-checker'
import type { ApplicationTestResult } from './tester/result'
import type { DesignReviewReport } from '../design-system'

// ─── Agent 身份 ──────────────────────────────────────────

export type AgentRole =
  | 'requirement'
  | 'product-planning'
  | 'blueprint'
  | 'coding'
  | 'review'
  | 'fix'
  | 'enhancement'
  | 'quality-evaluation'
  | 'runtime'
  | 'tester'

/** 所有 Agent 角色的列表 */
export const AGENT_ROLES: AgentRole[] = ['requirement', 'product-planning', 'blueprint', 'coding', 'review', 'fix', 'enhancement', 'quality-evaluation', 'runtime']

// ─── Agent 消息协议（JSON 通信）──────────────────────────

/**
 * Agent 之间传递的 JSON 消息。
 * 所有 Agent 间通信都通过此类消息，保证可序列化、可审计、可重放。
 */
export interface AgentMessage {
  /** 消息唯一 ID */
  id: string
  /** 消息类型 */
  type: AgentMessageType
  /** 发送方 Agent role */
  from: AgentRole
  /** 接收方 Agent role（"*" 表示广播给所有 Agent） */
  to: AgentRole | '*'
  /** 消息载荷（JSON 可序列化） */
  payload: AgentMessagePayload
  /** 时间戳 */
  timestamp: number
  /** 会话/任务 ID（用于关联整个流水线） */
  sessionId?: string
  /** 关联的上一消息 ID（用于追踪消息链） */
  replyTo?: string
}

/** 消息类型 */
export type AgentMessageType =
  | 'requirement.analyzed' // Requirement → Blueprint：需求分析结果
  | 'blueprint.produced' // Blueprint → Coding：应用蓝图
  | 'coding.produced' // Coding → Review：生成的代码
  | 'review.passed' // Review → Orchestrator：审查通过
  | 'review.failed' // Review → Fix：审查失败（携带问题清单）
  | 'fix.produced' // Fix → Review：修复后的代码
  | 'fix.applied' // Fix → Blueprint：修复反馈，可能需要更新蓝图
  | 'runtime.produced' // Runtime → Orchestrator：真实开发流程执行结果
  | 'progress' // 任意 Agent → Orchestrator：进度上报
  | 'error' // 任意 Agent → Orchestrator：错误上报
  | 'done' // 流水线完成
  | 'test.result' // Tester → Orchestrator：单轮应用测试结果
  | 'test.repair.start' // Tester → Orchestrator：开始自动修复
  | 'test.repair.done' // Tester → Orchestrator：修复完成
  | 'test.done' // Tester → Orchestrator：测试闭环结束（决定是否放行 Preview）
  | 'product-planning.done' // Product Planning → Orchestrator：产品规划完成
  | 'quality.done' // Quality Evaluation → Orchestrator：质量评分完成
  | 'enhancement.done' // Enhancement → Orchestrator：增强完成
  | 'ui-visual.skip' // Orchestrator：UI 视觉修复被跳过（功能未通过）
  | 'ui-visual.repair.start' // Orchestrator：开始 UI 视觉修复
  | 'ui-visual.repair.done' // Orchestrator：UI 视觉修复完成

/** 消息载荷（按消息类型区分） */
export type AgentMessagePayload =
  | RequirementAnalyzedPayload
  | BlueprintProducedPayload
  | CodingProducedPayload
  | ReviewPassedPayload
  | ReviewFailedPayload
  | FixProducedPayload
  | FixAppliedPayload
  | RuntimeProducedPayload
  | ProgressPayload
  | ErrorPayload
  | DonePayload
  | TestResultPayload

/** RequirementAgent 输出：解析后的需求 */
export interface RequirementAnalyzedPayload {
  /** 原始需求文本 */
  prompt: string
  /** 需求概述（结构化理解） */
  summary: string
  /** 应用类型推断 */
  appType: AppType
  /** 应用名称推断 */
  appName?: string
  /** 关键功能点 */
  features: string[]
  /** 数据实体（表）推断 */
  entities: Array<{ name: string; description: string }>
  /** 修改模式：已有的 App Model（若是在已有应用上迭代） */
  existingAppModel?: AppModel
  /** 修改模式：已有 Blueprint（若是在已有 Blueprint 上迭代，如 Fix 触发蓝图更新） */
  existingBlueprint?: Blueprint
  /** Fix 触发蓝图更新时的变更请求说明（仅修补必要结构，禁止整体重写） */
  blueprintChangeRequest?: string
  /** 多轮对话历史（修改模式上下文） */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** 已加载的技能上下文（Skill System 注入，供 BlueprintAgent 使用） */
  skillContextText?: string
  /** 产品规划信息（Product Planning Agent 产出，注入 Blueprint 生成） */
  productPlan?: import('@aikd/shared').ProductPlan
  /** 推荐的应用模式 ID（Pattern Library） */
  patternId?: string
}

/** BlueprintAgent 输出：应用蓝图 */
export interface BlueprintProducedPayload {
  /** 合法应用蓝图（CodingAgent 只能读取此合法 Blueprint） */
  blueprint: Blueprint
  /** 蓝图说明 */
  notes: string
  /**
   * 需求功能点（由 RequirementAgent 透传）。
   * CodingAgent 用它做「生成前检查」的功能覆盖度校验。
   */
  requirementFeatures?: string[]
  /** 需求数据实体（由 RequirementAgent 透传），用于数据模型匹配校验 */
  requirementEntities?: Array<{ name: string; description: string }>
  /** UI 视觉评审改进建议（UI Visual Review 闭环回传，供 CodingAgent 视觉层面优化） */
  uiVisualSuggestions?: string[]
}

/** CodingAgent 输出：生成的代码文件 */
export interface CodingProducedPayload {
  /** 生成的代码文件 */
  files: Array<{ path: string; content: string }>
  /** 本次编码所依据的合法 Blueprint */
  blueprint: Blueprint
  /** 转换得到的 AppModel（供后端持久化/预览使用） */
  appModel: AppModel
  /** 生成后文件完整性检查报告（import / 路径 / 组件缺失） */
  integrity?: IntegrityReport
  /** 需求功能点（透传至 Review，用于功能缺失检查） */
  requirementFeatures?: string[]
}

/** ReviewAgent 通过输出 */
export interface ReviewPassedPayload {
  /** 通过的消息 */
  passed: boolean
  /** 通过时的评价 */
  summary: string
}

/** ReviewAgent 输出联合类型（通过或失败） */
export type ReviewOutput = ReviewPassedPayload | ReviewFailedPayload

/** ReviewAgent 失败输出：问题清单 */
export interface ReviewFailedPayload {
  /** 失败标记 */
  passed: false
  /** 错误列表 */
  errors: string[]
  /** 警告列表 */
  warnings: string[]
  /** 修复建议（给 FixAgent） */
  suggestions: string[]
  /** 涉及的代码文件 */
  files: Array<{ path: string; content: string }>
}

/** FixAgent 输出：修复后的代码 */
export interface FixProducedPayload {
  /** 修复后的代码文件 */
  files: Array<{ path: string; content: string }>
  /** 修复说明 */
  summary: string
  /** 是否修复成功 */
  fixed: boolean
  /** 是否需要蓝图（App Model）结构变更 */
  requiresBlueprintChange?: boolean
  /** 蓝图变更请求说明 */
  changeRequest?: string
}

/** FixAgent 反馈给 Blueprint：蓝图可能需要更新 */
export interface FixAppliedPayload {
  /** 是否需要对蓝图做结构修改 */
  requiresBlueprintChange: boolean
  /** 建议的蓝图变更说明 */
  changeRequest?: string
}

/** RuntimeAgent 输出：真实开发流程执行结果 */
export interface RuntimeProducedPayload {
  /** 应用 ID */
  appId: string
  /** 是否成功 */
  success: boolean
  /** 预览 URL（可选） */
  url?: string
  /** 运行错误报告 */
  runtimeErrors?: {
    hasErrors: boolean
    errors: Array<{ kind: string; message: string; file?: string; line?: number; stack?: string; context?: string }>
  }
  /** 各步骤执行结果 */
  steps: Array<{ name: string; success: boolean; output?: string; error?: string }>
  /** 工具调用日志 */
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; success: boolean; output?: string; error?: string }>
}

/** 进度上报 */
export interface ProgressPayload {
  /** 阶段名 */
  phase: string
  /** 进度文本 */
  message: string
  /** 附带数据 */
  data?: unknown
}

/** 错误上报 */
export interface ErrorPayload {
  /** 错误信息 */
  message: string
  /** 错误详情 */
  detail?: unknown
}

/** 完成 */
export interface DonePayload {
  /** 完成说明 */
  message: string
}

// ─── Agent 接口 ─────────────────────────────────────────

/**
 * 单个 Agent 的接口。
 * 每个 Agent 接收输入消息，处理后产出（返回）新的输出消息。
 */
export interface Agent<TOutput = AgentMessagePayload> {
  /** Agent 角色 */
  readonly role: AgentRole
  /** 使用的主 Prompt 名称（独立管理） */
  readonly promptKey: string
  /**
   * 执行 Agent 逻辑。
   * @param input 输入（一般来自上一个 Agent 的输出消息）
   * @param context 运行上下文（共享的会话信息）
   */
  execute(input: AgentMessagePayload, context: AgentContext): Promise<TOutput>
}

/** Agent 运行上下文（所有 Agent 共享的可变状态） */
export interface AgentContext {
  /** 会话/任务 ID */
  sessionId: string
  /** LLM 客户端（OpenAI 兼容） */
  llm: LLMClient
  /** 应用 ID（透传给 Coding Agent） */
  appId?: string
  /** 进度回调 */
  onProgress?: (message: AgentMessage) => void
  /** 中止信号 */
  signal?: AbortSignal
}

// ─── Agent 元信息 / 运行记录 ─────────────────────────────

/** 一次 Agent 运行的记录（用于管理/审计） */
export interface AgentRunRecord {
  /** 运行 ID */
  runId: string
  /** Agent 角色 */
  role: AgentRole
  /** 开始时间 */
  startedAt: number
  /** 结束时间 */
  finishedAt?: number
  /** 状态 */
  status: 'running' | 'succeeded' | 'failed'
  /** 输入消息 */
  input?: AgentMessage
  /** 输出消息 */
  output?: AgentMessage
  /** 错误信息 */
  error?: string
}

// ─── Multi-Agent 编排结果 ───────────────────────────────

export interface MultiAgentResult {
  /** 最终 App Model */
  appModel: AppModel
  /** 最终代码文件 */
  files: Array<{ path: string; content: string }>
  /** 最终代码验证是否通过 */
  passed: boolean
  /** 审查结果（错误/警告/建议） */
  review: { errors: string[]; warnings: string[]; suggestions: string[] }
  /** 全部 Agent 的运行记录 */
  runs: AgentRunRecord[]
  /** 全部消息记录（JSON 通信日志） */
  messages: AgentMessage[]
  /** 总共重试次数（Fix 循环） */
  retries: number
  /** 应用测试结果（ApplicationTestAgent 产出） */
  testResult?: ApplicationTestResult
  /** 是否允许进入 Preview（仅测试通过才为 true） */
  previewAllowed?: boolean
  /** 自动修复轮数（测试失败后 RepairAgent 执行的轮次） */
  repairRounds?: number
  /** 自动修复记录 */
  repairLog?: string[]
  /** Design Review 报告（UI 自动审查结果） */
  designReview?: DesignReviewReport
  /** 本次加载的技能 ID 列表（Skill System） */
  skills?: string[]
  /** 产品规划信息（Product Planning Agent 产出） */
  productPlan?: import('@aikd/shared').ProductPlan
  /** 推荐的应用模式 ID */
  patternId?: string
  /** 质量评分报告（Application Quality Evaluation Agent 产出） */
  qualityReport?: import('./agents/quality-evaluation').QualityEvaluationReport
  /** 增强结果（Enhancement Agent 产出） */
  enhancement?: { addedCapabilities: string[]; summary: string; enhanced: boolean }
  /** UI 视觉评审结果（UiVisualReviewer 产出） */
  uiVisualReview?: import('../design-system').UiVisualReviewReport
  /** UI 视觉评审修复轮数 */
  uiVisualRepairRounds?: number
}

/** 应用测试结果消息载荷（Tester → Orchestrator） */
export interface TestResultPayload {
  /** 测试轮次 */
  round?: number
  /** 是否通过（passed/failed） */
  status?: 'passed' | 'failed'
  /** 综合得分 0-100 */
  score?: number
  /** 错误数量 */
  errors?: number
  /** 修复轮次（test.repair.* 消息使用） */
  repairRound?: number
  /** 命中错误的文件 */
  brokenFiles?: string[]
  /** 是否致命（build/runtime 失败） */
  fatal?: boolean
  /** 本轮修改的文件 */
  changedFiles?: string[]
  /** 修复说明 */
  note?: string
  /** 是否允许进入 Preview（test.done 使用） */
  previewAllowed?: boolean
}
