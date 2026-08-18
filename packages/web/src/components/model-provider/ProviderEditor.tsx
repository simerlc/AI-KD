// Provider 编辑弹窗：编辑内置 / 自定义 Provider，或新增自定义 Provider
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ProviderForm, type ProviderFormValues } from './ProviderForm'
import { useSetAtom } from 'jotai'
import { updateProviderAtom, addProviderAtom } from '@/lib/atoms/providers'
import type { ModelProvider } from '@/lib/providers/types'
import { getBuiltinModels } from './builtin-models'

interface ProviderEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑的 Provider；undefined 表示新增自定义 */
  provider?: ModelProvider
}

export function ProviderEditor({ open, onOpenChange, provider }: ProviderEditorProps) {
  const [saving, setSaving] = useState(false)
  const updateProvider = useSetAtom(updateProviderAtom)
  const addProvider = useSetAtom(addProviderAtom)

  const isCustom = provider?.type === 'custom'
  const isNew = !provider
  const builtinModels = provider && !isCustom ? getBuiltinModels(provider.id) : undefined

  const title = isNew ? '添加自定义提供方' : `编辑 ${provider.displayName}`

  const handleSave = async (values: ProviderFormValues) => {
    setSaving(true)
    try {
      const models = [
        {
          id: values.model,
          name: values.model,
          displayName: values.model,
        },
      ]
      if (isNew) {
        await addProvider({
          name: values.displayName,
          displayName: values.displayName,
          type: 'custom',
          baseUrl: values.baseUrl,
          apiKey: values.apiKey,
          models,
        })
      } else {
        await updateProvider({
          id: provider.id,
          input: {
            displayName: isCustom ? values.displayName : provider.displayName,
            baseUrl: values.baseUrl,
            apiKey: values.apiKey || undefined,
            models,
          },
        })
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>填写配置信息即可使用该模型。</DialogDescription>
        </DialogHeader>
        <ProviderForm
          provider={provider}
          isCustom={isCustom || isNew}
          builtinModels={builtinModels}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  )
}
