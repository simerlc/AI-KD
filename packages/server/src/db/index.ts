import type { DatabaseProvider } from './types'
import { createDrizzleProvider } from './drizzle/repositories'

export type { DatabaseProvider } from './types'
export * from './types'

let _provider: DatabaseProvider | null = null

/**
 * Get the database provider instance (SQLite via drizzle-orm).
 * AI快搭 V1 仅使用本地 SQLite。
 */
export function getDb(): DatabaseProvider {
  if (_provider) return _provider
  _provider = createDrizzleProvider()
  return _provider
}
