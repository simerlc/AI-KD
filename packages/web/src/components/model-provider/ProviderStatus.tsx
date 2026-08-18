// Provider 状态圆点
import type { ProviderStatus as Status } from '@/lib/providers/types'

const STATUS_META: Record<Status, { color: string; label: string }> = {
  active: { color: 'bg-green-500', label: '可用' },
  inactive: { color: 'bg-gray-300', label: '未配置' },
  error: { color: 'bg-red-500', label: '配置错误' },
}

export function ProviderStatusDot({ status }: { status: Status }) {
  const meta = STATUS_META[status] || STATUS_META.inactive
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.color}`} title={meta.label} />
}

export function ProviderStatusText({ status }: { status: Status }) {
  const meta = STATUS_META[status] || STATUS_META.inactive
  return <span className="text-xs text-muted-foreground">{meta.label}</span>
}
