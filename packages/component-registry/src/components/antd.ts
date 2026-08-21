import type { ComponentDefinition } from '../types'

// ─── Ant Design 组件适配 ─────────────────────────────────
//
// 将 Ant Design 常用组件以 ComponentDefinition 形式注册进组件库，
// 供 BlueprintAgent 组件选择与 CodingAgent 代码生成复用。
// 每个组件导出「可用的属性名称清单」，便于 Builder 正确生成 props。

/** 单个 Ant Design 组件的可用属性名称清单 */
export interface AntdComponentAdapter {
  /** 组件标识（如 'AntdButton'），与 ComponentDefinition.type 一致 */
  type: string
  /** 组件定义 */
  definition: ComponentDefinition
  /** 可用属性名称清单（Builder 可据此生成 props） */
  propNames: string[]
}

/** 将 antd 组件定义封装为带属性清单的适配器 */
function adapt(definition: ComponentDefinition, propNames: string[]): AntdComponentAdapter {
  return { type: definition.type, definition, propNames }
}

// ─── 各组件定义 ──────────────────────────────────────────

const AntdButton: ComponentDefinition = {
  type: 'AntdButton',
  name: 'Antd按钮',
  category: 'button',
  description: 'Ant Design 按钮组件，支持主要/默认/危险/虚线等类型与多尺寸。',
  acceptsChildren: true,
  defaultProps: { children: '按钮', type: 'primary', size: 'middle', danger: false, block: false },
  propsSchema: [
    { name: 'children', type: 'string', description: '按钮内容', default: '按钮', required: true },
    {
      name: 'type',
      type: 'select',
      description: '按钮类型',
      default: 'primary',
      options: ['primary', 'default', 'dashed', 'link', 'text'],
    },
    { name: 'size', type: 'select', description: '尺寸', default: 'middle', options: ['small', 'middle', 'large'] },
    { name: 'danger', type: 'boolean', description: '危险按钮', default: false },
    { name: 'block', type: 'boolean', description: '块级按钮', default: false },
    { name: 'disabled', type: 'boolean', description: '禁用', default: false },
    { name: 'loading', type: 'boolean', description: '加载中', default: false },
  ],
  usageExamples: [
    {
      name: '主要操作按钮',
      component: { type: 'AntdButton', props: { children: '提交', type: 'primary' } },
    },
  ],
}

const AntdInput: ComponentDefinition = {
  type: 'AntdInput',
  name: 'Antd输入框',
  category: 'form',
  description: 'Ant Design 输入框组件，支持受控值、占位符、前缀图标等。',
  acceptsChildren: false,
  defaultProps: { placeholder: '', size: 'middle', disabled: false, allowClear: false },
  propsSchema: [
    { name: 'value', type: 'string', description: '输入值' },
    { name: 'placeholder', type: 'string', description: '占位符', default: '' },
    { name: 'size', type: 'select', description: '尺寸', default: 'middle', options: ['small', 'middle', 'large'] },
    { name: 'disabled', type: 'boolean', description: '禁用', default: false },
    { name: 'allowClear', type: 'boolean', description: '允许清空', default: false },
    { name: 'type', type: 'select', description: '输入类型', default: 'text', options: ['text', 'password', 'number'] },
  ],
}

const AntdTable: ComponentDefinition = {
  type: 'AntdTable',
  name: 'Antd表格',
  category: 'display',
  description: 'Ant Design 表格组件，支持列定义、数据源、分页、排序与筛选。',
  acceptsChildren: false,
  defaultProps: { dataSource: [], pagination: true, size: 'middle' },
  propsSchema: [
    { name: 'dataSource', type: 'array', description: '表格数据（数组对象）', default: [], required: true },
    { name: 'columns', type: 'array', description: '列定义，如 [{"title":"姓名","dataIndex":"name"}]', default: [], required: true },
    { name: 'rowKey', type: 'string', description: '行唯一键字段' },
    { name: 'pagination', type: 'boolean', description: '是否分页', default: true },
    { name: 'loading', type: 'boolean', description: '加载中', default: false },
    { name: 'size', type: 'select', description: '尺寸', default: 'middle', options: ['small', 'middle', 'large'] },
  ],
  usageExamples: [
    {
      name: '用户列表表格',
      component: {
        type: 'AntdTable',
        props: {
          dataSource: 'users',
          columns: [
            { title: '姓名', dataIndex: 'name' },
            { title: '邮箱', dataIndex: 'email' },
          ],
        },
      },
    },
  ],
}

