// ─── Runtime 根组件 ──────────────────────────────────────
//
// App Schema → Runtime → Renderer → 真实应用
//
// Runtime 根据 AppSchema 渲染页面树，并注入：
//   - State Management（RuntimeProvider）
//   - Data Binding（DataClient）
//   - Event/Action Engine（复用 @aikd/agent）
//   - Error Handling（RuntimeErrorBoundary）
//
// Schema 更新后（传入新的 schema prop），React 响应式重新渲染。

import { useMemo } from 'react'
import type { AppModel, AppSchema } from '@aikd/shared'
import { ActionEngine } from '@aikd/agent'
import { EventEngine } from '@aikd/agent'
import type { DataClient } from './data/data-client'
import type { RuntimeAdapter } from './adapter'
import { normalizeSchema } from './schema/normalize'
import { RuntimeProvider } from './state/runtime-state'
import { EngineContext } from './components/use-engine'
import { RuntimeErrorBoundary } from './error-boundary'
import { PageRenderer } from './PageRenderer'

// ─── Runtime Props ───────────────────────────────────────

export interface RuntimeProps {
  /** AppSchema 或 AppModel（旧数据兼容） */
  schema: AppSchema | AppModel
  /** 数据访问客户端（Data Binding） */
  dataClient: DataClient
  /** 宿主能力（通知/导航/弹窗/刷新等） */
  adapter: RuntimeAdapter
  /** 初始路径 */
  initialPath?: string
  /** 当前用户 */
  user?: { id: string; [key: string]: unknown }
}

// ─── Runtime 根组件 ─────────────────────────────────────

export function Runtime({ schema, dataClient, adapter, initialPath, user }: RuntimeProps) {
  const appSchema = useMemo(() => normalizeSchema(schema), [schema])

  // 构建 Action Engine（注入数据 + 宿主能力）
  const engine = useMemo(() => {
    const actionEngine = new ActionEngine({
      database: {
        query: (params) => dataClient.query(String(params.tableId ?? params.table ?? ''), (params.query as never) ?? {}),
        insert: (params) => dataClient.create(String(params.tableId ?? params.table ?? ''), (params.data as Record<string, unknown>) ?? {}),
        update: (params) => dataClient.update(String(params.id), (params.data as Record<string, unknown>) ?? {}),
        remove: (params) => dataClient.remove(String(params.id)),
      },
      http: adapter.http ?? {
        request: async () => {
          throw new Error('HTTP 能力未注入')
        },
      },
      notification: adapter.actionRuntime.notification,
      navigation: adapter.actionRuntime.navigation,
      modal: adapter.actionRuntime.modal,
      page: adapter.actionRuntime.page,
    })
    const eventEngine = new EventEngine(actionEngine)
    return {
      eventEngine,
      actions: appSchema.actions ?? [],
      events: appSchema.events ?? [],
    }
  }, [dataClient, adapter, appSchema])

  return (
    <RuntimeErrorBoundary>
      <RuntimeProvider schema={appSchema} initialPath={initialPath} user={user}>
        <EngineContext.Provider value={engine}>
          <PageRenderer schema={appSchema} />
        </EngineContext.Provider>
      </RuntimeProvider>
    </RuntimeErrorBoundary>
  )
}
