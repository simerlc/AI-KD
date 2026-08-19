// ─── 默认组件用法示例（Component Library）─────────────────
//
// 为各基础组件提供默认的 usageExamples（用法示例），供 BlueprintAgent
// 做组件选择、CodingAgent 做组件复用。组件定义中未显式提供 usageExamples 时，
// 注册表会从这里合并默认示例。这样既能保持组件定义简洁，又保证示例可扩展。

import type { UsageExample } from './types'

/**
 * 默认用法示例映射：组件 type → 用法示例数组。
 * 新增组件时若想在注册中心获得示例，可在此追加。
 */
export const defaultUsageExamples: Record<string, UsageExample[]> = {
  Table: [
    {
      name: '数据列表',
      description: '展示数据表记录，支持搜索、新增、编辑、删除',
      component: {
        type: 'Table',
        props: {
          dataSource: 'database.customers',
          columns: [{ key: 'name', title: '名称' }, { key: 'phone', title: '电话' }],
          searchable: true,
          actions: ['detail', 'edit', 'delete'],
        },
      },
    },
  ],
  Form: [
    {
      name: '新增/编辑表单',
      description: '基于数据表字段的表单，用于新增或编辑记录',
      component: {
        type: 'Form',
        props: { dataSource: 'database.customers', title: '客户信息', submitText: '保存' },
        children: [
          { type: 'Input', props: { field: 'name', label: '名称', placeholder: '请输入名称' } },
          { type: 'Input', props: { field: 'phone', label: '电话', placeholder: '请输入电话' } },
        ],
      },
    },
  ],
  List: [
    {
      name: '信息列表',
      component: {
        type: 'List',
        props: {
          dataSource: 'database.articles',
          items: [{ text: '示例条目一' }, { text: '示例条目二' }],
        },
      },
    },
  ],
  Detail: [
    {
      name: '详情展示',
      component: {
        type: 'Detail',
        props: { dataSource: 'database.customers', paramId: ':id', title: '客户详情' },
      },
    },
  ],
  NavBar: [
    {
      name: '顶部导航',
      component: {
        type: 'NavBar',
        props: {
          items: [{ text: '首页', href: '/' }, { text: '商品', href: '/products' }],
        },
      },
    },
  ],
  Card: [
    {
      name: '信息卡片',
      component: {
        type: 'Card',
        props: { title: '卡片标题' },
        children: [{ type: 'Paragraph', props: { text: '卡片内容说明' } }],
      },
    },
  ],
}
