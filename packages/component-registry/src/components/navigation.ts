import type { ComponentDefinition } from '../types'

// ─── 导航组件 ────────────────────────────────────────────

export const Header: ComponentDefinition = {
  type: 'Header',
  name: '页头',
  category: 'navigation',
  description: '页面顶部导航栏，包含 Logo 和导航链接。',
  acceptsChildren: true,
  defaultProps: {
    title: '网站标题',
    logo: '',
    background: '#ffffff',
    height: '64px',
  },
  propsSchema: [
    { name: 'title', type: 'string', description: '网站标题', default: '网站标题', required: true },
    { name: 'logo', type: 'string', description: 'Logo 图片 URL（可选）', default: '' },
    { name: 'background', type: 'color', description: '背景颜色', default: '#ffffff' },
    { name: 'height', type: 'string', description: '高度', default: '64px' },
  ],
}

export const Footer: ComponentDefinition = {
  type: 'Footer',
  name: '页脚',
  category: 'navigation',
  description: '页面底部区域，常用于版权信息和链接。',
  acceptsChildren: true,
  defaultProps: {
    text: '© 2026 版权所有',
    background: '#f5f5f5',
    color: '#666666',
  },
  propsSchema: [
    { name: 'text', type: 'string', description: '页脚文本', default: '© 2026 版权所有' },
    { name: 'background', type: 'color', description: '背景颜色', default: '#f5f5f5' },
    { name: 'color', type: 'color', description: '文字颜色', default: '#666666' },
  ],
}

export const NavBar: ComponentDefinition = {
  type: 'NavBar',
  name: '导航菜单',
  category: 'navigation',
  description: '导航菜单栏，包含多个导航链接。',
  acceptsChildren: false,
  defaultProps: {
    items: [],
    orientation: 'horizontal',
  },
  propsSchema: [
    {
      name: 'items',
      type: 'array',
      description: '导航项列表，如 [{"text":"首页","href":"/"}]',
      default: [],
      required: true,
    },
    {
      name: 'orientation',
      type: 'select',
      description: '排列方向',
      default: 'horizontal',
      options: ['horizontal', 'vertical'],
    },
  ],
}

export const Tabs: ComponentDefinition = {
  type: 'Tabs',
  name: '标签页',
  category: 'navigation',
  description: '标签页组件，在多个内容面板间切换。',
  acceptsChildren: false,
  defaultProps: {
    tabs: [],
    defaultActive: 0,
  },
  propsSchema: [
    {
      name: 'tabs',
      type: 'array',
      description: '标签页列表，如 [{"title":"标签1","content":"内容1"}]',
      default: [],
      required: true,
    },
    { name: 'defaultActive', type: 'number', description: '默认激活的标签索引', default: 0 },
  ],
}
