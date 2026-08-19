// ─── IntegrityChecker（生成后文件完整性检查）───────────────
//
// 代码生成完成后立即执行的静态完整性检查，在跑 build / dev 之前
// 先拦截「一定会失败」的问题，避免把明显错误的项目交给编译器/浏览器。
//
// 检查三类（对应需求文档第五节第 1 项）：
//   1. import 是否存在   —— 相对路径 import 必须能解析到已生成的文件
//   2. 文件路径是否正确  —— 入口文件齐全、无重复路径、无非法路径
//   3. 组件是否缺失      —— JSX 中使用的组件必须已 import 或本地定义
//
// 该检查是纯静态的、确定性的，不依赖 LLM，因此结果稳定可复现。

/** 待检查的文件 */
export interface CheckableFile {
  path: string
  content: string
}

/** 完整性问题 */
export interface IntegrityIssue {
  severity: 'error' | 'warning'
  /** 问题类别 */
  kind: 'import' | 'path' | 'component' | 'entry'
  /** 所在文件 */
  file?: string
  /** 问题描述 */
  message: string
  /** 修复建议（供 FixAgent 使用） */
  suggestion?: string
}

/** 完整性检查报告 */
export interface IntegrityReport {
  passed: boolean
  issues: IntegrityIssue[]
  /** 错误数量 */
  errorCount: number
  /** 警告数量 */
  warningCount: number
}

/** 可省略的扩展名候选 */
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.css']
/** 目录 index 候选 */
const INDEX_FILES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx']

