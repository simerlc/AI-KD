// ─── Blueprint Validator ─────────────────────────────────
//
// 校验 Blueprint 是否合法。只有通过校验（success === true）的 Blueprint
// 才允许被 CodingAgent 读取。校验覆盖：
//   1. 结构完整性：六大要素齐全且类型正确
//   2. 引用一致性：pageComponents 引用的页面必须存在
//   3. 数据模型：数据表必须有 id / name / fields，字段必须有 name / type
//   4. 组件合法性：组件 type 必须已在 component-registry 注册
//   5. API 设计：接口必须有 method / path / description
//   6. 用户流程：flow 的步骤引用的页面必须存在

import type { Blueprint, BlueprintComponent, BlueprintValidationResult } from '@aikd/shared'
import { BLUEPRINT_SCHEMA_VERSION } from '@aikd/shared'
import { registry } from '@aikd/component-registry'

const VALID_APP_TYPES = new Set(['web', 'h5', 'static'])
const VALID_PAGE_TYPES = new Set(['home', 'list', 'detail', 'form', 'dashboard', 'login', 'custom'])
const VALID_LAYOUTS = new Set(['web', 'mobile'])
const VALID_API_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const VALID_FIELD_TYPES = new Set(['string', 'number', 'boolean', 'date', 'datetime', 'enum', 'uuid'])
const VALID_CRUD = new Set(['list', 'get', 'create', 'update', 'delete'])

/**
 * 宽容归一化：真实 LLM 输出常使用与规范不一致的同义枚举值。
 * 这里做「同义词 → 合法值」映射，避免因命名差异导致整个应用生成失败。
 */

/** crud 同义词 → 合法值（LLM 常见变体） */
const CRUD_ALIASES: Record<string, string> = {
  read: 'list',        // 读/列表
  query: 'list',       // 查询
  fetch: 'list',       // 获取列表
  detail: 'get',       // 详情
  find: 'get',         // 查找单个
  view: 'get',         // 查看单个
  insert: 'create',    // 插入
  add: 'create',       // 新增
  modify: 'update',    // 修改
  edit: 'update',      // 编辑
  remove: 'delete',    // 删除
  del: 'delete',       // 删除缩写
  destroy: 'delete',   // 删除
  none: '',            // 无 CRUD（忽略该字段）
}

/** pageType 同义词 → 合法值（LLM 常见变体） */
const PAGE_TYPE_ALIASES: Record<string, string> = {
  cart: 'custom',      // 购物车 → 自定义页
  checkout: 'custom',  // 结算 → 自定义页
  profile: 'custom',   // 个人中心 → 自定义页
  settings: 'custom',  // 设置 → 自定义页
  index: 'home',       // 首页
  landing: 'custom',   // 落地页
  'list-page': 'list', // 列表
  'detail-page': 'detail', // 详情
  'form-page': 'form', // 表单
}

/** 归一化 crud 值；返回合法值或空串（表示应忽略） */
export function normalizeCrud(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.toLowerCase().trim()
  if (VALID_CRUD.has(v)) return v
  if (v in CRUD_ALIASES) return CRUD_ALIASES[v]
  return ''
}

/** 归一化 pageType 值；返回合法值或原值（若非法则返回空串） */
export function normalizePageType(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.toLowerCase().trim()
  if (VALID_PAGE_TYPES.has(v)) return v
  if (v in PAGE_TYPE_ALIASES) return PAGE_TYPE_ALIASES[v]
  return ''
}

