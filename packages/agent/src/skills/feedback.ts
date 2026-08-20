// ─── Skill Feedback Loop ─────────────────────────────────
//
// 应用生成后：根据测试结果更新 Skill，让技能不断进化。
//
// 例如：发现大量商城页面缺少搜索优化 → 更新 ecommerce skill，
//       增加「搜索规范 / 过滤组件 / 排序逻辑」。
//
// 目标：让 AI快搭 拥有自己的工程知识库，从「AI 写代码」升级为「AI 调用专业技能开发软件」。

import type { Skill, SkillFeedback } from './types'
import { SkillRegistry, skillRegistry } from './registry'

/** Feedback 输入：测试结果摘要 */
export interface FeedbackInput {
  /** 应用名称/类型（用于定位相关技能） */
  appName?: string
  /** 用户需求（用于识别技能） */
  prompt?: string
  /** 测试失败的错误信息列表 */
  errors: string[]
  /** 本次加载的技能 ID 列表 */
  loadedSkills: string[]
}

/**
 * Skill Feedback Engine。
 * 根据测试结果生成技能进化建议，并应用到技能注册表。
 */
export class SkillFeedbackEngine {
  private registry: SkillRegistry

  constructor(registry: SkillRegistry = skillRegistry) {
    this.registry = registry
  }

  /**
   * 分析测试结果，生成技能进化反馈。
   * 返回本次实际应用的更新列表。
   */
  feedback(input: FeedbackInput): SkillFeedback[] {
    const feedbacks = this.analyze(input)
    const applied: SkillFeedback[] = []

    for (const fb of feedbacks) {
      const skill = this.registry.get(fb.skillId)
      if (!skill) continue
      const updated = this.applyFeedback(skill, fb)
      if (updated) {
        this.registry.update(skill.id, updated)
        applied.push(fb)
      }
    }

    return applied
  }

  /** 分析错误，映射到具体技能的进化建议 */
  analyze(input: FeedbackInput): SkillFeedback[] {
    const feedbacks: SkillFeedback[] = []

    // 根据错误关键词匹配到应强化的技能
    for (const err of input.errors) {
      const lower = err.toLowerCase()
      const fb = this.mapErrorToFeedback(lower)
      if (fb) feedbacks.push(fb)
    }

    return feedbacks
  }

