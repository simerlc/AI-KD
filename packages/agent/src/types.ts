import type { AppModel } from '@aikd/shared'

// ─── LLM Client 接口 ─────────────────────────────────────
//
// Agent 包不直接依赖 openai SDK，而是通过此接口调用 LLM。
// Server 端创建适配器实现此接口，注入到 Orchestrator 中。

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCompleteOptions {
  temperature?: number
  max_tokens?: number
  signal?: AbortSignal
}

export interface LLMClient {
  /** 非流式补全（用于 Planner 生成 JSON、Tester 验证） */
  complete(messages: LLMMessage[], options?: LLMCompleteOptions): Promise<string>

  /** 流式补全（用于 Builder 生成代码、向用户展示进度） */
  stream(messages: LLMMessage[], options: LLMCompleteOptions, onChunk: (chunk: string) => void): Promise<string>
}

// ─── Agent 通用类型 ──────────────────────────────────────

export type AgentPhase = 'planning' | 'building' | 'testing' | 'done' | 'error'

export interface AgentProgress {
  phase: AgentPhase
  message: string
  /** 详细数据（如 App Model JSON、代码文件列表） */
  data?: unknown
}

export type ProgressCallback = (progress: AgentProgress) => void

// ─── Builder 输出类型 ────────────────────────────────────

export interface GeneratedFile {
  /** 文件路径，如 "src/App.tsx" */
  path: string
  /** 文件内容 */
  content: string
}

export interface BuilderResult {
  files: GeneratedFile[]
}

// ─── Tester 输出类型 ─────────────────────────────────────

export interface TestResult {
  passed: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

// ─── Orchestrator 输出类型 ───────────────────────────────

export interface OrchestratorResult {
  appModel: AppModel
  files: GeneratedFile[]
  testResult: TestResult
  /** 执行过程中是否发生过重试 */
  retries: number
}

// ─── Orchestrator 配置 ───────────────────────────────────

export interface OrchestratorConfig {
  /** Planner 最大重试次数（默认 3） */
  maxPlannerRetries?: number
  /** Builder-Tester 循环最大重试次数（默认 2） */
  maxBuilderRetries?: number
  /** 中止信号 */
  signal?: AbortSignal
}
