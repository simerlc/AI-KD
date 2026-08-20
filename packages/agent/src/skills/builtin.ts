// ─── 内置技能库定义 ──────────────────────────────────────
//
// AI快搭 预置的专业开发技能。每个技能描述一类领域的开发规范与最佳实践。
// SkillSelector 根据需求关键词匹配这些技能；SkillContextLoader 读取并注入开发上下文。

import type { Skill } from './types'

/** 基础技能：前端工程化 */
const frontend: Skill = {
  id: 'frontend',
  name: '前端工程化',
  category: 'foundation',
  description: 'React + TypeScript + Vite 的前端工程规范',
  triggers: ['前端', 'react', '网站', '页面', 'web', '应用', 'h5', '前端开发', 'frontend'],
  rules: [
    '使用 React 18 + TypeScript 函数组件 + Hooks，禁止 class 组件',
    '构建工具用 Vite，路由用 react-router-dom v6',
    '只能使用 package.json 已声明的依赖，禁止引入未声明的第三方库',
    '所有组件必须基于 AI快搭 Design System（ds-* 类名）',
    '每个页面组件独立文件 src/pages/<pageId>.tsx',
  ],
  bestPractices: [
    '组件按职责拆分，避免巨型组件',
    '数据请求统一走 src/api.ts 封装',
    '使用函数式更新 state，避免闭包陷阱',
  ],
  components: ['Layout', 'Navbar', 'Sidebar', 'Card', 'Button'],
  prohibitions: ['禁止直接操作 DOM 绕过 React 状态', '禁止使用未声明的第三方库'],
  version: 1,
}

/** 基础技能：UI 设计 */
const uiDesign: Skill = {
  id: 'ui-design',
  name: 'UI 设计规范',
  category: 'foundation',
  description: '现代 SaaS 视觉语言与统一组件规范',
  triggers: ['ui', '界面', '设计', '美观', '样式', '视觉', '现代', 'ui设计', 'design'],
  rules: [
    '使用现代 SaaS 风格（Vercel / Linear / Notion / Stripe 视觉语言）',
    '所有颜色来自 Design Tokens（var(--ds-color-*)），禁止硬编码',
    '所有间距遵循 4px 栅格，圆角/阴影使用 Design Token',
    '统一组件：按钮/卡片/表格/表单必须复用 Design System 组件',
    '信息层级清晰：每页至多一个主标题 h1',
  ],
  bestPractices: [
    '主操作按钮用 primary 变体，页面只保留一个强调按钮',
    '卡片用统一阴影与圆角，保持视觉一致',
    '状态用 Badge 表达（成功/警告/错误）',
  ],
  components: ['Button', 'Card', 'Badge', 'Table', 'Modal', 'Avatar', 'Tabs'],
  prohibitions: ['禁止硬编码颜色/字体/间距', '禁止混用多种风格', '禁止为同一目的重复造组件'],
  version: 1,
}

/** 基础技能：响应式设计 */
const responsive: Skill = {
  id: 'responsive',
  name: '响应式设计',
  category: 'foundation',
  description: '多端适配（桌面 / 平板 / 移动端）',
  triggers: ['响应式', '移动端', '自适应', '手机', '平板', '多端', 'responsive', 'mobile'],
  rules: [
    '所有页面必须支持移动端（依赖 index.css 的 @media 断点）',
    '栅格布局在移动端自动折叠为单列',
    '侧边栏在移动端隐藏或折叠为抽屉',
    '触控目标尺寸不小于 44px',
  ],
  bestPractices: [
    '用 ds-grid-2/3/4 栅格 + 移动端断点折叠',
    '表格在移动端横向滚动（ds-table-wrap）',
  ],
  components: ['Layout', 'Grid', 'Sidebar', 'Navbar'],
  prohibitions: ['禁止写死固定宽度导致移动端溢出', '禁止在移动端保留多列布局'],
  version: 1,
}

// ── 业务技能 ────────────────────────────────────────────

