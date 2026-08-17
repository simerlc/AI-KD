import { Hono } from 'hono'
import { getDb } from '../db/index.js'
import { nanoid } from 'nanoid'
import { requireAuth, type AppEnv } from '../middleware/auth'
import { loadTaskMessagesPage } from '../agent/message-history.service.js'
import { getSandbox } from '../sandbox/index.js'
import { getWorkspacePath } from '../lib/workspace.js'
import fs from 'node:fs/promises'

const tasks = new Hono<AppEnv>()

// 创建应用
tasks.post('/', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const body = await c.req.json()
  const { prompt, appType, selectedModel, title, id } = body

  if (!prompt || typeof prompt !== 'string') {
    return c.json({ error: 'Prompt is required' }, 400)
  }

  // 优先使用前端传入的 id（与 ACP session/conversation 保持一致，避免产生两条重复任务）；
  // 未传入时（如 API 直接调用）才自行生成。
  const taskId = typeof id === 'string' && id.trim() ? id : nanoid()
  const now = Date.now()

  const task = await getDb().tasks.create({
    id: taskId,
    userId: session.user.id,
    prompt,
    title: title || prompt.slice(0, 50),
    appType: appType || 'web',
    selectedModel: selectedModel || null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  })

  return c.json({ task })
})

// 删除当前用户的所有应用（软删除）
tasks.delete('/', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  try {
    const taskList = await getDb().tasks.findByUserId(session.user.id, 1000)
    for (const t of taskList) {
      await getDb().tasks.softDelete(t.id)
    }
    return c.json({ success: true, deleted: taskList.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete tasks'
    return c.json({ error: msg }, 500)
  }
})

// 获取当前用户的应用列表
tasks.get('/', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskList = await getDb().tasks.findByUserId(session.user.id)
  return c.json({ tasks: taskList })
})

// 获取应用详情
tasks.get('/:taskId', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  return c.json({ task })
})

// 更新应用
tasks.patch('/:taskId', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const existing = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const body = await c.req.json()
  const { title, status, progress, error, previewUrl, sandboxUrl, appModelId, currentVersion } = body

  const updated = await getDb().tasks.update(taskId, {
    ...(title !== undefined && { title }),
    ...(status !== undefined && { status }),
    ...(progress !== undefined && { progress }),
    ...(error !== undefined && { error }),
    ...(previewUrl !== undefined && { previewUrl }),
    ...(sandboxUrl !== undefined && { sandboxUrl }),
    ...(appModelId !== undefined && { appModelId }),
    ...(currentVersion !== undefined && { currentVersion }),
  })

  return c.json({ task: updated })
})

// 删除应用（软删除）
tasks.delete('/:taskId', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const existing = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404)
  }

  await getDb().tasks.softDelete(taskId)
  return c.json({ success: true })
})

// 获取应用历史消息
tasks.get('/:taskId/messages', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const cursor = c.req.query('cursor')
  const result = await loadTaskMessagesPage(taskId, cursor || undefined)
  return c.json(result)
})

// 获取预览 URL（前端轮询调用）
//   - 沙箱在运行：返回 URL
//   - 沙箱未运行但工作区有文件：自动启动
//   - 否则返回 error
tasks.get('/:taskId/preview-url', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const sandbox = getSandbox()

  // 1. 沙箱已在运行，直接返回
  const running = sandbox.get(taskId)
  if (running && running.status === 'running') {
    return c.json({ previewUrl: running.url })
  }

  // 2. 检查工作区是否有文件（决定是否启动）
  const workspacePath = getWorkspacePath(taskId)
  let hasFiles = false
  try {
    const entries = await fs.readdir(workspacePath)
    hasFiles = entries.length > 0
  } catch {
    hasFiles = false
  }

  if (!hasFiles) {
    return c.json({ error: 'Workspace is empty, generate code first' }, 400)
  }

  // 3. 启动沙箱
  try {
    const instance = await sandbox.create({ appId: taskId })
    await getDb().tasks.update(taskId, {
      previewUrl: instance.url,
      sandboxUrl: instance.url,
    })
    return c.json({ previewUrl: instance.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start sandbox'
    return c.json({ error: msg }, 500)
  }
})

// 停止并销毁沙箱容器
tasks.post('/:taskId/sandbox/stop', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  await getSandbox().destroy(taskId)
  await getDb().tasks.update(taskId, { previewUrl: null, sandboxUrl: null })
  return c.json({ success: true })
})

// 重启沙箱容器（销毁后重新创建）
tasks.post('/:taskId/sandbox/restart', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const sandbox = getSandbox()
  await sandbox.destroy(taskId)
  try {
    const instance = await sandbox.create({ appId: taskId })
    await getDb().tasks.update(taskId, {
      previewUrl: instance.url,
      sandboxUrl: instance.url,
    })
    return c.json({ previewUrl: instance.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to restart sandbox'
    return c.json({ error: msg }, 500)
  }
})

// 获取沙箱状态
tasks.get('/:taskId/sandbox/status', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const instance = getSandbox().get(taskId)
  return c.json({
    status: instance?.status ?? 'stopped',
    url: instance?.url ?? null,
    hostPort: instance?.hostPort ?? null,
  })
})

// 获取 App Model 版本列表
tasks.get('/:taskId/app-models', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const appModels = await getDb().appModels.findByAppId(taskId)
  return c.json({
    appModels: appModels.map((m) => ({
      id: m.id,
      appId: m.appId,
      version: m.version,
      modelJson: m.modelJson,
      createdAt: m.createdAt,
    })),
  })
})

// 获取单个 App Model 详情
tasks.get('/:taskId/app-models/:modelId', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const modelId = c.req.param('modelId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const appModel = await getDb().appModels.findById(modelId)
  if (!appModel || appModel.appId !== taskId) {
    return c.json({ error: 'App model not found' }, 404)
  }

  return c.json({
    id: appModel.id,
    appId: appModel.appId,
    version: appModel.version,
    modelJson: appModel.modelJson,
    createdAt: appModel.createdAt,
  })
})

// 获取部署记录
tasks.get('/:taskId/deployments', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const taskId = c.req.param('taskId')
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const deployments = await getDb().deployments.findByTaskId(taskId)
  return c.json({ deployments })
})

export default tasks
