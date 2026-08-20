// ─── Design System · 页面模板系统 ────────────────────────
//
// 常用应用模板。AI 生成应用时应优先「组合模板」，而非从零创建页面。
// 每个模板描述：页面骨架 + 推荐的组件组合 + 布局结构，
// 供 BlueprintAgent / CodingAgent 参考，保证生成结果具备统一商业级结构。

/** 页面区块（模板的结构单元） */
export interface TemplateSection {
  /** 区块用途（如 header / stats / table / form / footer） */
  role: string
  /** 建议使用的 Design System 组件 */
  components: string[]
  /** 区块说明 */
  description: string
}

/** 页面模板 */
export interface PageTemplate {
  /** 模板 ID */
  id: string
  /** 模板名 */
  name: string
  /** 模板分类 */
  category: 'dashboard' | 'admin' | 'crm' | 'ecommerce' | 'landing'
  /** 适用场景描述 */
  description: string
  /** 推荐布局骨架（区块顺序） */
  sections: TemplateSection[]
  /** 推荐的路由结构 */
  routes: Array<{ path: string; title: string; pageType: string }>
  /** 关键交互要求 */
  interactions: string[]
}

/** 页面模板库 */
export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'saas-dashboard',
    name: 'SaaS Dashboard',
    category: 'dashboard',
    description: '现代 SaaS 数据看板：指标卡 + 图表 + 近期活动',
    sections: [
      { role: 'header', components: ['Navbar'], description: '顶部导航：产品名 + 主导航 + 用户头像' },
      { role: 'stats', components: ['Card', 'Badge'], description: '关键指标卡（StatCard 组合），含趋势徽章' },
      { role: 'charts', components: ['Card', 'Chart'], description: '数据可视化区域' },
      { role: 'activity', components: ['Card', 'Table', 'Badge'], description: '近期活动/列表' },
    ],
    routes: [
      { path: '/', title: '总览', pageType: 'dashboard' },
      { path: '/analytics', title: '分析', pageType: 'dashboard' },
      { path: '/settings', title: '设置', pageType: 'form' },
    ],
    interactions: ['数据加载 Loading 态', '指标卡悬浮提示', '图表数据为空时的 Empty 态'],
  },
  {
    id: 'admin-panel',
    name: 'Admin Panel',
    category: 'admin',
    description: '数据管理后台：侧边栏 + 列表 + 增删改查',
    sections: [
      { role: 'sidebar', components: ['Sidebar'], description: '侧边导航：分组菜单' },
      { role: 'toolbar', components: ['Button', 'Input'], description: '搜索 + 新增按钮' },
      { role: 'table', components: ['Table', 'Badge'], description: '数据列表（含操作列）' },
      { role: 'form', components: ['Form', 'Input', 'Select', 'Modal'], description: '新增/编辑表单' },
    ],
    routes: [
      { path: '/', title: '列表', pageType: 'list' },
      { path: '/new', title: '新增', pageType: 'form' },
      { path: '/:id/edit', title: '编辑', pageType: 'form' },
    ],
    interactions: ['删除二次确认', '表单校验', '保存成功/失败反馈', '空列表 Empty 态'],
  },
  {
    id: 'crm',
    name: 'CRM',
    category: 'crm',
    description: '客户关系管理：客户列表 + 详情 + 跟进记录',
    sections: [
      { role: 'sidebar', components: ['Sidebar'], description: '侧边导航' },
      { role: 'list', components: ['Table', 'Badge', 'Avatar'], description: '客户列表（含头像/状态徽章）' },
      { role: 'detail', components: ['Card', 'Tabs', 'Detail'], description: '客户详情页' },
      { role: 'timeline', components: ['Card', 'List'], description: '跟进记录时间线' },
    ],
    routes: [
      { path: '/', title: '客户', pageType: 'list' },
      { path: '/customers/:id', title: '客户详情', pageType: 'detail' },
      { path: '/customers/new', title: '新增客户', pageType: 'form' },
    ],
    interactions: ['客户状态徽章', '详情页 Tabs 切换', '新增客户表单校验'],
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    category: 'ecommerce',
    description: '电商：商品列表 + 商品详情 + 购物车 + 下单',
    sections: [
      { role: 'header', components: ['Navbar', 'Badge'], description: '顶部导航 + 购物车角标' },
      { role: 'catalog', components: ['Card', 'Grid', 'Badge'], description: '商品网格卡片' },
      { role: 'detail', components: ['Card', 'Button', 'Detail'], description: '商品详情 + 加入购物车' },
      { role: 'cart', components: ['Table', 'Button'], description: '购物车清单' },
      { role: 'checkout', components: ['Form', 'Input'], description: '下单表单' },
    ],
    routes: [
      { path: '/', title: '首页', pageType: 'home' },
      { path: '/products/:id', title: '商品详情', pageType: 'detail' },
      { path: '/cart', title: '购物车', pageType: 'list' },
      { path: '/checkout', title: '结算', pageType: 'form' },
    ],
    interactions: ['加入购物车反馈', '库存状态徽章', '下单成功反馈'],
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    category: 'landing',
    description: '营销落地页：Hero + 特性 + 定价 + CTA',
    sections: [
      { role: 'hero', components: ['Navbar', 'Button', 'Heading'], description: 'Hero 区：主标题 + CTA 按钮' },
      { role: 'features', components: ['Card', 'Grid'], description: '特性卡片网格' },
      { role: 'pricing', components: ['Card', 'Button', 'Badge'], description: '定价方案卡片' },
      { role: 'cta', components: ['Button', 'Card'], description: '最终行动号召' },
      { role: 'footer', components: ['Footer'], description: '页脚' },
    ],
    routes: [
      { path: '/', title: '首页', pageType: 'home' },
    ],
    interactions: ['CTA 按钮跳转', '定价卡片高亮', '移动端响应式'],
  },
]

