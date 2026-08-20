// ─── Skill Registry ──────────────────────────────────────
//
// 技能注册中心。管理所有可用技能的注册、查找、分类检索，
// 支持运行时扩展（register 新技能）、技能进化（feedback 更新）。

import type { Skill, SkillCategory } from './types'
import { BUILTIN_SKILLS } from './builtin'

export class SkillRegistry {
  private skills = new Map<string, Skill>()

  constructor(initial?: Skill[]) {
    const list = initial ?? BUILTIN_SKILLS
    for (const s of list) this.register(s)
  }

  /** 注册一个技能（已存在则覆盖） */
  register(skill: Skill): void {
    this.skills.set(skill.id, skill)
  }

  /** 批量注册 */
  registerAll(skills: Skill[]): void {
    for (const s of skills) this.register(s)
  }

  /** 获取技能 */
  get(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  /** 判断技能是否存在 */
  has(id: string): boolean {
    return this.skills.has(id)
  }

  /** 列出所有技能 */
  list(): Skill[] {
    return Array.from(this.skills.values())
  }

  /** 按分类获取技能 */
  listByCategory(category: SkillCategory): Skill[] {
    return this.list().filter((s) => s.category === category)
  }

  /** 按 ID 列表批量获取技能（跳过不存在的） */
  getMany(ids: string[]): Skill[] {
    const result: Skill[] = []
    for (const id of ids) {
      const s = this.skills.get(id)
      if (s) result.push(s)
    }
    return result
  }

  /** 更新技能（用于 Feedback Loop 进化） */
  update(id: string, patch: Partial<Skill>): Skill | undefined {
    const existing = this.skills.get(id)
    if (!existing) return undefined
    const updated: Skill = {
      ...existing,
      ...patch,
      // 版本号自动 +1
      version: existing.version + 1,
      id: existing.id,
    }
    this.skills.set(id, updated)
    return updated
  }

  /** 获取全部技能分类 */
  categories(): SkillCategory[] {
    const set = new Set<SkillCategory>()
    for (const s of this.skills.values()) set.add(s.category)
    return Array.from(set)
  }
}

/** 默认技能注册表（加载内置技能） */
export const skillRegistry = new SkillRegistry()
