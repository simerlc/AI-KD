// ─── Application Pattern Library ─────────────────────────
//
// 应用模式库。每个 Pattern 定义一类真实应用的：
//   - 页面结构（pages）
//   - 功能模块（modules）
//   - 数据模型（dataModels）
//   - 推荐组件（components）
//   - 用户流程（userFlows）
//
// AI 生成应用时优先组合 Pattern，禁止所有应用使用同一种模板。

/** 应用模式定义 */
export interface AppPattern {
  /** 模式 ID */
  id: string
  /** 模式名（中文） */
  name: string
  /** 分类 */
  category: string
  /** 适用场景描述 */
  description: string
  /** 触发关键词（用于 recommendPattern 匹配） */
  triggers: string[]
  /** 页面结构：每个页面的角色 + 说明 */
  pages: Array<{ role: string; pageType: string; title: string; description: string }>
  /** 功能模块 */
  modules: string[]
  /** 数据模型 */
  dataModels: Array<{ name: string; description: string; fields: string[] }>
  /** 推荐组件（Design System / component-registry） */
  components: string[]
  /** 用户流程 */
  userFlows: string[]
  /** 进阶能力（Enhancement Agent 可补充） */
  advancedCapabilities: string[]
}

/** 应用模式库 */
export const APP_PATTERNS: AppPattern[] = [
  {
    id: 'knowledge-app',
    name: '知识管理应用',
    category: 'productivity',
    description: '笔记/文档/知识库（如 Notion、语雀）',
    triggers: ['笔记', '知识', '文档', 'wiki', '知识库', 'note', 'markdown', '学习笔记', 'knowledge'],
    pages: [
      { role: 'home', pageType: 'home', title: '首页', description: '最近笔记、收藏、快捷入口' },
      { role: 'note-list', pageType: 'list', title: '笔记列表', description: '笔记卡片列表，支持分类/标签筛选' },
      { role: 'editor', pageType: 'custom', title: '编辑器', description: 'Markdown 编辑器 + 实时预览' },
      { role: 'note-detail', pageType: 'detail', title: '笔记详情', description: '笔记阅读 + 标签 + 收藏' },
      { role: 'search', pageType: 'list', title: '搜索', description: '全文搜索 + 结果高亮' },
      { role: 'stats', pageType: 'dashboard', title: '统计', description: '学习/写作统计' },
    ],
    modules: ['笔记创建与编辑', 'Markdown 支持', '分类管理', '标签系统', '全文搜索', '收藏', '历史记录', '知识关联'],
    dataModels: [
      { name: 'Note', description: '笔记', fields: ['id', 'title', 'content', 'categoryId', 'tags', 'isFavorite', 'createdAt', 'updatedAt'] },
      { name: 'Category', description: '分类', fields: ['id', 'name', 'parentId'] },
      { name: 'Tag', description: '标签', fields: ['id', 'name', 'color'] },
    ],
    components: ['Sidebar', 'Navbar', 'Card', 'Input', 'Button', 'Badge', 'Tabs', 'List', 'Modal'],
    userFlows: ['浏览笔记列表 → 打开笔记详情 → 编辑 → 保存', '首页搜索 → 结果列表 → 打开笔记', '新建笔记 → 编辑器 → 选择分类/标签 → 保存'],
    advancedCapabilities: ['AI 总结', '知识关联图谱', '学习统计', '协同编辑', '版本历史'],
  },
  {
    id: 'crm-system',
    name: 'CRM 客户关系管理',
    category: 'business',
    description: '客户/销售/跟进管理（如 Salesforce）',
    triggers: ['客户', 'crm', '销售', '跟进', '客户关系', '线索', '商机', 'customer', 'lead'],
    pages: [
      { role: 'dashboard', pageType: 'dashboard', title: '销售看板', description: '销售漏斗、业绩统计' },
      { role: 'customer-list', pageType: 'list', title: '客户列表', description: '客户列表 + 搜索 + 状态筛选' },
      { role: 'customer-detail', pageType: 'detail', title: '客户详情', description: '客户信息 + 跟进记录时间线' },
      { role: 'customer-form', pageType: 'form', title: '新增/编辑客户', description: '客户信息表单' },
      { role: 'lead-list', pageType: 'list', title: '线索管理', description: '销售线索池' },
    ],
    modules: ['客户管理', '线索管理', '跟进记录', '销售漏斗', '商机管理', '业绩统计', '客户标签'],
    dataModels: [
      { name: 'Customer', description: '客户', fields: ['id', 'name', 'company', 'phone', 'status', 'ownerId', 'createdAt'] },
      { name: 'Lead', description: '线索', fields: ['id', 'name', 'source', 'status', 'ownerId'] },
      { name: 'FollowUp', description: '跟进记录', fields: ['id', 'customerId', 'content', 'followUpAt'] },
    ],
    components: ['Sidebar', 'Table', 'Avatar', 'Badge', 'Card', 'Tabs', 'Form', 'Input', 'Modal', 'Dashboard', 'StatCard'],
    userFlows: ['客户列表 → 搜索 → 打开详情 → 添加跟进', '线索 → 转化为客户 → 录入信息', '销售看板 → 查看漏斗 → 钻取客户'],
    advancedCapabilities: ['销售预测', '客户画像', '自动分配', '邮件集成', '数据分析'],
  },
  {
    id: 'erp-system',
    name: 'ERP 企业资源管理',
    category: 'business',
    description: '采购/库存/订单/财务一体化',
    triggers: ['erp', '采购', '库存', '财务', '供应链', '进销存', '企业资源', '物料'],
    pages: [
      { role: 'dashboard', pageType: 'dashboard', title: '运营总览', description: '关键经营指标' },
      { role: 'purchase-list', pageType: 'list', title: '采购管理', description: '采购订单列表' },
      { role: 'inventory-list', pageType: 'list', title: '库存管理', description: '库存列表 + 出入库' },
      { role: 'order-list', pageType: 'list', title: '订单管理', description: '销售订单' },
      { role: 'finance', pageType: 'dashboard', title: '财务统计', description: '收支统计' },
    ],
    modules: ['采购管理', '库存管理', '订单管理', '财务管理', '供应商管理', '报表统计', '审批流程'],
    dataModels: [
      { name: 'PurchaseOrder', description: '采购订单', fields: ['id', 'supplierId', 'items', 'total', 'status', 'createdAt'] },
      { name: 'Inventory', description: '库存', fields: ['id', 'productId', 'quantity', 'warehouseId', 'updatedAt'] },
      { name: 'SalesOrder', description: '销售订单', fields: ['id', 'customerId', 'items', 'total', 'status'] },
    ],
    components: ['Sidebar', 'Table', 'Badge', 'Form', 'Modal', 'Dashboard', 'StatCard', 'Chart'],
    userFlows: ['采购下单 → 入库 → 库存更新', '销售下单 → 出库 → 库存扣减', '总览 → 钻取明细 → 导出报表'],
    advancedCapabilities: ['智能补货', '成本核算', '多仓库管理', '审批流', '财务对账'],
  },
  {
    id: 'dashboard',
    name: '数据看板',
    category: 'analytics',
    description: '数据指标可视化（如 Grafana、Tableau）',
    triggers: ['看板', '仪表盘', 'dashboard', '统计', '可视化', '指标', '监控', '分析', '报表'],
    pages: [
      { role: 'overview', pageType: 'dashboard', title: '总览', description: '核心指标 + 趋势' },
      { role: 'analytics', pageType: 'dashboard', title: '分析', description: '多维度分析图表' },
      { role: 'report', pageType: 'list', title: '报表', description: '报表列表 + 导出' },
    ],
    modules: ['指标卡片', '趋势图表', '多维分析', '数据钻取', '报表导出', '告警监控'],
    dataModels: [
      { name: 'Metric', description: '指标', fields: ['id', 'name', 'value', 'trend', 'dimension', 'recordedAt'] },
    ],
    components: ['Dashboard', 'StatCard', 'Chart', 'Card', 'Grid', 'Table', 'Badge'],
    userFlows: ['总览 → 查看趋势 → 钻取明细', '筛选维度 → 更新图表', '生成报表 → 导出'],
    advancedCapabilities: ['实时数据流', '异常检测', '自定义报表', '数据大屏'],
  },
  {
    id: 'community',
    name: '社区/论坛',
    category: 'social',
    description: '用户社区、问答、内容互动（如 Reddit、知乎）',
    triggers: ['社区', '论坛', '问答', '讨论', '帖子', '评论', '圈子', '社区论坛', 'forum', 'community'],
    pages: [
      { role: 'home', pageType: 'home', title: '首页', description: '帖子流 + 热门/最新' },
      { role: 'post-detail', pageType: 'detail', title: '帖子详情', description: '帖子 + 评论区' },
      { role: 'post-editor', pageType: 'form', title: '发帖', description: '发帖编辑器' },
      { role: 'user-profile', pageType: 'detail', title: '个人主页', description: '用户信息 + 动态' },
    ],
    modules: ['发帖', '评论', '点赞', '关注', '话题标签', '热门排序', '通知'],
    dataModels: [
      { name: 'Post', description: '帖子', fields: ['id', 'authorId', 'title', 'content', 'topicId', 'likes', 'createdAt'] },
      { name: 'Comment', description: '评论', fields: ['id', 'postId', 'authorId', 'content', 'createdAt'] },
      { name: 'Topic', description: '话题', fields: ['id', 'name', 'description'] },
    ],
    components: ['Navbar', 'Card', 'Avatar', 'Badge', 'Button', 'Input', 'List', 'Tabs', 'Modal'],
    userFlows: ['浏览首页 → 打开帖子 → 评论/点赞', '发帖 → 选择话题 → 发布', '关注用户 → 查看动态'],
    advancedCapabilities: ['推荐算法', '内容审核', '私信', '积分系统', '搜索'],
  },
  {
    id: 'ecommerce',
    name: '电商',
    category: 'commerce',
    description: '在线商城（如淘宝、Shopify）',
    triggers: ['商城', '电商', '购物', '商品', '下单', '购物车', '店铺', 'shop', 'store', 'ecommerce', 'product'],
    pages: [
      { role: 'home', pageType: 'home', title: '首页', description: '轮播 + 推荐商品' },
      { role: 'product-list', pageType: 'list', title: '商品列表', description: '商品网格 + 搜索筛选' },
      { role: 'product-detail', pageType: 'detail', title: '商品详情', description: '图文详情 + 加入购物车' },
      { role: 'cart', pageType: 'custom', title: '购物车', description: '购物车清单' },
      { role: 'checkout', pageType: 'form', title: '结算', description: '下单表单' },
      { role: 'order-list', pageType: 'list', title: '我的订单', description: '订单列表 + 状态' },
    ],
    modules: ['商品管理', '购物车', '订单系统', '支付流程', '库存管理', '优惠券', '评价系统', '物流跟踪'],
    dataModels: [
      { name: 'Product', description: '商品', fields: ['id', 'title', 'price', 'stock', 'images', 'categoryId', 'status'] },
      { name: 'Order', description: '订单', fields: ['id', 'customerId', 'items', 'total', 'status', 'createdAt'] },
      { name: 'CartItem', description: '购物车项', fields: ['id', 'userId', 'productId', 'quantity'] },
    ],
    components: ['Navbar', 'Card', 'Grid', 'Button', 'Badge', 'Input', 'Select', 'Table', 'Form', 'Modal'],
    userFlows: ['浏览商品 → 查看详情 → 加入购物车 → 下单', '搜索商品 → 筛选 → 查看详情', '订单列表 → 查看状态 → 确认收货'],
    advancedCapabilities: ['智能推荐', '秒杀活动', '优惠券系统', '会员体系', '数据分析'],
  },
  {
    id: 'saas-platform',
    name: 'SaaS 平台',
    category: 'platform',
    description: '多租户 SaaS 平台（如 Linear、Notion 企业版）',
    triggers: ['saas', '平台', '多租户', '订阅', '团队协作', '工作台', '企业版', '后台系统'],
    pages: [
      { role: 'dashboard', pageType: 'dashboard', title: '工作台', description: '个人工作台 + 待办' },
      { role: 'project-list', pageType: 'list', title: '项目列表', description: '项目/空间列表' },
      { role: 'project-detail', pageType: 'detail', title: '项目详情', description: '项目任务 + 成员' },
      { role: 'team', pageType: 'list', title: '团队', description: '成员管理' },
      { role: 'settings', pageType: 'custom', title: '设置', description: '工作区设置' },
    ],
    modules: ['项目管理', '任务分配', '团队协作', '权限管理', '订阅计费', '通知系统', '工作流'],
    dataModels: [
      { name: 'Project', description: '项目', fields: ['id', 'name', 'ownerId', 'members', 'status', 'createdAt'] },
      { name: 'Task', description: '任务', fields: ['id', 'projectId', 'assigneeId', 'status', 'priority', 'dueDate'] },
      { name: 'Member', description: '成员', fields: ['id', 'name', 'role', 'email'] },
    ],
    components: ['Sidebar', 'Navbar', 'Table', 'Badge', 'Card', 'Tabs', 'Avatar', 'Modal', 'Form', 'Input'],
    userFlows: ['登录 → 工作台 → 查看待办 → 处理任务', '项目详情 → 创建任务 → 分配成员', '团队管理 → 邀请成员 → 设置权限'],
    advancedCapabilities: ['实时协作', '权限矩阵', '订阅计费', '第三方集成', '审计日志'],
  },
  {
    id: 'hr-system',
    name: '人事管理系统',
    category: 'business',
    description: '员工/考勤/招聘/绩效管理',
    triggers: ['人事', '员工', '考勤', '招聘', '绩效', 'hr', '人力资源', '组织架构'],
    pages: [
      { role: 'employee-list', pageType: 'list', title: '员工花名册', description: '员工列表 + 搜索' },
      { role: 'employee-detail', pageType: 'detail', title: '员工详情', description: '员工信息 + 档案' },
      { role: 'attendance', pageType: 'list', title: '考勤', description: '考勤记录 + 异常' },
      { role: 'recruitment', pageType: 'list', title: '招聘', description: '候选人管理' },
      { role: 'performance', pageType: 'dashboard', title: '绩效', description: '绩效看板' },
    ],
    modules: ['员工档案', '考勤管理', '招聘管理', '绩效管理', '组织架构', '薪资管理'],
    dataModels: [
      { name: 'Employee', description: '员工', fields: ['id', 'name', 'department', 'position', 'status', 'joinedAt'] },
      { name: 'Attendance', description: '考勤', fields: ['id', 'employeeId', 'date', 'checkIn', 'checkOut', 'status'] },
      { name: 'Candidate', description: '候选人', fields: ['id', 'name', 'position', 'stage', 'appliedAt'] },
    ],
    components: ['Sidebar', 'Table', 'Avatar', 'Badge', 'Form', 'Input', 'Select', 'Modal', 'Dashboard', 'StatCard'],
    userFlows: ['花名册 → 搜索 → 查看详情 → 编辑档案', '考勤 → 查看异常 → 处理', '招聘 → 筛选候选人 → 推进阶段'],
    advancedCapabilities: ['智能排班', '薪资核算', '绩效分析', '人才盘点'],
  },
]

