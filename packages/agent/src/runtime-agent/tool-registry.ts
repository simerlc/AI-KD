// ─── Runtime Agent · Tool 注册中心 ────────────────────────
//
// 管理所有可用的 Tool（工具调用接口）。
// - 注册 / 注销 / 查找 / 列出全部工具定义
// - 执行工具（execute），自动记录调用日志
// - 可扩展：未来新增工具只需 register()

import type { Tool, ToolContext, ToolResult, ToolName } from './types'
import { filesystemTools } from './tools/filesystem'
import { terminalTools } from './tools/terminal'
import { browserTools } from './tools/browser'

export interface ToolCallRecord {
  tool: ToolName
  args: Record<string, unknown>
  success: boolean
  output?: string
  error?: string
  durationMs?: number
}

export class ToolRegistry {
  private tools = new Map<ToolName, Tool>()
  private callLog: ToolCallRecord[] = []

  constructor(initial?: Tool[]) {
    if (initial) this.registerAll(initial)
  }

  /** 注册工具（可扩展：新增工具调用 register） */
  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool)
  }

  /** 批量注册工具 */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /** 注销工具 */
  unregister(name: ToolName): void {
    this.tools.delete(name)
  }

  /** 获取工具 */
  get(name: ToolName): Tool | undefined {
    return this.tools.get(name)
  }

  /** 是否存在 */
  has(name: ToolName): boolean {
    return this.tools.has(name)
  }

  /** 列出全部工具定义（供 LLM 工具声明） */
  listDefinitions(): Tool['definition'][] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  /** 列出工具名 */
  listNames(): ToolName[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 执行指定工具。
   * @param name 工具名（如 filesystem.create）
   * @param args 参数
   * @param ctx  工具上下文
   * @throws 若工具不存在
   */
  async execute(name: ToolName, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`[ToolRegistry] 未知工具: "${name}"`)
    }
    if (ctx.signal?.aborted) {
      return { success: false, error: '已中止' }
    }
    const startedAt = Date.now()
    try {
      const result = await tool.execute(args, ctx)
      this.callLog.push({
        tool: name,
        args,
        success: result.success,
        output: result.output,
        error: result.error,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      this.callLog.push({ tool: name, args, success: false, error, durationMs: Date.now() - startedAt })
      return { success: false, error }
    }
  }

  /** 获取全部工具调用日志（审计） */
  getCallLog(): ToolCallRecord[] {
    return this.callLog.slice()
  }

  /** 清空调用日志 */
  clearCallLog(): void {
    this.callLog = []
  }
}

/** 默认注册中心：内置全部工具 */
export const defaultToolRegistry = new ToolRegistry([
  ...filesystemTools,
  ...terminalTools,
  ...browserTools,
])
