import { describe, it, expect } from 'vitest'
import { validateAppSchema } from '../app-schema'
import { checkSchemaCompatibility, isSchemaCompatible, normalizeSchemaVersion } from '../schema-version'
import { APP_SCHEMA_VERSION, type AppSchema } from '@aikd/shared'

// ─── 测试工具：构造一个合法的 AppSchema ──────────────────

function makeValidSchema(overrides: Partial<AppSchema> = {}): AppSchema {
  const base: AppSchema = {
    schemaVersion: APP_SCHEMA_VERSION,
    id: 'app_test',
    name: '测试应用',
    type: 'web',
    version: '0.1.0',
    pages: [
      {
        id: 'page_home',
        path: '/',
        title: '首页',
        layout: 'web',
        components: [
          {
            id: 'c_title',
            type: 'Heading',
            props: { text: 'Hello', level: 'h1' },
          },
          {
            id: 'c_btn',
            type: 'Button',
            props: { text: '点击' },
          },
        ],
      },
    ],
    routes: [{ path: '/', pageId: 'page_home' }],
    theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
    data: { sources: [] },
    actions: [
      {
        id: 'act_nav',
        name: '跳转',
        type: 'navigate',
        params: { path: '/about' },
      },
    ],
    events: [
      {
        id: 'evt_click',
        name: '点击跳转',
        trigger: 'interaction',
        event: 'click',
        actions: ['act_nav'],
      },
    ],
  }

  return { ...base, ...overrides } as AppSchema
}

// ─── 测试 ────────────────────────────────────────────────

describe('AppSchema 验证器', () => {
  it('应接受合法的 AppSchema', () => {
    const result = validateAppSchema(makeValidSchema())
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.data?.schemaVersion).toBe(APP_SCHEMA_VERSION)
  })

  it('缺失 schemaVersion 时应回退到默认版本', () => {
    const { schemaVersion: _omit, ...rest } = makeValidSchema()
    const result = validateAppSchema(rest)
    expect(result.success).toBe(true)
    expect(result.data?.schemaVersion).toBe(APP_SCHEMA_VERSION)
  })

  it('应拒绝缺少首页路由的 Schema', () => {
    const result = validateAppSchema(
      makeValidSchema({
        routes: [{ path: '/about', pageId: 'page_home' }],
      }),
    )
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('首页路由'))).toBe(true)
  })

  it('应拒绝引用不存在页面的路由', () => {
    const result = validateAppSchema(
      makeValidSchema({
        routes: [{ path: '/', pageId: 'page_ghost' }],
      }),
    )
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('page_ghost'))).toBe(true)
  })

  it('应拒绝事件引用不存在的动作', () => {
    const result = validateAppSchema(
      makeValidSchema({
        events: [
          {
            id: 'evt_bad',
            name: '坏事件',
            trigger: 'interaction',
            event: 'click',
            actions: ['act_ghost'],
          },
        ],
      }),
    )
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('act_ghost'))).toBe(true)
  })

  it('应拒绝页面引用不存在的事件', () => {
    const result = validateAppSchema(
      makeValidSchema({
        pages: [
          {
            id: 'page_home',
            path: '/',
            title: '首页',
            layout: 'web',
            components: [],
            events: ['evt_ghost'],
          },
        ],
      }),
    )
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.includes('evt_ghost'))).toBe(true)
  })

  it('应拒绝非法的 Action 类型', () => {
    const result = validateAppSchema(
      makeValidSchema({
        actions: [{ id: 'a', name: 'x', type: 'badType' as never, params: {} }],
      }),
    )
    expect(result.success).toBe(false)
  })

  it('应允许 action / event 为空（旧 AppModel 迁移场景）', () => {
    const result = validateAppSchema(
      makeValidSchema({
        actions: undefined,
        events: undefined,
      }),
    )
    expect(result.success).toBe(true)
  })
})

describe('Schema 版本管理', () => {
  it('CURRENT_SCHEMA_VERSION 应与 APP_SCHEMA_VERSION 一致', () => {
    expect(normalizeSchemaVersion(undefined)).toBe(APP_SCHEMA_VERSION)
  })

  it('相同主版本应视为兼容', () => {
    expect(checkSchemaCompatibility('1.0.0')).toBe('compatible')
    expect(checkSchemaCompatibility('1.5.0')).toBe('compatible')
    expect(isSchemaCompatible('1.2.3')).toBe(true)
  })

  it('低主版本应视为可迁移', () => {
    expect(checkSchemaCompatibility('0.9.0')).toBe('migrate')
    expect(isSchemaCompatible('0.1.0')).toBe(false)
  })

  it('高主版本应视为不支持', () => {
    expect(checkSchemaCompatibility('2.0.0')).toBe('unsupported')
  })

  it('缺失版本应视为可迁移', () => {
    expect(checkSchemaCompatibility(undefined)).toBe('migrate')
  })

  it('非法版本字符串应视为不支持', () => {
    expect(checkSchemaCompatibility('abc')).toBe('unsupported')
  })

  it('normalizeSchemaVersion 应回退非法/缺失版本', () => {
    expect(normalizeSchemaVersion(undefined)).toBe(APP_SCHEMA_VERSION)
    expect(normalizeSchemaVersion('abc')).toBe(APP_SCHEMA_VERSION)
    expect(normalizeSchemaVersion('1.2.3')).toBe('1.2.3')
  })
})
