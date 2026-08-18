// Provider 存储层：将 Provider 配置持久化到本地 JSON 文件
// 用 Node fs 存储，避免每次请求动态计算内置 Provider
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ModelProvider, PublicModelProvider } from './types'
import { getAllBuiltinSpecs, createBuiltinProvider } from './builtin'

const PROVIDER_DIR = path.join(os.homedir(), '.aikd')
const PROVIDER_FILE = path.join(PROVIDER_DIR, 'providers.json')

function ensureDir() {
  if (!fs.existsSync(PROVIDER_DIR)) {
    fs.mkdirSync(PROVIDER_DIR, { recursive: true })
  }
}

// ─── 与服务器内存缓存 ─────────────────────────────
let _cache: ModelProvider[] | null = null

function readFromDisk(): ModelProvider[] {
  ensureDir()
  if (!fs.existsSync(PROVIDER_FILE)) return []
  try {
    const raw = fs.readFileSync(PROVIDER_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as { providers?: ModelProvider[] }
    return Array.isArray(parsed.providers) ? parsed.providers : []
  } catch {
    return []
  }
}

function writeToDisk(providers: ModelProvider[]) {
  ensureDir()
  const payload = { providers }
  fs.writeFileSync(PROVIDER_FILE, JSON.stringify(payload, null, 2), 'utf-8')
  _cache = providers
}

function invalidateCache() {
  _cache = null
}

/**
 * 获取所有 Provider：内置（保证存在）+ 自定义 + 持久化的内置配置（apiKey/status）
 * 内置 Provider 始终存在；自定义 Provider 从磁盘读取。
 */
export function listProviders(): ModelProvider[] {
  if (_cache) return _cache

  const now = new Date().toISOString()
  // 内置 Provider 基础定义
  const builtinBase = getAllBuiltinSpecs().map((s) => createBuiltinProvider(s, now))

  // 磁盘上已有的持久化配置（含自定义 + 已配置的内置）
  const diskProviders = readFromDisk()
  const diskById = new Map(diskProviders.map((p) => [p.id, p]))

  // 合并：内置取磁盘中的配置（若存在），否则用基础定义
  const result: ModelProvider[] = builtinBase.map((base) => {
    const disk = diskById.get(base.id)
    if (disk) {
      return { ...base, ...disk, type: 'builtin' as const }
    }
    return base
  })

  // 自定义 Provider（只从磁盘读取）
  for (const p of diskProviders) {
    if (p.type === 'custom' && !result.some((r) => r.id === p.id)) {
      result.push(p)
    }
  }

  _cache = result
  return result
}

export function getProvider(id: string): ModelProvider | undefined {
  return listProviders().find((p) => p.id === id)
}

/** 保存（新增或更新）一个 Provider，内置 Provider 不允许被删除 */
export function saveProvider(provider: ModelProvider): ModelProvider {
  const providers = listProviders()
  const idx = providers.findIndex((p) => p.id === provider.id)
  if (idx >= 0) {
    providers[idx] = provider
  } else {
    providers.push(provider)
  }
  writeToDisk(providers)
  invalidateCache()
  return provider
}

export function deleteProvider(id: string): boolean {
  const providers = listProviders()
  const target = providers.find((p) => p.id === id)
  if (!target || target.type !== 'custom') {
    return false
  }
  const filtered = providers.filter((p) => p.id !== id)
  writeToDisk(filtered)
  invalidateCache()
  return true
}

/** 转换为对外安全的 Provider（隐藏 apiKey） */
export function toPublicProvider(p: ModelProvider): PublicModelProvider {
  const { apiKey, ...rest } = p
  return { ...rest, apiKey: apiKey ? '******' : undefined, hasApiKey: !!apiKey }
}

export function getProviderConfigFilePath() {
  return PROVIDER_FILE
}
