import type { ComponentDefinition } from '../types'

// ─── 表单组件 ────────────────────────────────────────────

export const Input: ComponentDefinition = {
  type: 'Input',
  name: '输入框',
  category: 'form',
  description: '单行文本输入框，支持占位符和标签。',
  acceptsChildren: false,
  defaultProps: {
    label: '',
    placeholder: '请输入',
    type: 'text',
    required: false,
  },
  propsSchema: [
    { name: 'label', type: 'string', description: '输入框标签', default: '' },
    { name: 'placeholder', type: 'string', description: '占位符文本', default: '请输入' },
    {
      name: 'type',
      type: 'select',
      description: '输入类型',
      default: 'text',
      options: ['text', 'email', 'password', 'number', 'tel'],
    },
    { name: 'required', type: 'boolean', description: '是否必填', default: false },
  ],
}

export const Textarea: ComponentDefinition = {
  type: 'Textarea',
  name: '文本域',
  category: 'form',
  description: '多行文本输入框。',
  acceptsChildren: false,
  defaultProps: {
    label: '',
    placeholder: '请输入内容',
    rows: 4,
  },
  propsSchema: [
    { name: 'label', type: 'string', description: '标签', default: '' },
    { name: 'placeholder', type: 'string', description: '占位符文本', default: '请输入内容' },
    { name: 'rows', type: 'number', description: '行数', default: 4 },
  ],
}

export const Select: ComponentDefinition = {
  type: 'Select',
  name: '下拉选择',
  category: 'form',
  description: '下拉选择框，支持多个选项。',
  acceptsChildren: false,
  defaultProps: {
    label: '',
    placeholder: '请选择',
    options: [],
  },
  propsSchema: [
    { name: 'label', type: 'string', description: '标签', default: '' },
    { name: 'placeholder', type: 'string', description: '占位符', default: '请选择' },
    {
      name: 'options',
      type: 'array',
      description: '选项列表，如 ["选项1", "选项2"]',
      default: [],
    },
  ],
}

export const Checkbox: ComponentDefinition = {
  type: 'Checkbox',
  name: '复选框',
  category: 'form',
  description: '复选框，支持单选或多选。',
  acceptsChildren: false,
  defaultProps: {
    label: '复选框',
    checked: false,
  },
  propsSchema: [
    { name: 'label', type: 'string', description: '复选框标签', default: '复选框', required: true },
    { name: 'checked', type: 'boolean', description: '是否选中', default: false },
  ],
}

export const Form: ComponentDefinition = {
  type: 'Form',
  name: '表单容器',
  category: 'form',
  description: '表单容器，包裹表单元素并处理提交。',
  acceptsChildren: true,
  defaultProps: {
    title: '',
    submitText: '提交',
    layout: 'vertical',
  },
  propsSchema: [
    { name: 'title', type: 'string', description: '表单标题', default: '' },
    { name: 'submitText', type: 'string', description: '提交按钮文字', default: '提交' },
    {
      name: 'layout',
      type: 'select',
      description: '表单布局',
      default: 'vertical',
      options: ['vertical', 'horizontal'],
    },
  ],
}
