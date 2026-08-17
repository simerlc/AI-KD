import type { Task } from '@aikd/shared'
import { Button } from '@/components/ui/button'
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Square,
  Code,
  MessageSquare,
  FileText,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTasks } from '@/components/app-layout'
import {
  getShowFilesPane,
  setShowFilesPane as saveShowFilesPane,
  getShowPreviewPane,
  setShowPreviewPane as saveShowPreviewPane,
  getShowChatPane,
  setShowChatPane as saveShowChatPane,
  getFilesPaneWidth,
  setFilesPaneWidth as saveFilesPaneWidth,
  getCodePaneWidth,
  setCodePaneWidth as saveCodePaneWidth,
  getChatPaneWidth,
  setChatPaneWidth as saveChatPaneWidth,
} from '@/lib/utils/cookies'
import { X } from 'lucide-react'
import { FileBrowser } from '@/components/file-browser'
import { FileDiffViewer } from '@/components/file-diff-viewer'
import { TaskChat, useChatStream } from '@/chat'
import { useAutoFix } from '@/hooks/use-auto-fix'
import { usePreviewBridge } from '@/hooks/use-preview-bridge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PreviewPlaceholder } from '@/components/preview/preview-placeholder'
import { AppModelViewer } from '@/components/app-model-viewer'

interface TaskDetailsProps {
  task: Task
  maxSandboxDuration?: number
  onStreamComplete?: () => void
  initialPrompt?: string
  initialImages?: Array<{ data: string; mimeType: string }>
  onInitialPromptConsumed?: () => void
}

interface DiffData {
  filename: string
  oldContent: string
  newContent: string
  language: string
}

type PaneResize = 'files' | 'chat' | 'code' | null