/** 业务技能：电商 */
const ecommerce: Skill = {
  id: 'ecommerce',
  name: '电商',
  category: 'business',
  description: '在线商城完整业务能力',
  triggers: ['商城', '电商', '购物', '商品', '下单', '订单', '购物车', '店铺', 'shop', 'store', 'ecommerce', 'product'],
  rules: [
    '必须包含：商品列表、商品详情、购物车、搜索、筛选、订单状态',
    '商品列表支持搜索与分类筛选',
    '商品详情页展示价格、库存、图文详情',
    '购物车支持数量调整与删除',
    '订单有明确的状态流转（待支付/已支付/已发货/已完成）',
    '库存状态用 Badge 表达（有货/缺货）',
  ],
  bestPractices: [
    '商品卡片用 Card + Grid 网格布局',
    '加入购物车按钮用 primary 变体并给予成功反馈',
    '价格用醒目样式突出',
  ],
  components: ['Card', 'Grid', 'Table', 'Button', 'Badge', 'Form', 'Navbar'],
  prohibitions: ['禁止缺少购物车或订单流程', '禁止商品列表无搜索/筛选'],
  examples: ['商品网格：Card 内嵌 Image + 标题 + 价格 + 加入购物车 Button'],
  dependencies: ['frontend', 'ui-design', 'responsive'],
  version: 1,
}

/** 业务技能：Dashboard */
const dashboard: Skill = {
  id: 'dashboard',
  name: '数据看板',
  category: 'business',
  description: '数据指标可视化看板',
  triggers: ['看板', '仪表盘', 'dashboard', '统计', '数据可视化', '指标', '总览', '监控', '分析'],
  rules: [
    '使用 StatCard 展示核心指标（数值 + 趋势）',
    '使用 Chart 展示趋势/分布',
    '关键指标必须绑定真实数据源',
    '数据加载要有 Loading 与 Empty 状态',
  ],
  bestPractices: [
    '指标卡用 Grid 网格布局，趋势用 Badge 表达涨跌',
    '图表数据为空时展示 Empty 态',
  ],
  components: ['Dashboard', 'StatCard', 'Chart', 'Card', 'Grid', 'Badge'],
  prohibitions: ['禁止展示无数据源的假指标', '禁止图表无空态处理'],
  dependencies: ['frontend', 'ui-design'],
  version: 1,
}

/** 业务技能：CRM */
const crm: Skill = {
  id: 'crm',
  name: '客户关系管理',
  category: 'business',
  description: '客户/销售/跟进管理',
  triggers: ['客户', 'crm', '销售', '跟进', '客户关系', '线索', '商机', 'customer', 'lead'],
  rules: [
    '包含客户列表（含头像/状态徽章）',
    '客户详情页用 Tabs 组织（基本信息/跟进记录）',
    '客户状态用 Badge 表达（新客/跟进中/成交/流失）',
    '支持新增/编辑客户表单',
  ],
  bestPractices: [
    '客户列表用 Table + Avatar + Badge',
    '跟进记录用 List 时间线展示',
  ],
  components: ['Table', 'Avatar', 'Badge', 'Card', 'Tabs', 'Form', 'List'],
  prohibitions: ['禁止缺少客户详情页', '禁止客户无状态标识'],
  dependencies: ['frontend', 'ui-design'],
  version: 1,
}

/** 业务技能：认证授权 */
const auth: Skill = {
  id: 'auth',
  name: '认证授权',
  category: 'business',
  description: '登录/注册/权限控制',
  triggers: ['登录', '注册', '认证', '权限', '用户', '密码', '账号', 'auth', 'login', '权限系统'],
  rules: [
    '使用 Login 组件实现登录页',
    '表单必须有校验（必填/格式）',
    '密码输入框用 password 类型',
    '权限系统：不同角色可见不同功能',
  ],
  bestPractices: [
    '登录表单居中展示，提交按钮 loading 态',
    '错误提示明确（用户名/密码错误）',
  ],
  components: ['Login', 'Form', 'Input', 'Button', 'Card'],
  prohibitions: ['禁止明文存储密码', '禁止表单无校验'],
  dependencies: ['frontend', 'ui-design'],
  version: 1,
}

