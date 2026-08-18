// Provider 表单：新增 / 编辑共用，包含字段、显示/隐藏 API Key、测试连接
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { providersApi } from '@/lib/providers/api'
import type { ModelProvider } from '@/lib/providers/types'

export interface ProviderFormValues {
  displayName: string
  baseUrl: string
  apiKey: string
  model: string
}

interface ProviderFormProps {
  /** 编辑已有 Provider 时传入；新增时 undefined */
  provider?: ModelProvider
  /** 自定义 Provider 是否可编辑名称 */
  isCustom: boolean
  /** 内置 Provider 的模型选项 */
  builtinModels?: string[]
  onSave: (values: ProviderFormValues) => Promise<void> | void
  onCancel: () => void
  saving?: boolean
}

export function ProviderForm({ provider, isCustom, builtinModels, onSave, onCancel, saving }: ProviderFormProps) {
  const initialModel = provider?.models[0]?.id || ''
  const [displayName, setDisplayName] = useState(provider?.displayName || '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || '')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(initialModel)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const testSeq = useRef(0)

  // 外部传入的 provider 变化时重置
  useEffect(() => {
    setDisplayName(provider?.displayName || '')
    setBaseUrl(provider?.baseUrl || '')
    setModel(provider?.models[0]?.id || '')
    setTestResult(null)
    // 编辑时若有 key，apiKey 保持空（不回显明文）
  }, [provider])

  const handleTest = async () => {
    if (!baseUrl || !apiKey || !model) {
      setTestResult({ ok: false, message: '请填写 Base URL、API Key 和模型名称后再测试' })
      return
    }
    const seq = ++testSeq.current
    setTesting(true)
    setTestResult(null)
    try {
      const res = await providersApi.test({ baseUrl, apiKey, model })
      if (seq !== testSeq.current) return // 已关闭或重新发起
      setTestResult({ ok: res.ok, message: res.message })
    } catch (err) {
      if (seq !== testSeq.current) return
      setTestResult({ ok: false, message: (err as Error).message })
    } finally {
      if (seq === testSeq.current) setTesting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void onSave({ displayName, baseUrl, apiKey, model })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isCustom && (
        <div className="space-y-1.5">
          <Label htmlFor="pf-displayName">名称</Label>
          <Input
            id="pf-displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Provider"
            required
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="pf-baseUrl">API Base URL</Label>
        <Input
          id="pf-baseUrl"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-apiKey">API Key</Label>
        <div className="relative">
          <Input
            id="pf-apiKey"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider?.hasApiKey ? '已配置，留空保持不变' : 'sk-...'}
            className="pr-10"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
            aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-model">模型</Label>
        {builtinModels && builtinModels.length > 0 ? (
          <select
            id="pf-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">选择模型</option>
            {builtinModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id="pf-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model-name"
            required
          />
        )}
      </div>

      {testResult && (
        <div
          className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
            testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{testResult.ok ? '连接成功' : testResult.message}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {testing ? '测试中...' : '测试连接'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          保存
        </Button>
      </div>
    </form>
  )
}
