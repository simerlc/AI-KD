import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2, ArrowUp, X, Cable, Code2, ImageIcon } from 'lucide-react'
import { setInstallDependencies, setMaxDuration, setKeepAlive, setEnableBrowser } from '@/lib/utils/cookies'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'
import { taskPromptAtom } from '@/lib/atoms/task'
import { providersAtom, selectedModelAtom, selectModelAtom, loadProvidersAtom } from '@/lib/atoms/providers'
import { toSelectedKey, fromSelectedKey } from '@/lib/providers/types'
import type { ModelProvider } from '@/lib/providers/types'

interface TaskFormProps {
  onSubmit: (data: {
    prompt: string
    selectedModel: string
    mode: 'default' | 'coding'
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
    enableBrowser: boolean
    imageBlocks?: Array<{ data: string; mimeType: string }>
  }) => void
  isSubmitting: boolean
  initialInstallDependencies?: boolean
  initialMaxDuration?: number
  initialKeepAlive?: boolean
  initialEnableBrowser?: boolean
  maxSandboxDuration?: number
}

// 应用类型已统一：移除 Web/H5/Static 选项，统一生成具有前后端、可预览、可使用的轻应用
// 此处保持为常量名，便于后续扩展回多类型时一处修改即可。
const APP_TYPE = 'web'

