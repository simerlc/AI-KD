import type { ComponentDefinition } from '../types'

// ─── 展示组件 ────────────────────────────────────────────

export const Image: ComponentDefinition = {
  type: 'Image',
  name: '图片',
  category: 'display',
  description: '图片展示组件，支持设置宽高和圆角。',
  acceptsChildren: false,
  defaultProps: {
    src: '',
    alt: '图片',
    width: '100%',
    height: 'auto',
    radius: '0px',
  },
  propsSchema: [
    { name: 'src', type: 'string', description: '图片地址 URL', default: '', required: true },
    { name: 'alt', type: 'string', description: '替代文本', default: '图片' },
    { name: 'width', type: 'string', description: '宽度，如 "100%" 或 "200px"', default: '100%' },
    { name: 'height', type: 'string', description: '高度，如 "auto" 或 "200px"', default: 'auto' },
    { name: 'radius', type: 'string', description: '圆角，如 "8px"', default: '0px' },
  ],
}

export const Card: ComponentDefinition = {
  type: 'Card',
  name: '卡片',
  category: 'display',
  description: '卡片容器，可包含标题、内容和图片，常用于信息展示。',
  acceptsChildren: true,
  defaultProps: {
    title: '卡片标题',
    shadow: 'medium',
    radius: '8px',
    padding: '16px',
  },
  propsSchema: [
    { name: 'title', type: 'string', description: '卡片标题', default: '卡片标题' },
    {
      name: 'shadow',
      type: 'select',
      description: '阴影大小',
      default: 'medium',
      options: ['none', 'small', 'medium', 'large'],
    },
    { name: 'radius', type: 'string', description: '圆角', default: '8px' },
    { name: 'padding', type: 'string', description: '内边距', default: '16px' },
  ],
}

export const List: ComponentDefinition = {
  type: 'List',
  name: '列表',
  category: 'display',
  description: '列表组件，根据数据源渲染重复内容，常用于文章列表、商品列表等。',
  acceptsChildren: false,
  defaultProps: {
    dataSource: '',
    layout: 'vertical',
    gap: '12px',
  },
  propsSchema: [
    {
      name: 'dataSource',
      type: 'string',
      description: '数据源名称（引用 App Model 中的 dataSources）',
      default: '',
      required: true,
    },
    {
      name: 'layout',
      type: 'select',
      description: '列表布局',
      default: 'vertical',
      options: ['vertical', 'grid'],
    },
    { name: 'gap', type: 'string', description: '列表项间距', default: '12px' },
  ],
}

export const Table: ComponentDefinition = {
  type: 'Table',
  name: '表格',
  category: 'display',
  description: '表格组件，根据数据源渲染行列数据。',
  acceptsChildren: false,
  defaultProps: {
    dataSource: '',
    columns: [],
  },
  propsSchema: [
    {
      name: 'dataSource',
      type: 'string',
      description: '数据源名称',
      default: '',
      required: true,
    },
    {
      name: 'columns',
      type: 'array',
      description: '列定义，如 [{"key":"name","title":"名称"}]',
      default: [],
    },
  ],
}