const AntdForm: ComponentDefinition = {
  type: 'AntdForm',
  name: 'Antd表单',
  category: 'form',
  description: 'Ant Design 表单组件，提供表单校验、布局与字段管理。',
  acceptsChildren: true,
  defaultProps: { layout: 'horizontal', labelCol: 4 },
  propsSchema: [
    { name: 'layout', type: 'select', description: '布局', default: 'horizontal', options: ['horizontal', 'vertical', 'inline'] },
    { name: 'labelCol', type: 'number', description: '标签列宽（span）', default: 4 },
    { name: 'wrapperCol', type: 'number', description: '控件列宽（span）' },
    { name: 'disabled', type: 'boolean', description: '禁用全部字段', default: false },
  ],
}

const AntdModal: ComponentDefinition = {
  type: 'AntdModal',
  name: 'Antd弹窗',
  category: 'feedback',
  description: 'Ant Design 模态框组件，支持标题、确认/取消按钮与自定义内容。',
  acceptsChildren: true,
  defaultProps: { open: false, title: '', footer: true, width: 520 },
  propsSchema: [
    { name: 'open', type: 'boolean', description: '是否显示', default: false, required: true },
    { name: 'title', type: 'string', description: '标题', default: '' },
    { name: 'width', type: 'number', description: '宽度（px）', default: 520 },
    { name: 'footer', type: 'boolean', description: '是否显示底部按钮', default: true },
    { name: 'closable', type: 'boolean', description: '是否可关闭', default: true },
    { name: 'okText', type: 'string', description: '确认按钮文字', default: '确定' },
    { name: 'cancelText', type: 'string', description: '取消按钮文字', default: '取消' },
  ],
}

const AntdTabs: ComponentDefinition = {
  type: 'AntdTabs',
  name: 'Antd标签页',
  category: 'navigation',
  description: 'Ant Design 标签页组件，在多个面板间切换内容。',
  acceptsChildren: true,
  defaultProps: { items: [], activeKey: '' },
  propsSchema: [
    { name: 'items', type: 'array', description: '标签项，如 [{"key":"1","label":"详情","children":...}]', default: [], required: true },
    { name: 'activeKey', type: 'string', description: '当前激活项 key' },
    { name: 'type', type: 'select', description: '样式类型', default: 'line', options: ['line', 'card', 'editable-card'] },
    { name: 'size', type: 'select', description: '尺寸', default: 'middle', options: ['small', 'middle', 'large'] },
  ],
}

const AntdSelect: ComponentDefinition = {
  type: 'AntdSelect',
  name: 'Antd选择器',
  category: 'form',
  description: 'Ant Design 下拉选择组件，支持单选/多选、搜索与选项分组。',
  acceptsChildren: false,
  defaultProps: { options: [], mode: 'single', placeholder: '', allowClear: false },
  propsSchema: [
    { name: 'options', type: 'array', description: '选项，如 [{"label":"A","value":"a"}]', default: [], required: true },
    { name: 'mode', type: 'select', description: '选择模式', default: 'single', options: ['single', 'multiple', 'tags'] },
    { name: 'placeholder', type: 'string', description: '占位符', default: '' },
    { name: 'allowClear', type: 'boolean', description: '允许清空', default: false },
    { name: 'showSearch', type: 'boolean', description: '可搜索', default: false },
  ],
}

const AntdDatePicker: ComponentDefinition = {
  type: 'AntdDatePicker',
  name: 'Antd日期选择器',
  category: 'form',
  description: 'Ant Design 日期选择组件，支持日期、日期范围与格式化。',
  acceptsChildren: false,
  defaultProps: { format: 'YYYY-MM-DD', placeholder: '' },
  propsSchema: [
    { name: 'format', type: 'string', description: '日期格式', default: 'YYYY-MM-DD' },
    { name: 'placeholder', type: 'string', description: '占位符', default: '' },
    { name: 'disabled', type: 'boolean', description: '禁用', default: false },
    { name: 'allowClear', type: 'boolean', description: '允许清空', default: true },
    { name: 'picker', type: 'select', description: '选择粒度', default: 'date', options: ['date', 'week', 'month', 'quarter', 'year'] },
  ],
}

const AntdLayout: ComponentDefinition = {
  type: 'AntdLayout',
  name: 'Antd布局',
  category: 'layout',
  description: 'Ant Design 布局容器，用于搭建页面整体骨架，可包含 Header/Sider/Content/Footer。',
  acceptsChildren: true,
  defaultProps: {},
  propsSchema: [],
}

const AntdLayoutHeader: ComponentDefinition = {
  type: 'AntdLayoutHeader',
  name: 'Antd顶部栏',
  category: 'layout',
  description: 'Ant Design 顶部栏，放置页头内容。',
  acceptsChildren: true,
  defaultProps: {},
  propsSchema: [],
}

const AntdLayoutSider: ComponentDefinition = {
  type: 'AntdLayoutSider',
  name: 'Antd侧边栏',
  category: 'layout',
  description: 'Ant Design 侧边栏，通常放置菜单或导航。',
  acceptsChildren: true,
  defaultProps: { width: 200 },
  propsSchema: [{ name: 'width', type: 'number', description: '宽度（px）', default: 200 }],
}

