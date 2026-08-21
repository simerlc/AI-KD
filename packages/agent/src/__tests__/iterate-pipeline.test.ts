import { describe, it, expect } from 'vitest'
import { Orchestrator } from '../orchestrator'
import type { AppModel } from '@aikd/shared'
import type { LLMClient, LLMMessage } from '../types'

/** 已有多页面应用：首页 + 列表页，含主题与数据源 */
function makeExistingApp(): AppModel {
  return {
    id: 'app_todo',
    name: '待办事项',
    type: 'web',
    version: '0.1.0',
    schema: {
      theme: { primaryColor: '#1677ff', fontFamily: 'Inter, sans-serif', borderRadius: 8, spacing: 8 },
      pages: [
        {
          id: 'page_home',
          path: '/',
          title: '首页',
          layout: 'web',
          pageType: 'home',
          components: [
            { id: 'c1', type: 'Heading', props: { text: '欢迎' } },
            { id: 'c2', type: 'Paragraph', props: { text: '这是待办应用' } },
          ],
        },
        {
          id: 'page_list',
          path: '/todos',
          title: '待办列表',
          layout: 'web',
          pageType: 'list',
          components: [
            { id: 'c3', type: 'Table', props: { columns: [{ title: '名称', dataIndex: 'name' }] } },
          ],
        },
      ],
      routes: [
        { path: '/', pageId: 'page_home' },
        { path: '/todos', pageId: 'page_list' },
      ],
      dataSources: [{ id: 'todos', name: 'todos', type: 'mock', data: [{ name: '写周报' }] }],
    },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }
}

/** 模拟 LLM：Planner 增量返回（新增统计页面，保留其余）；Builder 无有效文件数组→确定性兜底 */
function makeIterationLLM(): LLMClient {
  const existing = makeExistingApp()
  const incremental = JSON.stringify({
    ...existing,
    schema: {
      ...existing.schema,
      pages: [
        ...existing.schema.pages,
        {
          id: 'page_stats',
          path: '/stats',
          title: '统计页面',
          layout: 'web',
          pageType: 'dashboard',
          components: [{ id: 'c_stats', type: 'StatCard', props: { title: '完成数', value: 12 } }],
        },
      ],
      routes: [...existing.schema.routes, { path: '/stats', pageId: 'page_stats' }],
    },
  })
  return {
    async complete(_messages: LLMMessage[]): Promise<string> {
      return '```json\n' + incremental + '\n```'
    },
    async stream(_messages: LLMMessage[], _o, onChunk): Promise<string> {
      onChunk(incremental)
      return incremental
    },
  }
}

describe('用户迭代修改（Orchestrator 增量流水线）', () => {
  it('多页面应用输入"增加一个统计页面"，应动态新增该页面且原页面不受影响', async () => {
    const orchestrator = new Orchestrator(makeIterationLLM())

    const result = await orchestrator.run({
      prompt: '增加一个统计页面',
      appId: 'app_todo',
      existingAppModel: makeExistingApp(),
    })

    const app = result.appModel
    // 增量 Planner 产出新页面
    expect(app.schema.pages.map((p) => p.id)).toContain('page_stats')
    expect(app.schema.pages.map((p) => p.path)).toContain('/stats')
    // 原页面保留
    expect(app.schema.pages.map((p) => p.id)).toContain('page_home')
    expect(app.schema.pages.map((p) => p.id)).toContain('page_list')
    // 主题与数据源保留
    expect(app.schema.theme.primaryColor).toBe('#1677ff')
    expect(app.schema.dataSources).toHaveLength(1)
    // Builder 生成了含新页面的多个文件（含 App.tsx 与 pages）
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('src/App.tsx')
    expect(paths.some((p) => p.startsWith('src/pages/'))).toBe(true)
    // 结果仍通过测试（功能正确性不受影响）
    expect(result.testResult.passed).toBe(true)
  })
})
