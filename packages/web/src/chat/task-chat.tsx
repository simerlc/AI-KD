import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ArrowUp, Square, AlertCircle, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@aikd/shared'
import { useChatStream, type ChatMessage } from './use-chat-stream'

export interface TaskChatProps {
  taskId: string
  task: Task
  chatStream: ReturnType<typeof useChatStream>
  onStreamComplete?: () => void
  onManualUserSend?: () => void
  skillsList?: Array<{ name: string; description: string }>
}

export function TaskChat({ taskId, task, chatStream, onStreamComplete, onManualUserSend }: TaskChatProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { messages, isLoading, error, cancel, sendPrompt } = chatStream

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    onStreamComplete?.()
  }, [onStreamComplete])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    onManualUserSend?.()
    await sendPrompt(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {task.prompt ? task.prompt : '开始一段新的对话...'}
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      <div className="border-t bg-background p-3 flex-shrink-0">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            disabled={isLoading}
            rows={2}
            className="w-full resize-none pr-12"
          />
          <div className="absolute right-2 bottom-2">
            {isLoading ? (
              <Button
                size="icon"
                variant="destructive"
                onClick={() => void cancel()}
                className="h-8 w-8 rounded-full"
                title="停止"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => void handleSend()}
                disabled={!input.trim()}
                className="h-8 w-8 rounded-full"
                title="发送"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const toolParts = (message.parts ?? []).filter((p) => p.type === 'tool_call' || p.type === 'tool_result')

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        {message.content || (isLoadingPlaceholder(message) ? <LoadingDots /> : '')}
      </div>
      {toolParts.length > 0 && (
        <div className="flex flex-col gap-1 w-full max-w-[85%]">
          {toolParts.map((part, idx) => (
            <ToolCallBadge
              key={`${part.type}-${idx}`}
              name={part.type === 'tool_call' ? part.toolName : (part.toolName ?? 'tool')}
              status={part.status}
              isError={part.type === 'tool_result' ? part.isError : false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function isLoadingPlaceholder(message: ChatMessage): boolean {
  return message.role === 'agent' && message.status === 'streaming' && !message.content
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="text-xs text-muted-foreground">思考中...</span>
    </span>
  )
}

function ToolCallBadge({ name, status, isError }: { name: string; status?: string; isError?: boolean }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border',
        isError
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-border bg-muted/50 text-muted-foreground',
      )}
    >
      <Wrench className="h-3 w-3" />
      <span className="truncate max-w-[200px]">{name}</span>
      {status && <span className="opacity-60">· {status}</span>}
    </div>
  )
}

export { useChatStream } from './use-chat-stream'
export type { UseChatStreamReturn } from './use-chat-stream'
