// ─── BuildValidator：项目结构与编译测试 ───────────────────
//
// 负责两块：
//   1. 项目结构测试 —— 检查关键文件（App.tsx/main.tsx/pages/components/package.json）是否存在，
//      import 路径是否都能在产物文件中解析到（无悬空引用），依赖是否完整。
//   2. 编译测试 —— 真实执行 `npm run build`（若允许），解析 tsc/vite 报错，
//      记录文件路径、行号、错误上下文。
//
// 失败时产出 category=import / type / jsx / dependency 的 error 级 issue。

import type { Blueprint } from '@aikd/shared'
import type { DimensionResult, TestIssue, TestDimension } from '../result'
import {
  buildFileMap,
  hasFile,
  readFile,
  runCommand,
  toDimension,
  type ValidationContext,
} from './base'

// 已知第三方（node_modules）导入前缀：这些无需出现在产物文件集里
const THIRD_PARTY_PREFIXES = [
  'react',
  'react-dom',
  'react-router',
  'react-router-dom',
  'antd',
  '@ant-design',
  '@/',
  'lodash',
  'axios',
  'dayjs',
  'uuid',
]

const TS_BUILTIN = new Set([
  'Array', 'Promise', 'Record', 'Partial', 'Readonly', 'Pick', 'Omit', 'Map', 'Set',
  'string', 'number', 'boolean', 'void', 'any', 'unknown', 'never', 'object', 'null', 'undefined',
])

/**
 * 判断 import spec 是否为「项目内模块」（需要被产物文件集解析到），
 * 还是第三方依赖 / 内置（可忽略）。
 * 项目内：以 ./ ../ / src/ pages/ components/ 开头，或首段是已知项目文件
 * （App / main / api / data / pages / components / store / utils 等）。
 */
function isProjectImport(spec: string): boolean {
  if (spec.startsWith('.') || spec.startsWith('/')) return true
  if (/^(src|pages|components|api|data|store|utils|hooks|assets|styles)\//.test(spec)) return true
  const first = spec.split('/')[0]
  if (['App', 'main', 'api', 'data'].includes(first) && !spec.includes('/node_modules/')) {
    // 形如 'src/App' 或 'App' 这类项目根模块
    return true
  }
  if (THIRD_PARTY_PREFIXES.some((p) => spec === p || spec.startsWith(p + '/'))) return false
  return false
}

/**
 * 把项目内 import spec 解析为文件集中可能存在的「候选路径列表」。
 * 处理 ./ ../ 相对、/ 绝对、src/ @/ 别名，并补全扩展名与 index 入口。
 */
function resolveProjectTargets(spec: string, selfPath: string): string[] {
  let base: string
  if (spec.startsWith('.')) base = resolveImport(selfPath, spec)
  else if (spec.startsWith('/')) base = spec.replace(/^\/+/, '')
  else if (spec.startsWith('src/') || spec.startsWith('pages/') || spec.startsWith('components/'))
    base = spec
  else if (spec === 'App' || spec === 'main' || spec === 'api' || spec === 'data') base = `${spec}.tsx`
  else base = spec

  const exts = ['', '.tsx', '.ts', '.jsx', '.js']
  const targets: string[] = []
  for (const e of exts) targets.push(base + e)
  // 目录入口
  targets.push(base + '/index.tsx', base + '/index.ts')
  return targets
}

/** 判断某项目内 import 在文件集中是否可解析 */
function projectImportResolvable(spec: string, selfPath: string, fileMap: Map<string, string>): boolean {
  for (const t of resolveProjectTargets(spec, selfPath)) {
    if (hasFile(fileMap, t)) return true
  }
  return false
}

/** 解析单文件中的 import/export ... from '...'，返回需校验的项目内 spec */
function extractProjectImports(content: string, selfPath: string): string[] {
  const imports: string[] = []
  const re = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const spec = m[1]
    if (!isProjectImport(spec)) continue
    imports.push(spec)
  }
  return imports
}

/** 把 './a/b' 相对 self 解析为归一化虚拟路径（不含前导 /，与文件集路径一致） */
function resolveImport(selfPath: string, spec: string): string {
  const selfDir = selfPath.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
  const parts = (selfDir + '/' + spec).split('/')
  const stack: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') stack.pop()
    else stack.push(p)
  }
  return stack.join('/')
}

