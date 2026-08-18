// ─── 统一 App Schema 的 Zod Schema 与验证器 ──────────────
//
// 针对 @aikd/shared 中的 AppSchema 结构做严格校验。
// 与既有的 app-model 校验器（validator.ts）相互独立、并存，
// 不改变旧 AppModel 的验证路径。

import { z } from 'zod'
import { APP_SCHEMA_VERSION, type AppSchema, type SchemaValidationResult } from '@aikd/shared'
import { componentNodeSchema } from './schema'

// ─── Zod Schema 定义 ─────────────────────────────────────

const actionParamsSchema = z.record(z.string(), z.unknown())

const actionSchemaV1 = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum([
    // 旧抽象类型（向后兼容）
    'navigate',
    'setState',
    'setData',
    'callFunction',
    'submitForm',
    // 具体运行时类型
    'database.query',
    'database.insert',
    'database.update',
    'database.delete',
    'http.request',
    'notification.success',
    'notification.error',
    'navigation.go',
    'modal.open',
    'modal.close',
    'page.refresh',
    'custom',
  ]),
  params: actionParamsSchema,
  description: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

const eventSchemaV1 = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trigger: z.enum(['interaction', 'lifecycle', 'dataChange', 'custom']),
  event: z.enum(['click', 'change', 'submit', 'hover', 'focus', 'blur', 'input', 'rowClick', 'load']).optional(),
  lifecycle: z.enum(['onMount', 'onUnmount', 'pageLoad']).optional(),
  actions: z.array(z.string().min(1)),
  meta: z.record(z.string(), z.unknown()).optional(),
})

const dataSourceSchemaV1 = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['static', 'mock', 'local']),
  data: z.unknown(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

const dataBindingSchema = z.object({
  source: z.string().min(1),
  path: z.string().optional(),
  default: z.unknown().optional(),
})

const dataSchemaV1 = z.object({
  sources: z.array(dataSourceSchemaV1),
  bindings: z.array(dataBindingSchema).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

const pageSchemaV1 = z.object({
  id: z.string().min(1),
  path: z.string().min(1).startsWith('/'),
  title: z.string().min(1),
  layout: z.enum(['web', 'mobile']),
  components: z.array(componentNodeSchema),
  events: z.array(z.string()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

const routeSchemaV1 = z.object({
  path: z.string().min(1).startsWith('/'),
  pageId: z.string().min(1),
})

const themeSchemaV1 = z.object({
  primaryColor: z.string().min(1),
  fontFamily: z.string().min(1),
}).passthrough()

const appSchema = z.object({
  schemaVersion: z.string().default(APP_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['web', 'h5', 'static']),
  version: z.string().min(1),
  pages: z.array(pageSchemaV1).min(1, '至少需要一个页面'),
  routes: z.array(routeSchemaV1),
  theme: themeSchemaV1,
  data: dataSchemaV1,
  actions: z.array(actionSchemaV1).optional(),
  events: z.array(eventSchemaV1).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
})

// ─── 验证器 ──────────────────────────────────────────────

/**
 * 验证 AppSchema JSON 是否符合结构定义。
 *
 * 验证步骤：
 * 1. zod 结构验证
 * 2. 路由一致性（routes.pageId 必须在 pages 中存在）
 * 3. 事件动作引用一致性（events[].actions 必须在 actions 中存在）
 * 4. 页面事件引用一致性（pages[].events 必须在 events 中存在）
 * 5. 首页路由检查（必须存在 path === '/'）
 */
export function validateAppSchema(data: unknown): SchemaValidationResult {
  const parseResult = appSchema.safeParse(data)
  if (!parseResult.success) {
    return {
      success: false,
      errors: parseResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    }
  }

  const schema = parseResult.data as AppSchema
  const errors: string[] = []

  // 路由一致性
  const pageIds = new Set(schema.pages.map((p) => p.id))
  for (const route of schema.routes) {
    if (!pageIds.has(route.pageId)) {
      errors.push(`路由 ${route.path} 引用了不存在的页面: ${route.pageId}`)
    }
  }

  // 事件动作引用一致性
  const actionIds = new Set((schema.actions ?? []).map((a) => a.id))
  for (const ev of schema.events ?? []) {
    for (const actionId of ev.actions) {
      if (!actionIds.has(actionId)) {
        errors.push(`事件 ${ev.id} 引用了不存在的动作: ${actionId}`)
      }
    }
  }

  // 页面事件引用一致性
  const eventIds = new Set((schema.events ?? []).map((e) => e.id))
  for (const page of schema.pages) {
    for (const evId of page.events ?? []) {
      if (!eventIds.has(evId)) {
        errors.push(`页面 ${page.id} 引用了不存在的事件: ${evId}`)
      }
    }
  }

  // 首页路由
  const hasRootRoute = schema.routes.some((r) => r.path === '/')
  if (!hasRootRoute) {
    errors.push('应用必须包含 path 为 "/" 的首页路由')
  }

  if (errors.length > 0) {
    return { success: false, errors }
  }

  return { success: true, errors: [], data: schema }
}

// ─── 导出 ────────────────────────────────────────────────

export { appSchema, actionSchemaV1, eventSchemaV1, dataSchemaV1, dataSourceSchemaV1, pageSchemaV1 }