/** 业务技能：数据管理后台 */
const adminPanel: Skill = {
  id: 'admin-panel',
  name: '数据管理后台',
  category: 'business',
  description: '后台数据增删改查',
  triggers: ['后台', '管理', 'admin', '数据管理', '配置', '列表', '增删改查', 'crud'],
  rules: [
    '使用 Sidebar + 内容区布局',
    '列表页：搜索 + 新增按钮 + Table（含操作列）',
    '新增/编辑用 Form + Modal',
    '删除操作必须二次确认',
    '表单必须有校验，保存有成功/失败反馈',
  ],
  bestPractices: [
    '操作列用 ghost 按钮（编辑/删除）',
    '删除用 danger 变体 + confirm 确认',
    '空列表展示 Empty 态',
  ],
  components: ['Layout', 'Sidebar', 'Table', 'Button', 'Form', 'Modal', 'Input', 'Select'],
  prohibitions: ['禁止删除无二次确认', '禁止表单无校验', '禁止列表无 Empty 态'],
  dependencies: ['frontend', 'ui-design', 'responsive'],
  version: 1,
}

// ── 增强技能 ────────────────────────────────────────────

/** 增强技能：数据库 */
const database: Skill = {
  id: 'database',
  name: '数据库建模',
  category: 'enhancement',
  description: '数据表设计与字段规范',
  triggers: ['数据库', '数据表', '字段', '存储', '数据模型', 'database', '表结构'],
  rules: [
    '数据表通过 dataModel.tables 定义',
    '字段类型使用 string/number/boolean/date/datetime/enum/uuid',
    '每个表必须有主键与必要的必填字段',
    '表字段命名一致（同一实体跨页面字段名统一）',
  ],
  bestPractices: [
    '枚举字段用 enum 类型并声明 enumOptions',
    '时间字段用 datetime 类型',
  ],
  components: [],
  prohibitions: ['禁止字段命名不一致', '禁止缺失主键'],
  version: 1,
}

/** 增强技能：API 设计 */
const api: Skill = {
  id: 'api',
  name: 'API 设计',
  category: 'enhancement',
  description: '接口设计与数据访问规范',
  triggers: ['接口', 'api', '请求', '数据接口', '后端', 'rest', 'crud接口'],
  rules: [
    '所有数据读写走 src/api.ts 封装的 /api/data 接口',
    '每个数据表对应 list/get/create/update/delete CRUD 接口',
    '页面禁止直接写 fetch 地址',
    '所有 API 调用必须 try/catch 处理异常',
  ],
  bestPractices: [
    '接口与 Blueprint 的 apiDesign.endpoints 一一对应',
    '异步请求处理 loading/error 状态',
  ],
  components: [],
  prohibitions: ['禁止页面内直连 fetch', '禁止接口未实现', '禁止未处理异常'],
  dependencies: ['database'],
  version: 1,
}

/** 增强技能：动画交互 */
const animation: Skill = {
  id: 'animation',
  name: '动画交互',
  category: 'enhancement',
  description: '过渡动画与微交互',
  triggers: ['动画', '过渡', '动效', '交互', 'animation', '微交互', '动画效果'],
  rules: [
    '按钮/卡片 hover 有过渡效果（transition）',
    '模态框有淡入/缩放动画',
    '加载使用 ds-spinner 旋转动画',
    '动画时长控制在 150-300ms，避免拖沓',
  ],
  bestPractices: [
    '使用 CSS transition 而非 JS 动画',
    '尊重 prefers-reduced-motion 用户偏好',
  ],
  components: ['Modal', 'Button', 'Card'],
  prohibitions: ['禁止过长动画影响体验', '禁止无过渡的生硬切换'],
  version: 1,
}

/** 增强技能：测试 */
const testing: Skill = {
  id: 'testing',
  name: '测试',
  category: 'enhancement',
  description: '应用测试与质量保证',
  triggers: ['测试', '测试用例', '质量', '测试优化', 'testing', 'qa'],
  rules: [
    '生成应用必须通过 ApplicationTestAgent 全功能测试',
    '覆盖五大维度：build/runtime/ui/feature/api',
    '测试未通过自动进入修复闭环（最多 5 轮）',
  ],
  bestPractices: [
    '确保所有 import 可解析、无悬空引用',
    '确保所有页面可渲染、无白屏',
  ],
  components: [],
  prohibitions: ['禁止跳过测试直接预览', '禁止用注释代码规避测试'],
  version: 1,
}