/** 归一化路径：处理 ./ ../ 与多余斜杠 */
function resolvePath(fromFile: string, spec: string): string {
  const fromDir = fromFile.split('/').slice(0, -1).join('/')
  const combined = spec.startsWith('/') ? spec.slice(1) : `${fromDir}/${spec}`
  const parts: string[] = []
  for (const seg of combined.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  return parts.join('/')
}

/** HTML 原生标签（不需要 import） */
const HTML_TAGS = new Set([
  'div', 'span', 'p', 'a', 'img', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'footer', 'nav', 'main', 'section', 'article', 'aside', 'strong', 'em',
  'br', 'hr', 'pre', 'code', 'small', 'i', 'b', 'u', 's', 'svg', 'path', 'g', 'circle', 'rect',
  'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'use', 'iframe', 'video', 'audio',
  'source', 'canvas', 'figure', 'figcaption', 'blockquote', 'caption', 'colgroup', 'col',
  'fieldset', 'legend', 'dl', 'dt', 'dd', 'time', 'mark', 'del', 'ins', 'sup', 'sub', 'abbr',
])

/**
 * TypeScript 内置类型 / 工具类型。
 * 这些名称会出现在泛型参数里（如 `useState<Array<T>>`），
 * 必须排除，否则会被误判为「JSX 中使用了未定义的组件」。
 */
const TS_BUILTIN_TYPES = new Set([
  'Array', 'Record', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Partial', 'Required',
  'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'Parameters',
  'InstanceType', 'Awaited', 'Date', 'RegExp', 'Error', 'Object', 'String', 'Number', 'Boolean',
  'Function', 'Symbol', 'BigInt', 'JSON', 'Math', 'Iterable', 'Iterator', 'Generator',
  'ArrayBuffer', 'Uint8Array', 'Blob', 'File', 'FormData', 'Headers', 'Request', 'Response',
  'AbortController', 'AbortSignal', 'Event', 'CustomEvent', 'HTMLElement', 'HTMLInputElement',
  'HTMLDivElement', 'HTMLFormElement', 'HTMLButtonElement', 'Element', 'Node', 'NodeList',
  'T', 'K', 'V', 'U', 'R', 'P',
])

/**
 * 这些关键字之后出现的 `<` 一定是 JSX 而非泛型。
 * 用于避免把 `return <Foo />` 误判为泛型参数而漏掉真实的组件缺失问题。
 */
const JSX_LEADING_KEYWORDS = new Set([
  'return', 'default', 'case', 'yield', 'await', 'typeof', 'in', 'of', 'else', 'do',
])

export class IntegrityChecker {
  /**
   * 执行完整性检查。
   * @param files 生成的全部文件
   */
  check(files: CheckableFile[]): IntegrityReport {
    const issues: IntegrityIssue[] = []
    const fileSet = new Set(files.map((f) => f.path.replace(/^\.?\//, '')))

    // ── 2a. 重复路径 ────────────────────────────────────
    const seen = new Set<string>()
    for (const f of files) {
      const norm = f.path.replace(/^\.?\//, '')
      if (seen.has(norm)) {
        issues.push({
          severity: 'error',
          kind: 'path',
          file: f.path,
          message: `文件路径重复：${f.path}`,
          suggestion: '移除重复文件，确保每个路径唯一',
        })
      }
      seen.add(norm)

      // 非法路径：不允许绝对路径 / 越界路径
      if (f.path.includes('..')) {
        issues.push({
          severity: 'error',
          kind: 'path',
          file: f.path,
          message: `文件路径包含非法的上级引用：${f.path}`,
          suggestion: '使用项目内的相对路径',
        })
      }
      // 空内容文件
      if (!f.content || !f.content.trim()) {
        issues.push({
          severity: 'error',
          kind: 'path',
          file: f.path,
          message: `文件内容为空：${f.path}`,
          suggestion: '补全该文件内容，或从项目中移除该文件',
        })
      }
    }

    // ── 2b. 入口文件齐全 ───────────────────────────────
    const hasAny = (candidates: string[]): boolean =>
      candidates.some((c) => fileSet.has(c))

    if (!hasAny(['package.json'])) {
      issues.push({
        severity: 'error',
        kind: 'entry',
        message: '缺少 package.json，项目无法安装依赖与运行',
        suggestion: '生成 package.json，包含 dev/build 脚本与依赖声明',
      })
    }
    if (!hasAny(['index.html', 'public/index.html'])) {
      issues.push({
        severity: 'warning',
        kind: 'entry',
        message: '缺少 index.html 入口',
        suggestion: '生成 index.html 作为 Vite 入口',
      })
    }
    const entryCandidates = [
      'src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts',
      'src/main.jsx', 'src/index.jsx',
    ]
    if (!hasAny(entryCandidates)) {
      issues.push({
        severity: 'error',
        kind: 'entry',
        message: '缺少应用入口文件（src/main.tsx 或 src/index.tsx）',
        suggestion: '生成入口文件并挂载 React 根节点',
      })
    }

    // ── 1. import 解析 ─────────────────────────────────
    for (const f of files) {
      if (!/\.(t|j)sx?$/.test(f.path)) continue
      const specs = this.extractImports(f.content)
      for (const spec of specs) {
        // 仅校验相对路径（第三方包由 package.json 负责）
        if (!spec.startsWith('.') && !spec.startsWith('/')) continue
        const base = resolvePath(f.path.replace(/^\.?\//, ''), spec)
        const resolved =
          EXTENSIONS.some((ext) => fileSet.has(`${base}${ext}`)) ||
          INDEX_FILES.some((idx) => fileSet.has(`${base}${idx}`))
        if (!resolved) {
          issues.push({
            severity: 'error',
            kind: 'import',
            file: f.path,
            message: `${f.path} 中的 import "${spec}" 无法解析到任何已生成的文件`,
            suggestion: `创建缺失的文件 ${base}.tsx，或修正该 import 路径`,
          })
        }
      }
    }

    // ── 3. 组件缺失（JSX 使用了但未 import / 未定义）────
    for (const f of files) {
      if (!/\.(t|j)sx$/.test(f.path)) continue
      const used = this.extractJsxComponents(f.content)
      if (used.length === 0) continue
      const declared = this.extractDeclaredNames(f.content)
      for (const name of used) {
        if (declared.has(name)) continue
        issues.push({
          severity: 'error',
          kind: 'component',
          file: f.path,
          message: `${f.path} 中使用了组件 <${name}>，但未 import 也未在本文件定义`,
          suggestion: `为 ${name} 添加 import 语句，或在本文件中定义该组件`,
        })
      }
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length
    const warningCount = issues.length - errorCount

    return {
      passed: errorCount === 0,
      issues,
      errorCount,
      warningCount,
    }
  }

  /** 提取所有 import / export-from / 动态 import 的模块说明符 */
  private extractImports(content: string): string[] {
    const specs: string[] = []
    const patterns = [
      // import x from 'y' / import 'y' / import {a} from 'y'
      /import\s+(?:[\w*\s{},]+\s+from\s+)?['"]([^'"]+)['"]/g,
      // export ... from 'y'
      /export\s+(?:[\w*\s{},]+\s+)?from\s+['"]([^'"]+)['"]/g,
      // import('y')
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      // require('y')
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ]
    for (const re of patterns) {
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        if (m[1]) specs.push(m[1])
      }
    }
    return [...new Set(specs)]
  }

  /**
   * 提取 JSX 中使用的自定义组件名（大写开头）。
   *
   * 必须排除 TypeScript 泛型语法，否则会把 `useState<Array<T>>` 里的
   * `Array`、`Record` 等类型误判为「缺失组件」而产生误报。
   * 判定方式：JSX 标签的 `<` 前面只能是行首、空白、`(`、`{`、`[`、`,`、`>`、
   * `=` 、`&&`、`||`、`?`、`:`、`return` 等，而泛型的 `<` 前面紧邻标识符。
   */
  private extractJsxComponents(content: string): string[] {
    const names = new Set<string>()
    const re = /<([A-Z][A-Za-z0-9_.]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const name = m[1]
      if (!name) continue

      // 紧邻 `<` 之前的内容：若以标识符或 `>` 结尾，通常是泛型参数
      // （如 useState<Array<...>>、Promise<Record<...>>），而不是 JSX 标签。
      // 但 `return <Foo />`、`=> <Foo />` 等关键字后仍是合法 JSX，需放行。
      const before = content.slice(0, m.index).replace(/\s+$/, '')
      const prevChar = before.slice(-1)
      if (/[A-Za-z0-9_$>]/.test(prevChar)) {
        // 取紧邻的尾部单词，判断是否为可接 JSX 的关键字
        const trailingWord = /([A-Za-z_$][\w$]*)$/.exec(before)?.[1] ?? ''
        if (!JSX_LEADING_KEYWORDS.has(trailingWord)) continue
      }

      // TS 内置类型/工具类型不是组件
      if (TS_BUILTIN_TYPES.has(name)) continue

      // HTML 标签跳过
      if (HTML_TAGS.has(name.toLowerCase())) continue

      names.add(name)
    }
    // 处理 <Foo.Bar /> 形式：只校验根标识符
    return [...new Set([...names].map((n) => n.split('.')[0] as string))]
  }

  /** 提取本文件中「已声明可用」的标识符（import 的 + 本地定义的） */
  private extractDeclaredNames(content: string): Set<string> {
    const declared = new Set<string>()

    // 默认导入：import Foo from '...'
    const defaultRe = /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from/g
    // 命名导入：import { A, B as C } from '...'
    const namedRe = /import\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from/g
    // 命名空间导入：import * as Foo from '...'
    const nsRe = /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from/g
    // 本地定义：function Foo / const Foo = / class Foo
    const localRe =
      /(?:function|class)\s+([A-Z][\w$]*)|(?:const|let|var)\s+([A-Z][\w$]*)\s*[=:]/g

    let m: RegExpExecArray | null
    while ((m = defaultRe.exec(content)) !== null) {
      if (m[1]) declared.add(m[1])
    }
    while ((m = nsRe.exec(content)) !== null) {
      if (m[1]) declared.add(m[1])
    }
    while ((m = namedRe.exec(content)) !== null) {
      const inner = m[1] ?? ''
      for (const part of inner.split(',')) {
        const seg = part.trim()
        if (!seg) continue
        // 处理 `A as B` —— 实际可用名是 B
        const alias = seg.split(/\s+as\s+/)
        const name = (alias[alias.length - 1] ?? '').trim().replace(/^type\s+/, '')
        if (name) declared.add(name)
      }
    }
    while ((m = localRe.exec(content)) !== null) {
      const name = m[1] ?? m[2]
      if (name) declared.add(name)
    }

    // React 命名空间下的内置元素始终可用
    declared.add('Fragment')
    declared.add('Suspense')
    declared.add('StrictMode')
    declared.add('React')

    return declared
  }
}

/** 便捷单例 */
export const integrityChecker = new IntegrityChecker()

/** 便捷检查函数：生成后文件完整性检查 */
export function checkIntegrity(files: CheckableFile[]): IntegrityReport {
  return integrityChecker.check(files)
}