export function TaskDetails({
  task,
  maxSandboxDuration: _maxSandboxDuration = 300,
  onStreamComplete,
  initialPrompt,
  initialImages,
  onInitialPromptConsumed,
}: TaskDetailsProps) {
  const autoFixRef = useRef<{
    scheduleAutoFix: (err: { source: string; summary: string; detail?: string }) => void
  } | null>(null)

  const isCodingModeForAutoFix = task.mode === 'coding'

  const wrappedOnStreamComplete = useCallback(() => {
    onStreamComplete?.()
    if (!isCodingModeForAutoFix) return
    ;(async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}/preview-errors`, { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as {
          ok?: boolean
          buildErrors?: Array<{ source?: string; message?: string; file?: string }>
          runtimeErrors?: Array<{ source?: string; message?: string; stack?: string; componentStack?: string }>
        }
        const buildErrs = data.buildErrors ?? []
        const runtimeErrs = data.runtimeErrors ?? []
        if (buildErrs.length === 0 && runtimeErrs.length === 0) return
        const summary = [
          ...buildErrs.map((e) => `[build:${e.source || 'vite'}] ${e.file ? e.file + ': ' : ''}${e.message || ''}`),
          ...runtimeErrs.map((e) => `[runtime:${e.source || 'unknown'}] ${e.message || ''}`),
        ].join('\n---\n')
        const detail = runtimeErrs
          .map((e) => [e.stack, e.componentStack].filter(Boolean).join('\n'))
          .filter(Boolean)
          .join('\n---\n')
        autoFixRef.current?.scheduleAutoFix({
          source: 'preview-errors-probe',
          summary,
          detail: detail || undefined,
        })
      } catch {
        /* 静默 */
      }
    })()
  }, [onStreamComplete, isCodingModeForAutoFix, task.id])

  const chatStream = useChatStream(task.id, { onStreamComplete: wrappedOnStreamComplete })

  const autoFix = useAutoFix(task.id, {
    chatStream,
  })
  autoFixRef.current = autoFix

  const initialTriggered = useRef(false)
  useEffect(() => {
    if (!initialPrompt || initialTriggered.current) return
    // 等待 ACP session 初始化完成后再发送 prompt
    if (!chatStream.sessionId) return
    initialTriggered.current = true
    onInitialPromptConsumed?.()
    void chatStream.sendInitialPrompt(initialPrompt, initialImages)
  }, [initialPrompt, initialImages, onInitialPromptConsumed, chatStream.sendInitialPrompt, chatStream.sessionId])

  const [optimisticStatus, setOptimisticStatus] = useState<Task['status'] | null>(null)
  const { refreshTasks } = useTasks()
  const [diffsCache, setDiffsCache] = useState<Record<string, DiffData>>({})
  const loadingDiffsRef = useRef(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const previousStatusRef = useRef<Task['status']>(task.status)

  const hasBranch = !!(task.branchName && task.branchName.trim().length > 0)
  const [filesPane, setFilesPane] = useState<'files' | 'changes'>(hasBranch ? 'changes' : 'files')
  const [subMode, setSubMode] = useState<'local' | 'remote'>(hasBranch ? 'remote' : 'local')
  const viewMode: 'local' | 'remote' | 'all' | 'all-local' =
    filesPane === 'files' ? (subMode === 'local' ? 'all-local' : 'all') : subMode
  const [activeTab, setActiveTab] = useState<'code' | 'chat' | 'preview' | 'model'>('preview')

  const [showFilesPane, setShowFilesPaneState] = useState(() => getShowFilesPane())
  const isCodingMode = task.mode === 'coding'
  const [showPreviewPane, setShowPreviewPaneState] = useState(() => {
    const raw = typeof document !== 'undefined' ? document.cookie.match(/(^| )show-preview-pane=([^;]+)/) : null
    return raw ? raw[2] === 'true' : true
  })
  const [showChatPane, setShowChatPaneState] = useState(() => getShowChatPane())
  const [previewKey, setPreviewKey] = useState(0)

  const [previewGatewayUrl, setPreviewGatewayUrl] = useState<string | null>(null)
  const [previewGatewayLoading, setPreviewGatewayLoading] = useState(false)
  const [previewGatewayError, setPreviewGatewayError] = useState<string | null>(null)
  const [previewLoadingMessage, setPreviewLoadingMessage] = useState('正在启动预览...')
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [filesPaneWidth, setFilesPaneWidth] = useState(() => getFilesPaneWidth())
  const [codePaneWidth, setCodePaneWidth] = useState(() => getCodePaneWidth())
  const [chatPaneWidth, setChatPaneWidth] = useState(() => getChatPaneWidth())
  const [resizingPane, setResizingPane] = useState<PaneResize>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const previewBridge = usePreviewBridge({
    iframeRef: previewIframeRef,
    previewUrl: previewGatewayUrl,
    enabled: showPreviewPane,
  })

  const currentStatus = optimisticStatus ?? task.status
  // 运行时真实状态值为 done/created（见 acp.ts），但类型枚举为 completed/processing。
  // 用字符串宽松比较以兼容两种表示。
  const rawStatus = String(currentStatus)
  const isNotStarted = rawStatus === 'pending' || rawStatus === 'created'
  const isDone = rawStatus === 'done' || rawStatus === 'completed'
  const workspaceReady = !!(
    task.previewUrl ||
    task.sandboxUrl ||
    task.appModelId ||
    isDone
  )
  const hasFilesSupport = hasBranch || !!task.sandboxId || workspaceReady
  // 代码预览框在点击具体文件后才出现，关闭文件面板时一并隐藏。
  const showCodeViewer = showFilesPane && !!selectedFile && hasFilesSupport

  // 历史记录可能 previewUrl 为 null（后端重启后沙箱进程丢失/生成时未回写）。
  // 任务状态枚举：pending/created（未开始）、done/completed（完成）、error/stopped（可能已有部分产物）。
  // 除未开始的任务外，一律调用 /preview-url 接口，由后端判断 workspace 是否有文件并自动启动沙箱。
  const canLoadPreview =
    !isNotStarted &&
    (!!task.previewUrl || !!task.sandboxId || !!task.appModelId || isDone)

  const loadPreviewGatewayUrl = useCallback(async () => {
    if (!canLoadPreview) return
    setPreviewGatewayLoading(true)
    setPreviewGatewayError(null)
    setPreviewLoadingMessage('正在启动预览...')
    try {
      const res = await fetch(`/api/tasks/${task.id}/preview-url`, { credentials: 'include' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.previewUrl) {
        setPreviewGatewayUrl(data.previewUrl)
      } else if (data.error) {
        setPreviewGatewayError(data.error)
      }
    } catch (err) {
      setPreviewGatewayError(err instanceof Error ? err.message : '加载预览失败')
    } finally {
      setPreviewGatewayLoading(false)
    }
  }, [task.id, canLoadPreview])

  useEffect(() => {
    if (showPreviewPane && canLoadPreview && !previewGatewayUrl && !previewGatewayLoading && !previewGatewayError) {
      void loadPreviewGatewayUrl()
    }
  }, [
    showPreviewPane,
    canLoadPreview,
    previewGatewayUrl,
    previewGatewayLoading,
    previewGatewayError,
    loadPreviewGatewayUrl,
  ])

  useEffect(() => {
    setIframeLoaded(false)
    if (previewKey > 0) {
      setPreviewGatewayUrl(null)
      setPreviewGatewayError(null)
      setPreviewLoadingMessage('正在重启预览...')
      void loadPreviewGatewayUrl()
    }
  }, [previewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (optimisticStatus && task.status !== previousStatusRef.current) {
      setOptimisticStatus(null)
      previousStatusRef.current = task.status
    }
  }, [task.status, optimisticStatus])

  useEffect(() => {
    void refreshTasks()
  }, [currentStatus, refreshTasks])

  const toggleFilesPane = () => {
    const newValue = !showFilesPane
    setShowFilesPaneState(newValue)
    saveShowFilesPane(newValue)
    // 关闭文件面板时一并隐藏代码预览框
    if (!newValue) setSelectedFile(null)
  }
  const togglePreviewPane = () => {
    const newValue = !showPreviewPane
    setShowPreviewPaneState(newValue)
    saveShowPreviewPane(newValue)
  }
  const toggleChatPane = () => {
    const newValue = !showChatPane
    setShowChatPaneState(newValue)
    saveShowChatPane(newValue)
  }

  const handleViewModeChange = useCallback((newMode: 'local' | 'remote' | 'all' | 'all-local') => {
    if (newMode === 'all' || newMode === 'all-local') {
      setFilesPane('files')
      setSubMode(newMode === 'all-local' ? 'local' : 'remote')
    } else {
      setFilesPane('changes')
      setSubMode(newMode)
    }
  }, [])

  const openFileInTab = useCallback(
    (file: string, isFolder?: boolean) => {
      if (isFolder) return
      setSelectedFile(file)
    },
    [],
  )

  const fetchAllDiffs = useCallback(
    async (filenames: string[]) => {
      if (loadingDiffsRef.current || !hasBranch) return
      loadingDiffsRef.current = true
      try {
        const res = await fetch(`/api/tasks/${task.id}/diffs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ filenames }),
        })
        if (res.ok) {
          const data = await res.json()
          setDiffsCache((prev) => ({ ...prev, ...data }))
        }
      } catch {
        /* ignore */
      } finally {
        loadingDiffsRef.current = false
      }
    },
    [task.id, hasBranch],
  )

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!resizingPane || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (resizingPane === 'files') {
        const newWidth = Math.max(180, Math.min(480, e.clientX - rect.left))
        setFilesPaneWidth(newWidth)
      } else if (resizingPane === 'code') {
        const newWidth = Math.max(240, Math.min(900, e.clientX - rect.left - filesPaneWidth))
        setCodePaneWidth(newWidth)
      } else if (resizingPane === 'chat') {
        const newWidth = Math.max(240, Math.min(720, rect.right - e.clientX))
        setChatPaneWidth(newWidth)
      }
    }
    const handleUp = () => {
      if (resizingPane === 'files') saveFilesPaneWidth(filesPaneWidth)
      if (resizingPane === 'code') saveCodePaneWidth(codePaneWidth)
      if (resizingPane === 'chat') saveChatPaneWidth(chatPaneWidth)
      setResizingPane(null)
    }
    if (resizingPane) {
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      return () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }
    }
  }, [resizingPane, filesPaneWidth, codePaneWidth, chatPaneWidth])

  const StatusIcon = () => {
    if (currentStatus === 'processing') {
      return <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin text-muted-foreground" />
    }
    if (currentStatus === 'completed') {
      return <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-500" />
    }
    if (currentStatus === 'error') {
      return <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
    }
    return null
  }

  const renderPreviewPane = () => {
    return (
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <div className="flex items-center justify-between border-b border-border/60 px-3 h-[40px] flex-shrink-0 bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Eye className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">预览</span>
            {previewBridge.hmrStatus === 'connected' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">HMR</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPreviewKey((k) => k + 1)}
              title="刷新预览"
              disabled={previewGatewayLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${previewGatewayLoading ? 'animate-spin' : ''}`} />
            </Button>
            {previewGatewayUrl && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild title="在新窗口打开">
                <a href={previewGatewayUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 relative bg-muted/30">
          {previewGatewayLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{previewLoadingMessage}</p>
              </div>
            </div>
          ) : previewGatewayError ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-destructive mb-3">{previewGatewayError}</p>
                <Button size="sm" variant="outline" onClick={() => void loadPreviewGatewayUrl()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  重试
                </Button>
              </div>
            </div>
          ) : previewGatewayUrl ? (
            <iframe
              ref={previewIframeRef}
              key={previewKey}
              src={previewGatewayUrl}
              className="w-full h-full border-0"
              title="preview"
              onLoad={() => setIframeLoaded(true)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <PreviewPlaceholder />
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderDesktopToolbar = () => {
    return (
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/60 flex-shrink-0 bg-muted/20">
        <Button
          variant={showFilesPane ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'h-7 px-2.5 text-xs rounded-md',
            showFilesPane && 'bg-primary/10 text-primary hover:bg-primary/15'
          )}
          onClick={toggleFilesPane}
        >
          <FileText className="h-3.5 w-3.5 mr-1" />
          文件
        </Button>
        {hasBranch && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
            'h-7 px-2.5 text-xs rounded-md',
            showCodeViewer && 'bg-primary/10 text-primary hover:bg-primary/15'
          )}
            onClick={() => setSelectedFile(null)}
            disabled={!showCodeViewer}
          >
            <Code className="h-3.5 w-3.5 mr-1" />
            代码
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 px-2.5 text-xs rounded-md',
            showPreviewPane && 'bg-primary/10 text-primary hover:bg-primary/15'
          )}
          onClick={togglePreviewPane}
        >
          {showPreviewPane ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
          预览
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 px-2.5 text-xs rounded-md',
            showChatPane && 'bg-primary/10 text-primary hover:bg-primary/15'
          )}
          onClick={toggleChatPane}
        >
          <MessageSquare className="h-3.5 w-3.5 mr-1" />
          对话
        </Button>
      </div>
    )
  }

  const renderDesktopLayout = () => {
    const hasMiddlePane = showCodeViewer || showPreviewPane
    return (
      <div ref={containerRef} className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        {showFilesPane && (
          <div className="h-full overflow-y-auto flex-shrink-0 border-r" style={{ width: `${filesPaneWidth}px` }}>
            <FileBrowser
              taskId={task.id}
              branchName={task.branchName}
              repoUrl={task.repoUrl}
              sandboxId={task.sandboxId}
              workspaceReady={workspaceReady}
              onFileSelect={openFileInTab}
              onFilesLoaded={fetchAllDiffs}
              selectedFile={selectedFile ?? undefined}
              refreshKey={refreshKey}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />
          </div>
        )}

        {showFilesPane && showCodeViewer && (
          <div
            className="w-1 cursor-col-resize flex-shrink-0 relative group bg-border hover:bg-primary/50 transition-colors"
            onMouseDown={() => setResizingPane('files')}
          />
        )}

        {showCodeViewer && (
          <div
            className="min-h-0 min-w-0 flex flex-col flex-shrink-0 border-r"
            style={{ width: `${codePaneWidth}px` }}
          >
            <div className="flex items-center gap-2 px-3 h-[40px] border-b flex-shrink-0">
              <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate flex-1">{selectedFile || '选择文件'}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 flex-shrink-0"
                onClick={() => setSelectedFile(null)}
                title="关闭预览框"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <FileDiffViewer
                selectedFile={selectedFile ?? undefined}
                diffsCache={diffsCache}
                isInitialLoading={Object.keys(diffsCache).length === 0}
                viewMode={viewMode}
                taskId={task.id}
              />
            </div>
          </div>
        )}

        {showCodeViewer && showPreviewPane && (
          <div
            className="w-1 cursor-col-resize flex-shrink-0 relative group bg-border hover:bg-primary/50 transition-colors"
            onMouseDown={() => setResizingPane('code')}
          />
        )}

        {showPreviewPane && <div className="flex-[4] min-w-0 min-h-0 flex flex-col">{renderPreviewPane()}</div>}

        {showChatPane && hasMiddlePane && (
          <div
            className="w-1 cursor-col-resize flex-shrink-0 relative group bg-border hover:bg-primary/50 transition-colors"
            onMouseDown={() => setResizingPane('chat')}
          />
        )}

        {showChatPane && (
          <div
            className={cn('min-h-0 flex-shrink-0 border-l', !hasMiddlePane && 'flex-1 min-w-0')}
            style={hasMiddlePane ? { width: `${chatPaneWidth}px` } : undefined}
          >
            <TaskChat
              key={task.id}
              taskId={task.id}
              task={task}
              chatStream={chatStream}
              onStreamComplete={onStreamComplete}
              onManualUserSend={autoFix.notifyUserSend}
            />
          </div>
        )}
      </div>
    )
  }

  const renderMobileLayout = () => {
    return (
      <div className="md:hidden flex flex-col flex-1 min-h-0 relative pb-14">
        <div className="flex-1 overflow-hidden">
          {activeTab === 'code' && (
            <div className="relative h-full">
              <div className="px-3 flex items-center gap-2 bg-background border-b h-[46px]">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground truncate flex-1">{selectedFile || '选择文件'}</span>
              </div>
              <div className="overflow-hidden h-[calc(100%-46px)]">
                <div className="overflow-y-auto h-full">
                  <FileDiffViewer
                    selectedFile={selectedFile ?? undefined}
                    diffsCache={diffsCache}
                    isInitialLoading={Object.keys(diffsCache).length === 0}
                    viewMode={viewMode}
                    taskId={task.id}
                  />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'preview' && <div className="h-full">{renderPreviewPane()}</div>}
          {activeTab === 'model' && (
            <div className="h-full overflow-auto p-3">
              <AppModelViewer taskId={task.id} />
            </div>
          )}
          {activeTab === 'chat' && (
            <div className="h-full">
              <TaskChat
                key={task.id}
                taskId={task.id}
                task={task}
                chatStream={chatStream}
                onStreamComplete={onStreamComplete}
                onManualUserSend={autoFix.notifyUserSend}
              />
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t bg-background">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full h-14 rounded-none border-0 bg-transparent">
              <TabsTrigger value="code" className="flex-1 flex flex-col gap-1">
                <Code className="h-4 w-4" />
                <span className="text-[10px]">代码</span>
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex-1 flex flex-col gap-1">
                <Eye className="h-4 w-4" />
                <span className="text-[10px]">预览</span>
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex-1 flex flex-col gap-1">
                <MessageSquare className="h-4 w-4" />
                <span className="text-[10px]">对话</span>
              </TabsTrigger>
              <TabsTrigger value="model" className="flex-1 flex flex-col gap-1">
                <Layers className="h-4 w-4" />
                <span className="text-[10px]">模型</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="space-y-2 md:space-y-3 py-3 md:py-4 border-b px-4 md:px-5 flex-shrink-0 bg-gradient-to-b from-primary/[0.04] to-transparent">
        <div className="flex items-center gap-2">
          <StatusIcon />
          <p className="text-lg md:text-2xl font-semibold flex-1 truncate text-foreground">{task.title || task.prompt}</p>
          {currentStatus === 'processing' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 md:h-8 px-2 md:px-3 flex-shrink-0 border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => void chatStream.cancel()}
            >
              <Square className="h-3.5 w-3.5 mr-1.5" />
              <span className="text-xs md:text-sm">停止</span>
            </Button>
          )}
        </div>
        {task.error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
            {task.error}
          </div>
        )}
      </div>

      <>
        {renderDesktopToolbar()}
        {renderDesktopLayout()}
        {renderMobileLayout()}
      </>
    </div>
  )
}
