// ─── FeatureValidator：功能流程测试 ───────────────────────
//
// 根据 Application Blueprint 的 userFlow 自动生成测试任务并模拟真实用户操作：
//   - 每条 flow 的每个 step 映射到页面 + 操作（view/search/create/edit/delete/submit/navigate）
//   - 校验目标页面组件存在、对应操作所需的 UI 元素（输入框/按钮/表格）在代码中声明
//   - navigate 类步骤额外校验目标页面可达（路由存在）
//
// 这是"真实用户操作"的静态等价：检查页面与交互元素代码齐备，
// 真实运行时可由 RuntimeValidator + 浏览器自动化补充。

import type { Blueprint } from '@aikd/shared'
import type { DimensionResult, TestIssue } from '../result'
import { buildFileMap, readFile, toDimension, type ValidationContext } from './base'
import { pageFilePath, pageComponentName } from './naming'

export class FeatureValidator {
  async validate(ctx: ValidationContext): Promise<DimensionResult> {
    const fileMap = buildFileMap(ctx.files)
    const blueprint = ctx.blueprint
    const issues: TestIssue[] = []
    let checked = 0

    const flows = blueprint.userFlow?.flows ?? []
    if (flows.length === 0) {
      return toDimension('feature', [], 0, 'Blueprint 未定义用户流程，跳过功能测试')
    }

    for (const flow of flows) {
      for (const step of flow.steps) {
        checked++
        const page = blueprint.pages.find((p) => p.id === step.pageId)
        if (!page) {
          issues.push(errFeature(`流程「${flow.name}」步骤引用不存在的页面 ${step.pageId}`, 'blueprint', 'feature'))
          continue
        }
        const pageFile = pageFilePath(page.id)
        const content = readFile(fileMap, pageFile)
        if (!content) {
          issues.push(errFeature(`流程「${flow.name}」页面未生成：${pageFile}`, pageFile, 'feature'))
          continue
        }

        const required = requiredUiForAction(step.action)
        for (const ui of required) {
          checked++
          if (!content.includes(ui)) {
            issues.push(
              errFeature(
                `流程「${flow.name}」步骤「${step.description}」缺少必要 UI 元素：<${ui}>`,
                pageFile,
                'feature',
                'warning',
              ),
            )
          }
        }

        // navigate 类：校验目标页可达
        if (step.action === 'navigate' && step.targetPageId) {
          checked++
          const app = readFile(fileMap, 'src/App.tsx') ?? ''
          const targetComp = pageComponentName(step.targetPageId)
          if (!app.includes(targetComp))
            issues.push(
              errFeature(`流程「${flow.name}」跳转目标 ${step.targetPageId} 未在路由中挂载`, 'src/App.tsx', 'route', 'warning'),
            )
        }
      }
    }

    const summary =
      issues.length === 0
        ? `功能流程检查通过：覆盖 ${flows.length} 条流程全部步骤（检查 ${checked} 项）`
        : `功能流程发现 ${issues.length} 处问题（检查 ${checked} 项）`
    return toDimension('feature', issues, checked, summary)
  }
}

/** 不同用户操作所需的 UI 元素线索 */
function requiredUiForAction(action?: string): string[] {
  switch (action) {
    case 'search':
      return ['Input', 'SearchOutlined', 'onSearch']
    case 'create':
    case 'submit':
      return ['Button', 'Form']
    case 'edit':
      return ['Form', 'Button']
    case 'delete':
      return ['Popconfirm', 'delete']
    case 'view':
    default:
      return ['Table', 'List', 'div']
  }
}

function errFeature(
  message: string,
  file: string,
  category: TestIssue['category'],
  severity: TestIssue['severity'] = 'error',
): TestIssue {
  return { dimension: 'feature', severity, message, file, category }
}
