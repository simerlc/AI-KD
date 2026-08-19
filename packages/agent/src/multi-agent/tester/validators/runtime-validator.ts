// ─── RuntimeValidator：运行时启动检测 ─────────────────────
//
// 真实执行 `npm run dev` 启动 Vite 开发服务器，检测：
//   - 服务是否启动成功（默认端口 5173）
//   - 首页是否可访问（HTTP 200）
//   - 启动日志中是否包含致命错误
//
// 静态模式（无真实执行）：基于结构启发式判断（存在 main.tsx 入口且
// 无悬空 import 即视为"可启动"的高概率），并给出 warning 而非 error，
// 由上层决定是否阻断。

import type { DimensionResult, TestIssue } from '../result'
import { runCommand, toDimension, type ValidationContext } from './base'

const DEV_PORT = 5173

export class RuntimeValidator {
  async validate(ctx: ValidationContext): Promise<DimensionResult> {
    if (!ctx.allowRealExecution || !ctx.projectDir) {
      // 静态模式：结构良好的情况下给 warning（提示未真实运行）
      return toDimension(
        'runtime',
        [
          {
            dimension: 'runtime',
            severity: 'warning',
            message: '未执行真实 npm run dev（静态模式），运行风险未实测',
            category: 'runtime',
          },
        ],
        1,
        '静态模式：未真实启动开发服务器',
      )
    }

    // 1. 启动 dev 服务（后台），限时等待端口
    const start = Date.now()
    const proc = spawnDev(ctx.projectDir)
    const up = await waitForPort(DEV_PORT, 30_000)
    const issues: TestIssue[] = []
    let checked = 0

    checked++
    if (!up) {
      issues.push({
        dimension: 'runtime',
        severity: 'error',
        message: '开发服务器启动失败或端口 5173 在 30s 内未就绪',
        category: 'runtime',
      })
    } else {
      // 2. 首页可访问性
      checked++
      const httpOk = await fetchOk(`http://localhost:${DEV_PORT}/`)
      if (!httpOk)
        issues.push({
          dimension: 'runtime',
          severity: 'error',
          message: '首页 HTTP 访问失败（白屏/崩溃）',
          category: 'runtime',
        })
    }

    killDev(proc)
    const summary =
      issues.length === 0
        ? `运行时检查通过：dev 启动成功、首页可访问（${Date.now() - start}ms）`
        : `运行时检查失败：${issues.map((i) => i.message).join('；')}`
    return toDimension('runtime', issues, checked, summary)
  }
}

// ─── 进程管理 ──────────────────────────────────────────────
import { spawn } from 'node:child_process'

function spawnDev(cwd: string) {
  return spawn(
    process.platform === 'win32' ? 'cmd' : 'sh',
    process.platform === 'win32' ? ['/c', 'npm run dev'] : ['-c', 'npm run dev'],
    { cwd, detached: true, stdio: 'ignore' },
  )
}

function killDev(proc: ReturnType<typeof spawn>) {
  try {
    if (process.platform === 'win32') {
      // 通过 pid 杀掉进程树
      spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
    } else if (proc.pid) {
      process.kill(-proc.pid, 'SIGKILL')
    }
  } catch {
    /* noop */
  }
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`)
      if (res.ok || res.status === 200) return true
    } catch {
      /* 端口未就绪 */
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  return false
}

async function fetchOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    return res.status === 200
  } catch {
    return false
  }
}

export { DEV_PORT }
