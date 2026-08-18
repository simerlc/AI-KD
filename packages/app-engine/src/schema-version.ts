// ─── Schema 版本管理 ─────────────────────────────────────
//
// 区分两类版本：
//   - 应用语义版本（AppModel.version / AppSchema.version）：描述应用本身迭代
//   - Schema 结构版本（AppSchema.schemaVersion）：描述 AppSchema 结构本身迭代
//
// 当 AppSchema 结构发生「不兼容」变化时，schemaVersion 递增，
// 用于数据迁移与旧 Schema 的兼容性判断。

import { APP_SCHEMA_VERSION } from '@aikd/shared'

/** 当前支持的 Schema 结构版本 */
export const CURRENT_SCHEMA_VERSION = APP_SCHEMA_VERSION

/**
 * 兼容性级别。
 * - compatible：可以直接使用
 * - migrate：需要迁移后使用
 * - unsupported：不支持
 */
export type SchemaCompatibility = 'compatible' | 'migrate' | 'unsupported'

/**
 * 判断给定 schemaVersion 与当前版本的兼容性。
 *
 * 规则（简化语义化版本比较）：
 *   - major 相同 → 兼容（同主版本内向前兼容）
 *   - major 低于当前 → 可迁移（老版本可升级）
 *   - major 高于当前 → 不支持（未来版本，运行时过旧）
 */
export function checkSchemaCompatibility(version: string | undefined): SchemaCompatibility {
  if (!version) return 'migrate'

  const current = parseVersion(CURRENT_SCHEMA_VERSION)
  const target = parseVersion(version)
  if (!current || !target) return 'unsupported'

  if (target.major > current.major) return 'unsupported'
  if (target.major < current.major) return 'migrate'
  return 'compatible'
}

/** 判断是否兼容 */
export function isSchemaCompatible(version: string | undefined): boolean {
  return checkSchemaCompatibility(version) === 'compatible'
}

// ─── 内部版本解析 ────────────────────────────────────────

interface ParsedVersion {
  major: number
  minor: number
  patch: number
}

function parseVersion(version: string): ParsedVersion | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/**
 * 规范化 schemaVersion：缺失时补默认值。
 * 用于读取旧数据（无 schemaVersion 字段）时回退到 1.0.0。
 */
export function normalizeSchemaVersion(version: string | undefined): string {
  if (!version) return CURRENT_SCHEMA_VERSION
  return parseVersion(version) ? version : CURRENT_SCHEMA_VERSION
}
