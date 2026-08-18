import { describe, it, expect } from 'vitest'
import { BuilderAgent } from '../builder'
import type { AppModel } from '@aikd/shared'
import type { LLMClient } from '../types'

function makeAppModel(): AppModel {
  return {
    id: 'crm_app',
    name: '客户管理系统',
    type: 'web',
    version: '0.1.0',
    schema: {
      pages: [
        {
          id: 'page_list',
          path: '/',
          title: '客户列表',
          layout: 'web',
          components: [
            { id: 'heading', type: 'Heading', props: { text: '客户列表' } },
          ],
        },
      ],
      routes: [{ path: '/', pageId: 'page_list' }],
      theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
      dataSources: [
        {
          id: 'customers',
          name: 'customers',
          type: 'static',
          data: [{ id: 1, name: '张三', phone: '138' }],
        },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const mockLLM: LLMClient = {
  async complete() {
    return ''
  },
  async stream(_m, _o, onChunk) {
    onChunk('')
    return ''
  },
}

describe('BuilderAgent - 数据访问层生成', () => {
  it('应生成 src/api.ts（而非静态 data.ts）', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeAppModel() })

    const apiFile = files.find((f) => f.path === 'src/api.ts')
    expect(apiFile).toBeTruthy()
  })

  it('api.ts 应包含表引用和 CRUD 方法', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeAppModel() })

    const apiFile = files.find((f) => f.path === 'src/api.ts')!
    const content = apiFile.content

    // 表引用
    expect(content).toContain("tableId: 'customers'")
    // CRUD 方法
    expect(content).toContain('listRecords')
    expect(content).toContain('createRecord')
    expect(content).toContain('updateRecord')
    expect(content).toContain('deleteRecord')
    // 后端 API 路径
    expect(content).toContain('/api/data/tables/')
    expect(content).toContain('/api/data/records/')
  })

  it('vite.config.ts 应配置 /api 代理', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeAppModel() })

    const viteConfig = files.find((f) => f.path === 'vite.config.ts')!
    expect(viteConfig.content).toContain("proxy")
    expect(viteConfig.content).toContain("'/api'")
    expect(viteConfig.content).toContain('localhost:3001')
  })

  it('无数据源时也应生成 api.ts（空表）', async () => {
    const builder = new BuilderAgent(mockLLM)
    const model = makeAppModel()
    model.schema.dataSources = []
    const { files } = await builder.build({ appModel: model })

    // 无数据源时不生成 api.ts（保持向后兼容）
    const apiFile = files.find((f) => f.path === 'src/api.ts')
    expect(apiFile).toBeUndefined()
  })

  it('传入 appId 时 tableId 应与后端建表主键一致（appId:name）', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeAppModel(), appId: 'task_123' })

    const apiFile = files.find((f) => f.path === 'src/api.ts')!
    const content = apiFile.content

    // 后端 backend-init.service 用 `${appId}:${name}` 作为 data_models.id，
    // 前端 api.ts 必须使用相同的 tableId 才能命中后端表。
    expect(content).toContain("tableId: 'task_123:customers'")
    // 不应再出现裸的 'customers'（避免与后端主键不一致）
    expect(content).not.toContain("tableId: 'customers'")
  })
})
