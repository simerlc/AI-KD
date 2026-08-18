// ─── 事件处理器 Hook ─────────────────────────────────────
//
// 将组件的事件（click/submit/change/rowClick/load）绑定到 Event Engine，
// 触发对应的 Action 链。组件通过此 Hook 获得 onClick/onSubmit 等处理器。

import { useCallback, useMemo } from 'react'
import type { ComponentNode } from '@aikd/shared'
import { useRuntime, toActionContext } from '../state/runtime-state'
import { useEngine } from './use-engine'

export interface EventHandlers {
  onClick?: () => void
  onSubmit?: () => void
  onRowClick?: (record: Record<string, unknown>) => void
}

/**
 * 根据组件节点，返回其绑定的事件处理器。
 * 组件节点通过 meta 或扩展字段声明其事件（如 events 列表）。
 */
export function useEventHandlers(node: ComponentNode): EventHandlers {
  const { state, actions } = useRuntime()
  const engine = useEngine()

  const triggerEvent = useCallback(
    (trigger: 'click' | 'submit' | 'change' | 'load' | 'rowClick', record?: Record<string, unknown>) => {
      if (!engine) return
      const context = toActionContext(state)
      if (record) context.record = record
      void engine.eventEngine.trigger(trigger, engine.events, engine.actions, context)
    },
    [engine, state],
  )

  return useMemo<EventHandlers>(() => {
    const handlers: EventHandlers = {}

    // 组件绑定的事件（通过 meta.events 或直接 events 字段）
    const boundEvents = getBoundEvents(node)
    if (boundEvents.includes('click')) {
      handlers.onClick = () => triggerEvent('click')
    }
    if (boundEvents.includes('submit')) {
      handlers.onSubmit = () => triggerEvent('submit')
    }

    return handlers
  }, [node, triggerEvent])
}

/** 提取组件绑定的事件名（从 meta 或扩展字段） */
function getBoundEvents(node: ComponentNode): string[] {
  const meta = node.props?.meta as Record<string, unknown> | undefined
  const events = meta?.events
  if (Array.isArray(events)) return events.map(String)
  return []
}