/** 按分类获取模板 */
export function getTemplatesByCategory(category: PageTemplate['category']): PageTemplate[] {
  return PAGE_TEMPLATES.filter((t) => t.category === category)
}

/** 按 id 获取模板 */
export function getTemplate(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id)
}

/**
 * 根据应用名称/描述推断最合适的页面模板。
 * 用于 BlueprintAgent 生成前的模板推荐（让生成结果直接落在成熟模板骨架上）。
 */
export function recommendTemplate(input: {
  appName?: string
  description?: string
  features?: string[]
}): PageTemplate {
  const text = `${input.appName ?? ''} ${input.description ?? ''} ${(input.features ?? []).join(' ')}`.toLowerCase()

  const score: Record<string, number> = {
    'saas-dashboard': 0,
    'admin-panel': 0,
    crm: 0,
    ecommerce: 0,
    'landing-page': 0,
  }

  // 关键词规则：value 为权重，强业务信号词权重更高
  const rules: Array<{ template: string; keywords: Array<[string, number]> }> = [
    { template: 'crm', keywords: [['客户', 4], ['crm', 4], ['销售', 3], ['跟进', 3], ['客户关系', 4], ['线索', 3], ['customer', 3]] },
    { template: 'ecommerce', keywords: [['商城', 4], ['电商', 4], ['商品', 3], ['购物车', 4], ['下单', 4], ['订单', 3], ['店铺', 3], ['shop', 3], ['store', 3], ['product', 3]] },
    { template: 'landing-page', keywords: [['落地页', 4], ['官网', 4], ['营销', 3], ['landing', 3], ['宣传', 3], ['首页', 2], ['品牌', 3]] },
    { template: 'admin-panel', keywords: [['后台', 4], ['管理', 2], ['admin', 3], ['数据管理', 4], ['配置', 2], ['列表', 2]] },
    { template: 'saas-dashboard', keywords: [['看板', 4], ['仪表', 4], ['dashboard', 4], ['分析', 3], ['统计', 3], ['总览', 3], ['监控', 3]] },
  ]
  for (const r of rules) {
    for (const [kw, weight] of r.keywords) {
      if (text.includes(kw)) score[r.template] += weight
    }
  }
  // 默认偏向 dashboard
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0][0]
  return getTemplate(best) ?? PAGE_TEMPLATES[0]
}

/** 模板清单（供 Prompt 注入） */
export function templatesToPromptDescription(): string {
  return PAGE_TEMPLATES.map((t) => {
    const sections = t.sections.map((s) => `    - ${s.role}: ${s.components.join('/')} — ${s.description}`).join('\n')
    const routes = t.routes.map((r) => `    - ${r.path} (${r.pageType})`).join('\n')
    return `### ${t.name}（${t.category}）
${t.description}
区块结构：
${sections}
推荐路由：
${routes}
`
  }).join('\n')
}
