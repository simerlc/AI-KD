// 模型配置页面：管理 AI Provider
import { useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { providersAtom, providersLoadingAtom, providersErrorAtom, loadProvidersAtom } from '@/lib/atoms/providers'
import { SharedHeader } from '@/components/shared-header'
import { ProviderCard } from './ProviderCard'
import { ProviderEditor } from './ProviderEditor'
import { DeleteProviderDialog } from './DeleteProviderDialog'
import { Plus, Loader2, Settings2 } from 'lucide-react'
import type { ModelProvider } from '@/lib/providers/types'

export function ModelProviderPage() {
  const providers = useAtomValue(providersAtom)
  const loading = useAtomValue(providersLoadingAtom)
  const error = useAtomValue(providersErrorAtom)
  const loadProviders = useSetAtom(loadProvidersAtom)

  const [editing, setEditing] = useState<ModelProvider | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [addingCustom, setAddingCustom] = useState(false)
  const [deleting, setDeleting] = useState<ModelProvider | null>(null)

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const handleEdit = (provider: ModelProvider) => {
    setEditing(provider)
    setAddingCustom(false)
    setEditorOpen(true)
  }

  const handleAddCustom = () => {
    setEditing(null)
    setAddingCustom(true)
    setEditorOpen(true)
  }

  return (
    <div className="flex-1 bg-background flex flex-col">
      <div className="p-3">
        <SharedHeader leftActions={null} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
        <div className="max-w-[850px] mx-auto">
          {/* 标题 */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              模型
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">填入各提供方的 API 密钥即可使用其模型。</p>
          </div>

          {/* 加载态 */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          )}

          {/* 错误态 */}
          {error && !loading && (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              加载 Provider 失败：{error}
              <button className="ml-2 underline" onClick={() => void loadProviders()}>
                重试
              </button>
            </div>
          )}

          {/* Provider 列表 */}
          {!loading && !error && (
            <div className="space-y-3">
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  onEdit={handleEdit}
                  onDelete={(p) => setDeleting(p)}
                />
              ))}
            </div>
          )}

          {/* 底部操作按钮 */}
          {!loading && !error && (
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleAddCustom}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground py-3 transition-colors"
              >
                <Plus className="h-4 w-4" />
                添加自定义提供方
              </button>
            </div>
          )}

          {/* 提示：内置 Provider */}
          {!loading && !error && (
            <p className="mt-4 text-xs text-muted-foreground">
              内置 Provider（DeepSeek / OpenAI / Anthropic / Google Gemini / Qwen）默认可通过「编辑」配置使用，不可删除。
            </p>
          )}
        </div>
      </div>

      {/* 编辑/新增弹窗 */}
      <ProviderEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        provider={addingCustom ? undefined : editing || undefined}
      />

      {/* 删除确认 */}
      <DeleteProviderDialog provider={deleting} onOpenChange={(o) => !o && setDeleting(null)} />
    </div>
  )
}
