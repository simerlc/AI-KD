import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileBox, Layers, Type, Box, Hash, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────

interface AppModelRecord {
  id: string
  appId: string
  version: string
  modelJson: string
  createdAt: number
}

interface ComponentNode {
  type: string
  id?: string
  props?: Record<string, unknown>
  children?: ComponentNode[]
}

interface PageNode {
  id: string
  path: string
  title?: string
  components: ComponentNode[]
}

interface AppModel {
  id: string
  name: string
  type: string
  version: string
  schema: {
    pages: PageNode[]
  }
}

// ─── Component Tree Renderer ───────────────────────────

function ComponentTree({ node, depth = 0 }: { node: ComponentNode; depth?: number }) {
  const props = node.props || {}
  const propKeys = Object.keys(props)

  return (
    <div className={cn('border-l border-border ml-2', depth > 0 && 'ml-4')}>
      <div className="flex items-center gap-2 py-1 px-2 hover:bg-accent/50 rounded">
        <Box className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-mono font-medium">{node.type}</span>
        {node.id && (
          <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
            {node.id}
          </Badge>
        )}
        {propKeys.length > 0 && <span className="text-[10px] text-muted-foreground">{propKeys.length} props</span>}
      </div>
      {propKeys.length > 0 && depth < 3 && (
        <div className="ml-6 py-0.5 text-[10px] text-muted-foreground">
          {propKeys.slice(0, 5).map((k) => (
            <span key={k} className="mr-2">
              <span className="text-foreground/70">{k}</span>:<span className="ml-1">{formatPropValue(props[k])}</span>
            </span>
          ))}
          {propKeys.length > 5 && <span className="text-muted-foreground/50">+{propKeys.length - 5} more</span>}
        </div>
      )}
      {node.children && node.children.length > 0 && (
        <div className="ml-2">
          {node.children.map((child, i) => (
            <ComponentTree key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function formatPropValue(value: unknown): string {
  if (typeof value === 'string') return `"${value.slice(0, 30)}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.length}]`
  if (typeof value === 'object' && value !== null) return '{...}'
  return String(value)
}

// ─── App Model Viewer ──────────────────────────────────

export function AppModelViewer({ taskId }: { taskId: string }) {
  const [appModels, setAppModels] = useState<AppModelRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/tasks/${taskId}/app-models`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load app models')
        const data = await res.json()
        if (cancelled) return
        setAppModels(data.appModels || [])
        if (data.appModels?.length > 0) {
          setSelectedId(data.appModels[0].id)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [taskId])

  const selectedModel = useMemo(() => {
    const record = appModels.find((m) => m.id === selectedId)
    if (!record) return null
    try {
      return JSON.parse(record.modelJson) as AppModel
    } catch {
      return null
    }
  }, [appModels, selectedId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-destructive">加载失败: {error}</CardContent>
      </Card>
    )
  }

  if (appModels.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <FileBox className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无 App Model</p>
          <p className="text-xs mt-1">生成代码后会自动创建</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Version Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">版本:</span>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="h-7 text-xs w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {appModels.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                v{m.version} - {new Date(m.createdAt).toLocaleString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">共 {appModels.length} 个版本</span>
      </div>

      {/* App Model Tree View */}
      {selectedModel ? (
        <div className="space-y-3">
          {/* App Info */}
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs flex items-center gap-2">
                <Type className="h-3 w-3" />
                应用信息
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3 text-xs space-y-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground min-w-[60px]">名称:</span>
                <span className="font-medium">{selectedModel.name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground min-w-[60px]">类型:</span>
                <Badge variant="secondary" className="text-[10px] h-4">
                  {selectedModel.type}
                </Badge>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground min-w-[60px]">版本:</span>
                <span className="font-mono">v{selectedModel.version}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground min-w-[60px]">页面数:</span>
                <span>{selectedModel.schema.pages.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Pages & Components */}
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs flex items-center gap-2">
                <Layers className="h-3 w-3" />
                页面结构
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <div className="h-[400px] overflow-auto">
                {selectedModel.schema.pages.map((page, idx) => (
                  <div key={page.id} className="mb-3">
                    <div className="flex items-center gap-2 py-1 px-2 bg-muted/30 rounded text-xs">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono font-medium">{page.path}</span>
                      {page.title && <span className="text-muted-foreground">- {page.title}</span>}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {page.components.length} components
                      </span>
                    </div>
                    <div className="mt-1">
                      {page.components.map((comp, i) => (
                        <ComponentTree key={i} node={comp} />
                      ))}
                    </div>
                    {idx < selectedModel.schema.pages.length - 1 && <div className="border-b border-border my-2" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">App Model JSON 解析失败</CardContent>
        </Card>
      )}

      {/* Version History */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            版本历史
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <div className="space-y-1">
            {appModels.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={cn(
                  'w-full flex items-center justify-between py-1 px-2 rounded text-xs transition-colors',
                  m.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">v{m.version}</span>
                  {m.id === selectedId && (
                    <Badge variant="default" className="text-[10px] h-4 px-1">
                      当前
                    </Badge>
                  )}
                </div>
                <span className="text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
