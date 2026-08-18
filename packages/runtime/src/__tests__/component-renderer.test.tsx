import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppSchema, ComponentNode } from '@aikd/shared'
import { Runtime } from '../Runtime'
import { createMemoryDataClient } from '../data/data-client'
import type { RuntimeAdapter } from '../adapter'

// ─── 测试工具：构造 Runtime 渲染环境 ──────────────────────

function makeAdapter(): RuntimeAdapter {
  return {
    dataClient: createMemoryDataClient(),
    actionRuntime: {
      notification: { success: () => {}, error: () => {} },
      navigation: { go: () => {} },
      modal: { open: () => {}, close: () => {} },
      page: { refresh: () => {} },
    },
    http: { request: async () => ({ ok: true }) },
  }
}

function makeSchema(components: ComponentNode[]): AppSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'app_test',
    name: '测试',
    type: 'web',
    version: '0.1.0',
    pages: [{ id: 'page_home', path: '/', title: '首页', layout: 'web', components }],
    routes: [{ path: '/', pageId: 'page_home' }],
    theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
    data: { sources: [] },
  }
}

describe('ComponentRenderer（SSR 渲染）', () => {
  it('应渲染 Heading 组件', () => {
    const schema = makeSchema([{ id: 'h1', type: 'Heading', props: { text: '客户管理', level: 'h1' } }])
    const html = renderToStaticMarkup(<Runtime schema={schema} dataClient={createMemoryDataClient()} adapter={makeAdapter()} />)
    expect(html).toContain('客户管理')
    expect(html).toContain('<h1')
  })

  it('应渲染 Button 组件', () => {
    const schema = makeSchema([{ id: 'b1', type: 'Button', props: { text: '新增客户' } }])
    const html = renderToStaticMarkup(<Runtime schema={schema} dataClient={createMemoryDataClient()} adapter={makeAdapter()} />)
    expect(html).toContain('新增客户')
    expect(html).toContain('<button')
  })

  it('应渲染嵌套组件树（Container → Flex → Button）', () => {
    const schema = makeSchema([
      {
        id: 'container',
        type: 'Container',
        props: { padding: '16px' },
        children: [
          {
            id: 'flex',
            type: 'Flex',
            props: { direction: 'row', gap: '8px' },
            children: [{ id: 'btn', type: 'Button', props: { text: '保存' } }],
          },
        ],
      },
    ])
    const html = renderToStaticMarkup(<Runtime schema={schema} dataClient={createMemoryDataClient()} adapter={makeAdapter()} />)
    expect(html).toContain('保存')
  })

  it('应渲染 Form 表单组件', () => {
    const schema = makeSchema([
      {
        id: 'form',
        type: 'Form',
        props: { title: '客户表单' },
        children: [{ id: 'name', type: 'Input', props: { label: '客户名称', placeholder: '请输入' } }],
      },
    ])
    const html = renderToStaticMarkup(<Runtime schema={schema} dataClient={createMemoryDataClient()} adapter={makeAdapter()} />)
    expect(html).toContain('客户表单')
    expect(html).toContain('客户名称')
    expect(html).toContain('<form')
    expect(html).toContain('<input')
  })

  it('空页面应渲染占位提示', () => {
    const schema = makeSchema([])
    const html = renderToStaticMarkup(<Runtime schema={schema} dataClient={createMemoryDataClient()} adapter={makeAdapter()} />)
    expect(html).toContain('此页面暂无内容')
  })

  it('未知组件应渲染提示而非崩溃', () => {
    const schema = makeSchema([{ id: 'x', type: 'UnknownComponent', props: {} }])
    const html = renderToStaticMarkup(<Runtime schema={schema} dataClient={createMemoryDataClient()} adapter={makeAdapter()} />)
    expect(html).toContain('未知组件')
  })
})
