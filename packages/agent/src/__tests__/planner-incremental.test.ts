import { describe, it, expect } from 'vitest'
import { PlannerAgent } from '../planner'
import type { AppModel } from '@aikd/shared'
import type { LLMClient, LLMMessage } from '../types'

function makeMockLLM(response: string): LLMClient {
  return {
    async complete(_messages: LLMMessage[]): Promise<string> {
      return '```json\n' + response + '\n```'
    },
    async stream(_messages: LLMMessage[], _opts, onChunk): Promise<string> {
      onChunk(response)
      return response
    },
  }
}

/** 多页面已有应用：首页 + 列表页，含主题与数据源 */
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
      dataSources: [
        { id: 'todos', name: 'todos', type: 'mock', data: [{ name: '写周报' }] },
      ],
    },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }
}

/** LLM 返回：在原应用基础上新增一个统计页面，其余保留 */
function incrementalResultJson(): string {
  const existing = makeExistingApp()
  return JSON.stringify({
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
      routes: [
        ...existing.schema.routes,
        { path: '/stats', pageId: 'page_stats' },
      ],
    },
  })
}

describe('PlannerAgent - 增量修改（planIncremental）', () => {
  it('增加一个统计页面时，应新增页面且保留原有主题/数据源/页面', async () => {
    const llm = makeMockLLM(incrementalResultJson())
    const planner = new PlannerAgent(llm)
    const existing = makeExistingApp()

    const result = await planner.planIncremental({
      instruction: '增加一个统计页面',
      existingAppModel: existing,
    })

    const app = result.appModel
    // 新增统计页面
    expect(app.schema.pages.map((p) => p.path)).toContain('/stats')
    expect(app.schema.pages.map((p) => p.id)).toContain('page_stats')
    // 路由新增
    expect(app.schema.routes.map((r) => r.path)).toContain('/stats')
    // 原有页面不受影响
    expect(app.schema.pages.map((p) => p.id)).toContain('page_home')
    expect(app.schema.pages.map((p) => p.id)).toContain('page_list')
    expect(app.schema.pages.find((p) => p.id === 'page_list')?.components).toHaveLength(1)
    // 原有主题保留
    expect(app.schema.theme.primaryColor).toBe('#1677ff')
    // 原有数据源保留
    expect(app.schema.dataSources).toHaveLength(1)
    expect(app.schema.dataSources[0].id).toBe('todos')
    // 应用 id / createdAt 保留
    expect(app.id).toBe('app_todo')
    expect(app.createdAt).toBe(1700000000000)
  })

})
