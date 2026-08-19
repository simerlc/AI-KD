// ─── FixAgent ────────────────────────────────────────────
//
// 负责自动修复：根据 ReviewAgent 的问题清单修复代码。
// V1 采用确定性修复策略（不依赖 LLM）：
// - 处理"缺失文件"、"页面文件缺失"等结构性问题
// - 处理"未注册组件"等引用问题（会标记 requiresBlueprintChange）
// 同时预留 LLM 修复入口（fixWithLLM），当确定性修复无法覆盖时启用。

import type {
  Agent,
  AgentContext,
  FixProducedPayload,
  ReviewFailedPayload,
} from '../types'
import type { LLMClient, LLMMessage, TestResult } from '../../types'
import { registry } from '@aikd/component-registry'
import { buildSystemPrompt } from '../prompts'
import { extractJson } from '../../utils'
import { Fixer } from '../../auto-debug/fixer'
import { TesterAgent } from '../../tester'

const REQUIRED_FILES = ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx']

export class FixAgent implements Agent<FixProducedPayload> {
  readonly role = 'fix' as const
  readonly promptKey = 'fix'
  private llm: LLMClient
  private tester: TesterAgent

  constructor(llm: LLMClient) {
    this.llm = llm
    this.tester = new TesterAgent(llm)
  }

  setLLM(llm: LLMClient): void {
    this.llm = llm
    this.tester = new TesterAgent(llm)
  }

  async execute(input: ReviewFailedPayload, ctx: AgentContext): Promise<FixProducedPayload> {
    if (ctx.signal?.aborted) throw new Error('FixAgent aborted')

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'fix',
      to: '*',
      payload: { phase: 'fix', message: '正在自动修复...' },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    const files = input.files.map((f) => ({ path: f.path, content: f.content }))

    // 将 Review 错误转为 DebugIssue，交给增强版 Fixer 生成 Patch 并应用
    const debugIssues = this.toDebugIssues(input)
    const fixer = new Fixer(undefined)
    const { report, files: fixedFiles } = fixer.fix(files, debugIssues)

    // 叠加原有确定性修复（未注册组件 → 蓝图变更等）
    const fixPlan = this.applyDeterministicFixes(fixedFiles, input)

    ctx.onProgress?.({
      id: '',
      type: 'progress',
      from: 'fix',
      to: '*',
      payload: {
        phase: 'fix',
        message: report.summary,
      },
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
    })

    return {
      files: fixPlan.files,
      summary: report.summary,
      fixed: report.changedFiles > 0 || fixPlan.requiresBlueprintChange,
      ...(fixPlan.requiresBlueprintChange
        ? { requiresBlueprintChange: true, changeRequest: fixPlan.changeRequest }
        : {}),
    }
  }

  /** 将 Review 问题清单转换为 DebugIssue（Fixer 输入） */
  private toDebugIssues(input: ReviewFailedPayload): import('../../auto-debug').DebugIssue[] {
    const issues: import('../../auto-debug').DebugIssue[] = []
    for (const err of input.errors) {
      issues.push({
        category: 'structure',
        severity: 'error',
        message: err,
        suggestion: this.suggestFor(err),
      })
    }
    for (const w of input.warnings) {
      issues.push({ category: 'structure', severity: 'warning', message: w })
    }
    return issues
  }

  private suggestFor(err: string): string {
    if (err.startsWith('缺少必需文件')) return '补齐必需文件'
    if (err.startsWith('缺少页面文件')) return '为蓝图补齐页面'
    if (err.includes('未注册的组件')) return '更换为已注册组件或更新蓝图'
    // 生成后完整性检查产生的问题
    if (err.includes('无法解析到任何已生成的文件')) return '创建缺失文件或修正 import 路径'
    if (err.includes('但未 import 也未在本文件定义')) return '补充 import 语句或改用已注册组件'
    if (err.includes('文件路径重复')) return '移除重复文件，保证路径唯一'
    if (err.includes('文件内容为空')) return '补全该文件内容或移除该文件'
    if (err.includes('缺少应用入口文件')) return '生成 src/main.tsx 入口并挂载 React 根节点'
    return '请检查并修复该错误'
  }

  /**
   * 再次运行测试（Run Again 能力）。
   * 供闭环在 Fix 后复验代码是否仍通过。
   */
  async runTests(
    files: Array<{ path: string; content: string }>,
    appModel: import('@aikd/shared').AppModel,
  ): Promise<TestResult> {
    return this.tester.test({
      appModel,
      files: files.map((f) => ({ path: f.path, content: f.content })),
    })
  }

