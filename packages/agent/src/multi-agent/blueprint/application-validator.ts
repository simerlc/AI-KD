// ─── ApplicationValidator（生成前检查机制）─────────────────
//
// 位置：Blueprint 产出之后、CodingAgent 之前的强制关卡。
//
// 与 BlueprintValidator 的分工：
//   - BlueprintValidator：校验 Blueprint 的「结构合法性」（字段类型、引用一致性、组件已注册）
//   - ApplicationValidator：校验 Blueprint 对「用户需求的覆盖度」（语义完整性）
//
// 校验五项（对应需求文档第四节）：
//   1. 页面是否完整      —— 需求中的页面/功能是否都有承载页面
//   2. 功能是否覆盖需求  —— RequirementAgent 的 features 是否都被落实
//   3. 数据模型是否匹配  —— 需求实体是否都有对应数据表
//   4. 组件是否存在      —— 组件类型是否已在 component-registry 注册
//   5. API 是否定义      —— 有数据表的应用必须有对应 CRUD 接口
//
// 若校验失败（success === false），禁止进入代码生成阶段。

import type { Blueprint } from '@aikd/shared'
import { registry } from '@aikd/component-registry'

/** 生成前检查的输入 */
export interface ApplicationValidationInput {
  /** 已通过结构校验的 Blueprint */
  blueprint: Blueprint
  /** 需求分析产出的功能点（用于覆盖度比对） */
  features?: string[]
  /** 需求分析产出的数据实体（用于数据模型比对） */
  entities?: Array<{ name: string; description: string }>
}

/** 生成前检查结果 */
export interface ApplicationValidationResult {
  /** 是否允许进入代码生成阶段 */
  success: boolean
  /** 阻断性问题（非空则禁止生成代码） */
  errors: string[]
  /** 非阻断性提示 */
  warnings: string[]
  /** 各检查项的明细结果（便于报告与调试） */
  checks: {
    pages: boolean
    features: boolean
    dataModel: boolean
    components: boolean
    api: boolean
  }
}

/** 中文/英文通用的关键词归一化 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s_\-/、，,。.]+/g, '')
}

/**
 * 判断某个功能点是否在 Blueprint 中有「落点」。
 * 落点包括：页面标题/描述、用户流程步骤描述、API 描述、数据表名。
 */
function isFeatureCovered(feature: string, haystack: string[]): boolean {
  const f = normalize(feature)
  if (!f) return true
  // 直接包含
  if (haystack.some((h) => h.includes(f) || f.includes(h))) return true
  // 关键词部分匹配：功能描述常为短语，取 2 字以上片段做匹配
  const tokens = feature
    .split(/[\s_\-/、，,。.（）()]+/)
    .map(normalize)
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return false
  const hit = tokens.filter((t) => haystack.some((h) => h.includes(t)))
  // 过半关键词命中即视为已覆盖
  return hit.length * 2 >= tokens.length
}

export class ApplicationValidator {
  /**
   * 执行生成前检查。
   * @returns success 为 false 时，调用方必须阻断代码生成。
   */
  validate(input: ApplicationValidationInput): ApplicationValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const bp = input.blueprint

    const checks = {
      pages: true,
      features: true,
      dataModel: true,
      components: true,
      api: true,
    }

    // ── 1. 页面完整性 ──────────────────────────────────
    const pages = Array.isArray(bp.pages) ? bp.pages : []
    if (pages.length === 0) {
      errors.push('生成前检查：pages 为空，应用没有任何页面')
      checks.pages = false
    }
    if (pages.length > 0 && !pages.some((p) => p.path === '/')) {
      errors.push('生成前检查：缺少首页（path 为 "/" 的页面）')
      checks.pages = false
    }
    // 每个页面必须有组件规划，否则渲染出空白页
    const pageComponents = Array.isArray(bp.pageComponents) ? bp.pageComponents : []
    const plannedPageIds = new Set(pageComponents.map((pc) => pc.pageId))
    for (const p of pages) {
      if (!plannedPageIds.has(p.id)) {
        errors.push(`生成前检查：页面 "${p.id}"（${p.title}）没有组件规划，会渲染为空白页`)
        checks.pages = false
      } else {
        const entry = pageComponents.find((pc) => pc.pageId === p.id)
        if (!entry || !Array.isArray(entry.components) || entry.components.length === 0) {
          errors.push(`生成前检查：页面 "${p.id}"（${p.title}）组件列表为空`)
          checks.pages = false
        }
      }
    }

