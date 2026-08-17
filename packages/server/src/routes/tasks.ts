import { Context, Hono } from 'hono'
import { getDb } from '../db/index.js'
import { nanoid } from 'nanoid'
import { requireAuth, type AppEnv } from '../middleware/auth'
import { loadTaskMessagesPage } from '../agent/message-history.service.js'
import { getSandbox } from '../sandbox/index.js'
import { getWorkspacePath } from '../lib/workspace.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'

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

// ─── Workspace File APIs ─────────────────────────────────────
// 用于前端文件浏览器读取/编辑预览应用的源码文件结构。

const ALLOWED_FILE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.html', '.css', '.scss', '.less', '.json',
  '.md', '.txt', '.yaml', '.yml', '.svg',
])
const IGNORED_ENTRIES = new Set(['node_modules', '.git', 'dist', 'build', '.cache'])

async function resolveTaskWorkspace(c: Context<AppEnv>, taskId: string) {
  const authErr = requireAuth(c)
  if (authErr) return { authErr }

  const session = c.get('session')!
  const task = await getDb().tasks.findByIdAndUserId(taskId, session.user.id)
  if (!task) return { error: 'Task not found', status: 404 }

  // 工作区目录以 session/task id 命名（见 acp.ts 中 writeWorkspaceFiles(sessionId, ...)），
  // 因此直接以 taskId 作为工作区路径，而非 appModelId。
  const appId = taskId
  const workspacePath = path.resolve(getWorkspacePath(appId))
  if (!existsSync(workspacePath)) return { error: 'Workspace not ready', status: 409 }
  return { workspacePath, task, appId }
}

function normalizeRelativePath(raw?: string | string[]): string {
  if (!raw) return ''
  const value = Array.isArray(raw) ? raw[0] : raw
  const normalized = path.normalize(decodeURIComponent(value)).replace(/\\+/g, '/')
  if (normalized.startsWith('..')) return ''
  if (normalized.startsWith('/')) return normalized.slice(1)
  return normalized
}

function isInsideWorkspace(workspacePath: string, targetPath: string): boolean {
  const resolvedWorkspace = path.resolve(workspacePath)
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget === resolvedWorkspace || resolvedTarget.startsWith(resolvedWorkspace + path.sep)
}

tasks.get('/:taskId/files/list-dir', async (c) => {
  const result = await resolveTaskWorkspace(c, c.req.param('taskId'))
  if ('authErr' in result && result.authErr) return result.authErr
  if ('error' in result && result.error) return c.json({ error: result.error }, result.status as 404 | 409)

  const { workspacePath } = result
  const rawPath = c.req.query('path')
  const relativePath = normalizeRelativePath(rawPath)
  const targetPath = relativePath ? path.join(workspacePath, relativePath) : workspacePath

  if (!isInsideWorkspace(workspacePath, targetPath)) {
    return c.json({ error: 'Invalid path' }, 400)
  }

  if (!existsSync(targetPath)) {
    return c.json({ error: 'Directory not found' }, 404)
  }

  try {
    const stat = await fs.stat(targetPath)
    if (!stat.isDirectory()) {
      return c.json({ error: 'Not a directory' }, 400)
    }

    const names = await fs.readdir(targetPath)

    const entries: { name: string; type: 'file' | 'directory'; path: string }[] = []

    for (const name of names.sort((a, b) => a.localeCompare(b))) {
      if (IGNORED_ENTRIES.has(name)) continue
      const childPath = relativePath ? `${relativePath}/${name}` : name
      const fullPath = path.join(targetPath, name)
      try {
        const childStat = await fs.stat(fullPath)
        if (childStat.isDirectory()) {
          entries.push({ name, type: 'directory', path: childPath })
        } else if (childStat.isFile()) {
          entries.push({ name, type: 'file', path: childPath })
        }
      } catch {
        // skip entries we can't stat
      }
    }

    return c.json({ success: true, entries })
  } catch (err) {
    console.error('[files:list-dir] error', err)
    return c.json({ error: 'Failed to list directory' }, 500)
  }
})

tasks.get('/:taskId/files/download', async (c) => {
  const result = await resolveTaskWorkspace(c, c.req.param('taskId'))
  if ('authErr' in result && result.authErr) return result.authErr
  if ('error' in result && result.error) return c.json({ error: result.error }, result.status as 404 | 409)

  const { workspacePath } = result
  const rawPath = c.req.query('path')
  const relativePath = normalizeRelativePath(rawPath)
  if (!relativePath) {
    return c.json({ error: 'Path is required' }, 400)
  }

  const targetPath = path.join(workspacePath, relativePath)
  if (!isInsideWorkspace(workspacePath, targetPath)) {
    return c.json({ error: 'Invalid path' }, 400)
  }

  if (!existsSync(targetPath)) {
    return c.json({ error: 'File not found' }, 404)
  }

  try {
    const stat = await fs.stat(targetPath)
    if (!stat.isFile()) {
      return c.json({ error: 'Not a file' }, 400)
    }

    const content = await fs.readFile(targetPath, 'utf-8')
    const ext = path.extname(targetPath).toLowerCase()
    const isText = ALLOWED_FILE_EXTENSIONS.has(ext) || !/ /.test(content.slice(0, 1024))
    c.header('Content-Disposition', `attachment; filename="${path.basename(targetPath)}"`)
    c.header('Content-Type', isText ? 'text/plain; charset=utf-8' : 'application/octet-stream')
    return c.body(content)
  } catch (err) {
    console.error('[files:download] error', err)
    return c.json({ error: 'Failed to download file' }, 500)
  }
})

