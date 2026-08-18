// @aikd/runtime - App Schema 驱动的核心运行时
//
// App Schema → Runtime → Renderer → 真实应用
//
// 模块职责：
//   - ComponentRenderer：ComponentNode → React 元素
//   - StateManagement：运行时状态（表单/记录/路由/页面）
//   - DataBinding：DataClient 接口 + 内存实现
//   - EventEngine / ActionEngine / ExpressionEngine：复用 @aikd/agent
//   - ErrorHandling：RuntimeErrorBoundary

export { Runtime } from './Runtime'
export type { RuntimeProps } from './Runtime'
export { PageRenderer } from './PageRenderer'
export { ComponentRenderer } from './components/component-renderer'
export { RuntimeErrorBoundary } from './error-boundary'
export { RuntimeProvider, RuntimeContext, useRuntime } from './state/runtime-state'
export type { RuntimeState, RuntimeActions, RuntimeContextValue } from './state/runtime-state'
export { toActionContext } from './state/runtime-state'
export { createMemoryDataClient } from './data/data-client'
export type { DataClient } from './data/data-client'
export type { RuntimeAdapter } from './adapter'
export { normalizeSchema, isAppSchema, appModelToAppSchema } from './schema/normalize'
export { EngineContext, useEngine } from './components/use-engine'
