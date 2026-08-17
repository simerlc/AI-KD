import type { Task } from '@aikd/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Plus, Trash2, MoreVertical, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link, useLocation } from 'react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useState } from 'react'
import { toast } from 'sonner'
import { useTasks } from '@/components/app-layout'
import { useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'

// Model mappings for human-friendly names
const AGENT_MODELS = {
  claude: [
    { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
    { value: 'anthropic/claude-opus-4.6', label: 'Opus 4.6' },
    { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  ],
  codex: [
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5-Codex' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 nano' },
    { value: 'gpt-5-pro', label: 'GPT-5 pro' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
  ],
  copilot: [
    { value: 'claude-sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'claude-sonnet-4', label: 'Sonnet 4' },
    { value: 'claude-haiku-4.5', label: 'Haiku 4.5' },
    { value: 'gpt-5', label: 'GPT-5' },
  ],
  cursor: [
    { value: 'auto', label: 'Auto' },
    { value: 'sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'sonnet-4.5-thinking', label: 'Sonnet 4.5 Thinking' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { value: 'opus-4.1', label: 'Opus 4.1' },
    { value: 'grok', label: 'Grok' },
  ],
  gemini: [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  opencode: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
    { value: 'claude-opus-4-5', label: 'Opus 4.5' },
    { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  ],
} as const

interface TaskSidebarProps {
  tasks: Task[]
  width?: number
}

export function TaskSidebar({ tasks, width = 288 }: TaskSidebarProps) {
  const { pathname } = useLocation()
  const { refreshTasks, toggleSidebar } = useTasks()
  const { clearTasks } = useTasks()
  const session = useAtomValue(sessionAtom)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showClearAllDialog, setShowClearAllDialog] = useState(false)
  const [deleteCompleted, setDeleteCompleted] = useState(true)
  const [deleteFailed, setDeleteFailed] = useState(true)
  const [deleteStopped, setDeleteStopped] = useState(true)

  // Close sidebar on mobile when clicking any link
  const handleLinkClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      toggleSidebar()
    }
  }

  const handleNewTaskClick = () => {
    handleLinkClick()
  }

  const handleDeleteSingleTask = async (taskId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE', credentials: 'include' })
      if (response.ok) {
        toast.success('Task deleted')
        refreshTasks()
      } else {
        const data = await response.json()
        // 后端 409 时 failed 数组含每步的 step / message / code / requestId
        const detail = Array.isArray(data?.failed)
          ? data.failed.map((f: any) => `[${f.step}] ${f.message || f.code || 'failed'}`).join('；')
          : data?.detail || ''
        toast.error(detail ? `${data.error || '删除失败'}：${detail}` : data.error || 'Failed to delete task')
      }
    } catch {
      toast.error('Failed to delete task')
    }
  }

  const handleDeleteTasks = async () => {
    if (!deleteCompleted && !deleteFailed && !deleteStopped) {
      toast.error('Please select at least one task type to delete')
      return
    }

    setIsDeleting(true)
    try {
      const actions = []
      if (deleteCompleted) actions.push('completed')
      if (deleteFailed) actions.push('failed')
      if (deleteStopped) actions.push('stopped')

      const response = await fetch(`/api/tasks?action=${actions.join(',')}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        const result = await response.json()
        toast.success(result.message)
        await refreshTasks()
        setShowDeleteDialog(false)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete tasks')
      }
    } catch (error) {
      console.error('Error deleting tasks:', error)
      toast.error('Failed to delete tasks')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClearAllTasks = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch('/api/tasks', { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message || `Deleted ${data.deleted || 0} tasks`)
        await refreshTasks()
        setShowClearAllDialog(false)
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to delete tasks' }))
        toast.error(err.error || 'Failed to delete tasks; local list cleared')
        // Backend failed — clear local UI list so user sees empty sidebar
        clearTasks()
      }
    } catch (e) {
      console.error('Clear all tasks error:', e)
      toast.error('Failed to delete tasks; local list cleared')
      clearTasks()
    } finally {
      setIsDeleting(false)
    }
  }

  const getHumanFriendlyModelName = (agent: string | null, model: string | null) => {
    if (!agent || !model) return model

    const agentModels = AGENT_MODELS[agent as keyof typeof AGENT_MODELS]
    if (!agentModels) return model

    const modelInfo = agentModels.find((m) => m.value === model)
    return modelInfo ? modelInfo.label : model
  }

  const getAgentLogo = (agent: string | null) => {
    if (!agent) return null
    return Bot
  }

  // 相对时间（"刚刚"/"5 分钟前"/"2 小时前"/"3 天前"）
  const formatRelativeTime = (ts: number | null | undefined): string => {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60_000) return '刚刚'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
    return `${Math.floor(diff / 86_400_000)} 天前`
  }

  // 任务显示标题：title 有效则用 title，否则用 prompt/ID 前缀
  const getTaskTitle = (task: { title?: string | null; prompt?: string | null; id?: string }): string => {
    const t = (task.title || '').trim()
    const p = (task.prompt || '').trim()
    if (t && t.toLowerCase() !== 'untitled task') return t
    if (p) return p.slice(0, 40) + (p.length > 40 ? '...' : '')
    // 最后兜底：显示 ID 前缀而非无意义的「未命名任务」
    return task?.id ? `任务 ${task.id.slice(0, 8)}` : '未命名任务'
  }

  // Note: allow anonymous users to view and create tasks. session may be empty for guest use.

  return (
    <div
      className="h-full border-r bg-muted px-2 md:px-3 pt-3 md:pt-5.5 pb-3 md:pb-4 overflow-y-auto flex flex-col"
      style={{ width: `${width}px` }}
    >
      {/* New Task Button */}
      <div className="mb-3">
        <Link to="/" onClick={handleNewTaskClick}>
          <Button
            variant="default"
            size="sm"
            className="w-full h-8 text-xs shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            新建任务
          </Button>
        </Link>
      </div>

      {/* Tasks header with delete */}
      {/* <div className="mb-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground px-1">任务列表</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isDeleting || tasks.length === 0}
            title="删除任务"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div> */}

      {/* Tasks List */}
      <div className="space-y-1">
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-3 text-center text-xs text-muted-foreground">
              No tasks yet. Create your first task!
            </CardContent>
          </Card>
        ) : (
          <>
            {tasks
              .filter((t) => t && t.id)
              .slice(0, 10)
              .map((task) => {
              const isActive = pathname === `/apps/${task.id}`

              return (
                <Link
                  key={task.id}
                  to={`/apps/${task.id}`}
                  onClick={handleLinkClick}
                  className={cn(
                    'block rounded-lg transition-all',
                    isActive
                      ? 'ring-2 ring-primary shadow-sm'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <Card
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-accent p-0 rounded-lg group',
                      isActive && 'bg-accent',
                    )}
                  >
                    <CardContent className="px-3 py-2">
                      <div className="flex gap-2">
                        {/* Text content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3
                              className={cn(
                                'text-xs truncate mb-0.5',
                                isActive ? 'font-semibold text-primary' : 'font-medium text-foreground/90',
                                task.status === 'processing' &&
                                  'bg-gradient-to-r from-primary/60 from-20% via-foreground via-50% to-primary/60 to-80% bg-clip-text text-transparent bg-[length:300%_100%] animate-[shimmer_1.5s_linear_infinite]',
                              )}
                            >
                              {(() => {
                                const displayText = getTaskTitle(task)
                                return displayText.slice(0, 50) + (displayText.length > 50 ? '...' : '')
                              })()}
                            </h3>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              {task.status === 'error' && (
                                <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                              )}
                              {task.status === 'stopped' && (
                                <AlertCircle className="h-3 w-3 text-orange-500 flex-shrink-0" />
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  asChild
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                  }}
                                >
                                  <button className="h-5 w-5 p-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity">
                                    <MoreVertical className="h-3 w-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-36">
                                  <DropdownMenuItem
                                    className="text-xs text-destructive cursor-pointer"
                                    onClick={(e) => handleDeleteSingleTask(task.id, e)}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1.5" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {task.repoUrl && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                              <span className="truncate">
                                {(() => {
                                  try {
                                    const url = new URL(task.repoUrl)
                                    const pathParts = url.pathname.split('/').filter(Boolean)
                                    if (pathParts.length >= 2) {
                                      return `${pathParts[0]}/${pathParts[1].replace(/\.git$/, '')}`
                                    } else {
                                      return 'Unknown repository'
                                    }
                                  } catch {
                                    return 'Invalid repository URL'
                                  }
                                })()}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            {task.selectedAgent && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                {(() => {
                                  const AgentLogo = getAgentLogo(task.selectedAgent)
                                  return AgentLogo ? <AgentLogo className="w-2.5 h-2.5" /> : null
                                })()}
                                {task.selectedModel && (
                                  <span className="truncate">
                                    {getHumanFriendlyModelName(task.selectedAgent, task.selectedModel)}
                                  </span>
                                )}
                              </div>
                            )}
                            <span className="text-[10px] text-muted-foreground/70 ml-auto flex-shrink-0">
                              {formatRelativeTime(task.updatedAt ?? task.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
            {tasks.length >= 1 && (
              <div className="pt-1">
                <Link to="/apps" onClick={handleLinkClick}>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-7 px-2 text-xs">
                    View All Tasks
                  </Button>
                </Link>
              </div>
            )}
            {tasks.length >= 1 && (
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 px-2 text-xs text-destructive"
                  onClick={() => setShowClearAllDialog(true)}
                >
                  清空任务
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tasks</AlertDialogTitle>
            <AlertDialogDescription>
              Select which types of tasks you want to delete. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-completed"
                  checked={deleteCompleted}
                  onCheckedChange={(checked) => setDeleteCompleted(checked === true)}
                />
                <label
                  htmlFor="delete-completed"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Completed Tasks
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-failed"
                  checked={deleteFailed}
                  onCheckedChange={(checked) => setDeleteFailed(checked === true)}
                />
                <label
                  htmlFor="delete-failed"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Failed Tasks
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="delete-stopped"
                  checked={deleteStopped}
                  onCheckedChange={(checked) => setDeleteStopped(checked === true)}
                />
                <label
                  htmlFor="delete-stopped"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete Stopped Tasks
                </label>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTasks}
              disabled={isDeleting || (!deleteCompleted && !deleteFailed && !deleteStopped)}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Tasks'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空所有任务</AlertDialogTitle>
            <AlertDialogDescription>
              此操作会将当前用户的所有任务标记为已删除，无法恢复。是否确认？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllTasks} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? 'Deleting...' : '确认清空'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
