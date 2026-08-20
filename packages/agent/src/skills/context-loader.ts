// ─── Skill Context Loader ────────────────────────────────
//
// 代码生成前：自动读取相关 Skill，生成「开发上下文」注入 Code Agent。
//
// 流程：User Prompt → Skill Selector → 读取 Skill 文件 → 生成开发上下文 → Code Agent
//
// 生成上下文按「基础技能 + 业务技能 + 增强技能」分组，包含每个技能的
// 规范、最佳实践、组件推荐、禁止事项，让 Code Agent 据此生成专业应用。

import type { Skill, SkillContext } from './types'
import { SkillRegistry, skillRegistry } from './registry'
import type { SkillSelection } from './types'

export class SkillContextLoader {
  private registry: SkillRegistry

  constructor(registry: SkillRegistry = skillRegistry) {
    this.registry = registry
  }

  /**
   * 根据技能 ID 列表加载技能并生成开发上下文。
   */
  load(selection: SkillSelection): SkillContext {
    const skills: Skill[] = this.registry.getMany(selection.skills)

    const foundation = skills.filter((s) => s.category === 'foundation').map((s) => s.id)
    const business = skills.filter((s) => s.category === 'business').map((s) => s.id)
    const enhancement = skills.filter((s) => s.category === 'enhancement').map((s) => s.id)

    return {
      skills,
      contextText: this.buildContextText(skills),
      summary: { foundation, business, enhancement },
    }
  }

  /** 便捷：从技能 ID 列表直接加载 */
  loadByIds(ids: string[]): SkillContext {
    return this.load({ skills: ids, scores: {}, unmatched: [] })
  }

  /** 生成开发上下文文本（注入 Prompt） */
  buildContextText(skills: Skill[]): string {
    const lines: string[] = []
    lines.push('## Loaded Skills（已加载的专业开发技能）')
    lines.push('')
    lines.push('你必须严格遵守以下技能的开发规范，调用专业技能开发软件，而不是自由写代码。')
    lines.push('')

    const byCategory = (cat: Skill['category']) => skills.filter((s) => s.category === cat)
    const categories: Array<{ cat: Skill['category']; label: string }> = [
      { cat: 'foundation', label: '基础技能' },
      { cat: 'business', label: '业务技能' },
      { cat: 'enhancement', label: '增强技能' },
    ]

    for (const { cat, label } of categories) {
      const group = byCategory(cat)
      if (group.length === 0) continue
      lines.push(`### ${label}`)
      lines.push('')
      for (const skill of group) {
        lines.push(`#### ${skill.name}（${skill.id}）`)
        lines.push(`说明：${skill.description}`)
        if (skill.rules.length > 0) {
          lines.push(`开发规范：`)
          for (const r of skill.rules) lines.push(`- ${r}`)
        }
        if (skill.bestPractices.length > 0) {
          lines.push(`最佳实践：`)
          for (const p of skill.bestPractices) lines.push(`- ${p}`)
        }
        if (skill.components.length > 0) {
          lines.push(`组件推荐：${skill.components.join('、')}`)
        }
        if (skill.prohibitions.length > 0) {
          lines.push(`禁止事项：`)
          for (const p of skill.prohibitions) lines.push(`- ${p}`)
        }
        if (skill.examples && skill.examples.length > 0) {
          lines.push(`示例：`)
          for (const e of skill.examples) lines.push(`- ${e}`)
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  /** 生成「基础 + 业务 + 增强」分组摘要文本（用于进度展示） */
  buildSummaryText(ctx: SkillContext): string {
    const parts: string[] = []
    if (ctx.summary.foundation.length) parts.push(`基础：${ctx.summary.foundation.join(', ')}`)
    if (ctx.summary.business.length) parts.push(`业务：${ctx.summary.business.join(', ')}`)
    if (ctx.summary.enhancement.length) parts.push(`增强：${ctx.summary.enhancement.join(', ')}`)
    return parts.join(' | ')
  }
}

/** 默认 Skill Context Loader */
export const skillContextLoader = new SkillContextLoader()
