// ─── Engine 访问 Hook ────────────────────────────────────
//
// 提供 Action/Event Engine 的访问。引擎在 Runtime 根组件中构建，
// 通过 Context 注入，供组件事件处理器使用。

import { createContext, useContext } from 'react'
import type { EventSchema, ActionSchema } from '@aikd/shared'
import type { EventEngine } from '@aikd/agent'

export interface EngineBundle {
  eventEngine: EventEngine
  actions: ActionSchema[]
  events: EventSchema[]
}

export const EngineContext = createContext<EngineBundle | null>(null)

export function useEngine(): EngineBundle | null {
  return useContext(EngineContext)
}
