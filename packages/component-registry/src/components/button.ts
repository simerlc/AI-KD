import type { ComponentDefinition } from '../types'

// ─── 按钮组件 ────────────────────────────────────────────

export const Button: ComponentDefinition = {
  type: 'Button',
  name: '按钮',
  category: 'button',
  description: '可点击的按钮组件，支持多种样式和尺寸。',
  acceptsChildren: false,
  defaultProps: {
    text: '按钮',
    variant: 'primary',
    size: 'medium',
    disabled: false,
  },
  propsSchema: [
    { name: 'text', type: 'string', description: '按钮文字', default: '按钮', required: true },
    {
      name: 'variant',
      type: 'select',
      description: '按钮样式',
      default: 'primary',
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger'],
    },
    {
      name: 'size',
      type: 'select',
      description: '按钮尺寸',
      default: 'medium',
      options: ['small', 'medium', 'large'],
    },
    { name: 'disabled', type: 'boolean', description: '是否禁用', default: false },
  ],
}

export const Link: ComponentDefinition = {
  type: 'Link',
  name: '链接',
  category: 'button',
  description: '超链接，可跳转到内部路由或外部 URL。',
  acceptsChildren: false,
  defaultProps: {
    text: '链接',
    href: '#',
    target: '_self',
  },
  propsSchema: [
    { name: 'text', type: 'string', description: '链接文字', default: '链接', required: true },
    {
      name: 'href',
      type: 'string',
      description: '链接地址，如 "/about" 或 "https://..."',
      default: '#',
      required: true,
    },
    {
      name: 'target',
      type: 'select',
      description: '打开方式',
      default: '_self',
      options: ['_self', '_blank'],
    },
  ],
}
