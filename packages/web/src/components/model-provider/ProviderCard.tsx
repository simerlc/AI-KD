// Provider 卡片：显示单个 Provider，含状态圆点、自定义 Badge、编辑/删除按钮
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { ProviderStatusDot } from './ProviderStatus'
import { useSetAtom } from 'jotai'
import { testSavedProviderAtom } from '@/lib/atoms/providers'
import { useState } from 'react'
import type { ModelProvider } from '@/lib/providers/types'

interface ProviderCardProps {
  provider: ModelProvider
  onEdit: (provider: ModelProvider) => void
  onDelete: (provider: ModelProvider) => void
}

export function ProviderCard({ provider, onEdit, onDelete }: ProviderCardProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const testSavedProvider = useSetAtom(testSavedProviderAtom)

  const handleTest = async () => {
    if (!provider.apiKey && !provider.hasApiKey) {
      setTestResult({ ok: false, message: '请先配置 API Key' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testSavedProvider({ id: provider.id })
      setTestResult({ ok: res.ok, message: res.message })
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <ProviderStatusDot status={provider.status} />
        <span className="font-medium text-sm truncate">{provider.displayName}</span>
        {provider.type === 'custom' && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            自定义
          </Badge>
        )}
        {testResult && (
          <span
            className={`flex items-center gap-1 text-xs ${
              testResult.ok ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {testResult.ok ? '连接成功' : testResult.message}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
          onClick={handleTest}
          disabled={testing}
          title="测试连接"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">测试</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(provider)}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">编辑</span>
        </Button>
        {provider.type === 'custom' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-destructive hover:text-destructive"
            onClick={() => onDelete(provider)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">删除</span>
          </Button>
        )}
      </div>
    </div>
  )
}