    // ── 2. 功能覆盖度 ──────────────────────────────────
    const features = (input.features ?? []).filter((f) => f && f.trim())
    if (features.length > 0) {
      // 构建 Blueprint 侧的「语义落点」集合
      const haystack: string[] = []
      for (const p of pages) {
        haystack.push(normalize(p.title))
        haystack.push(normalize(p.description ?? ''))
        haystack.push(normalize(p.pageType))
      }
      for (const flow of bp.userFlow?.flows ?? []) {
        haystack.push(normalize(flow.name))
        haystack.push(normalize(flow.description ?? ''))
        for (const s of flow.steps ?? []) {
          haystack.push(normalize(s.description ?? ''))
          haystack.push(normalize(s.action ?? ''))
        }
      }
      for (const e of bp.apiDesign?.endpoints ?? []) {
        haystack.push(normalize(e.description ?? ''))
        haystack.push(normalize(e.path ?? ''))
      }
      for (const t of bp.dataModel?.tables ?? []) {
        haystack.push(normalize(t.name ?? ''))
        haystack.push(normalize(t.id ?? ''))
      }
      const filtered = haystack.filter((h) => h.length > 0)

      const uncovered = features.filter((f) => !isFeatureCovered(f, filtered))
      // 功能覆盖属于语义判断，采用「大面积缺失才阻断」策略，避免误杀
      if (uncovered.length > 0) {
        const ratio = uncovered.length / features.length
        if (ratio > 0.5) {
          errors.push(
            `生成前检查：需求功能覆盖不足，${uncovered.length}/${features.length} 个功能点未在 Blueprint 中落实：${uncovered.join('、')}`,
          )
          checks.features = false
        } else {
          warnings.push(
            `生成前检查：以下功能点未明确落实，建议补充页面或接口：${uncovered.join('、')}`,
          )
        }
      }
    } else {
      warnings.push('生成前检查：未提供需求功能点（features），跳过功能覆盖度校验')
    }

    // ── 3. 数据模型匹配 ────────────────────────────────
    const tables = bp.dataModel?.tables ?? []
    const entities = (input.entities ?? []).filter((e) => e?.name?.trim())
    if (entities.length > 0) {
      if (tables.length === 0) {
        errors.push(
          `生成前检查：需求包含 ${entities.length} 个数据实体，但 dataModel.tables 为空`,
        )
        checks.dataModel = false
      } else {
        const tableKeys = tables.map((t) => normalize(`${t.name ?? ''}${t.id ?? ''}`))
        const missing = entities.filter(
          (e) => !tableKeys.some((k) => k.includes(normalize(e.name)) || normalize(e.name).includes(k)),
        )
        if (missing.length > 0) {
          warnings.push(
            `生成前检查：需求实体未找到完全匹配的数据表：${missing.map((m) => m.name).join('、')}`,
          )
        }
      }
    }
    // 数据表字段完整性：空字段表会导致 Table/Form 组件渲染异常
    for (const t of tables) {
      if (!Array.isArray(t.fields) || t.fields.length === 0) {
        errors.push(`生成前检查：数据表 "${t.id ?? t.name}" 没有任何字段`)
        checks.dataModel = false
      }
    }

    // ── 4. 组件存在性 ──────────────────────────────────
    const missingTypes = new Set<string>()
    const walk = (nodes: Array<{ type?: string; children?: unknown[] }>): void => {
      for (const n of nodes ?? []) {
        if (!n) continue
        if (typeof n.type === 'string' && n.type && !registry.has(n.type)) {
          missingTypes.add(n.type)
        }
        if (Array.isArray(n.children)) {
          walk(n.children as Array<{ type?: string; children?: unknown[] }>)
        }
      }
    }
    for (const pc of pageComponents) {
      walk((pc.components ?? []) as Array<{ type?: string; children?: unknown[] }>)
    }
    if (missingTypes.size > 0) {
      errors.push(
        `生成前检查：引用了未注册的组件类型：${[...missingTypes].join('、')}（会导致运行时找不到组件）`,
      )
      checks.components = false
    }

    // ── 5. API 定义完整性 ──────────────────────────────
    const endpoints = bp.apiDesign?.endpoints ?? []
    if (tables.length > 0 && endpoints.length === 0) {
      errors.push('生成前检查：存在数据表但 apiDesign.endpoints 为空，数据无法读写')
      checks.api = false
    }
    // 绑定了数据表的页面必须有对应的数据接口，否则页面逻辑断裂
    const endpointTableIds = new Set(
      endpoints.map((e) => e.tableId).filter((id): id is string => !!id),
    )
    const endpointPaths = endpoints.map((e) => normalize(e.path ?? ''))
    for (const p of pages) {
      if (!p.tableId) continue
      const covered =
        endpointTableIds.has(p.tableId) ||
        endpointPaths.some((path) => path.includes(normalize(p.tableId as string)))
      if (!covered) {
        errors.push(
          `生成前检查：页面 "${p.id}" 绑定了数据表 "${p.tableId}"，但没有对应的 API 接口`,
        )
        checks.api = false
      }
    }
    // 有列表/表单页时，应存在相应的 CRUD 语义接口
    const cruds = new Set(endpoints.map((e) => e.crud).filter(Boolean))
    const hasFormPage = pages.some((p) => p.pageType === 'form')
    if (hasFormPage && !cruds.has('create') && !cruds.has('update')) {
      warnings.push('生成前检查：存在表单页，但未定义 create/update 接口')
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      checks,
    }
  }
}

/** 便捷单例 */
export const applicationValidator = new ApplicationValidator()

/** 便捷校验函数：生成前检查 */
export function validateApplication(
  input: ApplicationValidationInput,
): ApplicationValidationResult {
  return applicationValidator.validate(input)
}