const AntdLayoutContent: ComponentDefinition = {
  type: 'AntdLayoutContent',
  name: 'Antd内容区',
  category: 'layout',
  description: 'Ant Design 内容区，放置页面主体内容。',
  acceptsChildren: true,
  defaultProps: {},
  propsSchema: [],
}

const AntdLayoutFooter: ComponentDefinition = {
  type: 'AntdLayoutFooter',
  name: 'Antd页脚',
  category: 'layout',
  description: 'Ant Design 页脚，放置版权信息等。',
  acceptsChildren: true,
  defaultProps: {},
  propsSchema: [],
}

const AntdMenu: ComponentDefinition = {
  type: 'AntdMenu',
  name: 'Antd菜单',
  category: 'navigation',
  description: 'Ant Design 菜单组件，支持横向/纵向、子菜单与选中态。',
  acceptsChildren: false,
  defaultProps: { items: [], mode: 'inline' },
  propsSchema: [
    { name: 'items', type: 'array', description: '菜单项，如 [{"key":"home","label":"首页"}]', default: [], required: true },
    { name: 'mode', type: 'select', description: '菜单模式', default: 'inline', options: ['vertical', 'horizontal', 'inline'] },
    { name: 'selectedKeys', type: 'array', description: '选中项 keys', default: [] },
    { name: 'theme', type: 'select', description: '主题', default: 'light', options: ['light', 'dark'] },
  ],
}

const AntdFormItem: ComponentDefinition = {
  type: 'AntdFormItem',
  name: 'Antd表单项',
  category: 'form',
  description: 'Ant Design 表单项容器，绑定字段并承载校验规则。',
  acceptsChildren: true,
  defaultProps: { label: '', name: '' },
  propsSchema: [
    { name: 'label', type: 'string', description: '标签', default: '' },
    { name: 'name', type: 'string', description: '字段名', default: '', required: true },
    { name: 'required', type: 'boolean', description: '是否必填', default: false },
    { name: 'rules', type: 'array', description: '校验规则', default: [] },
  ],
}

// ─── 组件与属性清单汇总 ──────────────────────────────────

const adapters: AntdComponentAdapter[] = [
  adapt(AntdButton, ['children', 'type', 'size', 'danger', 'block', 'disabled', 'loading', 'icon', 'onClick', 'htmlType']),
  adapt(AntdInput, ['value', 'placeholder', 'size', 'disabled', 'allowClear', 'type', 'prefix', 'onChange', 'maxLength']),
  adapt(AntdTable, ['dataSource', 'columns', 'rowKey', 'pagination', 'loading', 'size', 'scroll', 'bordered', 'onChange']),
  adapt(AntdForm, ['layout', 'labelCol', 'wrapperCol', 'disabled', 'onFinish', 'initialValues', 'autoComplete']),
  adapt(AntdModal, ['open', 'title', 'width', 'footer', 'closable', 'okText', 'cancelText', 'onOk', 'onCancel', 'confirmLoading']),
  adapt(AntdTabs, ['items', 'activeKey', 'type', 'size', 'onChange', 'tabPosition']),
  adapt(AntdSelect, ['options', 'mode', 'placeholder', 'allowClear', 'showSearch', 'value', 'onChange', 'disabled']),
  adapt(AntdDatePicker, ['format', 'placeholder', 'disabled', 'allowClear', 'picker', 'value', 'onChange']),
  adapt(AntdLayout, ['style', 'hasSider']),
  adapt(AntdLayoutHeader, ['style', 'height']),
  adapt(AntdLayoutSider, ['width', 'collapsed', 'collapsible', 'theme', 'breakpoint']),
  adapt(AntdLayoutContent, ['style']),
  adapt(AntdLayoutFooter, ['style']),
  adapt(AntdMenu, ['items', 'mode', 'selectedKeys', 'theme', 'onClick', 'inlineCollapsed']),
  adapt(AntdFormItem, ['label', 'name', 'required', 'rules', 'validateStatus', 'help']),
]

/** Ant Design 组件定义列表（可直接注册进 ComponentRegistry） */
export const antdComponents: ComponentDefinition[] = adapters.map((a) => a.definition)

/** Ant Design 组件适配器列表（含属性名称清单） */
export const antdComponentAdapters: AntdComponentAdapter[] = adapters

/** 组件名称清单（给 Builder：应选用哪些 antd 组件） */
export const antdComponentNames: string[] = adapters.map((a) => a.definition.type)

/** 获取指定 antd 组件的可用属性名称清单 */
export function getAntdPropNames(type: string): string[] {
  return adapters.find((a) => a.type === type)?.propNames ?? []
}

/** 获取指定 antd 组件定义 */
export function getAntdComponent(type: string): ComponentDefinition | undefined {
  return adapters.find((a) => a.type === type)?.definition
}
