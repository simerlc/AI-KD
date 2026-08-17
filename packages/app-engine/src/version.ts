import type { AppModel, AppVersion, NewAppVersion } from '@aikd/shared'

// ─── 语义化版本管理 ──────────────────────────────────────

export interface SemVer {
  major: number
  minor: number
  patch: number
}

/** 解析语义化版本号 */
export function parseSemVer(version: string): SemVer | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/** 格式化语义化版本号 */
export function formatSemVer(sv: SemVer): string {
  return `${sv.major}.${sv.minor}.${sv.patch}`
}

/** 比较两个版本号，返回 -1/0/1 */
export function compareSemVer(a: string, b: string): number {
  const svA = parseSemVer(a)
  const svB = parseSemVer(b)
  if (!svA || !svB) return 0

  if (svA.major !== svB.major) return svA.major > svB.major ? 1 : -1
  if (svA.minor !== svB.minor) return svA.minor > svB.minor ? 1 : -1
  if (svA.patch !== svB.patch) return svA.patch > svB.patch ? 1 : -1
  return 0
}

/** 版本递增类型 */
export type VersionBumpType = 'patch' | 'minor' | 'major'

/** 递增版本号 */
export function bumpVersion(version: string, type: VersionBumpType = 'patch'): string {
  const sv = parseSemVer(version)
  if (!sv) return '0.1.0'

  switch (type) {
    case 'major':
      return formatSemVer({ major: sv.major + 1, minor: 0, patch: 0 })
    case 'minor':
      return formatSemVer({ major: sv.major, minor: sv.minor + 1, patch: 0 })
    case 'patch':
    default:
      return formatSemVer({ major: sv.major, minor: sv.minor, patch: sv.patch + 1 })
  }
}

/**
 * 根据变更内容推断版本递增类型。
 *
 * - 新增页面 / 新增数据源 → minor
 * - 修改组件 props / 主题 → patch
 * - 删除页面 / 变更应用类型 → major
 */
export function inferBumpType(oldModel: AppModel, newModel: AppModel): VersionBumpType {
  // 应用类型变更 → major
  if (oldModel.type !== newModel.type) return 'major'

  const oldPages = new Set(oldModel.schema.pages.map((p) => p.id))
  const newPages = new Set(newModel.schema.pages.map((p) => p.id))

  // 页面删除 → major
  for (const oldPage of oldPages) {
    if (!newPages.has(oldPage)) return 'major'
  }

  // 新增页面 → minor
  for (const newPage of newPages) {
    if (!oldPages.has(newPage)) return 'minor'
  }

  // 新增数据源 → minor
  const oldSources = new Set(oldModel.schema.dataSources.map((d) => d.id))
  const newSources = new Set(newModel.schema.dataSources.map((d) => d.id))
  for (const src of newSources) {
    if (!oldSources.has(src)) return 'minor'
  }

  // 默认 → patch
  return 'patch'
}

// ─── 版本快照创建 ────────────────────────────────────────

/**
 * 为当前 App Model 创建版本快照。
 *
 * 调用方负责将返回的 NewAppVersion 写入数据库。
 */
export function createVersionSnapshot(
  appModel: AppModel,
  userId: string,
  bumpType?: VersionBumpType,
  label?: string,
): NewAppVersion & { appModelId: string; version: string } {
  const newVersion = bumpType ? bumpVersion(appModel.version, bumpType) : appModel.version

  return {
    appId: appModel.id,
    version: newVersion,
    label: label ?? null,
    appModelId: appModel.id,
    codeHash: null,
    userId,
  }
}

/**
 * 从版本列表中查找最新版本。
 */
export function findLatestVersion(versions: AppVersion[]): AppVersion | null {
  if (versions.length === 0) return null
  return versions.reduce((latest, current) => {
    return compareSemVer(current.version, latest.version) > 0 ? current : latest
  })
}
