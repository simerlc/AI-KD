import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (err) => {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('Session not found')) {
    console.debug('[Server] SDK cleanup rejection (expected after cancel):', msg)
    return
  }
  console.error('[Server] Unhandled rejection:', err)
})

process.on('uncaughtException', (err) => {
  const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined
  if (code === 'EPIPE' || code === 'ECONNRESET' || code === 'ECONNREFUSED') {
    console.warn(`[Server] Ignored uncaught ${code}:`, (err as Error).message)
  } else {
    console.error('[Server] Uncaught exception:', err)
  }
})

import { authMiddleware } from './middleware/auth'
import type { AppEnv } from './middleware/auth'
import { DEFAULT_USER_ID, DEFAULT_USERNAME } from './middleware/auth'
import acpRoutes from './routes/acp'
import tasksRoutes from './routes/tasks'
import miscRoutes from './routes/misc'

const app = new Hono<AppEnv>()

// CORS configuration
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
  }),
)

// API routes (must be before static files)
app.use('*', authMiddleware)

app.get('/health', (c) => c.json({ status: 'ok' }))
app.route('/api/agent', acpRoutes)
app.route('/api/tasks', tasksRoutes)
app.route('/api', miscRoutes)

// Static file serving for production (web build output)
const webDistPath = resolve(__dirname, '../web/dist')
const serveStaticFiles = existsSync(webDistPath)

if (serveStaticFiles) {
  console.log(`[Server] Serving static files from: ${webDistPath}`)

  const indexHtml = readFileSync(resolve(webDistPath, 'index.html'), 'utf-8')

  app.use('/assets/*', serveStatic({ root: webDistPath }))
  app.use('/*', serveStatic({ root: webDistPath }))

  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) {
      return next()
    }
    return c.html(indexHtml)
  })
} else {
  console.log('[Server] Running in API-only mode (no static files)')
  console.log('[Server] For full-stack mode, build the web package first: pnpm build:web')
}

import { getDb } from './db/index.js'
import { getSandbox } from './sandbox/index.js'

// 创建默认用户（无登录模式）
async function ensureDefaultUser() {
  try {
    const db = getDb()
    const existing = await db.users.findById(DEFAULT_USER_ID)
    if (!existing) {
      await db.users.create({
        id: DEFAULT_USER_ID,
        provider: 'local',
        externalId: DEFAULT_USER_ID,
        username: DEFAULT_USERNAME,
        email: null,
        name: 'Admin',
        avatarUrl: '',
        apiKey: null,
        status: '',
        accessToken: '',
        role: ''
      })
      console.log('[Server] Default user created')
    }
  } catch (err) {
    console.error('[Server] Failed to create default user:', err)
  }
}

const PORT = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  if (serveStaticFiles) {
    console.log(`Open http://localhost:${PORT} in your browser`)
  } else {
    console.log(`API endpoint: http://localhost:${PORT}/api`)
    console.log(`For development, run: pnpm dev:web`)
  }

  ensureDefaultUser()

  // 清理服务器重启后遗留的孤儿沙箱进程，避免端口错配导致预览加载到旧内容
  const sandbox = getSandbox()
  if (typeof sandbox.cleanup === 'function') {
    sandbox
      .cleanup()
      .then(() => console.log('[Sandbox] Cleaned up orphan sandbox processes'))
      .catch((err) => console.error('[Sandbox] Cleanup failed:', err))
  }
})

export default app
