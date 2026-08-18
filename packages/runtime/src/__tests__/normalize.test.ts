import { describe, it, expect } from 'vitest'
import { normalizeSchema, isAppSchema, appModelToAppSchema } from '../schema/normalize'
import type { AppModel, AppSchema } from '@aikd/shared'

const appModel: AppModel = {
  id: 'app1',
  name: '客户管理',
  type: 'web',
  version: '0.1.0',
  schema: {
    pages: [
      {
        id: 'page_home',
        path: '/',
        title: '首页',
        layout: 'web',
        components: [{ id: 'c1', type: 'Heading', props: { text: 'Hello' } }],
      },
    ],
    routes: [{ path: '/', pageId: 'page_home' }],
    theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
    dataSources: [{ id: 'ds1', name: 'customers', type: 'static', data: [{ id: 1, name: '张三' }] }],
  },
  createdAt: 1000,
  updatedAt: 2000,
}

describe('normalizeSchema', () => {
  it('isAppSchema 应识别 AppSchema', () => {
    expect(isAppSchema(appModel)).toBe(false)
    expect(isAppSchema(appModelToAppSchema(appModel))).toBe(true)
  })

  it('appModelToAppSchema 应转换 dataSources → data.sources', () => {
    const schema = appModelToAppSchema(appModel)
    expect(schema.schemaVersion).toBe('1.0.0')
    expect(schema.data.sources).toHaveLength(1)
    expect(schema.data.sources[0].name).toBe('customers')
    expect(schema.data.sources[0].data).toEqual([{ id: 1, name: '张三' }])
    expect(schema.pages).toHaveLength(1)
    expect(schema.routes).toHaveLength(1)
  })

  it('normalizeSchema 应透传 AppSchema', () => {
    const schema = appModelToAppSchema(appModel)
    expect(normalizeSchema(schema)).toBe(schema)
  })

  it('normalizeSchema 应转换 AppModel', () => {
    const schema = normalizeSchema(appModel)
    expect(schema.schemaVersion).toBe('1.0.0')
    expect(schema.name).toBe('客户管理')
  })

  it('normalizeSchema 应拒绝未知输入', () => {
    expect(() => normalizeSchema({ foo: 'bar' } as unknown as AppSchema)).toThrow()
  })
})
