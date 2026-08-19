// ─── Runtime Agent · Tool Calling 类型定义 ────────────────
//
// RuntimeAgent 通过「工具调用（Tool Calling）」执行真实开发流程。
// 工具命名采用命名空间形式：
//   filesystem.create()
//   terminal.run()
//   browser.open()
//
// 安全约束：所有对文件系统/终端的操作都被限制在 workspace 目录内，
// 由 RuntimeAdapter 负责强制路径边界（见 tools/security.ts）。

// ─── Tool 元数据 ─────────────────────────────────────────

/** 工具名称（命名空间.方法，如 "filesystem.create"） */
export type ToolName = string

/** 工具参数 schema（JSON Schema 子集，供 LLM 工具调用与校验） */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  required?: boolean
  /** 枚举可选值 */
  enum?: string[]
  /** 数组元素类型 */
  items?: ToolParameterSchema
}

/** 工具定义：LLM 可调用的工具 */
export interface ToolDefinition {
  /** 工具名称（命名空间.方法） */
  name: ToolName
  /** 工具描述（给 LLM 判断何时调用） */
  description: string
  /** 参数 schema */
  parameters: Record<string, ToolParameterSchema>
}

// ─── Tool 调用上下文与结果 ────────────────────────────────

/** 工具调用上下文：向 Runtime 提供 workspace 与依赖 */
export interface ToolContext {
  /** 应用工作区绝对路径（所有文件/终端操作的安全边界根目录） */
  workspacePath: string
  /** 临时目录路径（非持久产物，可自由读写） */
  tmpPath?: string
  /** 中止信号 */
  signal?: AbortSignal
  /** 工具运行时（提供 install/start/error 等托管能力） */
  runtime?: RuntimeToolBackend
}

/**
 * Runtime 托管后端（由宿主注入，如 server 的沙箱/工作区实现）。
 * 提供需要真实运行环境的工具：npm install、启动 Vite、读取浏览器错误。
 */
export interface RuntimeToolBackend {
  /** 执行 npm install */
  npmInstall(workspacePath: string, options?: { signal?: AbortSignal }): Promise<{ success: boolean; output: string }>
  /** 启动 Vite Dev Server，返回预览 URL 或错误 */
  startServer(workspacePath: string, options?: { signal?: AbortSignal }): Promise<{ success: boolean; url?: string; output: string }>
  /** 读取运行时的错误（如构建日志 / 浏览器 console error） */
  getRuntimeErrors(appId: string, options?: { signal?: AbortSignal }): Promise<RuntimeErrorReport>
  /** 是否可用（如 npm / docker 是否就绪） */
  isAvailable?(appId: string): Promise<boolean>
}

/** 运行时错误报告 */
export interface RuntimeErrorReport {
  /** 是否存在错误 */
  hasErrors: boolean
  /** 错误列表 */
  errors: Array<{
    /** 错误类型（compile / runtime / build / lint / network） */
    kind: string
    /** 错误消息 */
    message: string
    /** 相关文件（可选） */
    file?: string
    /** 行号（可选） */
    line?: number
    /** 原始堆栈/上下文 */
    stack?: string
    /** 原始上下文片段 */
    context?: string
  }>
  /** 完整原始日志 */
  rawLogs?: string
}

/** 工具执行结果 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean
  /** 人类可读结果 */
  output?: string
  /** 结构化数据 */
  data?: unknown
  /** 错误信息（失败时） */
  error?: string
}

// ─── 工具实现接口 ─────────────────────────────────────────

/** 单个工具的可执行实现 */
export interface Tool {
  /** 工具定义（元数据） */
  readonly definition: ToolDefinition
  /**
   * 执行工具。
   * @param args 工具参数
   * @param ctx  工具上下文
   */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> | ToolResult
}

// ─── RuntimeAgent 输入/输出 ───────────────────────────────

/** RuntimeAgent 输入：需要执行的真实开发流程 */
export interface RuntimeInput {
  /** 应用 ID（用于定位 workspace） */
  appId: string
  /** 已生成的代码文件（可选，提供时先写入 workspace） */
  files?: Array<{ path: string; content: string }>
  /** 需要执行的流程步骤 */
  steps?: RuntimeStep[]
  /** 是否自动 npm install */
  install?: boolean
  /** 是否启动 Vite */
  startServer?: boolean
  /** 是否收集运行错误 */
  collectErrors?: boolean
}

/** 运行时流程步骤 */
export type RuntimeStep =
  | { type: 'createFiles'; files: Array<{ path: string; content: string }> }
  | { type: 'modifyFile'; path: string; content: string }
  | { type: 'npmInstall' }
  | { type: 'startVite' }
  | { type: 'getErrors' }

/** RuntimeAgent 输出 */
export interface RuntimeOutput {
  /** 执行结果是否成功 */
  success: boolean
  /** 应用 ID */
  appId: string
  /** 工作区路径 */
  workspacePath: string
  /** 预览 URL（启动 Vite 后） */
  url?: string
  /** 运行错误报告 */
  runtimeErrors?: RuntimeErrorReport
  /** 各步骤执行记录 */
  steps: Array<{
    name: string
    success: boolean
    output?: string
    error?: string
  }>
  /** 工具调用日志（Tool Calling 审计） */
  toolCalls: Array<{
    tool: ToolName
    args: Record<string, unknown>
    success: boolean
    output?: string
    error?: string
  }>
}
