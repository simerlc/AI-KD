import { appModelSchema, componentNodeSchema } from './schema'
import type { AppModel, AppModelValidationResult, ComponentNode } from '@aikd/shared'
import { registry } from '@aikd/component-registry'

// ─── App Model 验证器 ────────────────────────────────────

/**
 * 验证 App Model JSON 是否符合 schema 定义。
 *
 * 验证步骤：
 * 1. zod 结构验证（字段完整性、类型正确性）
 * 2. 组件引用验证（所有 ComponentNode.type 在 registry 中存在）
 * 3. 路由一致性验证（routes 中的 pageId 在 pages 中存在）
 */
export function validateAppModel(data: unknown): AppModelValidationResult {
  // Step 1: zod 结构验证
  const parseResult = appModelSchema.safeParse(data)
  if (!parseResult.success) {
    return {
      success: false,
      errors: parseResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    }
  }

  const model = parseResult.data as AppModel
  const errors: string[] = []

  // Step 2: 组件引用验证
  const validateComponent = (node: ComponentNode, pageId: string): void => {
    if (!registry.has(node.type)) {
      errors.push(`页面 ${pageId} 中使用了未注册的组件类型: ${node.type}`)
    }
    if (node.children) {
      for (const child of node.children) {
        validateComponent(child, pageId)
      }
    }
  }

  for (const page of model.schema.pages) {
    for (const comp of page.components) {
      validateComponent(comp, page.id)
    }
  }

  // Step 3: 路由一致性验证
  const pageIds = new Set(model.schema.pages.map((p) => p.id))
  for (const route of model.schema.routes) {
    if (!pageIds.has(route.pageId)) {
      errors.push(`路由 ${route.path} 引用了不存在的页面: ${route.pageId}`)
    }
  }

  // Step 3.5: 页面内容验证（页面必须至少有一个组件，避免生成空壳页面）
  for (const page of model.schema.pages) {
    if (!page.components || page.components.length === 0) {
      errors.push(`页面 ${page.id} 没有组件，请为页面添加至少一个组件`)
    }
  }

  // Step 4: 首页验证（至少有一个 path 为 '/' 的路由）
  const hasRootRoute = model.schema.routes.some((r) => r.path === '/')
  if (!hasRootRoute) {
    errors.push('应用必须包含 path 为 "/" 的首页路由')
  }

  if (errors.length > 0) {
    return { success: false, errors }
  }

  return { success: true, errors: [], data: model }
}

/**
 * 验证单个组件节点（供 Builder Agent 生成代码时增量校验）。
 */
export function validateComponentNode(data: unknown): { success: boolean; errors: string[]; data?: ComponentNode } {
  const parseResult = componentNodeSchema.safeParse(data)
  if (!parseResult.success) {
    return {
      success: false,
      errors: parseResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    }
  }

  const node = parseResult.data as ComponentNode
  if (!registry.has(node.type)) {
    return {
      success: false,
      errors: [`未注册的组件类型: ${node.type}`],
    }
  }

  return { success: true, errors: [], data: node }
}

/**
 * 快速格式校验（不做完整验证，仅检查基本结构）。
 */
export function isAppModelShape(data: unknown): data is AppModel {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.version === 'string' &&
    obj.schema !== undefined &&
    typeof obj.schema === 'object'
  )
}