/** 增强技能：AI 功能 */
const aiFeature: Skill = {
  id: 'ai-feature',
  name: 'AI 功能',
  category: 'enhancement',
  description: 'AI 能力集成（智能推荐/搜索）',
  triggers: ['ai', '人工智能', '智能', '推荐', '智能搜索', 'ai功能', '机器学习'],
  rules: [
    'AI 能力通过 API 调用集成，前端只负责展示结果',
    'AI 结果加载要有 Loading 与 Empty 态',
    'AI 调用失败要有明确的错误提示',
  ],
  bestPractices: ['AI 结果用 Card/List 优雅展示', '提供 loading 骨架屏'],
  components: ['Card', 'List', 'Button'],
  prohibitions: ['禁止前端直接调用模型', '禁止 AI 结果无 loading/error 态'],
  version: 1,
}

/** 增强技能：支付流程 */
const payment: Skill = {
  id: 'payment',
  name: '支付流程',
  category: 'enhancement',
  description: '支付与结算流程',
  triggers: ['支付', '结算', '付款', '订单支付', 'payment', 'checkout', '支付流程'],
  rules: [
    '支付前展示订单确认信息',
    '支付按钮有 loading 态，防止重复提交',
    '支付结果有明确成功/失败反馈',
    '订单状态与支付状态联动',
  ],
  bestPractices: ['下单用 Form 收集收货信息', '支付成功展示订单号'],
  components: ['Form', 'Input', 'Button', 'Card', 'Table'],
  prohibitions: ['禁止支付按钮无防重复', '禁止支付结果无反馈'],
  dependencies: ['ecommerce', 'api'],
  version: 1,
}

/** 增强技能：数据分析 */
const analytics: Skill = {
  id: 'analytics',
  name: '数据分析',
  category: 'enhancement',
  description: '数据分析与可视化',
  triggers: ['分析', '统计', '报表', '图表', 'analytics', '数据分析', '趋势'],
  rules: [
    '使用 Chart 组件展示数据',
    '数据必须绑定真实数据源',
    '图表要有标题与空态',
  ],
  bestPractices: ['折线图展示趋势，柱状图展示对比，饼图展示占比'],
  components: ['Chart', 'Card', 'StatCard', 'Grid'],
  prohibitions: ['禁止展示假数据', '禁止图表无数据源'],
  dependencies: ['dashboard'],
  version: 1,
}

// ── 企业业务技能（对齐飞书妙搭常用场景） ────────────────

/** 业务技能：审批流程 */
const approvalWorkflow: Skill = {
  id: 'approval-workflow',
  name: '审批流程',
  category: 'business',
  description: '请假/报销/采购等审批流（发起 → 审批 → 归档）',
  triggers: ['审批', '请假', '报销', '采购', '合同', '流程', '申请', 'approval', 'workflow', '审批流', '会签'],
  rules: [
    '包含申请列表（状态徽章：待审批/已通过/已驳回）',
    '申请表单含必填校验与附件字段',
    '审批操作（通过/驳回）必须二次确认',
    '审批状态流转清晰（草稿/审批中/已通过/已驳回/已归档）',
    '审批详情页展示流转时间线与审批意见',
  ],
  bestPractices: [
    '申请列表用 Table + Badge 展示状态',
    '审批流转用 List 时间线展示',
    '通过/驳回用 Button（primary/danger）+ Modal 确认',
  ],
  components: ['Table', 'Badge', 'Form', 'Input', 'Modal', 'List', 'Card', 'Button', 'Detail'],
  prohibitions: ['禁止审批操作无二次确认', '禁止申请表单无校验', '禁止状态流转混乱'],
  dependencies: ['frontend', 'ui-design', 'admin-panel'],
  version: 1,
}

/** 业务技能：工单管理 */
const ticketWorkorder: Skill = {
  id: 'ticket-workorder',
  name: '工单管理',
  category: 'business',
  description: '问题工单流转（发现 → 处理 → 解决）',
  triggers: ['工单', '问题', '报修', '派单', '处理', 'ticket', 'workorder', '工单流转', '问题跟踪'],
  rules: [
    '工单列表展示状态（待处理/处理中/已解决/已关闭）与优先级',
    '工单详情展示问题描述、处理人、处理记录',
    '支持工单新建、派单、状态更新',
    '关键指标用看板展示（待处理数量/解决率）',
  ],
  bestPractices: [
    '工单状态用 Badge 表达，优先级用颜色区分',
    '处理记录用 List 时间线',
    '统计卡片用 StatCard + Dashboard',
  ],
  components: ['Table', 'Badge', 'Form', 'Input', 'Detail', 'List', 'Dashboard', 'StatCard'],
  prohibitions: ['禁止工单无状态流转', '禁止缺少工单详情页', '禁止工单无优先级'],
  dependencies: ['frontend', 'ui-design', 'admin-panel'],
  version: 1,
}