  /** 将错误映射为技能进化反馈 */
  private mapErrorToFeedback(err: string): SkillFeedback | null {
    // 报销财务（先于审批流程匹配，避免"报销"被归类为通用审批）
    if (/报销|财务|费用|付款|发票|expense|finance/.test(err)) {
      return {
        skillId: 'expense-finance',
        kind: 'missing-rule',
        finding: '报销/财务流程不完整',
        suggestion: '完善金额校验、报销状态流转与费用统计规范',
      }
    }
    // 审批流程
    if (/审批|请假|会签|采购|合同|workflow|approval/.test(err)) {
      return {
        skillId: 'approval-workflow',
        kind: 'missing-rule',
        finding: '审批流程不完整',
        suggestion: '完善审批状态流转、二次确认与流转时间线规范',
      }
    }
    // 工单管理
    if (/工单|派单|报修|ticket|workorder/.test(err)) {
      return {
        skillId: 'ticket-workorder',
        kind: 'missing-rule',
        finding: '工单管理不完整',
        suggestion: '完善工单状态流转、优先级与处理记录规范',
      }
    }
    // 人事管理
    if (/员工|人事|考勤|入职|离职|hr/.test(err)) {
      return {
        skillId: 'hr-management',
        kind: 'missing-rule',
        finding: '人事管理不完整',
        suggestion: '完善员工状态、考勤异常与异动记录规范',
      }
    }
    // 项目管理
    if (/项目|任务|里程碑|进度|project|task/.test(err)) {
      return {
        skillId: 'project-management',
        kind: 'missing-rule',
        finding: '项目管理不完整',
        suggestion: '完善任务状态流转、进度展示与里程碑规范',
      }
    }
    // 库存管理
    if (/库存|出入库|盘点|仓库|inventory|stock/.test(err)) {
      return {
        skillId: 'inventory',
        kind: 'missing-rule',
        finding: '库存管理不完整',
        suggestion: '完善库存状态、出入库记录与预警规范',
      }
    }
    // 数据收集
    if (/问卷|调查|登记|投票|收集|survey/.test(err)) {
      return {
        skillId: 'data-collection',
        kind: 'missing-rule',
        finding: '数据收集表单不完整',
        suggestion: '完善表单字段校验、提交反馈与结果统计规范',
      }
    }
    // 预约点餐
    if (/预约|订座|点餐|预订|booking|reservation/.test(err)) {
      return {
        skillId: 'booking-reservation',
        kind: 'missing-rule',
        finding: '预约/点餐系统不完整',
        suggestion: '完善预约状态、时段选择与确认反馈规范',
      }
    }
    // 内容展示
    if (/介绍|宣传|手册|菜单|展示页|落地页|landing/.test(err)) {
      return {
        skillId: 'content-showcase',
        kind: 'missing-rule',
        finding: '内容展示页不完整',
        suggestion: '完善 Hero/分区/CTA 结构与响应式规范',
      }
    }
    // 电商相关
    if (/搜索|筛选|排序|search|filter|sort/.test(err)) {
      return {
        skillId: 'ecommerce',
        kind: 'missing-rule',
        finding: '商品列表缺少搜索/筛选/排序',
        suggestion: '增加搜索规范、过滤组件、排序逻辑',
      }
    }
    if (/购物车|cart|下单|订单|支付|checkout/.test(err)) {
      return {
        skillId: 'ecommerce',
        kind: 'missing-rule',
        finding: '购物车/订单流程不完整',
        suggestion: '完善购物车、订单状态流转与支付流程规范',
      }
    }
    // 后台/表格
    if (/表格|table|列表|分页|pagination/.test(err)) {
      return {
        skillId: 'admin-panel',
        kind: 'missing-rule',
        finding: '列表/表格交互不完整',
        suggestion: '增加表格分页、空态、操作列规范',
      }
    }
    if (/表单|校验|form|validate/.test(err)) {
      return {
        skillId: 'admin-panel',
        kind: 'missing-rule',
        finding: '表单缺少校验',
        suggestion: '增加表单必填/格式校验规范',
      }
    }
    // UI / 响应式
    if (/响应式|移动端|responsive|mobile|溢出/.test(err)) {
      return {
        skillId: 'responsive',
        kind: 'missing-rule',
        finding: '移动端响应式不完整',
        suggestion: '增加移动端断点与单列折叠规范',
      }
    }
    if (/硬编码|颜色|样式|style|css/.test(err)) {
      return {
        skillId: 'ui-design',
        kind: 'missing-rule',
        finding: '存在硬编码颜色或非规范样式',
        suggestion: '强制使用 Design Token，禁止硬编码颜色',
      }
    }
    // API / 异常
    if (/接口|api|异常|error|catch|失败/.test(err)) {
      return {
        skillId: 'api',
        kind: 'missing-rule',
        finding: 'API 调用未处理异常',
        suggestion: '所有 API 调用必须 try/catch 并处理 error 状态',
      }
    }
    // 空态/加载
    if (/空态|empty|加载|loading|空白/.test(err)) {
      return {
        skillId: 'ui-design',
        kind: 'missing-rule',
        finding: '缺少 Loading / Empty 状态',
        suggestion: '所有数据区必须包含 Loading 与 Empty 状态',
      }
    }

    return null
  }

  /** 将反馈应用到技能（去重后合并） */
  private applyFeedback(skill: Skill, fb: SkillFeedback): Partial<Skill> | null {
    const patch: Partial<Skill> = {}

    if (fb.kind === 'missing-rule' || fb.kind === 'new-practice') {
      if (!skill.rules.includes(fb.suggestion)) {
        patch.rules = [...skill.rules, fb.suggestion]
      }
    }
    if (fb.kind === 'missing-component') {
      if (!skill.components.includes(fb.suggestion)) {
        patch.components = [...skill.components, fb.suggestion]
      }
    }
    if (fb.kind === 'prohibition') {
      if (!skill.prohibitions.includes(fb.suggestion)) {
        patch.prohibitions = [...skill.prohibitions, fb.suggestion]
      }
    }

    // 无实际变更则返回 null
    if (Object.keys(patch).length === 0) return null
    return patch
  }
}

/** 默认 Skill Feedback Engine */
export const skillFeedbackEngine = new SkillFeedbackEngine()
