// ─── Application Memory ─────────────────────────────────
//
// 多轮应用进化能力。保存应用的状态快照：
//   - 当前功能（features）
//   - 页面结构（pages）
//   - 数据模型（dataModels）
//   - 用户修改历史（history）
//   - 已加载 Skills（skills）
//
// 后续用户说"增加 AI 总结功能"，AI 读取已有应用，做增量修改
// （修改 Note 模型、增加 AI 接口、新增 Summary 组件），
// 禁止重新生成整个项目。

import type { Blueprint } from '@aikd/shared'

/** 应用记忆快照 */
export interface ApplicationMemory {
  /** 应用 ID */
  appId: string
  /** 应用名 */
  appName: string
  /** 当前功能 */
  features: string[]
  /** 页面结构 */
  pages: Array<{ id: string; path: string; title: string; pageType: string }>
  /** 数据模型 */
  dataModels: Array<{ name: string; fields: string[] }>
  /** 已加载的 Skills */
  skills: string[]
  /** 用户修改历史 */
  history: Array<{ prompt: string; timestamp: number; summary: string }>
  /** 最新 Blueprint（完整快照） */
  latestBlueprint: Blueprint
  /** 最近更新时间 */
  updatedAt: number
}

/** 应用记忆存储接口（可接入数据库/文件/内存） */
export interface ApplicationMemoryStore {
  get(appId: string): ApplicationMemory | undefined
  set(memory: ApplicationMemory): void
  delete(appId: string): void
}

/** 内存实现（默认） */
export class InMemoryApplicationMemoryStore implements ApplicationMemoryStore {
  private map = new Map<string, ApplicationMemory>()

  get(appId: string): ApplicationMemory | undefined {
    return this.map.get(appId)
  }

  set(memory: ApplicationMemory): void {
    this.map.set(memory.appId, memory)
  }

  delete(appId: string): void {
    this.map.delete(appId)
  }
}

/** Application Memory Manager */
export class ApplicationMemoryManager {
  private store: ApplicationMemoryStore

  constructor(store?: ApplicationMemoryStore) {
    this.store = store ?? new InMemoryApplicationMemoryStore()
  }

  /**
   * 从一次生成结果保存应用记忆。
   */
  remember(input: {
    appId: string
    appName: string
    blueprint: Blueprint
    features: string[]
    skills: string[]
    prompt: string
    summary: string
  }): ApplicationMemory {
    const existing = this.store.get(input.appId)
    const now = Date.now()

    const memory: ApplicationMemory = {
      appId: input.appId,
      appName: input.appName,
      features: Array.from(new Set([...(existing?.features ?? []), ...input.features])),
      pages: input.blueprint.pages.map((p) => ({
        id: p.id,
        path: p.path,
        title: p.title,
        pageType: p.pageType,
      })),
      dataModels: input.blueprint.dataModel.tables.map((t) => ({
        name: t.name,
        fields: t.fields.map((f) => f.name),
      })),
      skills: Array.from(new Set([...(existing?.skills ?? []), ...input.skills])),
      history: [
        ...(existing?.history ?? []),
        { prompt: input.prompt, timestamp: now, summary: input.summary },
      ],
      latestBlueprint: input.blueprint,
      updatedAt: now,
    }

    this.store.set(memory)
    return memory
  }

  /** 读取应用记忆 */
  get(appId: string): ApplicationMemory | undefined {
    return this.store.get(appId)
  }

  /**
   * 生成「增量修改」的上下文提示，用于多轮进化。
   * 让后续修改基于已有应用做增量，而不是重新生成。
   */
  buildEvolutionContext(appId: string): string | undefined {
    const memory = this.store.get(appId)
    if (!memory) return undefined

    const parts: string[] = []
    parts.push('## 已有应用记忆（多轮进化上下文，必须做增量修改，禁止重新生成整个项目）')
    parts.push(`应用名：${memory.appName}`)
    parts.push(`当前功能：${memory.features.join('、')}`)
    parts.push(`页面结构：${memory.pages.map((p) => `${p.title}(${p.path})`).join('、')}`)
    parts.push(`数据模型：${memory.dataModels.map((d) => `${d.name}[${d.fields.join(',')}]`).join('；')}`)
    parts.push(`已加载技能：${memory.skills.join('、')}`)
    if (memory.history.length > 0) {
      parts.push(`修改历史：${memory.history.map((h) => h.prompt).join(' → ')}`)
    }
    return parts.join('\n')
  }
}

/** 默认单例 */
export const applicationMemory = new ApplicationMemoryManager()
