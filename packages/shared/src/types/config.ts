// ─── Auth 相关类型 ─────────────────────────────────────

export type AuthStatus = 'IDLE' | 'PENDING' | 'READY' | 'ERROR' | 'EXPIRED'

export interface AuthState {
  authStatus: AuthStatus
  error?: string
}

// ─── LLM 配置 ──────────────────────────────────────────

export interface LlmConfig {
  endpoint?: string
  apiKey?: string
  model?: string
  authToken?: string
}

// ─── 本地持久化配置 ────────────────────────────────────

export interface CoderConfig {
  llm?: LlmConfig
  server?: {
    port: number
  }
}

// ─── Setup Status ──────────────────────────────────────

export interface SetupStatus {
  llmConfigured: boolean
}
