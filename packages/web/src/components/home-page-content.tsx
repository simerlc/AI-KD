import { useState } from 'react'
import { TaskForm } from '@/components/task-form'
import { SharedHeader } from '@/components/shared-header'
import { toast } from 'sonner'
import { useNavigate } from 'react-router'
import { useTasks } from '@/components/app-layout'
import { useSetAtom } from 'jotai'
import { taskPromptAtom } from '@/lib/atoms/task'
import { Sparkles, LayoutTemplate } from 'lucide-react'

// 常用模板快捷入口（点击后自动填入 prompt 并聚焦）
const TEMPLATES = [
  '生成一个企业官网，包含首页、关于我们、产品和服务、联系我们页面，风格现代专业',
  '生成一个个人博客首页，包含文章列表、侧边栏和个人简介',
  '生成一个咖啡店官网，展示招牌饮品和门店信息，风格温馨有格调',
  '生成一个待办事项应用，支持添加、勾选完成和删除事项',
  '生成一个电商商品展示页，包含商品卡片、价格和购买按钮',
]

export function HomePageContent({ maxSandboxDuration = 300 }: { maxSandboxDuration?: number }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const { refreshTasks, addTaskOptimistically } = useTasks()
  const setTaskPrompt = useSetAtom(taskPromptAtom)

  const handleTaskSubmit = async (data: {
    prompt: string
    appType: string
    selectedModel: string
    mode: 'default' | 'coding'
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
    enableBrowser: boolean
    imageBlocks?: Array<{ data: string; mimeType: string }>
  }) => {
    // Clear the saved prompt since we're actually submitting it now
    setTaskPrompt('')

    setIsSubmitting(true)

    // Single task creation
    const { id } = addTaskOptimistically(data)

    try {
      // 先创建 task（不再与 ACP 初始化强绑定）
      const taskRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: data.prompt,
          appType: data.appType,
          selectedModel: data.selectedModel,
          title: data.prompt.slice(0, 50),
          id,
        }),
      })

      if (!taskRes.ok) {
        const err = await taskRes.json()
        toast.error(err.message || err.error || 'Failed to create app')
        setIsSubmitting(false)
        await refreshTasks()
        return
      }

      // 尝试初始化 ACP（非阻塞）——如果失败仅记录警告但不阻止任务创建/跳转
      ;(async () => {
        try {
          const initRes = await fetch('/api/agent/acp', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: 1 } }),
          })
          if (initRes.ok) {
            // 尝试创建 ACP session（也非阻塞）
            await fetch('/api/agent/acp', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'session/new', id: 2, params: { conversationId: id } }),
            })
          } else {
            console.warn('ACP initialize failed (ignored)')
          }
        } catch (e) {
          console.warn('ACP initialization error (ignored):', e)
        }
      })()

      // 全部成功，重置状态后跳转
      setIsSubmitting(false)
      // Save image blocks to sessionStorage so task-page-client can pick them up
      if (data.imageBlocks && data.imageBlocks.length > 0) {
        sessionStorage.setItem(`task-images-${id}`, JSON.stringify(data.imageBlocks))
      }
      navigate(`/apps/${id}?prompt=${encodeURIComponent(data.prompt)}`)
      await refreshTasks()
    } catch (error) {
      console.error('Error creating app:', error)
      toast.error('Failed to create app')
      setIsSubmitting(false)
      await refreshTasks()
    }
  }

  return (
    <div className="flex-1 bg-background flex flex-col">
      <div className="p-3">
        <SharedHeader leftActions={null} />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-20 md:pb-4">
        <div className="w-full max-w-2xl">
          <TaskForm onSubmit={handleTaskSubmit} isSubmitting={isSubmitting} initialMaxDuration={maxSandboxDuration} />

          {/* 常用模板快捷入口 */}
          <div className="mt-6">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2.5">
              <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
              <span>试试这些模板</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => {
                    setTaskPrompt(tpl)
                    // 让 textarea 聚焦
                    const ta = document.getElementById('prompt') as HTMLTextAreaElement | null
                    ta?.focus()
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-primary/70" />
                    {tpl.split('，')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
