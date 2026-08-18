// ─── Runtime State Management ────────────────────────────
//
// 运行时状态：基于 React Context，管理应用运行时的：
//   - schema：当前 AppSchema（Schema 更新后重新渲染）
//   - form：表单数据（组件输入 → 表单提交）
//   - record：当前选中记录
//   - user：当前用户
//   - navigation：页面路由状态
//
// 页面、组件、数据、Action 通过此状态解耦，互不直接依赖。

import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react'
import type { AppSchema, ActionContext } from '@aikd/shared'

// ─── Runtime State 类型 ──────────────────────────────────

export interface RuntimeState {
  /** 当前 AppSchema */
  schema: AppSchema
  /** 当前路由路径 */
  path: string
  /** 表单数据（键为组件 id 或字段名） */
  formData: Record<string, unknown>
  /** 当前选中记录 */
  currentRecord: Record<string, unknown> | null
  /** 当前用户 */
  user: { id: string; [key: string]: unknown }
  /** 页面级数据 */
  pageData: Record<string, unknown>
  /** 弹窗状态 */
  modal: { visible: boolean; title?: string; content?: unknown } | null
}

export interface RuntimeActions {
  /** 导航到指定路径 */
  navigate: (path: string) => void
  /** 更新表单数据 */
  setFormData: (data: Record<string, unknown>) => void
  /** 更新单个表单字段 */
  setFormField: (key: string, value: unknown) => void
  /** 设置当前记录 */
  setCurrentRecord: (record: Record<string, unknown> | null) => void
  /** 设置页面数据 */
  setPageData: (data: Record<string, unknown>) => void
  /** 打开弹窗 */
  openModal: (title: string, content?: unknown) => void
  /** 关闭弹窗 */
  closeModal: () => void
  /** 刷新页面（触发重新渲染） */
  refresh: () => void
}

export interface RuntimeContextValue {
  state: RuntimeState
  actions: RuntimeActions
}

// ─── 构造 ActionContext（供表达式/动作引擎使用） ─────────

export function toActionContext(state: RuntimeState): ActionContext {
  return {
    form: state.formData,
    record: state.currentRecord ?? undefined,
    user: state.user,
    page: state.pageData,
  }
}

// ─── React Context ───────────────────────────────────────

export const RuntimeContext = createContext<RuntimeContextValue | null>(null)

export function useRuntime(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext)
  if (!ctx) {
    throw new Error('useRuntime 必须在 RuntimeProvider 内使用')
  }
  return ctx
}

// ─── Provider ────────────────────────────────────────────

export interface RuntimeProviderProps {
  schema: AppSchema
  /** 初始路径，默认取 schema 首页路由 */
  initialPath?: string
  /** 当前用户 */
  user?: { id: string; [key: string]: unknown }
  children: ReactNode
}

export function RuntimeProvider({ schema, initialPath, user, children }: RuntimeProviderProps) {
  const [path, setPath] = useState(initialPath ?? findHomePath(schema))
  const [formData, setFormDataState] = useState<Record<string, unknown>>({})
  const [currentRecord, setCurrentRecordState] = useState<Record<string, unknown> | null>(null)
  const [pageData, setPageDataState] = useState<Record<string, unknown>>({})
  const [modal, setModal] = useState<RuntimeState['modal']>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const navigate = useCallback((to: string) => setPath(to), [])

  const setFormData = useCallback((data: Record<string, unknown>) => setFormDataState((prev) => ({ ...prev, ...data })), [])

  const setFormField = useCallback((key: string, value: unknown) => {
    setFormDataState((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setCurrentRecord = useCallback((record: Record<string, unknown> | null) => setCurrentRecordState(record), [])

  const setPageData = useCallback((data: Record<string, unknown>) => setPageDataState((prev) => ({ ...prev, ...data })), [])

  const openModal = useCallback((title: string, content?: unknown) => setModal({ visible: true, title, content }), [])
  const closeModal = useCallback(() => setModal(null), [])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const value = useMemo<RuntimeContextValue>(() => {
    const state: RuntimeState = {
      schema,
      path,
      formData,
      currentRecord,
      user: user ?? { id: 'anonymous' },
      pageData,
      modal,
    }
    return {
      state,
      actions: { navigate, setFormData, setFormField, setCurrentRecord, setPageData, openModal, closeModal, refresh },
    }
  }, [schema, path, formData, currentRecord, user, pageData, modal, navigate, setFormData, setFormField, setCurrentRecord, setPageData, openModal, closeModal, refresh])

  return (
    <RuntimeContext.Provider value={value}>
      <div key={refreshKey} style={{ display: 'contents' }}>
        {children}
      </div>
    </RuntimeContext.Provider>
  )
}

/** 找到首页路由，找不到则回退 '/' */
function findHomePath(schema: AppSchema): string {
  const home = schema.routes.find((r) => r.path === '/')
  return home?.path ?? schema.routes[0]?.path ?? '/'
}
