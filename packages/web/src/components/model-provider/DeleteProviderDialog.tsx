// 删除 Provider 确认弹窗
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSetAtom, useAtomValue } from 'jotai'
import { deleteProviderAtom, selectedModelAtom } from '@/lib/atoms/providers'
import { useState } from 'react'
import type { ModelProvider } from '@/lib/providers/types'

interface DeleteProviderDialogProps {
  provider: ModelProvider | null
  onOpenChange: (open: boolean) => void
}

export function DeleteProviderDialog({ provider, onOpenChange }: DeleteProviderDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const deleteProvider = useSetAtom(deleteProviderAtom)
  const selectedModel = useAtomValue(selectedModelAtom)

  const inUse = selectedModel?.providerId === provider?.id
  const open = !!provider

  const handleDelete = async () => {
    if (!provider) return
    setDeleting(true)
    try {
      await deleteProvider(provider.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>删除 Provider</DialogTitle>
          <DialogDescription>
            {inUse ? (
              <span className="text-amber-600">
                当前模型正在使用该 Provider，请先切换其他模型后再删除。
              </span>
            ) : (
              <>
                确定删除「{provider?.displayName}」吗？
                <br />
                删除后该 Provider 的配置和模型信息将被移除。
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || inUse}
          >
            {deleting ? '删除中...' : '删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