export function TaskForm({
  onSubmit,
  isSubmitting,
  initialInstallDependencies = false,
  initialMaxDuration = 300,
  initialKeepAlive = false,
  initialEnableBrowser = false,
}: TaskFormProps) {
  const session = useAtomValue(sessionAtom)
  const userId = session?.user?.id || ''
  const [prompt, setPrompt] = useAtom(taskPromptAtom)
  // 应用类型已统一：移除 Web/H5/Static 选项，统一生成具有前后端、可预览、可使用的轻应用
  const appType = APP_TYPE
  const [taskMode, setTaskMode] = useState<'default' | 'coding'>('coding')
  const [pendingImages, setPendingImages] = useState<
    Array<{ id: string; url: string; data: string; mimeType: string }>
  >([])
  const imageInputRef = useRef<HTMLInputElement>(null)

  // ── Provider / 模型选择 ──────────────────────────────
  const providers = useAtomValue(providersAtom)
  const selectedModel = useAtomValue(selectedModelAtom)
  const setSelectModel = useSetAtom(selectModelAtom)
  const setLoadProviders = useSetAtom(loadProvidersAtom)

  // 首次加载 Provider 列表
  useEffect(() => {
    void setLoadProviders()
  }, [setLoadProviders])

  // 若尚未选择模型且存在可用模型，自动选中第一个
  useEffect(() => {
    if (!selectedModel) {
      for (const p of providers) {
        if (!p.enabled || !p.hasApiKey) continue
        if (p.models.length > 0) {
          void setSelectModel({ providerId: p.id, modelId: p.models[0].id })
          break
        }
      }
    }
  }, [providers, selectedModel, setSelectModel])

  const [installDependencies, setInstallDependenciesState] = useState(initialInstallDependencies)
  const [maxDuration, setMaxDurationState] = useState(initialMaxDuration)
  const [keepAlive, setKeepAliveState] = useState(initialKeepAlive)
  const [enableBrowser, setEnableBrowserState] = useState(initialEnableBrowser)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const updateInstallDependencies = (value: boolean) => {
    setInstallDependenciesState(value)
    setInstallDependencies(value)
  }

  const updateMaxDuration = (value: number) => {
    setMaxDurationState(value)
    setMaxDuration(value)
  }

  const updateKeepAlive = (value: boolean) => {
    setKeepAliveState(value)
    setKeepAlive(value)
  }

  const updateEnableBrowser = (value: boolean) => {
    setEnableBrowserState(value)
    setEnableBrowser(value)
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
      if (!isMobile && !e.shiftKey) {
        e.preventDefault()
        if (prompt.trim()) {
          const form = e.currentTarget.closest('form')
          if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
          }
        }
      }
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const base64 = dataUrl.split(',')[1]
      const url = URL.createObjectURL(file)
      setPendingImages((prev) => [
        ...prev,
        { id: `img-${Date.now()}-${Math.random()}`, url, data: base64, mimeType: file.type },
      ])
    }
    reader.readAsDataURL(file)
  }

  const handlePasteImage = (e: React.ClipboardEvent) => {
    Array.from(e.clipboardData.items).forEach((item) => {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) processImageFile(file)
      }
    })
  }

  const handleImageFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach(processImageFile)
    e.target.value = ''
  }

  const removeImage = (id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img) URL.revokeObjectURL(img.url)
      return prev.filter((i) => i.id !== id)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) {
      return
    }
    // selectedModel 传 "providerId::modelId" 格式，后端据此动态创建对应 Provider
    onSubmit({
      prompt: prompt.trim(),
      selectedModel: selectedModel ? toSelectedKey(selectedModel) : (providers[0]?.id || ''),
      mode: taskMode,
      installDependencies,
      maxDuration,
      keepAlive,
      enableBrowser,
      imageBlocks:
        pendingImages.length > 0 ? pendingImages.map(({ data, mimeType }) => ({ data, mimeType })) : undefined,
    })
    setPendingImages([])
  }

  // userId referenced for future use (e.g. per-user storage scoping)
  void userId

  return (
    <div className="w-full max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">AI快搭</h1>
        <p className="text-lg text-muted-foreground mb-2">AI 驱动的轻应用搭建平台</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="relative border rounded-2xl shadow-sm overflow-hidden bg-background focus-within:border-primary/50 focus-within:shadow-md transition-shadow cursor-text">
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative group">
                  <img src={img.url} alt="" className="h-16 w-16 rounded-lg object-cover border border-border" />
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-background border border-border rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative bg-transparent">
            <Textarea
              ref={textareaRef}
              id="prompt"
              placeholder="用一句话描述你想搭建的轻应用，我会自动生成完整的前后端文件并立刻可预览使用... (可粘贴图片)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              onPaste={handlePasteImage}
              disabled={isSubmitting}
              required
              rows={4}
              className="w-full border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 p-4 text-base !bg-transparent shadow-none!"
            />
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleImageFiles}
          />

          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setTaskMode(taskMode === 'default' ? 'coding' : 'default')}
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border transition-colors ${
                    taskMode === 'coding'
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'text-muted-foreground border-border hover:border-primary/30'
                  }`}
                >
                  <Code2 className="h-3 w-3" />
                  {taskMode === 'coding' ? 'Coding' : 'Default'}
                </button>
                <span className="text-muted-foreground/50">·</span>
                <div className="flex items-center gap-2 text-sm text-muted-foreground px-2 h-8">
                  <ProviderModelSelect
                    value={selectedModel ? toSelectedKey(selectedModel) : ''}
                    onValueChange={(key) => {
                      const sel = fromSelectedKey(key)
                      if (sel) void setSelectModel(sel)
                    }}
                    providers={providers}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <TooltipProvider delayDuration={1500} skipDelayDuration={1500}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full h-8 w-8 p-0 relative"
                          onClick={() => updateEnableBrowser(!enableBrowser)}
                        >
                          <Cable className="h-4 w-4" />
                          {enableBrowser && (
                            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-green-500" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Agent Browser</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                    title="添加图片"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>

                  <Button
                    type="submit"
                    disabled={isSubmitting || (!prompt.trim() && pendingImages.length === 0)}
                    size="sm"
                    className="rounded-full h-8 w-8 p-0"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

/** 模型选择下拉：展示所有已配置 Provider 下的模型（层级形式） */
function ProviderModelSelect({
  value,
  onValueChange,
  providers,
}: {
  value: string
  onValueChange: (key: string) => void
  providers: ModelProvider[]
}) {
  const options: Array<{ key: string; group: string; label: string }> = []
  for (const p of providers) {
    if (!p.enabled || !p.hasApiKey) continue
    for (const m of p.models) {
      if (!m.enabled) continue
      options.push({
        key: toSelectedKey({ providerId: p.id, modelId: m.id }),
        group: p.displayName,
        label: m.displayName || m.name,
      })
    }
  }

  const current = options.find((o) => o.key === value)

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-7 border-0 shadow-none px-1 py-0 text-sm text-muted-foreground hover:text-foreground bg-transparent focus:ring-0 gap-1 w-auto min-w-[120px]">
        <span className="truncate">
          {current ? `${current.group} / ${current.label}` : value || '选择模型'}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 && (
          <div className="px-2 py-3 text-center text-sm text-muted-foreground">请先在「模型」页配置</div>
        )}
        {options.map((opt) => (
          <SelectItem key={opt.key} value={opt.key}>
            {opt.group} / {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
