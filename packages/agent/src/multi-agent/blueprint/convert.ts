// ─── Blueprint → AppModel 转换器 ─────────────────────────
//
// 将合法 Blueprint 转换为现有 Builder 可消费的 AppModel。
// 注意：转换前必须先通过 validateBlueprint 校验，保证输入是合法 Blueprint。
// AppModel 是渲染层（页面 + 组件树 + 主题 + 数据源），供确定性 Builder 生成代码。

import type { AppModel, Blueprint, ComponentNode, DataSource, Page, Route } from '@aikd/shared'
import { generateId } from '../../utils'

/**
 * 将 Blueprint 转换为 AppModel。
 * @param blueprint 合法 Blueprint（须已通过 validateBlueprint）
 * @param appId 应用 ID（可选，用于数据源 tableId 对齐）
 */
export function blueprintToAppModel(blueprint: Blueprint, appId?: string): AppModel {
  const now = Date.now()

  // 页面
  const pages: Page[] = blueprint.pages.map((p) => {
    // 找到该页的组件规划
    const compEntry = blueprint.pageComponents.find((pc) => pc.pageId === p.id)
    const components = (compEntry?.components ?? []).map(toComponentNode)
    return {
      id: p.id,
      path: p.path,
      title: p.title,
      layout: p.layout,
      components,
    }
  })

  // 路由
  const routes: Route[] = blueprint.pages.map((p) => ({ path: p.path, pageId: p.id }))

  // 主题（默认）
  const theme = { primaryColor: '#1677ff', fontFamily: 'Inter, sans-serif' }

  // 数据源：从 dataModel 表生成；data 从 Blueprint 中无法得知示例数据，置为 {} 由后端填充
  const dataSources: DataSource[] = blueprint.dataModel.tables.map((t) => ({
    id: t.id,
    name: t.name,
    type: 'mock',
    data: t.fields.length > 0 ? [{}] : [],
  }))

  return {
    id: appId ? appId : generateId('app'),
    name: blueprint.appName,
    type: blueprint.appType,
    version: '0.1.0',
    schema: {
      pages,
      routes,
      theme,
      dataSources,
    },
    createdAt: now,
    updatedAt: now,
  }
}

/** 将 BlueprintComponent 递归转为 ComponentNode */
function toComponentNode(bc: import('@aikd/shared').BlueprintComponent): ComponentNode {
  return {
    id: bc.id,
    type: bc.type,
    props: bc.props ?? {},
    ...(bc.children && bc.children.length > 0
      ? { children: bc.children.map(toComponentNode) }
      : {}),
  }
}
