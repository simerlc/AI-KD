// ─── AI Skill System 测试 ────────────────────────────────
//
// 覆盖：
//   1. Skill Registry（注册/查找/分类）
//   2. Skill Selector（需求 → 技能列表）
//   3. Skill Context Loader（生成开发上下文）
//   4. Skill Feedback Loop（测试结果反馈进化技能）

import { describe, it, expect } from 'vitest'
import {
  SkillRegistry,
  SkillSelector,
  SkillContextLoader,
  SkillFeedbackEngine,
  BUILTIN_SKILLS,
  skillRegistry,
} from '../skills'

// ─── 1. Skill Registry ─────────────────────────────────
describe('Skill Registry', () => {
  it('内置技能库包含核心技能', () => {
    const ids = new Set(BUILTIN_SKILLS.map((s) => s.id))
    expect(ids.has('frontend')).toBe(true)
    expect(ids.has('ui-design')).toBe(true)
    expect(ids.has('responsive')).toBe(true)
    expect(ids.has('ecommerce')).toBe(true)
    expect(ids.has('dashboard')).toBe(true)
    expect(ids.has('crm')).toBe(true)
    expect(ids.has('auth')).toBe(true)
    expect(ids.has('database')).toBe(true)
    expect(ids.has('api')).toBe(true)
    expect(ids.has('animation')).toBe(true)
    expect(ids.has('testing')).toBe(true)
  })

  it('按分类检索技能', () => {
    const foundation = skillRegistry.listByCategory('foundation')
    const business = skillRegistry.listByCategory('business')
    const enhancement = skillRegistry.listByCategory('enhancement')
    expect(foundation.length).toBeGreaterThan(0)
    expect(business.length).toBeGreaterThan(0)
    expect(enhancement.length).toBeGreaterThan(0)
  })

  it('注册自定义技能', () => {
    const reg = new SkillRegistry([])
    reg.register({
      id: 'custom-skill',
      name: '自定义技能',
      category: 'business',
      description: '测试',
      triggers: ['自定义'],
      rules: [],
      bestPractices: [],
      components: [],
      prohibitions: [],
      version: 1,
    })
    expect(reg.has('custom-skill')).toBe(true)
    expect(reg.get('custom-skill')!.name).toBe('自定义技能')
  })
})

// ─── 2. Skill Selector ─────────────────────────────────
describe('Skill Selector', () => {
  const selector = new SkillSelector()

  it('电商需求识别 ecommerce 技能', () => {
    const result = selector.select({ prompt: '创建一个电商网站' })
    expect(result.skills).toContain('ecommerce')
  })

  it('企业后台识别 admin-panel / dashboard 技能', () => {
    const result = selector.select({ prompt: '创建企业后台管理系统' })
    expect(result.skills).toContain('admin-panel')
  })

  it('客户管理识别 crm 技能', () => {
    const result = selector.select({ prompt: '做一个客户关系管理系统' })
    expect(result.skills).toContain('crm')
  })

  it('始终加载基础技能（frontend/ui-design）', () => {
    const result = selector.select({ prompt: '任意需求' })
    expect(result.skills).toContain('frontend')
    expect(result.skills).toContain('ui-design')
  })

  it('电商需求展开依赖技能', () => {
    // ecommerce 依赖 frontend/ui-design/responsive
    const result = selector.select({ prompt: '创建在线商城，支持移动端' })
    expect(result.skills).toContain('ecommerce')
    expect(result.skills).toContain('responsive')
  })

  it('登录需求识别 auth 技能', () => {
    const result = selector.select({ prompt: '做一个带登录注册的用户系统' })
    expect(result.skills).toContain('auth')
  })

  it('飞书妙搭场景：审批需求识别 approval-workflow', () => {
    const result = selector.select({ prompt: '做一个请假审批系统' })
    expect(result.skills).toContain('approval-workflow')
  })

  it('飞书妙搭场景：工单需求识别 ticket-workorder', () => {
    const result = selector.select({ prompt: '问题工单跟踪系统' })
    expect(result.skills).toContain('ticket-workorder')
  })

  it('飞书妙搭场景：人事需求识别 hr-management', () => {
    const result = selector.select({ prompt: '员工人事管理系统' })
    expect(result.skills).toContain('hr-management')
  })

  it('飞书妙搭场景：项目需求识别 project-management', () => {
    const result = selector.select({ prompt: '项目任务跟踪系统' })
    expect(result.skills).toContain('project-management')
  })

  it('飞书妙搭场景：库存需求识别 inventory', () => {
    const result = selector.select({ prompt: '库存出入库管理' })
    expect(result.skills).toContain('inventory')
  })

  it('飞书妙搭场景：问卷需求识别 data-collection', () => {
    const result = selector.select({ prompt: '做一个在线问卷调查' })
    expect(result.skills).toContain('data-collection')
  })

  it('飞书妙搭场景：预约需求识别 booking-reservation', () => {
    const result = selector.select({ prompt: '会议室预约系统' })
    expect(result.skills).toContain('booking-reservation')
  })

  it('飞书妙搭场景：报销需求识别 expense-finance', () => {
    const result = selector.select({ prompt: '费用报销管理系统' })
    expect(result.skills).toContain('expense-finance')
  })

  it('飞书妙搭场景：展示页需求识别 content-showcase', () => {
    const result = selector.select({ prompt: '做一个产品宣传介绍页' })
    expect(result.skills).toContain('content-showcase')
  })
})

