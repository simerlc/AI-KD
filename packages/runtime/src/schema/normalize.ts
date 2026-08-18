// ─── Schema 归一化 ───────────────────────────────────────
//
// 将多种输入（AppSchema 或旧 AppModel）统一归一化为 AppSchema。
// Runtime 只消费标准 AppSchema，兼容旧的 AppModel 数据。

import type { AppModel, AppSchema } from '@aikd/shared'

/** 判断输入是否为 AppSchema（带 schemaVersion） */
export function isAppSchema(value: unknown): value is AppSchema {
  return (
    !!value &&
    typeof value === 'object' &&
    'schemaVersion' in (value as object) &&
    'pages' in (value as object) &&
    'data' in (value as object)
  )
}

/**
 * 将 AppModel 提升为 AppSchema。
 * AppModel 的 dataSources → AppSchema 的 data.sources，
 * 无 actions/events（旧数据），补默认 schemaVersion。
 */
export function appModelToAppSchema(model: AppModel): AppSchema {
  return {
    schemaVersion: '1.0.0',
    id: model.id,
    name: model.name,
    type: model.type,
    version: model.version,
    pages: model.schema.pages.map((p) => ({ ...p, meta: {} })),
    routes: model.schema.routes,
    theme: { ...model.schema.theme },
    data: {
      sources: model.schema.dataSources.map((ds) => ({
        id: ds.id,
        name: ds.name,
        type: (ds.type === 'mock' ? 'mock' : 'static') as 'static' | 'mock' | 'local',
        data: ds.data,
      })),
    },
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  }
}

/**
 * 归一化：接受 AppSchema 或 AppModel，统一返回 AppSchema。
 * 未知输入抛出错误。
 */
export function normalizeSchema(input: AppSchema | AppModel): AppSchema {
  if (isAppSchema(input)) return input
  // AppModel 判断：有 schema.pages 无 schemaVersion
  if (input && typeof input === 'object' && 'schema' in input && 'pages' in (input as AppModel).schema) {
    return appModelToAppSchema(input as AppModel)
  }
  throw new Error('无法识别的 Schema 输入，期望 AppSchema 或 AppModel')
}
