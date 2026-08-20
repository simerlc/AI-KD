// ─── Design System · 基础组件元数据 ───────────────────────
//
// 定义 AI 生成应用必须复用的基础组件清单及其变体/尺寸/状态能力。
// 这些元数据被用于：
//   1. 生成代码时的组件渲染（Builder 引用）
//   2. AI 生成 Prompt（告知 Agent 必须使用这些组件而非自由造 UI）
//   3. Design Review Agent（检查组件是否被正确复用）
//
// 组件命名采用 ds- 前缀（Design System），与生成应用内的 CSS 类对应。

/** 组件变体 */
export interface ComponentVariant {
  name: string
  /** 描述该变体适用场景 */
  description: string
}

/** 组件尺寸 */
export type ComponentSize = 'small' | 'medium' | 'large'

/** 组件状态能力 */
export interface ComponentStates {
  disabled: boolean
  loading: boolean
  error: boolean
  responsive: boolean
}

/** 基础组件定义 */
export interface DSComponent {
  /** 组件名（如 Button、Card） */
  type: string
  /** 分类 */
  category: 'layout' | 'input' | 'display' | 'navigation' | 'feedback'
  /** 用途描述 */
  description: string
  /** 支持的变体 */
  variants: ComponentVariant[]
  /** 支持的尺寸 */
  sizes: ComponentSize[]
  /** 状态能力 */
  states: ComponentStates
  /** CSS 类名前缀（如 ds-btn） */
  className: string
  /** 关键 props */
  props: string[]
}

