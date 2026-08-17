import { z } from 'zod'

// ─── App Model Zod Schema ────────────────────────────────
//
// 用于验证 LLM 生成的 App Model JSON 是否符合预期结构。
// Planner Agent 输出 App Model JSON 后，必须通过此 schema 验证。
//
// 注意：children 使用 z.array(z.any()) 避免递归类型定义，
// 子组件的递归验证在 validator.ts 中手动完成。

export const componentNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
  children: z.array(z.any()).optional(),
})

export const pageSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1).startsWith('/'),
  title: z.string().min(1),
  layout: z.enum(['web', 'mobile']),
  components: z.array(componentNodeSchema),
})

export const routeSchema = z.object({
  path: z.string().min(1).startsWith('/'),
  pageId: z.string().min(1),
})

export const themeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, '必须是十六进制颜色，如 #3b82f6'),
  fontFamily: z.string().min(1),
  secondaryColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
})

export const dataSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['static', 'mock']),
  data: z.unknown(),
})

export const appModelSchemaSchema = z.object({
  pages: z.array(pageSchema).min(1, '至少需要一个页面'),
  routes: z.array(routeSchema),
  theme: themeSchema,
  dataSources: z.array(dataSourceSchema),
})

export const appModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['web', 'h5', 'static']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, '版本号格式须为 x.y.z'),
  schema: appModelSchemaSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
})

// ─── Schema 类型推断 ─────────────────────────────────────

export type ZodComponentNode = z.infer<typeof componentNodeSchema>
export type ZodPage = z.infer<typeof pageSchema>
export type ZodAppModel = z.infer<typeof appModelSchema>
