// ─── filesystem.* 工具（Tool Calling）────────────────────
//
// 提供文件系统操作能力：
//   filesystem.create(path, content)  创建/写入文件（自动建目录）
//   filesystem.read(path)             读取文件内容
//   filesystem.write(path, content)   修改/覆盖文件内容
//   filesystem.list(path)             列出目录内容
//   filesystem.delete(path)           删除文件或目录
//
// 所有路径都经过 resolveSafePath 校验，强制限制在 workspace 内。

import fs from 'node:fs/promises'
import path from 'node:path'
import type { Tool, ToolContext, ToolResult } from '../types'
import { assertSafeRelativePath } from './security'

const workspacePathOf = (ctx: ToolContext): string => ctx.workspacePath

export const filesystemCreateTool: Tool = {
  definition: {
    name: 'filesystem.create',
    description: '创建新文件并写入内容（自动创建父目录）。若文件已存在则覆盖。',
    parameters: {
      path: { type: 'string', description: '相对 workspace 的文件路径，如 src/App.tsx', required: true },
      content: { type: 'string', description: '文件内容', required: true },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const target = String(args.path ?? '')
    const content = String(args.content ?? '')
    const abs = assertSafeRelativePath(workspacePathOf(ctx), target)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf-8')
    return { success: true, output: `已创建文件 ${target}`, data: { path: target, size: content.length } }
  },
}

export const filesystemReadTool: Tool = {
  definition: {
    name: 'filesystem.read',
    description: '读取指定文件的完整内容。',
    parameters: {
      path: { type: 'string', description: '相对 workspace 的文件路径', required: true },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const target = String(args.path ?? '')
    const abs = assertSafeRelativePath(workspacePathOf(ctx), target)
    const content = await fs.readFile(abs, 'utf-8')
    return { success: true, output: content, data: { path: target, content } }
  },
}

export const filesystemWriteTool: Tool = {
  definition: {
    name: 'filesystem.write',
    description: '修改/覆盖已存在文件的内容（路径必须已存在，否则用 filesystem.create）。',
    parameters: {
      path: { type: 'string', description: '相对 workspace 的文件路径', required: true },
      content: { type: 'string', description: '新的文件内容', required: true },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const target = String(args.path ?? '')
    const content = String(args.content ?? '')
    const abs = assertSafeRelativePath(workspacePathOf(ctx), target)
    await fs.writeFile(abs, content, 'utf-8')
    return { success: true, output: `已修改文件 ${target}`, data: { path: target } }
  },
}

export const filesystemListTool: Tool = {
  definition: {
    name: 'filesystem.list',
    description: '列出指定目录下的文件与子目录（不含 node_modules）。',
    parameters: {
      path: { type: 'string', description: '相对 workspace 的目录路径，默认根目录', required: false },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const target = String(args.path ?? '.')
    const abs = assertSafeRelativePath(workspacePathOf(ctx), target)
    const entries = await fs.readdir(abs, { withFileTypes: true })
    const items = entries
      .filter((e) => e.name !== 'node_modules')
      .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
    return { success: true, output: items.map((i) => `${i.type === 'directory' ? '[dir]' : '     '} ${i.name}`).join('\n'), data: { path: target, items } }
  },
}

export const filesystemDeleteTool: Tool = {
  definition: {
    name: 'filesystem.delete',
    description: '删除指定文件或目录（目录递归删除）。',
    parameters: {
      path: { type: 'string', description: '相对 workspace 的文件或目录路径', required: true },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const target = String(args.path ?? '')
    const abs = assertSafeRelativePath(workspacePathOf(ctx), target)
    await fs.rm(abs, { recursive: true, force: true })
    return { success: true, output: `已删除 ${target}` }
  },
}

/** 全部 filesystem 工具 */
export const filesystemTools: Tool[] = [
  filesystemCreateTool,
  filesystemReadTool,
  filesystemWriteTool,
  filesystemListTool,
  filesystemDeleteTool,
]
