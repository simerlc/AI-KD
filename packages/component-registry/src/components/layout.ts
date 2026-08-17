import type { ComponentDefinition } from '../types'

// ─── 布局组件 ────────────────────────────────────────────

export const Container: ComponentDefinition = {
  type: 'Container',
  name: '容器',
  category: 'layout',
  description: '页面级容器，用于包裹和居中内容，可设置最大宽度。',
  acceptsChildren: true,
  defaultProps: {
    maxWidth: '1200px',
    padding: '16px',
    background: 'transparent',
  },
  propsSchema: [
    { name: 'maxWidth', type: 'string', description: '最大宽度，如 "1200px" 或 "100%"', default: '1200px' },
    { name: 'padding', type: 'string', description: '内边距，如 "16px" 或 "24px"', default: '16px' },
    { name: 'background', type: 'color', description: '背景颜色', default: 'transparent' },
  ],
}

export const Grid: ComponentDefinition = {
  type: 'Grid',
  name: '网格布局',
  category: 'layout',
  description: '网格布局容器，将子组件按列排列。',
  acceptsChildren: true,
  defaultProps: {
    columns: 3,
    gap: '16px',
  },
  propsSchema: [
    { name: 'columns', type: 'number', description: '列数', default: 3, required: true },
    { name: 'gap', type: 'string', description: '列间距，如 "16px"', default: '16px' },
  ],
}

export const Flex: ComponentDefinition = {
  type: 'Flex',
  name: '弹性布局',
  category: 'layout',
  description: '弹性布局容器，支持水平和垂直排列子组件。',
  acceptsChildren: true,
  defaultProps: {
    direction: 'row',
    justify: 'flex-start',
    align: 'center',
    gap: '8px',
  },
  propsSchema: [
    {
      name: 'direction',
      type: 'select',
      description: '排列方向',
      default: 'row',
      options: ['row', 'column'],
    },
    {
      name: 'justify',
      type: 'select',
      description: '主轴对齐方式',
      default: 'flex-start',
      options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
    },
    {
      name: 'align',
      type: 'select',
      description: '交叉轴对齐方式',
      default: 'center',
      options: ['flex-start', 'center', 'flex-end', 'stretch'],
    },
    { name: 'gap', type: 'string', description: '子元素间距', default: '8px' },
  ],
}

export const Section: ComponentDefinition = {
  type: 'Section',
  name: '区块',
  category: 'layout',
  description: '页面区块，用于分割页面内容，可设置标题和背景。',
  acceptsChildren: true,
  defaultProps: {
    title: '',
    background: '#ffffff',
    padding: '24px',
  },
  propsSchema: [
    { name: 'title', type: 'string', description: '区块标题（可选）', default: '' },
    { name: 'background', type: 'color', description: '背景颜色', default: '#ffffff' },
    { name: 'padding', type: 'string', description: '内边距', default: '24px' },
  ],
}
