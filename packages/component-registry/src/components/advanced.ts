import type { ComponentDefinition } from '../types'

// ─── 高级 / 复合组件 ──────────────────────────────────────
//
// Dashboard / Chart / Login 等复合组件，让 Agent 优先复用而非从零生成。
// 每个组件都提供 usageExamples，供 BlueprintAgent 组件选择与 CodingAgent 复用。

export const Dashboard: ComponentDefinition = {
  type: 'Dashboard',
  name: '仪表盘',
  category: 'dashboard',
  description:
    '仪表盘/数据看板容器，用于聚合展示多个数据卡片、统计指标与图表，常作为应用首页。可包含 StatCard 统计项与 Chart 图表。',
  acceptsChildren: true,
  defaultProps: {
    title: '数据总览',
    cards: [],
    layout: 'grid',
    columns: 3,
  },
  propsSchema: [
    { name: 'title', type: 'string', description: '仪表盘标题', default: '数据总览' },
    {
      name: 'cards',
      type: 'array',
      description: '统计卡片数组，如 [{"label":"总销售额","value":"¥128,000","trend":"+12%"}]',
      default: [],
    },
    {
      name: 'layout',
      type: 'select',
      description: '布局方式',
      default: 'grid',
      options: ['grid', 'stack'],
    },
    { name: 'columns', type: 'number', description: '卡片列数', default: 3 },
  ],
  usageExamples: [
    {
      name: '商城运营看板',
      description: '聚合销售、订单、商品等统计数据的首页看板',
      component: {
        type: 'Dashboard',
        props: {
          title: '商城运营看板',
          cards: [
            { label: '今日销售额', value: '¥12,800', trend: '+15%' },
            { label: '今日订单', value: '326', trend: '+8%' },
            { label: '在售商品', value: '1,204', trend: '+3%' },
          ],
        },
        children: [
          { type: 'Chart', props: { type: 'bar', dataSource: 'sales' } },
          { type: 'Chart', props: { type: 'line', dataSource: 'orders' } },
        ],
      },
    },
  ],
}

export const StatCard: ComponentDefinition = {
  type: 'StatCard',
  name: '统计卡片',
  category: 'dashboard',
  description: '单个统计指标卡片，展示标签、数值与趋势，用于仪表盘数据总览。',
  acceptsChildren: false,
  defaultProps: {
    label: '指标',
    value: '0',
    trend: '',
    color: '#1677ff',
  },
  propsSchema: [
    { name: 'label', type: 'string', description: '指标标签', default: '指标', required: true },
    { name: 'value', type: 'string', description: '指标数值', default: '0', required: true },
    { name: 'trend', type: 'string', description: '趋势，如 "+12%"', default: '' },
    { name: 'color', type: 'color', description: '主题色', default: '#1677ff' },
  ],
  usageExamples: [
    {
      name: '销售统计卡片',
      component: {
        type: 'StatCard',
        props: { label: '今日销售额', value: '¥12,800', trend: '+15%' },
      },
    },
  ],
}

export const Chart: ComponentDefinition = {
  type: 'Chart',
  name: '图表',
  category: 'chart',
  description: '数据图表组件，支持柱状图、折线图、饼图等，用于数据可视化分析。',
  acceptsChildren: false,
  defaultProps: {
    type: 'bar',
    dataSource: '',
    title: '',
    height: '300px',
  },
  propsSchema: [
    {
      name: 'type',
      type: 'select',
      description: '图表类型',
      default: 'bar',
      options: ['bar', 'line', 'pie', 'area'],
      required: true,
    },
    {
      name: 'dataSource',
      type: 'string',
      description: '数据源名称（引用 dataSources），图表据此渲染',
      default: '',
      required: true,
    },
    { name: 'title', type: 'string', description: '图表标题', default: '' },
    { name: 'height', type: 'string', description: '图表高度', default: '300px' },
  ],
  usageExamples: [
    {
      name: '月度销售柱状图',
      description: '展示每月销售数据的柱状图',
      component: {
        type: 'Chart',
        props: { type: 'bar', dataSource: 'sales', title: '月度销售趋势' },
      },
    },
    {
      name: '销售趋势折线图',
      component: {
        type: 'Chart',
        props: { type: 'line', dataSource: 'salesTrend', title: '销售趋势' },
      },
    },
  ],
}

export const Login: ComponentDefinition = {
  type: 'Login',
  name: '登录页',
  category: 'auth',
  description:
    '登录表单组件，包含用户名/密码输入与登录按钮，可用于认证页。通常作为独立页面使用。',
  acceptsChildren: false,
  defaultProps: {
    title: '欢迎登录',
    submitText: '登录',
    usernameLabel: '用户名',
    passwordLabel: '密码',
    redirectTo: '/',
  },
  propsSchema: [
    { name: 'title', type: 'string', description: '登录页标题', default: '欢迎登录' },
    { name: 'submitText', type: 'string', description: '登录按钮文字', default: '登录' },
    { name: 'usernameLabel', type: 'string', description: '用户名输入框标签', default: '用户名' },
    { name: 'passwordLabel', type: 'string', description: '密码输入框标签', default: '密码' },
    {
      name: 'redirectTo',
      type: 'string',
      description: '登录成功后的跳转路径',
      default: '/',
    },
  ],
  usageExamples: [
    {
      name: '商城登录页',
      description: '标准用户名密码登录',
      component: {
        type: 'Login',
        props: { title: '商城登录', redirectTo: '/dashboard' },
      },
    },
  ],
}
