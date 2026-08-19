// ─── terminal.* 工具（Tool Calling）──────────────────────
//
// 提供终端命令执行能力：
//   terminal.run(command)     在 workspace 内执行白名单命令（npm/npx/node/vite/pnpm）
//
// 安全：
//   - assertSafeCommand 仅允许白名单命令，并拒绝危险 shell 片段
//   - 命令在 workspace 目录（cwd）内执行
//   - 托管命令（npm install / vite）优先委托给注入的 RuntimeToolBackend，
//     否则使用受限的本地子进程执行（仅 npm/npx/node）

import { execFile, spawn } from 'node:child_process'
import type { Tool, ToolContext, ToolResult } from '../types'
import { assertSafeCommand } from './security'

/** 托管命令映射：把工具级命令翻译为 RuntimeToolBackend 提供的托管能力 */
const MANAGED_PATTERNS: Array<{ pattern: RegExp; kind: 'npmInstall' | 'startVite' }> = [
  { pattern: /^npm\s+(install|i)(\s|$)/, kind: 'npmInstall' },
  { pattern: /^(npx\s+vite|vite)(\s|$)/, kind: 'startVite' },
]

export const terminalRunTool: Tool = {
  definition: {
    name: 'terminal.run',
    description:
      '在应用 workspace 内执行命令。仅允许白名单命令（npm/npx/node/vite/pnpm），如 "npm install"、"npx vite --host 0.0.0.0"、"node -e \\"...\\""。',
    parameters: {
      command: { type: 'string', description: '要执行的命令', required: true },
      timeoutMs: { type: 'number', description: '超时（毫秒），默认 120000', required: false },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const command = String(args.command ?? '')
    const timeoutMs = Number(args.timeoutMs ?? 120_000)

    // 安全校验：白名单命令 + 无危险片段
    assertSafeCommand(command)

    // 若提供了 RuntimeToolBackend，托管匹配的 npm/vite 命令
    if (ctx.runtime) {
      for (const m of MANAGED_PATTERNS) {
        if (m.pattern.test(command.trim())) {
          if (m.kind === 'npmInstall') {
            const res = await ctx.runtime.npmInstall(ctx.workspacePath, { signal: ctx.signal })
            return { success: res.success, output: res.output, error: res.success ? undefined : res.output }
          }
          if (m.kind === 'startVite') {
            const res = await ctx.runtime.startServer(ctx.workspacePath, { signal: ctx.signal })
            return {
              success: res.success,
              output: res.url ?? res.output,
              data: res.url ? { url: res.url } : undefined,
              error: res.success ? undefined : res.output,
            }
          }
        }
      }
    }

    // 否则：受限本地执行（仅安全白名单命令，cwd 固定为 workspace）
    return runLocalCommand(command, ctx.workspacePath, timeoutMs, ctx.signal)
  },
}

/** 全部 terminal 工具 */
export const terminalTools: Tool[] = [terminalRunTool]

// ─── 受限本地命令执行 ─────────────────────────────────────

/**
 * 在 workspace 内执行白名单命令（不经过 shell，避免命令注入）。
 * 使用 execFile/spawn 直接传参，仅支持简单命令。
 */
function runLocalCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const [cmd, ...args] = command.trim().split(/\s+/)

  return new Promise<ToolResult>((resolve) => {
    let output = ''
    let errorOut = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ success: false, error: `命令执行超时（${timeoutMs}ms）`, output: output.slice(-2000) })
      }
    }, timeoutMs)

    const child = spawn(cmd!, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (d: Buffer) => (output += d.toString()))
    child.stderr?.on('data', (d: Buffer) => (errorOut += d.toString()))

    if (signal) {
      if (signal.aborted) child.kill()
      signal.addEventListener('abort', () => child.kill(), { once: true })
    }

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ success: false, error: `无法执行命令: ${err.message}` })
      }
    })

    child.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        const ok = code === 0
        resolve({
          success: ok,
          output: (output || errorOut).slice(-4000),
          error: ok ? undefined : `退出码 ${code}: ${errorOut.slice(-1000)}`,
        })
      }
    })
  })
}

/** 仅供内部测试：直接执行命令的封装 */
export function execInWorkspace(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, { cwd, windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}
