// ─── App Plan 的 Zod Schema 与验证器 ─────────────────────
//
// AppPlan 是 AI「应用规划器」的结构化输出。
// 此验证器严格校验 AppPlan JSON，确保其符合 Schema 定义。

import { z } from 'zod'
import type { AppPlan } from '@aikd/shared'

const APP_PLAN_VERSION = '1.0.0'

// ─── Zod Schema ──────────────────────────────────────────

const appPlanInfoSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['web', 'h5', 'static']),
  description: z.string(),
  icon: z.string().optional(),
  homePath: z.string().optional(),
})

const appPlanFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'enum', 'uuid']),
  required: z.boolean().optional(),
  label: z.string().optional(),
  enumOptions: z.array(z.string()).optional(),
  default: z.unknown().optional(),
})

const appPlanTableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fields: z.array(appPlanFieldSchema).min(1, '表至少需要一个字段'),
})

const appPlanRelationSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(['oneToOne', 'oneToMany', 'manyToMany']),
  foreignKey: z.string().optional(),
})

const appPlanActionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
})

const appPlanEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trigger: z.enum(['interaction', 'lifecycle', 'dataChange', 'custom']),
  event: z.string().optional(),
  lifecycle: z.string().optional(),
  actions: z.array(z.string()).min(1),
})

const appPlanWorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trigger: z.string().min(1),
  steps: z.array(z.string()).min(1),
  description: z.string().optional(),
})

const appPlanPermissionSchema = z.object({
  role: z.string().min(1),
  pages: z.array(z.string()),
  actions: z.array(z.string()).optional(),
  tables: z.array(z.string()).optional(),
})

const appPlanPageSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  layout: z.enum(['web', 'mobile']),
  description: z.string(),
  tableId: z.string().optional(),
  pageType: z.enum(['list', 'form', 'detail', 'dashboard', 'custom']).optional(),
})

const appPlanSchema = z.object({
  schemaVersion: z.string().default(APP_PLAN_VERSION),
  app: appPlanInfoSchema,
  pages: z.array(appPlanPageSchema).min(1, '至少需要一个页面'),
  tables: z.array(appPlanTableSchema),
  relations: z.array(appPlanRelationSchema).optional(),
  actions: z.array(appPlanActionSchema).optional(),
  events: z.array(appPlanEventSchema).optional(),
  workflows: z.array(appPlanWorkflowSchema).optional(),
  permissions: z.array(appPlanPermissionSchema).optional(),
})

// ─── 验证器 ──────────────────────────────────────────────

export interface AppPlanValidationResult {
  success: boolean
  errors: string[]
  data?: AppPlan
}

/**
 * 验证 AppPlan JSON。
 * 1. zod 结构验证
 * 2. 引用一致性（relation 的表存在、event/action 的引用存在）
 */
export function validateAppPlan(data: unknown): AppPlanValidationResult {
  const parsed = appPlanSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    }
  }

  const plan = parsed.data as AppPlan
  const errors: string[] = []

  const tableIds = new Set(plan.tables.map((t) => t.id))
  const actionIds = new Set((plan.actions ?? []).map((a) => a.id))

  // relation 引用一致性
  for (const rel of plan.relations ?? []) {
    if (!tableIds.has(rel.from)) errors.push(`关系引用了不存在的表: ${rel.from}`)
    if (!tableIds.has(rel.to)) errors.push(`关系引用了不存在的表: ${rel.to}`)
  }

  // event 引用的 action 存在
  for (const ev of plan.events ?? []) {
    for (const actionId of ev.actions) {
      if (!actionIds.has(actionId)) errors.push(`事件 ${ev.id} 引用了不存在的动作: ${actionId}`)
    }
  }

  // workflow 步骤引用的 action 存在
  for (const wf of plan.workflows ?? []) {
    for (const step of wf.steps) {
      if (!actionIds.has(step)) errors.push(`工作流 ${wf.id} 引用了不存在的动作: ${step}`)
    }
  }

  // page 引用的 table 存在
  for (const page of plan.pages) {
    if (page.tableId && !tableIds.has(page.tableId)) {
      errors.push(`页面 ${page.id} 引用了不存在的表: ${page.tableId}`)
    }
  }

  if (errors.length > 0) {
    return { success: false, errors }
  }

  return { success: true, errors: [], data: plan }
}

export { appPlanSchema, APP_PLAN_VERSION }
