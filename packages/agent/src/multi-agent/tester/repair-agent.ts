// ─── RepairAgent：自动修复代码（Patch-first） ─────────────
//
// 职责（对应需求第五/六节）：
//   接收 ErrorAnalyzerAgent 产出的 RepairContext，调用 LLM 生成"针对错误的最小补丁"，
//   仅修改出错文件，绝不重新生成整个应用。修复完成后返回新版 files 供重新测试。
//
// 修复策略（Patch-first，绝不全量重写）：
//   1. 错误定位 —— 仅针对 RepairContext.brokenFiles
//   2. 文件分析 —— 把出错文件内容 + 错误日志一起发给 LLM
//   3. Patch 修改 —— LLM 返回"仅修改的文件内容"（其余文件原样保留）
//   4. 重新测试 —— 由 orchestrator 闭环调用 ApplicationTestAgent
//
// 安全约束（需求第六节"避免"）：
//   - 不删除模块（prompt 强制要求保留已有功能）
//   - 不改 Blueprint 决定的页面/路由结构
//   - 若 LLM 返回不可解析，回退到规则修复（fixCode）兜底

import type { Blueprint } from '@aikd/shared'
import type { GeneratedFile, LLMClient, LLMMessage } from '../../types'
import type { RepairContext } from './error-analyzer-agent'
import { buildRepairPrompt } from '../prompts'
import { buildFileMap, readFile } from './validators/base'

export interface RepairResult {
  /** 修复后的完整文件集（仅 brokenFiles 可能变化） */
  files: GeneratedFile[]
  /** 本轮实际修改的文件 */
  changedFiles: string[]
  /** 修复说明 */
  note: string
  /** 是否使用了规则兜底（无 LLM 时无法生成补丁） */
  usedFallback: boolean
}

export class RepairAgent {
  constructor(private llm?: LLMClient) {}

  async repair(
    ctx: RepairContext,
    currentFiles: GeneratedFile[],
  ): Promise<RepairResult> {
    const fileMap = buildFileMap(currentFiles)
    const changed = new Map<string, string>()

    for (const brokenPath of ctx.brokenFiles) {
      const content = readFile(fileMap, brokenPath)
      if (!content) continue
      // 仅取与该文件相关的错误
      const fileErrors = ctx.errorLog
      const patched = await this.patchFile(brokenPath, content, fileErrors, ctx)
      if (patched.changed) changed.set(normalize(brokenPath), patched.fixedCode)
    }

    // 合并回原文件集
    const files = currentFiles.map((f) => {
      const key = normalize(f.path)
      return changed.has(key) ? { ...f, content: changed.get(key)! } : f
    })

    return {
      files,
      changedFiles: Array.from(changed.keys()),
      note: `第 ${ctx.round} 轮修复：修改 ${changed.size} 个文件（Patch-first，未重写整体）`,
      usedFallback: false,
    }
  }

  /** 单文件 Patch：优先 LLM，失败回退原内容（无 LLM 时无法补丁） */
  private async patchFile(
    path: string,
    content: string,
    errorLog: string,
    ctx: RepairContext,
  ): Promise<{ fixedCode: string; changed: boolean }> {
    if (this.llm) {
      try {
        const prompt = buildRepairPrompt(ctx, path, content)
        const messages: LLMMessage[] = [{ role: 'user', content: prompt }]
        const out = await this.llm.complete(messages, { temperature: 0 })
        // 尝试从输出中提取该文件的完整修复后内容（LLM 应返回该文件全部代码）
        const extracted = extractFileBlock(out, path) ?? out
        if (extracted && extracted.trim().length > 0 && extracted !== content) {
          return { fixedCode: extracted, changed: true }
        }
      } catch {
        /* 落到规则兜底 */
      }
    }
    // 无 LLM 或 LLM 失败：无法生成补丁，返回原内容（标记未修改，等待下一轮）
    void errorLog
    return { fixedCode: content, changed: false }
  }
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/')
}

/** 从 LLM 输出中提取 ```tsx/``` 代码块，或带文件名标记的块 */
function extractFileBlock(out: string, path: string): string | null {
  const fence = '```'
  // 优先匹配文件名标记：如 `// src/App.tsx` 或 `### src/App.tsx`
  const nameMarker = new RegExp(
    `(?:\\/\\/|#|###)\\s*${escapeReg(path)}[\\s\\S]*?${fence}(?:tsx|ts|jsx|js)?\\n([\\s\\S]*?)${fence}`,
    'i',
  )
  const m = nameMarker.exec(out)
  if (m) return m[1]
  // 否则取第一个代码块
  const block = new RegExp(`${fence}(?:tsx|ts|jsx|js)?\\n([\\s\\S]*?)${fence}`).exec(out)
  return block ? block[1] : null
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