// ─── 3. Skill Context Loader ───────────────────────────
describe('Skill Context Loader', () => {
  const loader = new SkillContextLoader()

  it('加载技能并生成开发上下文', () => {
    const ctx = loader.loadByIds(['ecommerce', 'frontend', 'ui-design'])
    expect(ctx.skills.length).toBe(3)
    expect(ctx.contextText).toContain('Loaded Skills')
    expect(ctx.contextText).toContain('电商')
    expect(ctx.contextText).toContain('购物车')
  })

  it('上下文按基础/业务/增强分组', () => {
    const ctx = loader.loadByIds(['frontend', 'ecommerce', 'payment'])
    expect(ctx.summary.foundation).toContain('frontend')
    expect(ctx.summary.business).toContain('ecommerce')
    expect(ctx.summary.enhancement).toContain('payment')
  })

  it('生成摘要文本', () => {
    const ctx = loader.loadByIds(['frontend', 'ecommerce'])
    const text = loader.buildSummaryText(ctx)
    expect(text).toContain('基础')
    expect(text).toContain('业务')
  })
})

// ─── 4. Skill Feedback Loop ────────────────────────────
describe('Skill Feedback Loop', () => {
  it('根据测试错误进化技能（增加规范）', () => {
    const reg = new SkillRegistry()
    const engine = new SkillFeedbackEngine(reg)
    const ecommerceSkill = reg.get('ecommerce')!
    const beforeRules = ecommerceSkill.rules.length

    const applied = engine.feedback({
      appName: '商城',
      errors: ['商品列表缺少搜索筛选功能'],
      loadedSkills: ['ecommerce'],
    })

    expect(applied.length).toBeGreaterThan(0)
    expect(applied[0].skillId).toBe('ecommerce')
    // 技能版本号 +1，规则增加
    const updated = reg.get('ecommerce')!
    expect(updated.version).toBe(ecommerceSkill.version + 1)
    expect(updated.rules.length).toBeGreaterThan(beforeRules)
  })

  it('表单校验错误进化 admin-panel 技能', () => {
    const reg = new SkillRegistry()
    const engine = new SkillFeedbackEngine(reg)
    const applied = engine.feedback({
      errors: ['表单缺少校验'],
      loadedSkills: ['admin-panel'],
    })
    expect(applied.some((f) => f.skillId === 'admin-panel')).toBe(true)
  })

  it('API 异常错误进化 api 技能', () => {
    const reg = new SkillRegistry()
    const engine = new SkillFeedbackEngine(reg)
    const applied = engine.feedback({
      errors: ['接口调用失败未处理异常'],
      loadedSkills: ['api'],
    })
    expect(applied.some((f) => f.skillId === 'api')).toBe(true)
  })

  it('无匹配错误时不产生反馈', () => {
    const reg = new SkillRegistry()
    const engine = new SkillFeedbackEngine(reg)
    const applied = engine.feedback({
      errors: ['无关错误信息'],
      loadedSkills: [],
    })
    expect(applied.length).toBe(0)
  })

  it('重复反馈不重复添加规范（去重）', () => {
    const reg = new SkillRegistry()
    const engine = new SkillFeedbackEngine(reg)
    const skill = reg.get('ecommerce')!
    const beforeRules = skill.rules.length

    engine.feedback({ errors: ['商品列表缺少搜索筛选功能'], loadedSkills: ['ecommerce'] })
    engine.feedback({ errors: ['商品列表缺少搜索筛选功能'], loadedSkills: ['ecommerce'] })

    // 相同建议只添加一次
    expect(reg.get('ecommerce')!.rules.length).toBe(beforeRules + 1)
  })

  it('飞书妙搭：审批错误进化 approval-workflow 技能', () => {
    const reg = new SkillRegistry()
    const engine = new SkillFeedbackEngine(reg)
    const applied = engine.feedback({ errors: ['审批流程缺少二次确认'], loadedSkills: ['approval-workflow'] })
    expect(applied.some((f) => f.skillId === 'approval-workflow')).toBe(true)
  })

  it('飞书妙搭：报销错误归类到 expense-finance 而非 approval-workflow', () => {
    const reg = new SkillRegistry()
    const engine = new SkillFeedbackEngine(reg)
    const applied = engine.feedback({ errors: ['报销金额缺少校验'], loadedSkills: [] })
    expect(applied.some((f) => f.skillId === 'expense-finance')).toBe(true)
    expect(applied.some((f) => f.skillId === 'approval-workflow')).toBe(false)
  })

  it('飞书妙搭：工单错误进化 ticket-workorder 技能', () => {
    const reg = new SkillRegistry()
    const engine = new SkillFeedbackEngine(reg)
    const applied = engine.feedback({ errors: ['工单缺少状态流转'], loadedSkills: ['ticket-workorder'] })
    expect(applied.some((f) => f.skillId === 'ticket-workorder')).toBe(true)
  })
})