tasks.post('/:taskId/files/save', async (c) => {
  const result = await resolveTaskWorkspace(c, c.req.param('taskId'))
  if ('authErr' in result && result.authErr) return result.authErr
  if ('error' in result && result.error) return c.json({ error: result.error }, result.status as 404 | 409)

  const { workspacePath } = result
  const body = await c.req.json<{ path: string; content: string }>()
  const relativePath = normalizeRelativePath(body.path)
  if (!relativePath) {
    return c.json({ error: 'Path is required' }, 400)
  }

  const targetPath = path.join(workspacePath, relativePath)
  if (!isInsideWorkspace(workspacePath, targetPath)) {
    return c.json({ error: 'Invalid path' }, 400)
  }

  const ext = path.extname(targetPath).toLowerCase()
  if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
    return c.json({ error: 'File type not allowed' }, 400)
  }

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, body.content, 'utf-8')
    return c.json({ success: true })
  } catch (err) {
    console.error('[files:save] error', err)
    return c.json({ error: 'Failed to save file' }, 500)
  }
})

// Legacy frontend endpoints used by the code editor / diff viewer
const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript', '.html': 'html', '.css': 'css',
  '.scss': 'scss', '.less': 'less', '.json': 'json', '.md': 'markdown',
  '.yaml': 'yaml', '.yml': 'yaml', '.svg': 'xml', '.txt': 'plaintext',
}

function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return EXT_TO_LANGUAGE[ext] || 'plaintext'
}

function isTextFile(fullPath: string, content: Buffer): boolean {
  if (!ALLOWED_FILE_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
    return false
  }
  return !content.slice(0, 1024).includes(0)
}

tasks.get('/:taskId/file-content', async (c) => {
  const result = await resolveTaskWorkspace(c, c.req.param('taskId'))
  if ('authErr' in result && result.authErr) return result.authErr
  if ('error' in result && result.error) return c.json({ error: result.error }, result.status as 404 | 409)

  const { workspacePath } = result
  const rawFilename = c.req.query('filename')
  const relativePath = normalizeRelativePath(rawFilename)
  if (!relativePath) {
    return c.json({ error: 'filename is required' }, 400)
  }

  const targetPath = path.join(workspacePath, relativePath)
  if (!isInsideWorkspace(workspacePath, targetPath)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  if (!existsSync(targetPath)) {
    return c.json({ error: 'File not found' }, 404)
  }

  try {
    const stat = await fs.stat(targetPath)
    if (!stat.isFile()) {
      return c.json({ error: 'Not a file' }, 400)
    }

    const buffer = await fs.readFile(targetPath)
    const ext = path.extname(targetPath).toLowerCase()
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)
    const isBinary = !isTextFile(targetPath, buffer)
    const language = detectLanguage(targetPath)

    const data = {
      filename: relativePath,
      oldContent: '',
      newContent: isBinary ? buffer.toString('base64') : buffer.toString('utf-8'),
      language,
      isBinary,
      isImage,
      isBase64: isBinary,
    }
    return c.json({ success: true, data })
  } catch (err) {
    console.error('[file-content] error', err)
    return c.json({ error: 'Failed to read file' }, 500)
  }
})

tasks.post('/:taskId/save-file', async (c) => {
  const result = await resolveTaskWorkspace(c, c.req.param('taskId'))
  if ('authErr' in result && result.authErr) return result.authErr
  if ('error' in result && result.error) return c.json({ error: result.error }, result.status as 404 | 409)

  const { workspacePath } = result
  const body = await c.req.json<{ filename: string; content: string }>()
  const relativePath = normalizeRelativePath(body.filename)
  if (!relativePath) {
    return c.json({ error: 'filename is required' }, 400)
  }

  const targetPath = path.join(workspacePath, relativePath)
  if (!isInsideWorkspace(workspacePath, targetPath)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const ext = path.extname(targetPath).toLowerCase()
  if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
    return c.json({ error: 'File type not allowed' }, 400)
  }

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, body.content, 'utf-8')
    return c.json({ success: true })
  } catch (err) {
    console.error('[save-file] error', err)
    return c.json({ error: 'Failed to save file' }, 500)
  }
})

// 将整个工作区源码打包为 zip 下载（排除 node_modules/.git/dist 等）
tasks.get('/:taskId/files/download-zip', async (c) => {
  const result = await resolveTaskWorkspace(c, c.req.param('taskId'))
  if ('authErr' in result && result.authErr) return result.authErr
  if ('error' in result && result.error) return c.json({ error: result.error }, result.status as 404 | 409)

  const { workspacePath, appId } = result

  // 递归收集需要打包的文件
  const files: Record<string, Uint8Array> = {}
  const walk = async (dir: string, relPrefix: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (IGNORED_ENTRIES.has(entry.name)) continue
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs, rel)
      } else if (entry.isFile()) {
        const content = await fs.readFile(abs)
        files[rel] = new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
      }
    }
  }

  try {
    await walk(workspacePath, '')
  } catch (err) {
    console.error('[download-zip] walk error', err)
    return c.json({ error: 'Failed to read workspace' }, 500)
  }

  if (Object.keys(files).length === 0) {
    return c.json({ error: 'Workspace is empty' }, 409)
  }

  // 延迟加载 fflate，避免在无 zip 请求时占用内存
  const { zipSync } = await import('fflate')
  let zipped: Uint8Array
  try {
    zipped = zipSync(files, { level: 6 })
  } catch (err) {
    console.error('[download-zip] zip error', err)
    return c.json({ error: 'Failed to compress files' }, 500)
  }

  const safeName = (appId || 'source').replace(/[^a-zA-Z0-9_-]/g, '_')
  c.header('Content-Type', 'application/zip')
  c.header('Content-Disposition', `attachment; filename="${safeName}-source.zip"`)
  return c.body(zipped as unknown as ArrayBuffer, 200)
})

export default tasks
