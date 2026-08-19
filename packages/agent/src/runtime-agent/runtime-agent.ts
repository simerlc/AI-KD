// ─── Runtime Agent ────────────────────────────────────────
//
// 让 Agent 能执行「真实开发流程」：
//   1. 创建项目文件（filesystem.create）
//   2. 修改代码（filesystem.write）
//   3. 执行 npm install（terminal.run）
//   4. 启动 Vite（terminal.run / browser.open）
//   5. 获取运行错误（browser.getRuntimeErrors）
//   6. 返回错误上下文（RuntimeErrorReport）
//
// 所有操作通过 Tool Calling 接口执行，并由 ToolRegistry 记录调用日志。
// 安全：所有文件系统/终端操作被限制在 workspace 目录内（security.ts）。

import path from 'node:path'
import type { RuntimeInput, RuntimeOutput, RuntimeStep, RuntimeToolBackend, ToolContext } from './types'
import { ToolRegistry, defaultToolRegistry } from './tool-registry'
import { filesystemCreateTool, filesystemWriteTool } from './tools/filesystem'

export interface RuntimeAgentOptions {
  /** 工具注册中心（默认内置全部工具） */
  tools?: ToolRegistry
  /** 工作区根目录（所有 app 工作区的父目录） */
  workspaceRoot?: string
  /** 运行时托管后端（npm install / 启动 Vite / 错误收集） */
  runtimeBackend?: RuntimeToolBackend
  /** 进度回调 */
  onProgress?: (message: string, phase?: string) => void
}

export class RuntimeAgent {
  private tools: ToolRegistry
  private workspaceRoot: string
  private backend?: RuntimeToolBackend
  private onProgress?: (message: string, phase?: string) => void

  constructor(options: RuntimeAgentOptions = {}) {
    this.tools = options.tools ?? defaultToolRegistry
    this.workspaceRoot = path.resolve(options.workspaceRoot ?? 'workspaces')
    this.backend = options.runtimeBackend
    this.onProgress = options.onProgress
  }

  /** 获取应用工作区绝对路径 */
  workspaceOf(appId: string): string {
    return path.join(this.workspaceRoot, appId)
  }

  /**
   * 执行真实开发流程。
   * @param input 输入（appId + 可选 files/steps）
   */
  async run(input: RuntimeInput): Promise<RuntimeOutput> {
    const workspacePath = this.workspaceOf(input.appId)
    const ctx: ToolContext = {
      workspacePath,
      signal: undefined,
      runtime: this.backend,
    }

    const steps = this.buildSteps(input)
    const stepResults: RuntimeOutput['steps'] = []
    const toolCalls: RuntimeOutput['toolCalls'] = []

    try {
      for (const step of steps) {
        if (ctx.signal?.aborted) break
        const stepResult = await this.runStep(step, ctx)
        stepResults.push(stepResult)
        // 记录本次步骤的工具调用
        for (const call of this.tools.getCallLog()) {
          toolCalls.push({ tool: call.tool, args: call.args, success: call.success, output: call.output, error: call.error })
        }
        this.tools.clearCallLog()
      }
    } catch (err) {
      stepResults.push({
        name: 'workflow',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // 默认收集运行错误
    let runtimeErrors
    if (input.collectErrors ?? true) {
      runtimeErrors = await this.collectErrors(input.appId)
    }

    return {
      success: stepResults.every((s) => s.success),
      appId: input.appId,
      workspacePath,
      runtimeErrors,
      steps: stepResults,
      toolCalls,
    }
  }

  /** 根据输入构建步骤列表 */
  private buildSteps(input: RuntimeInput): RuntimeStep[] {
    const steps: RuntimeStep[] = []
    if (input.files && input.files.length > 0) {
      steps.push({ type: 'createFiles', files: input.files })
    }
    if (input.steps && input.steps.length > 0) {
      steps.push(...input.steps)
    }
    if (input.install && !steps.some((s) => s.type === 'npmInstall')) {
      steps.push({ type: 'npmInstall' })
    }
    if (input.startServer && !steps.some((s) => s.type === 'startVite')) {
      steps.push({ type: 'startVite' })
    }
    return steps
  }

  /** 执行单个流程步骤 */
  private async runStep(step: RuntimeStep, ctx: ToolContext): Promise<RuntimeOutput['steps'][number]> {
    switch (step.type) {
      case 'createFiles': {
        const result = await this.createFiles(step.files, ctx)
        return { name: 'createFiles', success: result.success, output: result.output, error: result.error }
      }
      case 'modifyFile': {
        const result = await this.modifyFile(step.path, step.content, ctx)
        return { name: `modifyFile:${step.path}`, success: result.success, output: result.output, error: result.error }
      }
      case 'npmInstall': {
        this.onProgress?.('正在执行 npm install...', 'install')
        const result = await this.tools.execute('terminal.run', { command: 'npm install' }, ctx)
        return { name: 'npmInstall', success: result.success, output: result.output, error: result.error }
      }
      case 'startVite': {
        this.onProgress?.('正在启动 Vite...', 'start')
        const result = await this.tools.execute('terminal.run', { command: 'npx vite' }, ctx)
        return { name: 'startVite', success: result.success, output: result.output, error: result.error }
      }
      case 'getErrors': {
        const result = await this.collectErrors(ctx.workspacePath ? path.basename(ctx.workspacePath) : '')
        return { name: 'getErrors', success: true, output: result?.hasErrors ? '发现运行错误' : '无运行错误' }
      }
      default: {
        const _exhaustive: never = step
        return { name: 'unknown', success: false, error: `未知步骤类型 ${String(_exhaustive)}` }
      }
    }
  }

  /** 创建项目文件 */
  private async createFiles(
    files: Array<{ path: string; content: string }>,
    ctx: ToolContext,
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    let count = 0
    for (const file of files) {
      const result = await this.tools.execute('filesystem.create', { path: file.path, content: file.content }, ctx)
      if (!result.success) return result
      count++
    }
    return { success: true, output: `已创建 ${count} 个文件` }
  }

  /** 修改代码 */
  private async modifyFile(
    filePath: string,
    content: string,
    ctx: ToolContext,
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    // 先确认文件存在
    const readRes = await this.tools.execute('filesystem.read', { path: filePath }, ctx)
    const tool = readRes.success ? filesystemWriteTool : filesystemCreateTool
    const result = await this.tools.execute(tool.definition.name, { path: filePath, content }, ctx)
    return result
  }

  /** 收集运行错误 */
  private async collectErrors(appId: string): Promise<RuntimeOutput['runtimeErrors'] | undefined> {
    if (!this.backend) return undefined
    const ctx: ToolContext = {
      workspacePath: this.workspaceOf(appId),
      runtime: this.backend,
    }
    const result = await this.tools.execute('browser.getRuntimeErrors', { appId }, ctx)
    return (result.data as RuntimeOutput['runtimeErrors']) ?? undefined
  }

  /** 直接获取运行时后端（供上层编排使用） */
  getBackend(): RuntimeToolBackend | undefined {
    return this.backend
  }

  /** 获取工具注册中心 */
  getTools(): ToolRegistry {
    return this.tools
  }
}
