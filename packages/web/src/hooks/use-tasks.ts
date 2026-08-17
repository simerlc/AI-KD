import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { Task } from '@aikd/shared'

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try {
      const data = await api.get<{ tasks: Task[] }>('/api/tasks')
      // Filter out invalid or malformed tasks returned by the server
      const valid = Array.isArray(data.tasks)
        ? data.tasks.filter((t) => t && typeof t.id === 'string')
        : []
      setTasks(valid)
    } catch {
      setTasks([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  return { tasks, isLoading, refreshTasks: fetchTasks }
}