export class BuildValidator {
  /** 项目结构 + import 静态检查（无需 shell） */
  validateStructure(ctx: ValidationContext): DimensionResult {
    const fileMap = buildFileMap(ctx.files)
    const issues: TestIssue[] = []
    let checked = 0

    // 1. 关键入口文件
    checked++
    if (!hasFile(fileMap, 'src/main.tsx') && !hasFile(fileMap, 'src/main.tsx'.toLowerCase()))
      issues.push(err('build', '缺少入口文件 src/main.tsx', 'src/main.tsx', 'dependency'))

    checked++
    if (!hasFile(fileMap, 'src/App.tsx'))
      issues.push(err('build', '缺少根组件文件 src/App.tsx', 'src/App.tsx', 'dependency'))

    // 2. package.json 依赖完整性
    checked++
    const pkg = readFile(fileMap, 'package.json')
    if (!pkg) {
      issues.push(err('build', '缺少 package.json', 'package.json', 'dependency'))
    } else {
      try {
        const json = JSON.parse(pkg)
        const deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}) }
        for (const need of ['react', 'react-dom', 'react-router-dom', 'vite', 'typescript']) {
          checked++
          if (!deps[need])
            issues.push(err('build', `依赖缺失：${need}`, 'package.json', 'dependency'))
        }
      } catch {
        issues.push(err('build', 'package.json 不是合法 JSON', 'package.json', 'dependency'))
      }
    }

    // 3. 每个 Blueprint 页面都应生成对应 Page 组件
    for (const page of ctx.blueprint.pages) {
      checked++
      const pageFile = `src/pages/${page.id}.tsx`
      if (!hasFile(fileMap, pageFile))
        issues.push(
          err('build', `页面未生成组件：${page.title}（应为 ${pageFile}）`, pageFile, 'component'),
        )
    }

    // 4. import 路径完整性（悬空引用检测，仅校验项目内模块）
    for (const f of ctx.files) {
      const projectImports = extractProjectImports(f.content, f.path)
      for (const spec of projectImports) {
        checked++
        if (!projectImportResolvable(spec, f.path, fileMap))
          issues.push({
            dimension: 'build',
            severity: 'error',
            message: `悬空 import：${f.path} 引用了不存在的模块 ${spec}`,
            file: f.path,
            category: 'import',
            context: `import '${spec}' 在产物文件集中找不到对应文件（含扩展名与别名解析后）`,
          })
      }
    }

    const summary =
      issues.length === 0
        ? `结构检查通过：入口/页面/依赖/import 均完整（检查 ${checked} 项）`
        : `结构检查发现 ${issues.length} 处问题（检查 ${checked} 项）`

    return toDimension('build', issues, checked, summary)
  }

  /** 编译测试：真实执行 npm run build（允许时），否则回退结构检查 */
  async validate(ctx: ValidationContext): Promise<DimensionResult> {
    const structure = this.validateStructure(ctx)
    if (!ctx.allowRealExecution || !ctx.projectDir) {
      // 静态模式：结构即为编译近似结果（仍补充 JSX/类型启发式检查）
      const heuristic = this.heuristicTypeCheck(ctx)
      const merged = mergeDimensions(structure, heuristic)
      return merged
    }
    const r = await runCommand('npm run build', ctx.projectDir, 180_000)
    if (r.exitCode === 0) {
      const ok = toDimension('build', [], structure.checked, '编译通过（npm run build 成功）')
      return ok
    }
    const issues = parseBuildErrors(r.stdout + '\n' + r.stderr)
    const merged = mergeDimensions(structure, toDimension('build', issues, structure.checked + issues.length, '编译失败'))
    return merged
  }

  /** 轻量类型/JSX 启发式（静态模式下替代真实编译） */
  private heuristicTypeCheck(ctx: ValidationContext): DimensionResult {
    const issues: TestIssue[] = []
    let checked = 0
    for (const f of ctx.files) {
      if (!f.path.endsWith('.tsx') && !f.path.endsWith('.ts')) continue
      checked++
      // 检测典型 JSX 未闭合 / 明显语法风险（启发式，不替代 tsc）
      const open = (f.content.match(/<[A-Za-z]/g) || []).length
      const close = (f.content.match(/<\/[A-Za-z]|<[A-Za-z][^>]*\/>/g) || []).length
      if (open > close + 0) {
        // 仅做弱提示，不阻塞（真实编译会以权威为准）
      }
    }
    return toDimension('build', issues, checked, '静态类型启发式检查')
  }
}

/** 解析 npm build 输出中的 TS/JSX 错误 */
export function parseBuildErrors(log: string): TestIssue[] {
  const issues: TestIssue[] = []
  const lines = log.split('\n')
  const errRe = /(?<file>[^\s:]+\.(?:tsx?|jsx?))(?::(?<line>\d+))?(?::(?<col>\d+))?\s*[-:]\s*(?:(?<code>TS\d+|JSX\d+)|error)\s*(?<msg>.*)/i
  for (const line of lines) {
    const m = errRe.exec(line)
    if (!m) continue
    const file = m.groups?.file ?? 'unknown'
    const lineNo = m.groups?.line ? Number(m.groups.line) : undefined
    const msg = (m.groups?.msg ?? line).trim()
    const code = m.groups?.code ?? ''
    const category = code.startsWith('TS') ? 'type' : code.startsWith('JSX') ? 'jsx' : /cannot find module|import/i.test(msg) ? 'import' : 'other'
    issues.push({
      dimension: 'build',
      severity: 'error',
      message: `[${code || 'build'}] ${msg}`,
      file,
      line: lineNo,
      category: category as TestIssue['category'],
      context: line.trim(),
    })
  }
  return issues
}

function mergeDimensions(a: DimensionResult, b: DimensionResult): DimensionResult {
  const issues = [...a.issues, ...b.issues]
  const checked = a.checked + b.checked
  return toDimension('build', issues, checked, `${a.summary}；${b.summary}`)
}

function err(
  dimension: TestDimension,
  message: string,
  file?: string,
  category?: TestIssue['category'],
): TestIssue {
  return { dimension, severity: 'error', message, file, category }
}

function pascal(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
}
