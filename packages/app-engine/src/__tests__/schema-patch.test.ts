import { describe, it, expect } from 'vitest'
import {
  applyPatch,
  invertPatch,
  validatePatch,
  createPatch,
  PatchHistory,
} from '../schema-patch'
import type { AppSchema } from '@aikd/shared'

// ─── 测试工具 ────────────────────────────────────────────

function makeSchema(): AppSchema {
  return {
    schemaVersion: '1.0.0',
    id: 'app_test',
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
          { id: 'btn_add', type: 'Button', props: { text: '新增客户' } },
        ],
      },
    ],
    routes: [{ path: '/', pageId: 'page_list' }],
    theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
    data: {
      sources: [{ id: 'customers', name: '客户', type: 'static', data: [] }],
    },
    actions: [
      { id: 'insert_customer', name: '新增客户', type: 'database.insert', params: { tableId: 'customers' } },
    ],
    events: [
      { id: 'save', name: '保存', trigger: 'interaction', event: 'click', actions: ['insert_customer'] },
    ],
  }
}

// ─── add 操作 ────────────────────────────────────────────

describe('SchemaPatch - add', () => {
  it('应在数组末尾追加元素', () => {
    const schema = makeSchema()
    const patch = createPatch('增加页面', [
      {
        op: 'add',
        path: '/pages/-',
        value: { id: 'page_new', path: '/new', title: '新增页', layout: 'web', components: [] },
      },
    ], schema.version)

    const result = applyPatch(schema, patch)
    expect(result.success).toBe(true)
    expect(result.schema!.pages).toHaveLength(2)
    expect(result.schema!.pages[1].id).toBe('page_new')
  })

  it('应更新对象的属性', () => {
    const schema = makeSchema()
    const patch = createPatch('修改标题', [
      { op: 'update', path: '/pages/0/title', value: '客户管理' },
    ], schema.version)

    const result = applyPatch(schema, patch)
    expect(result.success).toBe(true)
    expect(result.schema!.pages[0].title).toBe('客户管理')
  })

  it('应删除数组元素', () => {
    const schema = makeSchema()
    const patch = createPatch('删除组件', [
      { op: 'delete', path: '/pages/0/components/1' },
    ], schema.version)

    const result = applyPatch(schema, patch)
    expect(result.success).toBe(true)
    expect(result.schema!.pages[0].components).toHaveLength(1)
    expect(result.schema!.pages[0].components[0].id).toBe('heading')
  })

  it('应移动数组元素', () => {
    const schema = makeSchema()
    // 添加第二个组件，然后移动到第一个
    const patch = createPatch('移动组件', [
      { op: 'move', from: '/pages/0/components/1', path: '/pages/0/components/0' },
    ], schema.version)

    const result = applyPatch(schema, patch)
    expect(result.success).toBe(true)
    expect(result.schema!.pages[0].components[0].id).toBe('btn_add')
    expect(result.schema!.pages[0].components[1].id).toBe('heading')
  })
})

// ─── 验证 ────────────────────────────────────────────────

describe('SchemaPatch - validatePatch', () => {
  it('应拒绝非法路径', () => {
    const schema = makeSchema()
    const patch = createPatch('非法', [
      { op: 'update', path: 'invalid/path', value: 1 },
    ], schema.version)

    const result = validatePatch(schema, patch)
    expect(result.success).toBe(false)
  })

  it('应拒绝空操作列表', () => {
    const schema = makeSchema()
    const patch = createPatch('空', [], schema.version)
    const result = validatePatch(schema, patch)
    expect(result.success).toBe(false)
  })

  it('应拒绝无效操作类型', () => {
    const schema = makeSchema()
    const patch = createPatch('非法类型', [
      { op: 'invalid' as never, path: '/x' },
    ], schema.version)
    const result = validatePatch(schema, patch)
    expect(result.success).toBe(false)
  })
})

// ─── 撤销 ────────────────────────────────────────────────

describe('SchemaPatch - invertPatch（撤销）', () => {
  it('add 的逆操作是 delete', () => {
    const schema = makeSchema()
    const patch = createPatch('增加页面', [
      { op: 'add', path: '/pages/-', value: { id: 'p2', path: '/2', title: 'x', layout: 'web', components: [] } },
    ], schema.version)

    const applied = applyPatch(schema, patch)
    expect(applied.success).toBe(true)

    const inverse = invertPatch(patch, schema, applied.schema)
    const reverted = applyPatch(applied.schema!, inverse)
    expect(reverted.success).toBe(true)
    expect(reverted.schema!.pages).toHaveLength(1)
  })

  it('update 的逆操作是回写原值', () => {
    const schema = makeSchema()
    const patch = createPatch('修改标题', [
      { op: 'update', path: '/pages/0/title', value: '新标题' },
    ], schema.version)

    const applied = applyPatch(schema, patch)
    expect(applied.schema!.pages[0].title).toBe('新标题')

    const inverse = invertPatch(patch, schema, applied.schema)
    const reverted = applyPatch(applied.schema!, inverse)
    expect(reverted.schema!.pages[0].title).toBe('客户列表')
  })

  it('delete 的逆操作是恢复原值', () => {
    const schema = makeSchema()
    const patch = createPatch('删除组件', [
      { op: 'delete', path: '/pages/0/components/1' },
    ], schema.version)

    const applied = applyPatch(schema, patch)
    expect(applied.schema!.pages[0].components).toHaveLength(1)

    const inverse = invertPatch(patch, schema, applied.schema)
    const reverted = applyPatch(applied.schema!, inverse)
    expect(reverted.schema!.pages[0].components).toHaveLength(2)
    expect(reverted.schema!.pages[0].components[1].id).toBe('btn_add')
  })
})

// ─── 历史 / 失败安全 ─────────────────────────────────────

describe('SchemaPatch - PatchHistory', () => {
  it('应支持撤销和重做', () => {
    const schema = makeSchema()
    const history = new PatchHistory()

    const patch = createPatch('修改标题', [
      { op: 'update', path: '/pages/0/title', value: '新标题' },
    ], schema.version)

    const applied = applyPatch(schema, patch)
    expect(applied.success).toBe(true)
    history.record(patch, schema, applied.schema!)

    // 撤销
    const undoResult = history.undo()
    expect(undoResult.success).toBe(true)
    expect(undoResult.schema!.pages[0].title).toBe('客户列表')

    // 重做
    const redoResult = history.redo()
    expect(redoResult.success).toBe(true)
    expect(redoResult.schema!.pages[0].title).toBe('新标题')
  })

  it('Patch 应用失败不应破坏原 Schema', () => {
    const schema = makeSchema()
    const originalJson = JSON.stringify(schema)

    const badPatch = createPatch('非法路径', [
      { op: 'update', path: '/pages/999/title', value: 'x' },
    ], schema.version)

    const result = applyPatch(schema, badPatch)
    expect(result.success).toBe(false)
    // 原 Schema 未被修改
    expect(JSON.stringify(schema)).toBe(originalJson)
  })
})