/** 业务技能：人事管理 */
const hrManagement: Skill = {
  id: 'hr-management',
  name: '人事管理',
  category: 'business',
  description: '员工信息/入职/离职/考勤管理',
  triggers: ['人事', '员工', '入职', '离职', '考勤', 'hr', '人事管理', '花名册', '组织架构', 'employee'],
  rules: [
    '员工花名册列表（含 Avatar/部门/职位/状态）',
    '员工详情页用 Tabs（基本信息/考勤记录/异动记录）',
    '支持入职/离职/异动登记表单',
    '考勤记录用 Table 展示（出勤/请假/迟到）',
  ],
  bestPractices: [
    '员工列表用 Table + Avatar + Badge',
    '员工状态用 Badge（在职/离职/试用期）',
    '考勤异常用 warning/error 颜色高亮',
  ],
  components: ['Table', 'Avatar', 'Badge', 'Tabs', 'Form', 'Card', 'Detail'],
  prohibitions: ['禁止员工无状态标识', '禁止缺少员工详情', '禁止考勤无异常标记'],
  dependencies: ['frontend', 'ui-design', 'admin-panel'],
  version: 1,
}

/** 业务技能：项目管理 */
const projectManagement: Skill = {
  id: 'project-management',
  name: '项目管理',
  category: 'business',
  description: '项目/任务/里程碑跟踪',
  triggers: ['项目', '任务', '里程碑', '进度', '甘特图', '项目跟踪', 'project', 'task', '项目管理', '待办'],
  rules: [
    '项目列表展示进度与状态',
    '任务列表支持状态流转（待办/进行中/已完成）',
    '项目详情展示里程碑与任务分解',
    '进度用百分比/进度条展示',
  ],
  bestPractices: [
    '任务状态用 Badge 表达',
    '项目进度用进度条或百分比',
    '里程碑用 List 时间线',
  ],
  components: ['Table', 'Badge', 'Card', 'Tabs', 'Form', 'List', 'Dashboard'],
  prohibitions: ['禁止任务无状态流转', '禁止项目无进度展示', '禁止缺少任务列表'],
  dependencies: ['frontend', 'ui-design', 'admin-panel'],
  version: 1,
}

/** 业务技能：库存管理 */
const inventory: Skill = {
  id: 'inventory',
  name: '库存管理',
  category: 'business',
  description: '商品/物料库存出入库',
  triggers: ['库存', '出入库', '盘点', '仓库', '物料', 'inventory', 'stock', '库存管理', '进货', '出货'],
  rules: [
    '库存列表展示数量与库存状态（充足/偏低/缺货）',
    '支持入库/出库登记表单',
    '库存状态用 Badge 表达，缺货用 error 高亮',
    '库存变动记录用 Table 展示',
  ],
  bestPractices: [
    '库存数量低于阈值时用 warning/error 提示',
    '出入库用 Form + Modal',
    '库存统计用 StatCard 看板',
  ],
  components: ['Table', 'Badge', 'Form', 'Modal', 'Input', 'Select', 'StatCard'],
  prohibitions: ['禁止库存无状态标识', '禁止缺少出入库记录', '禁止库存无预警'],
  dependencies: ['frontend', 'ui-design', 'admin-panel'],
  version: 1,
}

/** 业务技能：数据收集与表单 */
const dataCollection: Skill = {
  id: 'data-collection',
  name: '数据收集与表单',
  category: 'business',
  description: '问卷/登记/信息采集表单',
  triggers: ['问卷', '调查', '登记', '信息采集', '投票', '表单', '收集', 'survey', 'form', '问卷星', '报名'],
  rules: [
    '表单字段有明确类型（文本/单选/多选/日期）',
    '所有字段有校验（必填/格式）',
    '提交后有成功反馈',
    '采集数据用 Table 展示，支持导出视图',
    '投票类展示实时结果统计',
  ],
  bestPractices: [
    '表单用 Form + Input/Select/Textarea/Checkbox',
    '提交按钮 loading 态 + 成功反馈',
    '结果统计用 Chart 可视化',
  ],
  components: ['Form', 'Input', 'Select', 'Textarea', 'Checkbox', 'Button', 'Table', 'Chart'],
  prohibitions: ['禁止表单无校验', '禁止提交无反馈', '禁止问卷无结果统计'],
  dependencies: ['frontend', 'ui-design'],
  version: 1,
}

