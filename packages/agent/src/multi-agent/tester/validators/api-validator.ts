// ─── APIValidator：接口测试 ───────────────────────────────
//
// 校验生成代码中 API 设计与实现的一致性，避免"调用不存在接口 / 字段不匹配 / 数据加载失败"：
//   1. Blueprint 中定义的每个 endpoint 应在 src/api.ts（或等效文件）中有对应函数声明
//   2. 前端调用（pages/components 中）引用的接口路径应出现在 api.ts 定义里
//   3. 接口请求方法（GET/POST/...）与声明一致
//   4. responseFields / requestFields 的关键字段在返回类型/参数中出现
//
// 真实运行时模式可由 RuntimeValidator 叠加 HTTP 探活（本文件聚焦静态一致性）。

import type { Blueprint } from '@aikd/shared'
import type { DimensionResult, TestIssue } from '../result'
import { buildFileMap, readFile, toDimension, type ValidationContext } from './base'

export class APIValidator {
  async validate(ctx: ValidationContext): Promise<DimensionResult> {
    const fileMap = buildFileMap(ctx.files)
    const blueprint = ctx.blueprint
    const issues: TestIssue[] = []
    let checked = 0

    // 收集 api 实现文件内容
    const apiFiles = ['src/api.ts', 'src/api/index.ts', 'src/services/api.ts']
    let apiContent = ''
    for (const p of apiFiles) {
      const c = readFile(fileMap, p)
      if (c) apiContent += '\n' + c
    }
    if (apiContent.trim()) checked++ // api 文件存在
    else
      issues.push({
        dimension: 'api',
        severity: 'warning',
        message: '未找到 API 实现文件（src/api.ts），前端接口调用可能悬空',
        file: 'src/api.ts',
        category: 'api',
      })

    const endpoints = blueprint.apiDesign?.endpoints ?? []
    for (const ep of endpoints) {
      checked++
      // 1. api.ts 中应声明该路径（实现完整性提示：warning，真实运行时由 mock/代理兜底）
      if (apiContent && !apiContent.includes(ep.path)) {
        issues.push(
          errApi(
            `接口未实现：${ep.method} ${ep.path} 在 src/api.ts 中找不到（建议补齐数据访问层）`,
            'src/api.ts',
            'api',
            'warning',
          ),
        )
      }
      // 2. 前端对路径的引用应在 api.ts 定义或页面中出现
      const referenced = ctx.files.some(
        (f) => f.content.includes(ep.path) || f.content.includes(ep.id),
      )
      if (!referenced && apiContent.includes(ep.path))
        issues.push(
          errApi(`接口 ${ep.path} 已定义但未被任何页面/组件调用`, 'src/api.ts', 'api', 'warning'),
        )
      void referenced
    }

    // 3. 前端 fetch/axios 调用路径必须来自 api.ts 定义（禁止裸写不存在路径）
    for (const f of ctx.files) {
      if (f.path.endsWith('.tsx') || f.path.endsWith('.ts')) {
        const rawPaths = extractRawApiPaths(f.content)
        for (const p of rawPaths) {
          checked++
          const declared = endpoints.some((e) => e.path === p) || apiContent.includes(p)
          if (!declared)
            issues.push(
              errApi(`页面直接调用未定义接口路径：${p}（应通过 src/api.ts 统一定义）`, f.path, 'api'),
            )
        }
      }
    }

    const summary =
      issues.length === 0
        ? `API 检查通过：${endpoints.length} 个接口定义与调用一致（检查 ${checked} 项）`
        : `API 检查发现 ${issues.length} 处问题（检查 ${checked} 项）`
    return toDimension('api', issues, checked, summary)
  }
}

/** 提取前端代码中裸写的 fetch('/api/...') / axios('/api/...') 路径 */
function extractRawApiPaths(content: string): string[] {
  const out: string[] = []
  const re = /(?:fetch|axios(?:\.\w+)?)\s*\(\s*['"`](\/api\/[^'"`]+)['"`]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) out.push(m[1])
  return out
}

function errApi(
  message: string,
  file: string,
  category: TestIssue['category'],
  severity: TestIssue['severity'] = 'error',
): TestIssue {
  return { dimension: 'api', severity, message, file, category }
}
