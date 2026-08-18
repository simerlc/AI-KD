// ─── Runtime Adapter ─────────────────────────────────────
//
// Runtime 依赖的宿主能力接口。宿主（web Preview）实现这些接口，
// 将 Action Engine 的通知/导航/弹窗/刷新请求映射到真实 UI 行为。

import type { ActionRuntime } from '@aikd/agent'
import type { DataClient } from './data/data-client'

/** 宿主为 Runtime 提供的能力集合 */
export interface RuntimeAdapter {
  /** 数据访问（Data Binding） */
  dataClient: DataClient
  /** Action 运行时能力（通知/导航/弹窗/刷新等） */
  actionRuntime: Omit<ActionRuntime, 'database' | 'http'>
  /** HTTP 请求能力（可选，供 http.request action 使用） */
  http?: ActionRuntime['http']
}
