import type { ComponentDefinition } from '../types'

// ─── 文本组件 ────────────────────────────────────────────

export const Heading: ComponentDefinition = {
  type: 'Heading',
  name: '标题',
  category: 'text',
  description: '标题文本，支持 h1-h6 级别。',
  acceptsChildren: false,
  defaultProps: {
    text: '标题',
    level: 'h2',
    color: '#1a1a1a',
    align: 'left',
  },
  propsSchema: [
    { name: 'text', type: 'string', description: '标题文本内容', default: '标题', required: true },
    {
      name: 'level',
      type: 'select',
      description: '标题级别',
      default: 'h2',
      options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    },
    { name: 'color', type: 'color', description: '文字颜色', default: '#1a1a1a' },
    {
      name: 'align',
      type: 'select',
      description: '对齐方式',
      default: 'left',
      options: ['left', 'center', 'right'],
    },
  ],
}

export const Text: ComponentDefinition = {
  type: 'Text',
  name: '文本',
  category: 'text',
  description: '普通文本内容，支持自定义样式。',
  acceptsChildren: false,
  defaultProps: {
    text: '这是一段文本',
    fontSize: '14px',
    color: '#333333',
    align: 'left',
  },
  propsSchema: [
    { name: 'text', type: 'string', description: '文本内容', default: '这是一段文本', required: true },
    { name: 'fontSize', type: 'string', description: '字体大小，如 "14px"', default: '14px' },
    { name: 'color', type: 'color', description: '文字颜色', default: '#333333' },
    {
      name: 'align',
      type: 'select',
      description: '对齐方式',
      default: 'left',
      options: ['left', 'center', 'right'],
    },
  ],
}

export const Paragraph: ComponentDefinition = {
  type: 'Paragraph',
  name: '段落',
  category: 'text',
  description: '段落文本，支持多行长文本展示。',
  acceptsChildren: false,
  defaultProps: {
    text: '这是一段段落文本。',
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#333333',
  },
  propsSchema: [
    { name: 'text', type: 'string', description: '段落内容', default: '这是一段段落文本。', required: true },
    { name: 'fontSize', type: 'string', description: '字体大小', default: '16px' },
    { name: 'lineHeight', type: 'string', description: '行高，如 "1.6"', default: '1.6' },
    { name: 'color', type: 'color', description: '文字颜色', default: '#333333' },
  ],
}
