// ─── Validator 公共上下文与工具 ────────────────────────────
//
// 所有 Validator 共享同一份「生成应用上下文」：文件集合、Blueprint、入口信息。
// 这样 Build/Runtime/UI/Feature/API 五个验证器可独立工作，又能被 ApplicationTestAgent 聚合。

import type { Blueprint } from '@aikd/shared'
import type { GeneratedFile } from '../../../types'
import type { DimensionResult, TestIssue, TestDimension } from '../result'

/** 验证器输入上下文 */
export interface ValidationContext {
  /** CodingAgent 产出的文件集合（虚拟文件系统） */
  files: GeneratedFile[]
  /** 应用 Blueprint（用于推断应有哪些页面/API/流程） */
  blueprint: Blueprint
  /** 项目所在目录（真实执行 npm build/dev 时使用）；静态模式下可空 */
  projectDir?: string
  /** 是否允许执行真实 shell 命令（build/dev） */
  allowRealExecution?: boolean
  /** 当前测试轮次 */
  round?: number
}

/** 由 GeneratedFile[] 构建 path→content 的 Map，便于路径检索 */
export function buildFileMap(files: GeneratedFile[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const f of files) m.set(normalizePath(f.path), f.content)
  return m
}

/** 统一路径：反斜杠→斜杠，去掉前导 / */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** 判断文件是否存在（不区分大小写，统一 / 分隔） */
export function hasFile(fileMap: Map<string, string>, path: string): boolean {
  const p = normalizePath(path)
  if (fileMap.has(p)) return true
  for (const key of fileMap.keys()) if (key.toLowerCase() === p.toLowerCase()) return true
  return false
}

/** 取文件内容（大小写不敏感） */
export function readFile(fileMap: Map<string, string>, path: string): string | undefined {
  const p = normalizePath(path)
  if (fileMap.has(p)) return fileMap.get(p)
  for (const [k, v] of fileMap.entries()) if (k.toLowerCase() === p.toLowerCase()) return v
  return undefined
}

/** 工具：把若干 issue 与计数聚合成 DimensionResult */
export function toDimension(
  dimension: TestDimension,
  issues: TestIssue[],
  checked: number,
  summary: string,
): DimensionResult {
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const passed = Math.max(0, checked - errors)
  const score = checked === 0 ? 0 : Math.round((passed / checked) * 100)
  const status: DimensionResult['status'] =
    errors > 0 ? 'failed' : warnings > 0 ? 'warning' : checked === 0 ? 'skipped' : 'passed'
  return { status, score, checked, passed, issues, summary }
}

/** 安全执行 shell 命令并返回 stdout/stderr/exitCode */
export async function runCommand(
  cmd: string,
  cwd: string,
  timeoutMs = 120_000,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  // 动态导入，避免在非 Node 环境（如纯测试）报错
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileP = promisify(execFile)
  try {
    const res = (await execFileP(
      process.platform === 'win32' ? 'cmd' : 'sh',
      process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd],
      { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 },
    )) as { stdout: string; stderr: string }
    return { stdout: res.stdout, stderr: res.stderr, exitCode: 0 }
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? (e as Error)?.message ?? String(e),
      exitCode: typeof err.code === 'number' ? err.code : 1,
    }
  }
}