/** Design System 全部基础组件定义 */
export const DESIGN_SYSTEM_COMPONENTS: DSComponent[] = [
  {
    type: 'Button',
    category: 'input',
    description: '操作按钮，所有可点击动作的统一入口',
    variants: [
      { name: 'primary', description: '主操作，页面唯一强调按钮' },
      { name: 'secondary', description: '次要操作' },
      { name: 'outline', description: '描边按钮，弱化操作' },
      { name: 'ghost', description: '无背景按钮，用于表格行内/导航' },
      { name: 'danger', description: '危险操作（删除等）' },
    ],
    sizes: ['small', 'medium', 'large'],
    states: { disabled: true, loading: true, error: false, responsive: true },
    className: 'ds-btn',
    props: ['label', 'variant', 'size', 'loading', 'disabled', 'onClick', 'icon'],
  },
  {
    type: 'Card',
    category: 'display',
    description: '内容容器卡片，统一阴影与圆角',
    variants: [
      { name: 'default', description: '标准卡片' },
      { name: 'bordered', description: '仅描边无阴影' },
      { name: 'elevated', description: '悬浮强调卡片' },
    ],
    sizes: ['medium'],
    states: { disabled: false, loading: true, error: false, responsive: true },
    className: 'ds-card',
    props: ['title', 'subtitle', 'variant', 'loading', 'children'],
  },
  {
    type: 'Input',
    category: 'input',
    description: '文本输入框，含 label / 错误提示',
    variants: [
      { name: 'default', description: '标准输入' },
      { name: 'error', description: '校验失败态' },
    ],
    sizes: ['small', 'medium', 'large'],
    states: { disabled: true, loading: false, error: true, responsive: true },
    className: 'ds-input',
    props: ['label', 'placeholder', 'value', 'onChange', 'error', 'disabled', 'required', 'type'],
  },
  {
    type: 'Select',
    category: 'input',
    description: '下拉选择框',
    variants: [{ name: 'default', description: '标准选择' }],
    sizes: ['small', 'medium', 'large'],
    states: { disabled: true, loading: true, error: true, responsive: true },
    className: 'ds-select',
    props: ['label', 'options', 'value', 'onChange', 'placeholder', 'disabled'],
  },
  {
    type: 'Modal',
    category: 'feedback',
    description: '模态对话框，含遮罩与关闭',
    variants: [{ name: 'default', description: '标准模态框' }],
    sizes: ['small', 'medium', 'large'],
    states: { disabled: false, loading: true, error: false, responsive: true },
    className: 'ds-modal',
    props: ['open', 'title', 'onClose', 'children', 'footer', 'width'],
  },
  {
    type: 'Table',
    category: 'display',
    description: '数据表格，统一表头/空态/加载态',
    variants: [{ name: 'default', description: '标准表格' }],
    sizes: ['medium'],
    states: { disabled: false, loading: true, error: true, responsive: true },
    className: 'ds-table',
    props: ['columns', 'data', 'loading', 'empty', 'rowKey', 'actions'],
  },
  {
    type: 'Form',
    category: 'input',
    description: '表单容器，统一校验与提交反馈',
    variants: [{ name: 'default', description: '标准表单' }],
    sizes: ['medium'],
    states: { disabled: true, loading: true, error: true, responsive: true },
    className: 'ds-form',
    props: ['onSubmit', 'children', 'loading', 'submitText', 'title'],
  },
  {
    type: 'Tabs',
    category: 'navigation',
    description: '标签页切换',
    variants: [{ name: 'default', description: '标准标签页' }],
    sizes: ['medium'],
    states: { disabled: true, loading: false, error: false, responsive: true },
    className: 'ds-tabs',
    props: ['items', 'activeKey', 'onChange', 'children'],
  },
  {
    type: 'Dropdown',
    category: 'navigation',
    description: '下拉菜单，用于更多操作',
    variants: [{ name: 'default', description: '标准下拉' }],
    sizes: ['medium'],
    states: { disabled: true, loading: false, error: false, responsive: true },
    className: 'ds-dropdown',
    props: ['trigger', 'items', 'onSelect'],
  },
  {
    type: 'Badge',
    category: 'display',
    description: '状态/标签徽章',
    variants: [
      { name: 'success', description: '成功状态' },
      { name: 'warning', description: '警告状态' },
      { name: 'error', description: '错误状态' },
      { name: 'info', description: '信息/中性' },
      { name: 'neutral', description: '中性标签' },
    ],
    sizes: ['small', 'medium'],
    states: { disabled: false, loading: false, error: false, responsive: true },
    className: 'ds-badge',
    props: ['text', 'variant', 'dot'],
  },
  {
    type: 'Avatar',
    category: 'display',
    description: '头像/首字母占位',
    variants: [{ name: 'default', description: '标准头像' }],
    sizes: ['small', 'medium', 'large'],
    states: { disabled: false, loading: false, error: false, responsive: true },
    className: 'ds-avatar',
    props: ['name', 'src', 'size'],
  },
  {
    type: 'Navbar',
    category: 'navigation',
    description: '顶部导航栏',
    variants: [{ name: 'default', description: '标准导航栏' }],
    sizes: ['medium'],
    states: { disabled: false, loading: false, error: false, responsive: true },
    className: 'ds-navbar',
    props: ['title', 'items', 'logo', 'actions'],
  },
  {
    type: 'Sidebar',
    category: 'navigation',
    description: '侧边栏导航',
    variants: [{ name: 'default', description: '标准侧边栏' }],
    sizes: ['medium'],
    states: { disabled: false, loading: false, error: false, responsive: true },
    className: 'ds-sidebar',
    props: ['items', 'activeKey', 'collapsed', 'logo'],
  },
  {
    type: 'Layout',
    category: 'layout',
    description: '应用整体布局（侧边栏 + 顶栏 + 内容区）',
    variants: [
      { name: 'sidebar', description: '带侧边栏的布局' },
      { name: 'topbar', description: '仅顶栏布局' },
    ],
    sizes: ['medium'],
    states: { disabled: false, loading: false, error: false, responsive: true },
    className: 'ds-layout',
    props: ['sidebar', 'navbar', 'children', 'variant'],
  },
]

/** 按类型查找组件定义 */
export function getDSComponent(type: string): DSComponent | undefined {
  return DESIGN_SYSTEM_COMPONENTS.find((c) => c.type === type)
}

/** 判断是否为 Design System 基础组件 */
export function isDesignSystemComponent(type: string): boolean {
  return DESIGN_SYSTEM_COMPONENTS.some((c) => c.type === type)
}
