// ─── browser.* 工具（Tool Calling）────────────────────────
//
// 提供浏览器/运行时能力：
//   browser.open(appId)        打开应用预览（需运行时后端提供 URL）
//   browser.getRuntimeErrors(appId)  获取应用运行/构建错误
//
// 依赖注入的 RuntimeToolBackend（由宿主如 server 沙箱实现）。
// 若未注入后端，browser.* 返回"不可用"结果，而不抛异常。

import type { Tool, ToolContext, ToolResult } from '../types'

export const browserOpenTool: Tool = {
  definition: {
    name: 'browser.open',
    description: '打开（预览）指定应用。返回应用的预览 URL。',
    parameters: {
      appId: { type: 'string', description: '应用 ID', required: true },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const appId = String(args.appId ?? ctx.runtime ? '' : '')
    if (!ctx.runtime) {
      return { success: false, error: '未注入 Runtime 后端，无法打开浏览器预览' }
    }
    const res = await ctx.runtime.startServer(ctx.workspacePath, { signal: ctx.signal })
    if (res.success && res.url) {
      return { success: true, output: res.url, data: { url: res.url, appId } }
    }
    return { success: false, error: res.output || '无法启动应用预览' }
  },
}

export const browserGetRuntimeErrorsTool: Tool = {
  definition: {
    name: 'browser.getRuntimeErrors',
    description: '获取应用的运行时错误（构建错误 / 编译错误 / 浏览器 console 错误），用于自动修复。',
    parameters: {
      appId: { type: 'string', description: '应用 ID', required: true },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const appId = String(args.appId ?? '')
    if (!ctx.runtime) {
      return { success: false, error: '未注入 Runtime 后端，无法获取运行错误' }
    }
    const report = await ctx.runtime.getRuntimeErrors(appId, { signal: ctx.signal })
    return {
      success: true,
      output: report.hasErrors ? report.errors.map((e) => `[${e.kind}] ${e.message}`).join('\n') : '无运行错误',
      data: report,
    }
  },
}

/** 全部 browser 工具 */
export const browserTools: Tool[] = [browserOpenTool, browserGetRuntimeErrorsTool]