/** 业务技能：预约点餐 */
const bookingReservation: Skill = {
  id: 'booking-reservation',
  name: '预约与点餐',
  category: 'business',
  description: '预约/订座/点餐系统',
  triggers: ['预约', '订座', '点餐', '预订', '挂号', '预约系统', 'booking', 'reservation', '订餐', '排班'],
  rules: [
    '预约表单含时间/人数/联系方式字段',
    '支持时段/资源可用性展示',
    '预约列表展示状态（待确认/已确认/已取消）',
    '点餐支持菜品选择与购物车式下单',
  ],
  bestPractices: [
    '时段选择用 Select 或 Tabs',
    '预约状态用 Badge 表达',
    '点餐用 Card 网格展示菜品',
  ],
  components: ['Form', 'Select', 'Input', 'Button', 'Table', 'Badge', 'Card', 'Grid'],
  prohibitions: ['禁止预约无状态管理', '禁止缺少时段/资源选择', '禁止预约无确认反馈'],
  dependencies: ['frontend', 'ui-design'],
  version: 1,
}

/** 业务技能：内容展示 */
const contentShowcase: Skill = {
  id: 'content-showcase',
  name: '内容展示',
  category: 'business',
  description: '服务介绍/活动宣传/产品手册/电子菜单等展示页',
  triggers: ['介绍', '宣传', '手册', '菜单', '展示页', '活动页', '产品手册', '图文', '官网', '落地页', 'landing'],
  rules: [
    '注重 UI 美观与信息层级（Hero + 分区 + CTA）',
    '图文排版清晰，图片与文字搭配合理',
    '移动端响应式适配',
    '明确的行动号召（CTA 按钮）',
  ],
  bestPractices: [
    'Hero 区用大标题 + 主 CTA 按钮',
    '特性/服务用 Card + Grid 网格',
    '图文混排用 Image + Text/Paragraph',
  ],
  components: ['Navbar', 'Heading', 'Paragraph', 'Image', 'Card', 'Grid', 'Button', 'Footer'],
  prohibitions: ['禁止纯文字无视觉层次', '禁止缺少 CTA', '禁止移动端不响应式'],
  dependencies: ['frontend', 'ui-design', 'responsive'],
  version: 1,
}

/** 业务技能：报销财务 */
const expenseFinance: Skill = {
  id: 'expense-finance',
  name: '报销与财务',
  category: 'business',
  description: '费用报销/付款申请/财务记录',
  triggers: ['报销', '财务', '费用', '付款', '发票', 'expense', 'finance', '报销单', '预算'],
  rules: [
    '报销单表单含金额/用途/日期/发票字段',
    '金额字段做数值校验（非负、保留两位小数）',
    '报销列表展示状态（草稿/审批中/已报销/已驳回）',
    '费用统计用看板/图表展示',
  ],
  bestPractices: [
    '金额用醒目样式 + 货币符号',
    '报销状态用 Badge 表达',
    '费用汇总用 StatCard + Chart',
  ],
  components: ['Table', 'Form', 'Input', 'Badge', 'Dashboard', 'StatCard', 'Chart'],
  prohibitions: ['禁止金额无校验', '禁止报销无状态流转', '禁止缺少费用统计'],
  dependencies: ['frontend', 'ui-design', 'approval-workflow'],
  version: 1,
}

/** 全部内置技能 */
export const BUILTIN_SKILLS: Skill[] = [
  frontend,
  uiDesign,
  responsive,
  ecommerce,
  dashboard,
  crm,
  auth,
  adminPanel,
  database,
  api,
  animation,
  testing,
  aiFeature,
  payment,
  analytics,
  // 企业业务技能（对齐飞书妙搭）
  approvalWorkflow,
  ticketWorkorder,
  hrManagement,
  projectManagement,
  inventory,
  dataCollection,
  bookingReservation,
  contentShowcase,
  expenseFinance,
]

/** 技能 ID 映射（快速查找） */
export const BUILTIN_SKILL_MAP: Record<string, Skill> = Object.fromEntries(
  BUILTIN_SKILLS.map((s) => [s.id, s]),
)
