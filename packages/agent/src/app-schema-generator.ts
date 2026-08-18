// ─── App Schema Generator ────────────────────────────────
//
// 将 AppPlan 确定性地转换为 AppSchema。
// 不是 LLM 生成，而是规则驱动的转换：
//   - pages[].description + pageType → 页面组件树（列表页 → 表单 + 表格）
//   - tables → data.sources
//   - actions/events/workflows → 直接映射
//
// 转换是纯函数，可测试、可复现。

import type {
  AppPlan,
  AppPlanPage,
  AppPlanTable,
  AppSchema,
  ComponentNode,
  DataSourceSchema,
  PageSchema,
} from '@aikd/shared'

// ─── 转换结果 ────────────────────────────────────────────

export interface GenerateResult {
  schema: AppSchema
  warnings: string[]
}

// ─── 主入口 ──────────────────────────────────────────────

export function generateAppSchema(plan: AppPlan): GenerateResult {
  const warnings: string[] = []

  const pages = plan.pages.map((p) => generatePage(p, plan))
  const dataSources = plan.tables.map(generateDataSource)

  const schema: AppSchema = {
    schemaVersion: '1.0.0',
    id: generateId('app'),
    name: plan.app.name,
    type: plan.app.type,
    version: '0.1.0',
    pages,
    routes: plan.pages.map((p) => ({ path: p.path, pageId: p.id })),
    theme: {
      primaryColor: '#3b82f6',
      fontFamily: 'Inter, sans-serif',
    },
    data: {
      sources: dataSources,
    },
    actions: (plan.actions ?? []).map((a) => ({
      ...a,
      type: a.type as never,
    })),
    events: (plan.events ?? []).map((e) => ({
      ...e,
      trigger: e.trigger as never,
      event: e.event as never,
      lifecycle: e.lifecycle as never,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  return { schema, warnings }
}

// ─── 页面生成 ────────────────────────────────────────────

function generatePage(page: AppPlanPage, plan: AppPlan): PageSchema {
  const components = generatePageComponents(page, plan)
  return {
    id: page.id,
    path: page.path,
    title: page.title,
    layout: page.layout,
    components,
  }
}

/**
 * 根据页面类型生成组件树。
 * - list：标题 + 搜索表单 + 数据表格
 * - form：标题 + 表单（字段 → 输入组件）
 * - detail：标题 + 详情展示
 * - dashboard：标题 + 统计卡片
 */
function generatePageComponents(page: AppPlanPage, plan: AppPlan): ComponentNode[] {
  const table = plan.tables.find((t) => t.id === page.tableId)
  const components: ComponentNode[] = []

  // 页面标题
  components.push({
    id: `heading_${page.id}`,
    type: 'Heading',
    props: { text: page.title, level: 'h2' },
  })

  switch (page.pageType) {
    case 'form':
      if (table) {
        components.push({
          id: `form_${page.id}`,
          type: 'Form',
          props: { title: `编辑${table.name}`, submitText: '保存' },
          children: table.fields.map((field, i) => fieldToInput(field, i)),
        })
      }
      break

    case 'list':
      if (table) {
        components.push({
          id: `table_${page.id}`,
          type: 'Table',
          props: {
            columns: table.fields.map((f) => ({ key: f.name, title: f.label ?? f.name })),
            rows: [],
          },
        })
      }
      break

    case 'detail':
      if (table) {
        components.push({
          id: `detail_${page.id}`,
          type: 'Container',
          props: { padding: '16px' },
          children: table.fields.map((field, i) => ({
            id: `field_${page.id}_${i}`,
            type: 'Text',
            props: { text: `${field.label ?? field.name}：—` },
          })),
        })
      }
      break

    case 'dashboard':
      components.push({
        id: `dash_${page.id}`,
        type: 'Container',
        props: { padding: '16px' },
        children: [
          {
            id: `dash_hint_${page.id}`,
            type: 'Alert',
            props: { text: page.description || '数据看板', variant: 'info' },
          },
        ],
      })
      break

    default:
      // custom：仅占位提示
      components.push({
        id: `hint_${page.id}`,
        type: 'Alert',
        props: { text: page.description || '此页面内容待完善', variant: 'info' },
      })
  }

  return components
}

/** 字段 → 表单输入组件 */
function fieldToInput(field: AppPlanTable['fields'][number], index: number): ComponentNode {
  const id = `input_${index}`
  const base = { label: field.label ?? field.name, placeholder: `请输入${field.label ?? field.name}` }

  switch (field.type) {
    case 'boolean':
      return { id, type: 'Checkbox', props: { label: field.label ?? field.name } }
    case 'enum':
      return { id, type: 'Select', props: { ...base, options: field.enumOptions ?? [] } }
    case 'number':
      return { id, type: 'Input', props: { ...base, type: 'number' } }
    default:
      return { id, type: 'Input', props: { ...base, type: 'text' } }
  }
}

/** 表 → 数据源 */
function generateDataSource(table: AppPlanTable): DataSourceSchema {
  return {
    id: table.id,
    name: table.name,
    type: 'static',
    data: [],
  }
}

// ─── 辅助 ────────────────────────────────────────────────

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${timestamp}${random}`
}
