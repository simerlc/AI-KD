import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { getDb } from '../db/index.js'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { encryptJWE } from '../lib/session'
import { requireAuth, type AppEnv, type AppSession } from '../middleware/auth'

const SESSION_COOKIE_NAME = 'nex_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year in seconds

const auth = new Hono<AppEnv>()

auth.post('/register', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return c.json({ error: 'Username and password are required' }, 400)
    }

    const trimmedUsername = username.trim().toLowerCase()
    if (trimmedUsername.length < 3) {
      return c.json({ error: 'Username must be at least 3 characters' }, 400)
    }
    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400)
    }

    // Check if username already exists
    const existing = await getDb().users.findByProviderAndExternalId('local', trimmedUsername)
    if (existing) {
      return c.json({ error: 'Username already taken' }, 409)
    }

    // Create user — first registered user becomes admin automatically
    const userId = nanoid()
    const now = Date.now()
    const passwordHash = await bcrypt.hash(password, 12)
    const userCount = await getDb().users.count()
    const role = userCount === 0 ? 'admin' : 'user'
    const apiKey = `sak_${nanoid(40)}`

    await getDb().users.create({
      id: userId,
      provider: 'local',
      externalId: trimmedUsername,
      accessToken: '',
      username: trimmedUsername,
      role,
      status: 'active',
      apiKey,
    })

    await getDb().localCredentials.create({
      userId,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })

    // Create session
    const session: AppSession = {
      created: now,
      authProvider: 'local',
      user: {
        id: userId,
        username: trimmedUsername,
        email: undefined,
        name: trimmedUsername,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmedUsername)}&background=6366f1&color=fff`,
      },
    }

    const sessionValue = await encryptJWE(session, '1y')

    setCookie(c, SESSION_COOKIE_NAME, sessionValue, {
      path: '/',
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'Lax',
    })

    return c.json({
      success: true,
      user: {
        id: userId,
        username: trimmedUsername,
        email: undefined,
        name: trimmedUsername,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmedUsername)}&background=6366f1&color=fff`,
        role,
      },
    })
  } catch (error) {
    console.error('Error registering local user:', error)
    return c.json({ error: 'Registration failed' }, 500)
  }
})

auth.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return c.json({ error: 'Username and password are required' }, 400)
    }

    const trimmedUsername = username.trim().toLowerCase()

    const user = await getDb().users.findByProviderAndExternalId('local', trimmedUsername)
    if (!user) {
      return c.json({ error: 'Invalid username or password' }, 401)
    }

    const cred = await getDb().localCredentials.findByUserId(user.id)
    if (!cred) {
      return c.json({ error: 'Invalid username or password' }, 401)
    }

    const valid = await bcrypt.compare(password, cred.passwordHash)
    if (!valid) {
      return c.json({ error: 'Invalid username or password' }, 401)
    }

    if (user.status === 'disabled') {
      return c.json({ error: 'Account has been disabled' }, 403)
    }

    // Update last login
    await getDb().users.update(user.id, { lastLoginAt: Date.now(), updatedAt: Date.now() })

    const session: AppSession = {
      created: Date.now(),
      authProvider: 'local',
      user: {
        id: user.id,
        username: user.username,
        email: user.email || undefined,
        name: user.name || user.username,
        avatar:
          user.avatarUrl ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=6366f1&color=fff`,
      },
    }

    const sessionValue = await encryptJWE(session, '1y')

    setCookie(c, SESSION_COOKIE_NAME, sessionValue, {
      path: '/',
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'Lax',
    })

    return c.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || undefined,
        name: user.name || user.username,
        avatar:
          user.avatarUrl ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=6366f1&color=fff`,
        role: user.role || 'user',
      },
    })
  } catch (error) {
    console.error('Error logging in local user:', error)
    return c.json({ error: 'Login failed' }, 500)
  }
})

auth.post('/signout', async (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
  return c.json({ success: true })
})

auth.get('/me', async (c) => {
  const session = c.get('session')
  if (!session) {
    return c.json({ user: undefined })
  }

  const user = await getDb().users.findById(session.user.id)
  if (user?.status === 'disabled') {
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
    return c.json({ user: undefined })
  }

  return c.json({
    user: {
      ...session.user,
      role: user?.role || 'user',
    },
    authProvider: session.authProvider,
  })
})

// Rate limit info
auth.get('/rate-limit', async (c) => {
  const session = c.get('session')
  if (!session?.user?.id) return c.json({ error: 'Unauthorized' }, 401)

  return c.json({
    allowed: true,
    remaining: 100,
    used: 0,
    total: 100,
    resetAt: new Date(Date.now() + 86400000).toISOString(),
  })
})

// GET /auth-config - Expose auth configuration to frontend
auth.get('/auth-config', (c) => {
  return c.json({ providers: ['local'] })
})

// ─── API Key (view / reset) ────────────────────────────────────────────────

auth.get('/api-key', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!
  const user = await getDb().users.findById(session.user.id)
  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json({ apiKey: user.apiKey || null })
})

auth.post('/api-key/reset', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const plainKey = `sak_${nanoid(40)}`
  await getDb().users.update(session.user.id, { apiKey: plainKey })
  return c.json({ apiKey: plainKey })
})

export default auth