/** 按 ID 获取模式 */
export function getPattern(id: string): AppPattern | undefined {
  return APP_PATTERNS.find((p) => p.id === id)
}

/** 根据需求推荐最匹配的应用模式 */
export function recommendPattern(input: {
  prompt?: string
  summary?: string
  appName?: string
  features?: string[]
}): AppPattern {
  const text = `${input.prompt ?? ''} ${input.summary ?? ''} ${input.appName ?? ''} ${(input.features ?? []).join(' ')}`.toLowerCase()

  const scores: Record<string, number> = {}
  for (const p of APP_PATTERNS) {
    let score = 0
    for (const t of p.triggers) {
      if (text.includes(t.toLowerCase())) score += t.length >= 2 ? 3 : 1
    }
    scores[p.id] = score
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  // 无匹配时返回通用 CRM/管理类模式（业务系统最常用）
  return getPattern(best[1] > 0 ? best[0] : 'crm-system') ?? APP_PATTERNS[0]
}

/** 模式清单描述（供 Prompt 注入） */
export function patternsToPromptDescription(): string {
  return APP_PATTERNS.map((p) => {
    const pages = p.pages.map((pg) => `    - ${pg.title}（${pg.pageType}）：${pg.description}`).join('\n')
    const modules = p.modules.join('、')
    const dataModels = p.dataModels.map((d) => `    - ${d.name}（${d.description}）：${d.fields.join(', ')}`).join('\n')
    const components = p.components.join('、')
    const flows = p.userFlows.map((f) => `    - ${f}`).join('\n')
    return `### ${p.name}（${p.id}）
说明：${p.description}
页面结构：
${pages}
功能模块：${modules}
数据模型：
${dataModels}
推荐组件：${components}
用户流程：
${flows}`
  }).join('\n\n')
}
