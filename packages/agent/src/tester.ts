import type { AppModel, ComponentNode } from '@aikd/shared'
import type { GeneratedFile, TestResult, LLMClient } from './types'
import { registry } from '@aikd/component-registry'

// ─── Tester Agent ────────────────────────────────────────
//
// Tester 负责验证 Builder 生成的代码是否完整可用。
// V1 仅做静态分析（无构建），Phase 4 将加入 Docker 构建测试。

export interface TesterOptions {
  appModel: AppModel
  files: GeneratedFile[]
  signal?: AbortSignal
}

const REQUIRED_FILES = ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx']

export class TesterAgent {
  constructor(private llm: LLMClient) {}

  async test(options: TesterOptions): Promise<TestResult> {
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []

    // 1. 检查必需文件
    const filePaths = new Set(options.files.map((f) => f.path))
    for (const required of REQUIRED_FILES) {
      if (!filePaths.has(required)) {
        errors.push(`缺少必需文件: ${required}`)
      }
    }

    // 如果缺少必需文件，直接返回失败
    if (errors.length > 0) {
      return { passed: false, errors, warnings, suggestions }
    }

    // 2. 检查页面文件
    const pages = options.appModel.schema.pages
    for (const page of pages) {
      const pagePath = `src/pages/${page.id}.tsx`
      if (!filePaths.has(pagePath)) {
        errors.push(`缺少页面文件: ${pagePath}`)
      }
    }

    // 3. 检查组件引用合法性
    const validateComponent = (node: ComponentNode, location: string): void => {
      if (!registry.has(node.type)) {
        errors.push(`${location}: 使用了未注册的组件类型 "${node.type}"`)
      }

      // 检查 props 是否包含必需字段
      const def = registry.get(node.type)
      if (def) {
        for (const propSchema of def.propsSchema) {
          if (propSchema.required && !(propSchema.name in (node.props || {}))) {
            warnings.push(`${location} → ${node.type}: 缺少必需 prop "${propSchema.name}"`)
          }
        }
      }

      // 递归检查子组件
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          validateComponent(node.children[i], `${location} → ${node.type}[${i}]`)
        }
      }
    }

    for (const page of pages) {
      for (let i = 0; i < page.components.length; i++) {
        validateComponent(page.components[i], `页面 ${page.id}[${i}]`)
      }
    }

    // 4. 检查路由一致性
    const pageIds = new Set(pages.map((p) => p.id))
    for (const route of options.appModel.schema.routes) {
      if (!pageIds.has(route.pageId)) {
        errors.push(`路由 "${route.path}" 引用了不存在的页面: ${route.pageId}`)
      }
    }

    // 5. 检查首页路由
    const hasRootRoute = options.appModel.schema.routes.some((r) => r.path === '/')
    if (!hasRootRoute) {
      errors.push('应用必须包含首页路由 (path: "/")')
    }

    // 6. 检查 package.json 格式
    const pkgFile = options.files.find((f) => f.path === 'package.json')
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content)
        if (!pkg.dependencies?.react) {
          warnings.push('package.json 中缺少 react 依赖')
        }
        if (!pkg.dependencies?.['react-dom']) {
          warnings.push('package.json 中缺少 react-dom 依赖')
        }
      } catch {
        errors.push('package.json 不是有效的 JSON')
      }
    }

    // 7. 检查代码文件的基本语法
    for (const file of options.files) {
      if (file.path.endsWith('.tsx') || file.path.endsWith('.ts')) {
        const balanceResult = this.checkBraceBalance(file.content)
        if (!balanceResult.balanced) {
          warnings.push(`${file.path}: ${balanceResult.message}`)
        }
      }
    }

    // 8. 生成建议
    if (warnings.length === 0 && errors.length === 0) {
      suggestions.push('代码结构完整，可以进入预览阶段')
    } else if (errors.length === 0) {
      suggestions.push('代码基本可用，但有部分警告需要注意')
    } else {
      suggestions.push('请修复上述错误后重新生成代码')
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      suggestions,
    }
  }

  /** 检查花括号是否平衡（简易检查） */
  private checkBraceBalance(code: string): { balanced: boolean; message: string } {
    let depth = 0
    let inString: false | '"' | "'" | '`' = false

    for (let i = 0; i < code.length; i++) {
      const char = code[i]

      // 处理字符串
      if (inString) {
        if (char === inString && code[i - 1] !== '\\') {
          inString = false
        }
        continue
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = char
        continue
      }

      if (char === '{') depth++
      if (char === '}') depth--

      if (depth < 0) {
        return { balanced: false, message: '花括号不匹配：多余的 "}"' }
      }
    }

    if (depth !== 0) {
      return { balanced: false, message: `花括号不匹配：剩余 ${depth} 个未闭合的 "{"` }
    }

    return { balanced: true, message: '' }
  }
}
