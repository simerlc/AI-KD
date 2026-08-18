// 模型选择器：从所有 Provider 中按层级选择模型
import { useAtomValue, useSetAtom } from 'jotai'
import { providersAtom, selectedModelAtom, selectModelAtom } from '@/lib/atoms/providers'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toSelectedKey } from '@/lib/providers/types'

interface ModelSelectorProps {
  className?: string
  triggerClassName?: string
}

export function ModelSelector({ className, triggerClassName }: ModelSelectorProps) {
  const providers = useAtomValue(providersAtom)
  const selected = useAtomValue(selectedModelAtom)
  const selectModel = useSetAtom(selectModelAtom)

  // 拼接所有可用模型（仅已启用且配置了 key 的 provider）
  const options: Array<{ key: string; providerId: string; modelId: string; label: string; group: string }> = []
  for (const p of providers) {
    if (!p.enabled) continue
    if (p.type === 'builtin' && !p.hasApiKey) continue // 内置未配置 key 不可用
    if (p.type === 'custom' && !p.hasApiKey) continue
    for (const m of p.models) {
      if (!m.enabled) continue
      options.push({
        key: toSelectedKey({ providerId: p.id, modelId: m.id }),
        providerId: p.id,
        modelId: m.id,
        label: m.displayName || m.name,
        group: p.displayName,
      })
    }
  }

  const currentKey = selected ? toSelectedKey(selected) : undefined
  const currentOption = options.find((o) => o.key === currentKey)

  return (
    <Select
      value={currentKey || ''}
      onValueChange={(key) => {
        const opt = options.find((o) => o.key === key)
        if (opt) void selectModel({ providerId: opt.providerId, modelId: opt.modelId })
      }}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue
          placeholder={currentOption ? `${currentOption.group} / ${currentOption.label}` : '选择模型'}
        />
      </SelectTrigger>
      <SelectContent className={className}>
        {options.length === 0 && (
          <div className="px-2 py-3 text-center text-sm text-muted-foreground">请先在「模型」页面配置 Provider</div>
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
