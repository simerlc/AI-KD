// ─── Runtime Agent · 安全边界 ─────────────────────────────
//
// 强制所有文件系统与终端操作被限制在 workspace 目录内。
//
// 策略：
//   - resolveSafePath：将任意输入路径解析为绝对路径，并确保其在 workspace 根内，
//     否则抛出错误（防止路径穿越攻击）
//   - assertSafeCommand：仅允许白名单命令在 workspace 内执行（npm/npx/node/vite），
//     并拒绝包含危险 shell 特性的命令
//   - 所有工具（filesystem.* / terminal.*）在执行前都必须先经过这两层校验

import path from 'node:path'

/** 允许在 workspace 内执行的命令（npm/npx/vite/node），其余一律拒绝 */
const ALLOWED_COMMANDS = new Set(['npm', 'npx', 'node', 'vite', 'pnpm'])

/** 危险 shell 片段（路径穿越 / 命令注入） */
const DANGEROUS_FRAGMENTS = [
  '..',
  ';',
  '&&',
  '|',
  '>',
  '<',
  '`',
  '$(',
  '${',
  'rm -rf /',
  '--volume',
  '-v ',
  '--network',
  '--privileged',
]

/**
 * 将输入路径解析为绝对路径，并确保其位于 workspace 根目录内。
 * @param workspacePath workspace 根目录（绝对路径）
 * @param target        相对或绝对路径
 * @throws 若解析后的路径超出 workspace 边界
 */
export function resolveSafePath(workspacePath: string, target: string): string {
  const root = path.resolve(workspacePath)
  const abs = path.resolve(root, target)
  const rel = path.relative(root, abs)

  // 在根目录之外（含 .. 穿越）或恰好为根目录本身（不允许写根目录文件）时拒绝
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`[RuntimeAgent] 路径越界被拒绝: "${target}"（仅允许 workspace 内操作）`)
  }
  return abs
}

/** 检查路径是否在 workspace 内（不抛错，供工具判断） */
export function isWithinWorkspace(workspacePath: string, target: string): boolean {
  try {
    resolveSafePath(workspacePath, target)
    return true
  } catch {
    return false
  }
}

/**
 * 校验命令是否为白名单命令且不包含危险片段。
 * @param command 要执行的命令（如 "npm install"）
 * @throws 若命令非法
 */
export function assertSafeCommand(command: string): void {
  if (!command || typeof command !== 'string') {
    throw new Error('[RuntimeAgent] 命令不能为空')
  }

  // 白名单命令必须是首个 token
  const firstToken = command.trim().split(/\s+/)[0]
  if (!ALLOWED_COMMANDS.has(firstToken)) {
    throw new Error(
      `[RuntimeAgent] 命令被拒绝: "${firstToken}"（仅允许 ${Array.from(ALLOWED_COMMANDS).join('/')}）`,
    )
  }

  // 检查危险片段
  for (const frag of DANGEROUS_FRAGMENTS) {
    if (command.includes(frag)) {
      throw new Error(`[RuntimeAgent] 命令含危险片段 "${frag}" 被拒绝`)
    }
  }
}

/**
 * 校验单个文件路径（filesystem 工具使用）。
 * 拒绝绝对路径（必须相对 workspace）与穿越路径。
 */
export function assertSafeRelativePath(workspacePath: string, target: string): string {
  if (!target || typeof target !== 'string') {
    throw new Error('[RuntimeAgent] 文件路径不能为空')
  }
  if (path.isAbsolute(target)) {
    throw new Error(`[RuntimeAgent] 拒绝绝对路径: "${target}"（请使用相对 workspace 路径）`)
  }
  return resolveSafePath(workspacePath, target)
}
