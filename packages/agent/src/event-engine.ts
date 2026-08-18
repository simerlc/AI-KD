// ─── Event Engine ────────────────────────────────────────
//
// 统一 Event → Action 编排引擎。
// 将事件（click/submit/change/load/rowClick/pageLoad）映射到一组 Action，
// 按顺序执行，并聚合每个 Action 的结果。

import type { ActionContext, ActionSchema, EventResult, EventSchema } from '@aikd/shared'
import { ActionEngine } from './action-engine'

// ─── 事件触发名 → 事件匹配 ───────────────────────────────

/** 支持的事件触发名（组件 + 页面） */
export type TriggerName = 'click' | 'submit' | 'change' | 'load' | 'rowClick' | 'pageLoad'

/**
 * 判断一个 EventSchema 是否匹配给定的触发名。
 * - click/submit/change/load/rowClick → 匹配 interaction 事件的 event 字段
 * - pageLoad → 匹配 lifecycle 事件的 lifecycle 字段
 */
export function matchEventTrigger(event: EventSchema, trigger: TriggerName): boolean {
  if (trigger === 'pageLoad') {
    return event.trigger === 'lifecycle' && (event.lifecycle === 'pageLoad' || event.lifecycle === 'onMount')
  }
  return event.trigger === 'interaction' && event.event === trigger
}

// ─── Event Engine ────────────────────────────────────────

export class EventEngine {
  constructor(private actionEngine: ActionEngine) {}

  /**
   * 执行单个事件（按顺序执行其绑定的所有 Action）。
   */
  async dispatch(
    event: EventSchema,
    actions: ActionSchema[],
    context: ActionContext = {},
  ): Promise<EventResult> {
    const results = []

    for (const actionId of event.actions) {
      const action = actions.find((a) => a.id === actionId)
      if (!action) {
        results.push({ success: false, error: `事件 "${event.name}" 引用了不存在的动作: ${actionId}` })
        continue
      }
      results.push(await this.actionEngine.execute(action, context))
    }

    const firstError = results.find((r) => !r.success)
    return {
      success: !firstError,
      results,
      error: firstError?.error,
    }
  }

  /**
   * 触发一个事件：根据触发名找到匹配的 EventSchema 并执行。
   * 支持多个事件匹配同一触发名时顺序执行。
   */
  async trigger(
    trigger: TriggerName,
    events: EventSchema[],
    actions: ActionSchema[],
    context: ActionContext = {},
  ): Promise<EventResult | null> {
    const matched = events.filter((e) => matchEventTrigger(e, trigger))
    if (matched.length === 0) return null

    const allResults = []
    let firstError: string | undefined

    for (const event of matched) {
      const result = await this.dispatch(event, actions, context)
      allResults.push(...result.results)
      if (result.error && !firstError) firstError = result.error
    }

    return {
      success: !firstError,
      results: allResults,
      error: firstError,
    }
  }
}
