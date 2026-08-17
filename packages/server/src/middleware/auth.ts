import { Context, Next } from 'hono'

// ─── 默认用户（无登录模式）──────────────────────────────
//
// V1 简化版：去除登录功能，所有请求使用默认用户。
// 配置好 LLM API Key 后即可直接使用。

export interface SessionUser {
  id: string
  username: string
  email: string | undefined
  avatar: string
  name?: string
}

export interface AppSession {
  created: number
  authProvider: 'local'
  user: SessionUser
}

export type AppEnv = {
  Variables: {
    session: AppSession | undefined
    apiKeyScopes: string[] | undefined
  }
}

/** 默认用户 ID，所有请求使用此用户 */
export const DEFAULT_USER_ID = 'default-user'
export const DEFAULT_USERNAME = 'admin'

/** 默认 session（每次请求都使用） */
function createDefaultSession(): AppSession {
  return {
    created: Date.now(),
    authProvider: 'local',
    user: {
      id: DEFAULT_USER_ID,
      username: DEFAULT_USERNAME,
      email: undefined,
      avatar: '',
      name: 'Admin',
    },
  }
}

/** 认证中间件：直接设置默认用户，不检查任何凭证 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  c.set('session', createDefaultSession())
  c.set('apiKeyScopes', ['acp'])
  await next()
}

/** 始终放行（无登录模式） */
export function requireAuth(_c: Context<AppEnv>) {
  return null
}
