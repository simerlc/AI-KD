import fs from 'node:fs/promises'
import path from 'node:path'
import type { GeneratedFile } from '@aikd/agent'

// ─── 工作区文件管理 ──────────────────────────────────────
//
// 将 Builder 生成的代码文件写入到 ./workspaces/{appId}/ 目录。
// Phase 4 的 Docker 沙箱将从此目录挂载文件。

// 工作区路径：保持固定目录名 workspaces，不随端口变化。
// 历史任务列表的隔离由 DB 路径（data-<PORT>）负责；代码产物应跨端口共享，
// 否则换端口后所有已生成的应用预览都会丢失。
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(process.cwd(), 'workspaces')

/** 获取应用工作区目录路径 */
export function getWorkspacePath(appId: string): string {
  return path.join(WORKSPACE_ROOT, appId)
}

// 需要保留的文件/目录（不随重新生成而删除，避免重复安装依赖）
const KEEP_ENTRIES = new Set(['node_modules', 'package.json', 'package-lock.json'])

/**
 * 将生成的代码文件写入工作区。
 *
 * 写入前会清理工作区中上一次生成的源码文件，避免旧文件残留导致预览加载到
 * 旧版本的代码（例如重新生成时被移除的旧页面文件仍被 Vite/入口引用）。
 * 保留 node_modules 与 package 清单，避免重复安装依赖。
 */
export async function writeWorkspaceFiles(appId: string, files: GeneratedFile[]): Promise<void> {
  const workspacePath = getWorkspacePath(appId)

  // 1. 清理上一次的源码文件（保留依赖与包清单）
  try {
    const entries = await fs.readdir(workspacePath)
    for (const name of entries) {
      if (KEEP_ENTRIES.has(name)) continue
      const p = path.join(workspacePath, name)
      await fs.rm(p, { recursive: true, force: true })
    }
  } catch {
    // 工作区不存在，忽略
  }

  // 2. 写入新生成的代码文件
  for (const file of files) {
    const filePath = path.join(workspacePath, file.path)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, file.content, 'utf-8')
  }
}

/** 清理工作区（删除所有文件） */
export async function cleanWorkspace(appId: string): Promise<void> {
  const workspacePath = getWorkspacePath(appId)
  try {
    await fs.rm(workspacePath, { recursive: true, force: true })
  } catch {
    // 目录不存在，忽略
  }
}
