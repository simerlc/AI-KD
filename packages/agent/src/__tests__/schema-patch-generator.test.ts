import { describe, it, expect } from 'vitest'
import { SchemaPatchGenerator } from '../schema-patch-generator'
import { applyPatch, createPatch } from '@aikd/app-engine'
import { validateAppSchema } from '@aikd/app-engine'
import type { LLMClient, LLMMessage } from '../types'
import type { AppSchema, PatchOp } from '@aikd/shared'

// ─── 测试工具：基础客户管理系统 Schema ───────────────────

function makeCrmSchema(): AppSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'crm_app',
    name: '客户管理系统',
    type: 'web',
    version: '0.1.0',
    pages: [
      {
        id: 'page_list',
        path: '/',
        title: '客户列表',
        layout: 'web',
        components: [
          { id: 'heading', type: 'Heading', props: { text: '客户列表' } },
          { id: 'table', type: 'Table', props: { columns: [{ key: 'name', title: '客户名称' }, { key: 'phone', title: '手机号' }], rows: [] } },
        ],
      },
    ],
    routes: [{ path: '/', pageId: 'page_list' }],
    theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
    data: {
      sources: [
        {
          id: 'customers',
          name: '客户',
          type: 'static',
          data: [
            { id: 1, name: '张三', phone: '138' },
            { id: 2, name: '李四', phone: '139' },
          ],
        },
      ],
    },
    actions: [
      { id: 'insert_customer', name: '新增客户', type: 'database.insert', params: { tableId: 'customers' } },
      { id: 'refresh', name: '刷新', type: 'page.refresh', params: {} },
    ],
    events: [
      { id: 'save', name: '保存', trigger: 'interaction', event: 'submit', actions: ['insert_customer', 'refresh'] },
    ],
  }
}

// 构造 mock LLM，返回指定 ops
function makeLLM(ops: PatchOp[]): LLMClient {
  return {
    async complete(_messages: LLMMessage[]): Promise<string> {
      return '```json\n' + JSON.stringify({ ops }) + '\n```'
    },
    async stream(_m, _o, onChunk) {
      onChunk('')
      return ''
    },
  }
}

// 完整流程：自然语言 → Patch → apply → 验证
async function runScenario(request: string, ops: PatchOp[]) {
  const schema = makeCrmSchema()
  const generator = new SchemaPatchGenerator(makeLLM(ops))
  const { patch } = await generator.generate({ request, currentSchema: schema })

  const fullPatch = createPatch(patch.description, patch.ops, schema.version)
  const result = applyPatch(schema, fullPatch)
  return result
}

// ─── 5 种自然语言修改场景 ────────────────────────────────

describe('AI 增量修改 — 5 种自然语言场景', () => {
  it('场景 1：增加客户等级字段', async () => {
    const result = await runScenario('增加客户等级字段', [
      {
        op: 'update',
        path: '/data/sources/0/data',
        value: [
          { id: 1, name: '张三', phone: '138', level: 'VIP' },
          { id: 2, name: '李四', phone: '139', level: '普通' },
        ],
      },
      {
        op: 'update',
        path: '/pages/0/components/1/props/columns',
        value: [
          { key: 'name', title: '客户名称' },
          { key: 'phone', title: '手机号' },
          { key: 'level', title: '客户等级' },
        ],
      },
    ])

    expect(result.success).toBe(true)
    const columns = result.schema!.pages[0].components[1].props.columns as Array<{ key: string; title: string }>
    expect(columns.map((c) => c.key)).toContain('level')
    expect(columns.some((c) => c.title === '客户等级')).toBe(true)
  })

  it('场景 2：给客户列表增加搜索', async () => {
    const result = await runScenario('给客户列表增加搜索', [
      {
        op: 'add',
        path: '/pages/0/components/1',
        value: { id: 'search', type: 'Input', props: { placeholder: '搜索客户', type: 'text' } },
      },
    ])

    expect(result.success).toBe(true)
    const components = result.schema!.pages[0].components
    expect(components.some((c) => c.id === 'search')).toBe(true)
    expect(components[1].type).toBe('Input')
  })

  it('场景 3：增加客户详情页面', async () => {
    const result = await runScenario('增加客户详情页面', [
      {
        op: 'add',
        path: '/pages/-',
        value: {
          id: 'page_detail',
          path: '/detail',
          title: '客户详情',
          layout: 'web',
          components: [{ id: 'detail_heading', type: 'Heading', props: { text: '客户详情' } }],
        },
      },
      {
        op: 'add',
        path: '/routes/-',
        value: { path: '/detail', pageId: 'page_detail' },
      },
    ])

    expect(result.success).toBe(true)
    expect(result.schema!.pages).toHaveLength(2)
    expect(result.schema!.pages[1].id).toBe('page_detail')
    expect(result.schema!.routes).toHaveLength(2)
    expect(result.schema!.routes[1].path).toBe('/detail')
  })

  it('场景 4：销售只能看到自己的客户（权限过滤）', async () => {
    const result = await runScenario('销售只能看到自己的客户', [
      {
        op: 'add',
        path: '/actions/-',
        value: {
          id: 'filter_own_customers',
          name: '过滤自己的客户',
          type: 'database.query',
          params: { tableId: 'customers', query: { filters: [{ field: 'salesId', op: 'eq', value: '{{user.id}}' }] } },
        },
      },
      {
        op: 'update',
        path: '/events/0/actions',
        value: ['filter_own_customers', 'insert_customer', 'refresh'],
      },
    ])

    expect(result.success).toBe(true)
    const filterAction = result.schema!.actions!.find((a) => a.id === 'filter_own_customers')
    expect(filterAction).toBeDefined()
    expect(filterAction!.params.query).toMatchObject({ filters: [{ field: 'salesId', op: 'eq', value: '{{user.id}}' }] })
    expect(result.schema!.events![0].actions).toContain('filter_own_customers')
  })

  it('场景 5：修改客户列表标题', async () => {
    const result = await runScenario('修改客户列表标题', [
      { op: 'update', path: '/pages/0/title', value: '我的客户' },
      { op: 'update', path: '/pages/0/components/0/props/text', value: '我的客户' },
    ])

    expect(result.success).toBe(true)
    expect(result.schema!.pages[0].title).toBe('我的客户')
    expect(result.schema!.pages[0].components[0].props.text).toBe('我的客户')
  })
})

// ─── 撤销验证 ────────────────────────────────────────────

describe('AI 增量修改 — 撤销与失败安全', () => {
  it('每次修改后 Schema 仍通过验证', async () => {
    // 综合场景：连续修改后验证 Schema 合法性
    const schema = makeCrmSchema()
    const generator = new SchemaPatchGenerator(makeLLM([
      { op: 'update', path: '/pages/0/title', value: '客户管理' },
    ]))

    const { patch } = await generator.generate({ request: '改名', currentSchema: schema })
    const result = applyPatch(schema, createPatch(patch.description, patch.ops, schema.version))

    expect(result.success).toBe(true)
    const validation = validateAppSchema(result.schema!)
    expect(validation.success).toBe(true)
  })

  it('非法 Patch 不应破坏原应用', async () => {
    const schema = makeCrmSchema()
    const originalJson = JSON.stringify(schema)

    // 生成器会重试失败，这里直接测试 applyPatch 的失败安全
    const badPatch = createPatch('非法修改', [
      { op: 'update', path: '/pages/999/title', value: 'x' },
    ], schema.version)

    const result = applyPatch(schema, badPatch)
    expect(result.success).toBe(false)
    expect(JSON.stringify(schema)).toBe(originalJson)
  })
})