  /**
   * 确定性修复：
   * - 补充缺失的必需文件（空占位）
   * - 处理"缺少页面文件"（标记需蓝图变更）
   * - 检测未注册组件（标记需蓝图变更，由 Blueprint 修复）
   */
  private applyDeterministicFixes(
    files: Array<{ path: string; content: string }>,
    review: ReviewFailedPayload,
  ): {
    files: Array<{ path: string; content: string }>
    changes: number
    requiresBlueprintChange: boolean
    changeRequest?: string
  } {
    const fileMap = new Map(files.map((f) => [f.path, f.content]))
    let changes = 0
    const blueprintChangeRequests: string[] = []

    // 1. 补充缺失的必需文件
    for (const required of REQUIRED_FILES) {
      if (!fileMap.has(required)) {
        fileMap.set(required, this.placeholderFor(required))
        changes++
      }
    }

    // 2. 页面文件缺失 → 需要蓝图补齐页面，标记蓝图变更
    const missingPage = review.errors.find((e) => e.startsWith('缺少页面文件'))
    if (missingPage) {
      blueprintChangeRequests.push(missingPage)
    }

    // 3. 未注册组件 → 需要蓝图更换为合法组件
    for (const err of review.errors) {
      const match = err.match(/未注册的组件类型 "([^"]+)"/)
      if (match) {
        const type = match[1]
        // 尝试做模糊匹配（大小写/蛇形），匹配到合法组件则提示
        const lower = type.toLowerCase()
        const found = registry.list().find((c) => c.type.toLowerCase() === lower)
        blueprintChangeRequests.push(
          found
            ? `将组件 "${type}" 替换为 "${found.type}"`
            : `移除组件 "${type}"（component-registry 中不存在）`,
        )
      }
    }

    // 4. 路由指向不存在页面 → 标记蓝图变更
    for (const err of review.errors) {
      if (err.includes('引用了不存在的页面') || err.includes('必须包含首页路由')) {
        blueprintChangeRequests.push(err)
      }
    }

    return {
      files: Array.from(fileMap.entries()).map(([path, content]) => ({ path, content })),
      changes,
      requiresBlueprintChange: blueprintChangeRequests.length > 0,
      ...(blueprintChangeRequests.length > 0
        ? { changeRequest: blueprintChangeRequests.join('；') }
        : {}),
    }
  }

  /** 缺失文件的占位内容（仅用于通过结构检查，真正的补齐由 Coding/Blueprint 重新生成） */
  private placeholderFor(path: string): string {
    switch (path) {
      case 'package.json':
        return JSON.stringify(
          {
            name: 'aikd-app',
            private: true,
            version: '0.1.0',
            type: 'module',
            scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' },
            dependencies: { react: '^18.3.0', 'react-dom': '^18.3.0' },
            devDependencies: { vite: '^5.4.0', typescript: '^5.5.0' },
          },
          null,
          2,
        )
      case 'index.html':
        return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>AI快搭应用</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
      case 'src/main.tsx':
        return `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)`
      case 'src/App.tsx':
        return `import React from 'react'
export default function App() {
  return <div>AI快搭应用</div>
}`
      default:
        return ''
    }
  }

  /** 预留：基于 LLM 的代码级修复（当前未默认启用） */
  async fixWithLLM(
    input: ReviewFailedPayload,
    ctx: AgentContext,
  ): Promise<FixProducedPayload> {
    const system = buildSystemPrompt(this.promptKey)
    const userContent = `## 待修复代码文件\n\n${JSON.stringify(input.files, null, 2)}\n\n## 审查问题清单\n\n${JSON.stringify(
      { errors: input.errors, warnings: input.warnings, suggestions: input.suggestions },
      null,
      2,
    )}\n\n请根据审查结果修复代码，输出完整代码文件数组。`

    const messages: LLMMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ]
    const response = await ctx.llm.complete(messages, {
      temperature: 0.2,
      max_tokens: 16384,
      signal: ctx.signal,
    })
    const parsed = extractJson(response) as {
      files?: Array<{ path: string; content: string }>
      summary?: string
      fixed?: boolean
      requiresBlueprintChange?: boolean
      changeRequest?: string
    } | null
    if (!parsed || !Array.isArray(parsed.files)) {
      throw new Error('FixAgent: LLM 修复结果解析失败')
    }

    // Patch 语义合并：LLM 按 Patch 优先原则只返回「被修改过的文件」，
    // 必须与原文件集合合并，否则未返回的文件会被整体丢弃（等于删项目）。
    const merged = new Map(input.files.map((f) => [f.path, f.content]))
    for (const f of parsed.files) {
      if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') continue
      merged.set(f.path, f.content)
    }

    return {
      files: Array.from(merged.entries()).map(([path, content]) => ({ path, content })),
      summary: parsed.summary || 'LLM 修复完成',
      fixed: parsed.fixed !== false,
      ...(parsed.requiresBlueprintChange
        ? { requiresBlueprintChange: true, changeRequest: parsed.changeRequest }
        : {}),
    }
  }
}

/** 便捷工厂 */
export function createFixAgent(llm: LLMClient): FixAgent {
  return new FixAgent(llm)
}
