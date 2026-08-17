import type { ComponentDefinition } from '../types'

// ─── 反馈组件 ────────────────────────────────────────────

export const Alert: ComponentDefinition = {
  type: 'Alert',
  name: '提示框',
  category: 'feedback',
  description: '提示信息框，用于展示重要消息。',
  acceptsChildren: false,
  defaultProps: {
    text: '这是一条提示信息',
    variant: 'info',
    closable: false,
  },
  propsSchema: [
    { name: 'text', type: 'string', description: '提示文本', default: '这是一条提示信息', required: true },
    {
      name: 'variant',
      type: 'select',
      description: '提示类型',
      default: 'info',
      options: ['info', 'success', 'warning', 'error'],
    },
    { name: 'closable', type: 'boolean', description: '是否可关闭', default: false },
  ],
}

export const Badge: ComponentDefinition = {
  type: 'Badge',
  name: '徽标',
  category: 'feedback',
  description: '徽标组件，用于展示数字或状态标记。',
  acceptsChildren: false,
  defaultProps: {
    text: 'New',
    color: '#3b82f6',
    background: '#dbeafe',
  },
  propsSchema: [
    { name: 'text', type: 'string', description: '徽标文本', default: 'New', required: true },
    { name: 'color', type: 'color', description: '文字颜色', default: '#3b82f6' },
    { name: 'background', type: 'color', description: '背景颜色', default: '#dbeafe' },
  ],
}

export const Modal: ComponentDefinition = {
  type: 'Modal',
  name: '弹窗',
  category: 'feedback',
  description: '模态弹窗，展示在页面之上的对话框。',
  acceptsChildren: true,
  defaultProps: {
    title: '弹窗标题',
    visible: false,
    width: '500px',
  },
  propsSchema: [
    { name: 'title', type: 'string', description: '弹窗标题', default: '弹窗标题' },
    { name: 'visible', type: 'boolean', description: '是否可见', default: false },
    { name: 'width', type: 'string', description: '弹窗宽度', default: '500px' },
  ],
}
