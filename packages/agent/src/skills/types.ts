// ─── AI Skill System · 类型定义 ──────────────────────────
//
// Skill 是 AI快搭 的「工程知识库」单元。每个 Skill 描述一类开发领域的
// 规范、最佳实践、组件推荐与禁止事项。生成应用前，SkillSelector 根据
// 用户需求识别应加载的技能，SkillContextLoader 读取并组装成开发上下文，
// 注入到 Blueprint / Coding 阶段，让 AI 调用专业技能而非自由写代码。

/** Skill 分类：基础 / 业务 / 增强 */
export type SkillCategory = 'foundation' | 'business' | 'enhancement'

/** Skill 定义（对应 skill.md 的结构化描述） */
export interface Skill {
  /** 技能唯一 ID，如 'ecommerce' */
  id: string
  /** 技能名称（中文） */
  name: string
  /** 分类：foundation（基础）/ business（业务）/ enhancement（增强） */
  category: SkillCategory
  /** 技能说明：这个技能解决什么问题 */
  description: string
  /** 适用场景：何时应加载此技能（关键词列表，用于 SkillSelector 匹配） */
  triggers: string[]
  /** 开发规范：生成代码时必须遵守的规则 */
  rules: string[]
  /** 最佳实践：推荐的做法 */
  bestPractices: string[]
  /** 组件推荐：优先复用的组件（Design System / component-registry 组件） */
  components: string[]
  /** 禁止事项：绝不能做的事 */
  prohibitions: string[]
  /** 示例代码片段（可选） */
  examples?: string[]
  /** 依赖的其他技能（加载本技能时一并加载） */
  dependencies?: string[]
  /** 版本号（用于 Feedback Loop 进化追踪） */
  version: number
}

/** Skill 选择结果 */
export interface SkillSelection {
  /** 命中的技能 ID 列表（含依赖展开） */
  skills: string[]
  /** 每个命中的技能的匹配得分 */
  scores: Record<string, number>
  /** 未命中的技能（供调试） */
  unmatched: string[]
}

/** 加载后的技能上下文（注入到 Code Agent） */
export interface SkillContext {
  /** 已加载技能列表 */
  skills: Skill[]
  /** 生成的开发上下文文本（注入 Prompt） */
  contextText: string
  /** 基础技能 + 业务技能 + 增强技能 分组摘要 */
  summary: {
    foundation: string[]
    business: string[]
    enhancement: string[]
  }
}

/** Skill Feedback：测试结果 → 技能进化建议 */
export interface SkillFeedback {
  /** 涉及的技能 ID */
  skillId: string
  /** 反馈类型 */
  kind: 'missing-rule' | 'missing-component' | 'prohibition' | 'new-practice'
  /** 反馈内容（发现的问题/缺失） */
  finding: string
  /** 建议更新（要新增的规范/组件/禁止项） */
  suggestion: string
}
