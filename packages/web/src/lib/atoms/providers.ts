// Provider Store：负责 Provider 数据加载与操作，React 组件只做 UI
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { providersApi } from '@/lib/providers/api'
import type { ModelProvider, ProviderInput, SelectedModel } from '@/lib/providers/types'
import { toSelectedKey, fromSelectedKey } from '@/lib/providers/types'

export const providersAtom = atom<ModelProvider[]>([])

export const providersLoadingAtom = atom<boolean>(false)

export const providersErrorAtom = atom<string | null>(null)

/** 当前选中的模型（持久化到 localStorage，刷新后保留） */
export const selectedModelKeyAtom = atomWithStorage<string | null>('aikd-selected-model', null)

export const selectedModelAtom = atom<SelectedModel | null>((get) => {
  const key = get(selectedModelKeyAtom)
  return key ? fromSelectedKey(key) : null
})

/** 重新加载 Provider 列表 */
export const loadProvidersAtom = atom(null, async (_get, set) => {
  set(providersLoadingAtom, true)
  set(providersErrorAtom, null)
  try {
    const providers = await providersApi.list()
    set(providersAtom, providers)
  } catch (err) {
    set(providersErrorAtom, (err as Error).message)
  } finally {
    set(providersLoadingAtom, false)
  }
})

/** 新增 Provider */
export const addProviderAtom = atom(null, async (_get, set, input: ProviderInput) => {
  const provider = await providersApi.create(input)
  set(loadProvidersAtom)
  return provider
})

/** 更新 Provider */
export const updateProviderAtom = atom(null, async (_get, set, args: { id: string; input: Partial<ProviderInput> }) => {
  const provider = await providersApi.update(args.id, args.input)
  set(loadProvidersAtom)
  return provider
})

/** 删除 Provider */
export const deleteProviderAtom = atom(null, async (_get, set, id: string) => {
  await providersApi.remove(id)
  set(loadProvidersAtom)
})

/** 测试 Provider（用当前表单值，不持久化） */
export const testProviderAtom = atom(null, async (_get, _set, input: { baseUrl: string; apiKey: string; model: string }) => {
  return providersApi.test(input)
})

/** 测试已保存的 Provider 并更新状态 */
export const testSavedProviderAtom = atom(
  null,
  async (_get, set, args: { id: string; model?: string }) => {
    const result = await providersApi.testSaved(args.id, args.model)
    set(loadProvidersAtom)
    return result
  },
)

/** 选择模型并持久化 */
export const selectModelAtom = atom(null, async (_get, set, sel: SelectedModel | null) => {
  set(selectedModelKeyAtom, sel ? toSelectedKey(sel) : null)
})

/** 获取指定 Provider */
export const getProviderByIdAtom = atom((get) => (id: string) => {
  return get(providersAtom).find((p) => p.id === id) || null
})

/** 获取某模型引用（通过 provider::model key） */
export const getModelByKeyAtom = atom((get) => (key: string) => {
  const sel = fromSelectedKey(key)
  if (!sel) return null
  const provider = get(providersAtom).find((p) => p.id === sel.providerId)
  if (!provider) return null
  const model = provider.models.find((m) => m.id === sel.modelId)
  return { provider, model: model || null }
})