export class BlueprintValidator {
  /**
   * 校验 Blueprint。
   * @param input 待校验的 Blueprint（可能是 any，来自 LLM 输出）
   * @returns 校验结果；成功时返回规范化的 Blueprint
   */
  validate(input: unknown): BlueprintValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      return { success: false, errors: ['Blueprint 必须是一个对象'] }
    }
    const bp = input as Record<string, unknown>

    // ── 结构完整性 ──────────────────────────────────────
    const requireString = (field: string, key: string) => {
      const v = bp[field]
      if (typeof v !== 'string' || !v.trim()) {
        errors.push(`${field} 必须是非空字符串（${key}）`)
      }
    }
    requireString('appName', '应用名称')

    const appType = bp.appType
    if (typeof appType !== 'string' || !VALID_APP_TYPES.has(appType)) {
      errors.push('appType 必须是 "web" | "h5" | "static" 之一')
    }

    // schemaVersion（可选，缺失则提示）
    if (bp.schemaVersion && bp.schemaVersion !== BLUEPRINT_SCHEMA_VERSION) {
      warnings.push(`schemaVersion "${bp.schemaVersion}" 与当前版本 "${BLUEPRINT_SCHEMA_VERSION}" 不一致`)
    }

    // ── 页面列表 ────────────────────────────────────────
    const pages = Array.isArray(bp.pages) ? bp.pages : null
    if (!pages) {
      errors.push('pages 必须是数组（页面列表）')
    }
    const pageIds = new Set<string>()
    const pagePathSet = new Set<string>()
    pages?.forEach((p, i) => {
      const page = (p ?? {}) as Record<string, unknown>
      if (typeof page.id !== 'string' || !page.id) errors.push(`pages[${i}].id 必须是字符串`)
      else pageIds.add(page.id)
      if (typeof page.path !== 'string' || !page.path) errors.push(`pages[${i}].path 必须是字符串`)
      else if (pagePathSet.has(page.path)) errors.push(`pages[${i}].path "${page.path}" 重复`)
      else pagePathSet.add(page.path)
      if (typeof page.title !== 'string' || !page.title) errors.push(`pages[${i}].title 必须是字符串`)
      if (page.layout && !VALID_LAYOUTS.has(String(page.layout))) {
        errors.push(`pages[${i}].layout 必须是 "web" | "mobile"`)
      }
      if (page.pageType !== undefined && page.pageType !== null) {
        const normalized = normalizePageType(page.pageType)
        if (!normalized) {
          errors.push(`pages[${i}].pageType "${page.pageType}" 无效`)
        } else if (normalized !== String(page.pageType)) {
          // 就地归一化，让后续流程拿到合法值
          page.pageType = normalized
        }
      }
    })

    // 必须有首页（path === '/'）
    if (pages && !pagePathSet.has('/')) {
      errors.push('Blueprint 必须包含首页（pages 中至少一个 path 为 "/"）')
    }

    // ── 页面组件 ────────────────────────────────────────
    const pageComponents = Array.isArray(bp.pageComponents) ? bp.pageComponents : []
    if (pageComponents.length === 0) {
      errors.push('pageComponents 不能为空（每个页面都应有组件规划）')
    }
    const componentRefError = (msg: string) => errors.push(msg)
    pageComponents.forEach((pc, i) => {
      const entry = (pc ?? {}) as Record<string, unknown>
      const pId = entry.pageId
      if (typeof pId !== 'string' || !pId) {
        componentRefError(`pageComponents[${i}].pageId 必须是字符串`)
      } else if (!pageIds.has(pId)) {
        componentRefError(`pageComponents[${i}] 引用了不存在的页面 "${pId}"`)
      }
      const comps = Array.isArray(entry.components) ? entry.components : []
      if (comps.length === 0) {
        componentRefError(`pageComponents[${i}]（页面 ${pId}）components 不能为空`)
      }
      // 校验组件合法性
      this.validateComponents(comps, `pageComponents[${i}]`, errors)
    })

    // 页面必须有对应组件规划（每页都应有组件）
    if (pages) {
      const compPageIds = new Set(pageComponents.map((pc) => (pc as { pageId?: string })?.pageId))
      for (const pId of pageIds) {
        if (!compPageIds.has(pId)) {
          errors.push(`页面 "${pId}" 没有对应的 pageComponents 组件规划`)
        }
      }
    }

    // ── 数据模型 ────────────────────────────────────────
    const dataModel = bp.dataModel as Record<string, unknown> | undefined
    if (!dataModel || !Array.isArray(dataModel.tables)) {
      errors.push('dataModel.tables 必须是数组（数据模型）')
    } else {
      const tables = dataModel.tables as Record<string, unknown>[]
      tables.forEach((t, i) => {
        if (typeof t.id !== 'string' || !t.id) errors.push(`dataModel.tables[${i}].id 必须是字符串`)
        if (typeof t.name !== 'string' || !t.name) errors.push(`dataModel.tables[${i}].name 必须是字符串`)
        if (!Array.isArray(t.fields)) {
          errors.push(`dataModel.tables[${i}].fields 必须是数组`)
        } else {
          ;(t.fields as Record<string, unknown>[]).forEach((f, j) => {
            if (typeof f.name !== 'string' || !f.name) errors.push(`dataModel.tables[${i}].fields[${j}].name 必须是字符串`)
            if (typeof f.type !== 'string' || !VALID_FIELD_TYPES.has(f.type)) {
              errors.push(`dataModel.tables[${i}].fields[${j}].type "${f.type}" 无效`)
            }
            if (f.type === 'enum' && !Array.isArray(f.enumOptions)) {
              errors.push(`dataModel.tables[${i}].fields[${j}].type 为 enum 时必须有 enumOptions`)
            }
          })
        }
      })
    }

    // ── API 设计 ────────────────────────────────────────
    const apiDesign = bp.apiDesign as Record<string, unknown> | undefined
    if (!apiDesign || !Array.isArray(apiDesign.endpoints)) {
      errors.push('apiDesign.endpoints 必须是数组（API 设计）')
    } else {
      ;(apiDesign.endpoints as Record<string, unknown>[]).forEach((e, i) => {
        if (typeof e.method !== 'string' || !VALID_API_METHODS.has(e.method)) {
          errors.push(`apiDesign.endpoints[${i}].method "${e.method}" 无效`)
        }
        if (typeof e.path !== 'string' || !e.path) errors.push(`apiDesign.endpoints[${i}].path 必须是字符串`)
        if (typeof e.description !== 'string' || !e.description) {
          errors.push(`apiDesign.endpoints[${i}].description 必须是字符串`)
        }
        if (e.crud !== undefined && e.crud !== null && String(e.crud) !== '') {
          const normalized = normalizeCrud(e.crud)
          if (!normalized) {
            errors.push(`apiDesign.endpoints[${i}].crud "${e.crud}" 无效`)
          } else {
            // 就地归一化，让后续流程拿到合法值
            e.crud = normalized
          }
        }
      })
    }

    // ── 用户流程 ────────────────────────────────────────
    const userFlow = bp.userFlow as Record<string, unknown> | undefined
    if (!userFlow || !Array.isArray(userFlow.flows)) {
      errors.push('userFlow.flows 必须是数组（用户流程）')
    } else {
      ;(userFlow.flows as Record<string, unknown>[]).forEach((flow, i) => {
        if (typeof flow.id !== 'string' || !flow.id) errors.push(`userFlow.flows[${i}].id 必须是字符串`)
        if (typeof flow.name !== 'string' || !flow.name) errors.push(`userFlow.flows[${i}].name 必须是字符串`)
        const steps = Array.isArray(flow.steps) ? flow.steps : []
        if (steps.length === 0) errors.push(`userFlow.flows[${i}].steps 不能为空`)
        steps.forEach((s, j) => {
          const step = (s ?? {}) as Record<string, unknown>
          if (typeof step.pageId !== 'string' || !pageIds.has(step.pageId)) {
            errors.push(`userFlow.flows[${i}].steps[${j}] 引用了不存在的页面 "${step.pageId}"`)
          }
          if (step.targetPageId && !pageIds.has(String(step.targetPageId))) {
            errors.push(`userFlow.flows[${i}].steps[${j}].targetPageId "${step.targetPageId}" 引用了不存在的页面`)
          }
        })
      })
    }

    // 组件校验还需检查：页面绑定的 tableId 是否存在于数据模型
    if (pages && Array.isArray(dataModel?.tables)) {
      const tableIds = new Set((dataModel.tables as { id?: string }[]).map((t) => t.id))
      for (const p of pages) {
        const tableId = (p as { tableId?: string }).tableId
        if (tableId && !tableIds.has(tableId)) {
          errors.push(`页面 "${(p as { id?: string }).id}" 绑定的 tableId "${tableId}" 在数据模型中不存在`)
        }
      }
    }

    if (errors.length > 0) {
      return { success: false, errors, warnings }
    }

    return {
      success: true,
      errors: [],
      warnings,
      data: bp as unknown as Blueprint,
    }
  }

  /** 递归校验组件树（type 必须注册、id 唯一、children 递归） */
  private validateComponents(components: unknown[], prefix: string, errors: string[]): void {
    const seen = new Set<string>()
    const walk = (nodes: unknown[], path: string) => {
      if (!Array.isArray(nodes)) return
      nodes.forEach((node, i) => {
        const n = (node ?? {}) as Record<string, unknown>
        const type = n.type
        if (typeof type !== 'string' || !type) {
          errors.push(`${path}[${i}].type 必须是字符串`)
          return
        }
        if (!registry.has(type)) {
          errors.push(`${path}[${i}] 使用了未注册的组件类型 "${type}"`)
        }
        const id = n.id
        if (typeof id !== 'string' || !id) {
          errors.push(`${path}[${i}].id 必须是字符串`)
        } else if (seen.has(id)) {
          errors.push(`组件 id "${id}" 重复（${path}[${i}]）`)
        } else {
          seen.add(id)
        }
        if (n.children) walk(n.children as unknown[], `${path}[${i}].children`)
      })
    }
    walk(components, prefix)
  }
}

/** 便捷单例 */
export const blueprintValidator = new BlueprintValidator()

/** 便捷校验函数 */
export function validateBlueprint(input: unknown): BlueprintValidationResult {
  return blueprintValidator.validate(input)
}
