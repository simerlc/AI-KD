// ─── Skill Selector Agent ────────────────────────────────
//
// 输入：用户需求
// 输出：需要加载的技能列表。
//
// 例如：
//   "创建一个电商网站" → [ecommerce, frontend, ui-design, responsive, ...]
//   "创建企业后台"     → [admin-panel, dashboard, data-visualization, ...]
//
// 匹配策略：关键词打分 + 分类加权 + 依赖展开 + 基础技能兜底。

import type { Skill, SkillSelection } from './types'
import { SkillRegistry, skillRegistry } from './registry'

export interface SkillSelectorInput {
  /** 用户原始需求 */
  prompt: string
  /** 需求分析结果（可选，含功能点/实体，提升匹配精度） */
  requirement?: {
    summary?: string
    appType?: string
    appName?: string
    features?: string[]
    entities?: Array<{ name: string; description: string }>
  }
  /** 最大技能数量（默认 8） */
  maxSkills?: number
}

export class SkillSelector {
  private registry: SkillRegistry

  constructor(registry: SkillRegistry = skillRegistry) {
    this.registry = registry
  }

  /**
   * 根据需求选择应加载的技能列表。
   * 返回技能 ID 列表（含依赖展开 + 基础技能兜底）。
   */
  select(input: SkillSelectorInput): SkillSelection {
    const text = this.buildSearchText(input)
    const scores: Record<string, number> = {}
    const unmatched: string[] = []

    for (const skill of this.registry.list()) {
      let score = 0
      for (const trigger of skill.triggers) {
        if (text.includes(trigger.toLowerCase())) {
          // 触发词越长越精准（如 "购物车" > "购"）
          score += trigger.length >= 2 ? 3 : 1
        }
      }
      if (score > 0) {
        scores[skill.id] = score
      } else {
        unmatched.push(skill.id)
      }
    }

    // 依赖展开：命中的技能若声明依赖，一并加入
    const selected = new Set<string>()
    const visited = new Set<string>()
    const expand = (id: string) => {
      if (visited.has(id)) return
      visited.add(id)
      selected.add(id)
      const skill = this.registry.get(id)
      if (skill?.dependencies) {
        for (const dep of skill.dependencies) expand(dep)
      }
    }
    for (const id of Object.keys(scores).sort((a, b) => scores[b] - scores[a])) {
      expand(id)
    }

    // 基础技能兜底：前端工程化 + UI 设计永远加载（保证最低质量）
    for (const base of ['frontend', 'ui-design']) {
      if (!selected.has(base) && this.registry.has(base)) {
        selected.add(base)
        scores[base] = scores[base] ?? 0
      }
    }

    const max = input.maxSkills ?? 8
    const skills = Array.from(selected).slice(0, max)

    return { skills, scores, unmatched }
  }

  /** 便捷：仅返回技能 ID 列表 */
  selectIds(input: SkillSelectorInput): string[] {
    return this.select(input).skills
  }

  private buildSearchText(input: SkillSelectorInput): string {
    const parts: string[] = [input.prompt]
    const req = input.requirement
    if (req) {
      if (req.summary) parts.push(req.summary)
      if (req.appType) parts.push(req.appType)
      if (req.appName) parts.push(req.appName)
      if (req.features) parts.push(req.features.join(' '))
      if (req.entities) parts.push(req.entities.map((e) => `${e.name} ${e.description}`).join(' '))
    }
    return parts.join(' ').toLowerCase()
  }
}

/** 默认 Skill Selector */
export const skillSelector = new SkillSelector()
