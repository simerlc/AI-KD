// ─── Action Engine ───────────────────────────────────────
//
// 统一 Action 执行引擎。将 ActionSchema 分发到具体的 handler 执行，
// 与 UI 组件解耦。外部能力（数据库、HTTP、通知、导航、弹窗、刷新）
// 通过 ActionRuntime 接口注入，引擎本身不依赖具体实现。

import type { ActionContext, ActionResult, ActionSchema } from '@aikd/shared'
import { resolveObject } from './expression'

// ─── ActionRuntime 接口 ──────────────────────────────────

/**
 * Action 执行所需的运行时能力。
 * 由宿主（如 server / 前端 runtime）实现并注入。
 */
export interface ActionRuntime {
  /** 数据库操作 */
  database: {
    query(params: Record<string, unknown>): Promise<unknown>
    insert(params: Record<string, unknown>): Promise<unknown>
    update(params: Record<string, unknown>): Promise<unknown>
    remove(params: Record<string, unknown>): Promise<unknown>
  }
  /** HTTP 请求 */
  http: {
    request(params: Record<string, unknown>): Promise<unknown>
  }
  /** 通知（toast 等） */
  notification: {
    success(message: string): void
    error(message: string): void
  }
  /** 导航 */
  navigation: {
    go(path: string): void
  }
  /** 弹窗 */
  modal: {
    open(params: Record<string, unknown>): void
    close(): void
  }
  /** 页面刷新 */
  page: {
    refresh(): void
  }
}

// ─── Action Engine ───────────────────────────────────────

export class ActionEngine {
  constructor(private runtime: ActionRuntime) {}

  /**
   * 执行单个 Action。
   * 1. 解析 params 中的变量表达式
   * 2. 根据 type 分发到 handler
   * 3. 捕获错误，返回结构化结果
   */
  async execute(action: ActionSchema, context: ActionContext = {}): Promise<ActionResult> {
    try {
      // 解析变量表达式
      const params = resolveObject(action.params, context) as Record<string, unknown>

      const data = await this.dispatch(action.type, params, context)
      return { success: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: `动作 "${action.name}" 执行失败: ${message}` }
    }
  }

  /** 按 Action 类型分发到具体 handler */
  private async dispatch(type: string, params: Record<string, unknown>, context: ActionContext): Promise<unknown> {
    switch (type) {
      case 'database.query':
        return this.runtime.database.query(params)

      case 'database.insert':
        return this.runtime.database.insert(params)

      case 'database.update':
        return this.runtime.database.update(params)

      case 'database.delete':
        return this.runtime.database.remove(params)

      case 'http.request':
        return this.runtime.http.request(params)

      case 'notification.success':
        this.runtime.notification.success(String(params.message ?? '操作成功'))
        return undefined

      case 'notification.error':
        this.runtime.notification.error(String(params.message ?? '操作失败'))
        return undefined

      case 'navigation.go':
        this.runtime.navigation.go(String(params.path ?? '/'))
        return undefined

      case 'modal.open':
        this.runtime.modal.open(params)
        return undefined

      case 'modal.close':
        this.runtime.modal.close()
        return undefined

      case 'page.refresh':
        this.runtime.page.refresh()
        return undefined

      // 旧抽象类型兼容映射（向后兼容，不破坏旧 Schema）
      case 'navigate':
        this.runtime.navigation.go(String(params.path ?? '/'))
        return undefined

      case 'setState':
      case 'setData':
      case 'callFunction':
      case 'submitForm':
        // 旧类型无对应运行时 handler，标记为未实现但不抛错
        return undefined

      case 'custom':
        // 自定义动作：由宿主通过 runtime 扩展处理，这里仅返回 params
        return params

      default:
        throw new Error(`未知的 Action 类型: ${type}`)
    }
  }
}
