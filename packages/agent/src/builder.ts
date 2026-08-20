import type { AppModel, ComponentNode, Page } from '@aikd/shared'
import type { GeneratedFile, LLMClient } from './types'
import { generateId } from './utils'
import { generateDesignSystemCss, deriveTokens } from './design-system'

// ─── Builder Agent ───────────────────────────────────────
//
// Builder 负责将 App Model 转化为可运行的 React 代码文件。
// 使用确定性代码生成（非 LLM），确保输出稳定可靠。
// 生成的代码基于 React 18 + TypeScript + Vite。

export interface BuilderOptions {
  appModel: AppModel
  /** 应用 ID（task/session id），用于生成与后端一致的数据表主键 */
  appId?: string
  signal?: AbortSignal
}

/** 页面级能力扫描结果（决定注入哪些 import / state / handler） */
interface PageAnalysis {
  sources: string[]
  needsDelete: boolean
  needsGet: boolean
  needsUpdate: boolean
  hasTable: boolean
  hasSearchableTable: boolean
  tableActions: string[]
  hasDetail: boolean
  hasFormWithParam: boolean
  formParamId?: string
  formDataSource?: string
}

export class BuilderAgent {
  constructor(private llm: LLMClient) {}

  async build(options: BuilderOptions): Promise<{ files: GeneratedFile[] }> {
    const { appModel, appId } = options

    // ── 结构归一化：兼容 LLM 输出的常见偏差（顶层 pages/dataSources / 缺失 schema 包裹等）──
    const normalized = this.normalizeAppModel(appModel)

    const files: GeneratedFile[] = []

    // 1. 静态配置文件
    files.push(this.generatePackageJson(normalized))
    files.push(this.generateIndexHtml(normalized))
    files.push(this.generateViteConfig())
    files.push(this.generateTsConfig())

    // 2. 入口文件
    files.push(this.generateMainTsx())
    files.push(this.generateIndexCss(normalized))

    // 3. App 根组件（含路由）
    files.push(this.generateAppTsx(normalized))

    // 4. 页面组件
    for (const page of normalized.schema.pages) {
      files.push(this.generatePageComponent(page, normalized))
    }

    // 5. 数据访问层（无条件生成：页面组件始终可能引用 '../api'，即使无数据源也应生成基础文件）
    files.push(this.generateDataFile(normalized, appId))

    return { files }
  }

  /**
   * 将 LLM 生成的 App Model 归一化为 Builder 期望的稳定结构。
   * 兼容：pages/dataSources 放在顶层而非 schema 下、schema 字段缺失等情况。
   */
  private normalizeAppModel(appModel: AppModel): AppModel {
    const root = (appModel as unknown) as Record<string, unknown>
    const schemaLike = (root.schema as Record<string, unknown>) || {}
    const pickArray = (keys: string[]): unknown[] => {
      for (const k of keys) {
        const v = (root[k] ?? schemaLike[k]) as unknown
        if (Array.isArray(v)) return v
      }
      return []
    }
    const pages = pickArray(['schema.pages', 'pages', 'schemaPages']) as AppModel['schema']['pages']
    const routes = pickArray(['schema.routes', 'routes']) as AppModel['schema']['routes']
    const dataSources = pickArray(['schema.dataSources', 'dataSources']) as AppModel['schema']['dataSources']
    const theme = (schemaLike.theme ?? root.theme ?? {}) as AppModel['schema']['theme']

    return {
      ...(appModel as unknown as Record<string, unknown>),
      id: appModel.id || (root.id as string) || 'app',
      name: appModel.name || (root.name as string) || '应用',
      schema: {
        pages: pages || [],
        routes: routes || [],
        theme: theme || { primaryColor: '#1677ff', mode: 'light' },
        dataSources: dataSources || [],
      },
    } as AppModel
  }

  // ─── 静态文件生成 ──────────────────────────────────────

  private generatePackageJson(appModel: AppModel): GeneratedFile {
    return {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: appModel.id,
          private: true,
          version: appModel.version,
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'tsc && vite build',
            preview: 'vite preview',
          },
          dependencies: {
            react: '^18.3.0',
            'react-dom': '^18.3.0',
            'react-router-dom': '^6.26.0',
            antd: '^5.20.0',
          },
          devDependencies: {
            '@types/react': '^18.3.0',
            '@types/react-dom': '^18.3.0',
            '@vitejs/plugin-react': '^4.3.0',
            typescript: '^5.5.0',
            vite: '^5.4.0',
          },
        },
        null,
        2,
      ),
    }
  }

  private generateIndexHtml(appModel: AppModel): GeneratedFile {
    return {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${this.escapeHtml(appModel.name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    }
  }

  private generateViteConfig(): GeneratedFile {
    return {
      path: 'vite.config.ts',
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端 API 地址：AI快搭 统一 Data API
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 将前端 /api 请求代理到后端，让应用拥有真实的数据存取能力
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
`,
    }
  }

  private generateTsConfig(): GeneratedFile {
    return {
      path: 'tsconfig.json',
      content: JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            useDefineForClassFields: true,
            lib: ['ES2020', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            skipLibCheck: true,
            moduleResolution: 'bundler',
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
            strict: true,
            noUnusedLocals: false,
            noUnusedParameters: false,
            noFallthroughCasesInSwitch: true,
          },
          include: ['src'],
        },
        null,
        2,
      ),
    }
  }

  private generateMainTsx(): GeneratedFile {
    return {
      path: 'src/main.tsx',
      content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
    }
  }

  private generateIndexCss(appModel: AppModel): GeneratedFile {
    // 基于 Design System 生成统一 CSS：Design Tokens + 基础组件 + 状态样式。
    // 生成应用的视觉语言完全由设计系统驱动，禁止自由造样式。
    const theme = appModel.schema.theme
    const tokens = deriveTokens(theme?.primaryColor, {
      mode: theme?.backgroundColor === '#0f172a' ? 'dark' : 'light',
      fontFamily: theme?.fontFamily,
    })
    const css = generateDesignSystemCss(tokens)
    // h5 移动端应用额外限制内容宽度
    const mobileWidth = appModel.type === 'h5' ? '\n\n/* 移动端应用：限制内容区宽度 */\n.ds-layout-content { max-width: 480px; margin: 0 auto; }\n' : ''

    return {
      path: 'src/index.css',
      content: css + mobileWidth,
    }
  }

  // ─── App.tsx 生成 ───────────────────────────────────────

  private generateAppTsx(appModel: AppModel): GeneratedFile {
    const routes = appModel.schema.routes
    const hasMultiplePages = routes.length > 1

    if (!hasMultiplePages) {
      // 单页应用
      const page = appModel.schema.pages[0]
      const pageImport = `import ${this.pageComponentName(page.id)} from './pages/${page.id}'`
      return {
        path: 'src/App.tsx',
        content: `import React from 'react'
${pageImport}

export default function App() {
  return <${this.pageComponentName(page.id)} />
}
`,
      }
    }

    // 多页应用 - 路由（支持动态参数 /:id）
    // import 去重（多条路由可能指向同一页面，避免重复声明导致编译错误）
    const importSet = new Set<string>()
    for (const r of routes) {
      const page = appModel.schema.pages.find((p) => p.id === r.pageId)
      if (page) importSet.add(`import ${this.pageComponentName(page.id)} from './pages/${page.id}'`)
    }
    const imports = Array.from(importSet).join('\n')

    // 生成路由匹配逻辑：将 '/customers/:id' 编译为可匹配动态段的代码。
    // 兜底：当列表页 path 为 '/' 时，自动注册 /<datasource-short-name> 别名
    // （如 /customers），保证前端链接跳转能命中。
    const aliasedRoutes: Array<{ path: string; pageId: string }> = []
    for (const r of routes) {
      aliasedRoutes.push(r)
      if (r.path === '/') {
        // 找到列表页对应的数据源（如果有），用 short name 作为别名
        const page = appModel.schema.pages.find((p) => p.id === r.pageId)
        if (page) {
          const primaryDs = this.collectDataSources(page.components)[0]
          if (primaryDs) {
            const shortName = primaryDs.replace(/^database\./, '')
            if (shortName && shortName !== '/') {
              aliasedRoutes.push({ path: `/${shortName}`, pageId: r.pageId })
            }
          }
        }
      }
    }
    const matchLogic = aliasedRoutes
      .map((r) => {
        const page = appModel.schema.pages.find((p) => p.id === r.pageId)
        if (!page) return null
        const segments = r.path.split('/').filter(Boolean)
        const dynamicIdx = segments.findIndex((s) => s.startsWith(':'))
        if (dynamicIdx >= 0) {
          const staticPrefix = segments.slice(0, dynamicIdx).join('/')
          const paramName = segments[dynamicIdx].slice(1)
          return `      if (segs.length === ${segments.length} && segs.slice(0, ${dynamicIdx}).join('/') === '${staticPrefix}') {
        return <${this.pageComponentName(page.id)} ${paramName}={segs[${dynamicIdx}]} />
      }`
        }
        return `      if (path === '${r.path}') {
        return <${this.pageComponentName(page.id)} />
      }`
      })
      .filter(Boolean)
      .join('\n')

    return {
      path: 'src/App.tsx',
      content: `import React, { useState, useEffect } from 'react'
${imports}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (to: string) => {
    window.history.pushState(null, '', to)
    setPath(to)
  }

  const renderPage = () => {
    const segs = path.split('/').filter(Boolean)
${matchLogic}
    return <div>404 - 页面未找到</div>
  }

  return <div className="app">{renderPage()}</div>
}
`,
    }
  }

  // ─── 页面组件生成 ───────────────────────────────────────

  private generatePageComponent(page: Page, appModel: AppModel): GeneratedFile {
    const componentName = this.pageComponentName(page.id)
    const isMobile = page.layout === 'mobile'

    // 扫描页面能力：数据源、是否需要 删除/详情/更新、表格搜索等
    const analysis = this.analyzePage(page.components)
    const dataSources = analysis.sources
    const hasData = dataSources.length > 0
    const primaryDs = dataSources[0] || ''
    const primaryState = primaryDs ? `${this.toCamelCase(primaryDs)}Data` : ''
    const primaryLoad = primaryDs ? `load${this.capitalize(this.toCamelCase(primaryDs))}` : ''

    // 兜底：页面没有组件时渲染占位内容，避免预览白屏
    const componentJsx =
      page.components.length > 0
        ? page.components.map((comp) => this.renderComponent(comp, 6, undefined, appModel)).join('\n')
        : `      <div className="ds-empty" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--ds-color-text-tertiary)' }}>此页面暂无内容</p>
      </div>`

    // ── pageType='list' 页面自动增强：统计摘要 + 面包屑，让列表页不再是简单 demo 样式 ──
    // 自动追加 stats 区到 componentJsx 之前，并补充 stats 派生逻辑到 dataHooks/extraHooks
    const listEnhancement = (page.pageType === 'list' && primaryDs)
      ? this.buildListPageEnhancement(page, primaryDs, primaryState, analysis.hasSearchableTable)
      : null
    const finalComponentJsx = listEnhancement ? listEnhancement.jsx + '\n' + componentJsx : componentJsx

    // 生成数据加载 Hook 声明（有数据源时）
    const dataHooks = dataSources
      .map((ds) => this.generateDataHook(ds))
      .join('\n\n')

    // 动态 API 导入
    const apiMethods = new Set<string>(['listRecords'])
    if (dataSources.length > 0) apiMethods.add('createRecord')
    if (analysis.needsDelete) apiMethods.add('deleteRecord')
    if (analysis.needsGet) apiMethods.add('getRecord')
    if (analysis.needsUpdate) apiMethods.add('updateRecord')

    // 若页面有 Form 且 Form 子树中无 Input，Builder 会生成运行时动态字段
    // （使用 customersFallback[0] 取字段名），需把 fallback 变量也加入 import。
    // 递归遍历整个组件树查找 Form（可能在多层 Container/Section 内）。
    const pageHasForm = (() => {
      const walk = (nodes: ComponentNode[]): boolean => {
        for (const n of nodes) {
          if (n.type === 'Form') return true
          if (n.children && walk(n.children)) return true
        }
        return false
      }
      return walk(page.components)
    })()
    if (pageHasForm) {
      for (const ds of dataSources) {
        const dsBase = ds.replace(/^database\./, '')
        apiMethods.add(`${this.toCamelCase(dsBase)}Fallback`)
      }
    }
    const apiImportList = Array.from(apiMethods).join(', ')

    // 额外状态 / handler（搜索、删除、详情/编辑取数）
    const extraHooks: string[] = []
    if (analysis.hasSearchableTable) {
      extraHooks.push(`  // 列表搜索
  const [q, setQ] = useState('')
  const ${primaryState}Filtered = ${primaryState}.filter((r) =>
    q.trim() === '' ? true : JSON.stringify(r.data).toLowerCase().includes(q.trim().toLowerCase()),
  )`)
    }
    if (analysis.needsDelete && primaryDs) {
      extraHooks.push(`  // 删除处理
  const handleDelete = async (ds: string, id: string) => {
    if (!window.confirm('确认删除该记录？')) return
    try {
      await deleteRecord(ds, id)
      await ${primaryLoad}()
    } catch (err) {
      console.error('删除失败:', err)
      window.alert('删除失败，请重试')
    }
  }`)
    }
    if (analysis.needsGet && primaryDs) {
      extraHooks.push(`  // 根据路由参数 :id 加载单条记录（详情 / 编辑）
  const [record, setRecord] = useState<{ id: string; data: Record<string, unknown> } | null>(null)
  useEffect(() => {
    const id = (props && props.id) || ''
    if (!id) return
    void (async () => {
      try {
        const res = await getRecord('${primaryDs}', id)
        const rec = res.record ?? null
        setRecord(rec)
        // 编辑页：用记录预填表单
        if (rec) set${this.capitalize(this.toCamelCase(primaryDs))}Form(rec.data as Record<string, unknown>)
      } catch (err) {
        console.error('加载记录失败:', err)
      }
    })()
  }, [props && props.id])`)
    }

    const imports = hasData
      ? `import React, { useState, useEffect } from 'react'
import { ${apiImportList} } from '../api'`
      : `import React from 'react'`

    // 需要接收路由参数（详情 / 编辑页）时，函数签名加上 props
    const needsProps = analysis.hasDetail || analysis.hasFormWithParam
    const fnSignature = needsProps
      ? `export default function ${componentName}(props: { id?: string }) {`
      : `export default function ${componentName}() {`

    const extraHookBlock = (extraHooks.join('\n\n') + (listEnhancement ? '\n\n' + listEnhancement.hook : '')).trim()

    // 列表页增强的导入补全
    const finalImports = listEnhancement?.extraImports
      ? `import React, { useState, useEffect, useMemo } from 'react'
import { ${apiImportList} } from '../api'`
      : imports

    return {
      path: `src/pages/${page.id}.tsx`,
      content: `${finalImports}

${fnSignature}
${dataHooks}${extraHookBlock ? '\n\n' + extraHookBlock : ''}
  return (
    <div className="page" ${isMobile ? 'style={{ minHeight: "100vh", maxWidth: "480px", margin: "0 auto" }}' : ''}>
${finalComponentJsx}
    </div>
  )
}
`,
    }
  }

  /**
   * 列表页增强：自动生成统计摘要 + 状态筛选，让列表页不再是简单 demo 样式。
   * 返回 { jsx, hook, extraImports }，由 generatePageComponent 注入到页面。
   *
   * 增强内容：
   *   1. 顶部 4 个 StatCard（总数 / 待处理 / 已完成 / 异常），按数据自动计算
   *   2. 状态徽章着色（在 Table 操作列中识别 status 字段并根据值渲染 Badge）
   *
   * 注：实际渲染中 Badge 着色通过 Table 渲染时识别 'status' 列实现（见 renderComponent Table case）。
   *    本方法主要负责生成顶部统计区 + 状态筛选。
   */
  private buildListPageEnhancement(
    page: Page,
    primaryDs: string,
    primaryState: string,
    hasSearch: boolean,
  ): { jsx: string; hook: string; extraImports: boolean } {
    const tableId = page.tableId || primaryDs.replace(/^database\./, '')
    // 顶部统计区：4 张卡片（总数 / 待审批 / 已通过 / 已驳回）— 从数据中派生
    // 注意：此方法返回**生成到 React 源文件里的字面量文本**，因此要使用字符串拼接而非模板字符串插值，
    // 否则 ${primaryState} 会被 JS 求值为变量值，丢失标识符名。
    const s = primaryState
    const statsJsx = [
      '      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "20px" }}>',
      '        <div className="ds-card">',
      '          <div style={{ fontSize: "13px", color: "var(--ds-color-text-secondary)" }}>全部</div>',
      `          <div style={{ fontSize: "24px", fontWeight: 600, marginTop: "4px" }}>{${s}.length}</div>`,
      '        </div>',
      '        <div className="ds-card">',
      '          <div style={{ fontSize: "13px", color: "var(--ds-color-text-secondary)" }}>待处理</div>',
      `          <div style={{ fontSize: "24px", fontWeight: 600, marginTop: "4px", color: "var(--ds-color-warning)" }}>{${s}.filter((r) => { const _s = String(r.data?.status ?? ""); return _s.includes("待") || _s.includes("pending") || _s.includes("审批") }).length}</div>`,
      '        </div>',
      '        <div className="ds-card">',
      '          <div style={{ fontSize: "13px", color: "var(--ds-color-text-secondary)" }}>已通过</div>',
      `          <div style={{ fontSize: "24px", fontWeight: 600, marginTop: "4px", color: "var(--ds-color-success)" }}>{${s}.filter((r) => { const _s = String(r.data?.status ?? ""); return _s.includes("通过") || _s.includes("approved") || _s.includes("完成") }).length}</div>`,
      '        </div>',
      '        <div className="ds-card">',
      '          <div style={{ fontSize: "13px", color: "var(--ds-color-text-secondary)" }}>已驳回</div>',
      `          <div style={{ fontSize: "24px", fontWeight: 600, marginTop: "4px", color: "var(--ds-color-error)" }}>{${s}.filter((r) => { const _s = String(r.data?.status ?? ""); return _s.includes("驳回") || _s.includes("拒绝") || _s.includes("rejected") }).length}</div>`,
      '        </div>',
      '      </div>',
    ].join('\n')

    // 状态筛选：仅在有搜索时注入
    // 注意：使用字符串拼接 + 数组 join 而非模板字符串，避免 ${primaryState} 被 JS 求值
    const statusFilterHook = hasSearch
      ? [
          '  // 状态筛选',
          "  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')",
          `  const statusFiltered = (() => {`,
          `    if (statusFilter === 'all') return ${s}`,
          `    const map: Record<string, string[]> = {`,
          `      pending: ['待', 'pending', '审批'],`,
          `      approved: ['通过', 'approved', '完成'],`,
          `      rejected: ['驳回', '拒绝', 'rejected'],`,
          `    }`,
          `    const keywords = map[statusFilter] || []`,
          `    return ${s}.filter((r) => {`,
          `      const _s = String(r.data?.status ?? '')`,
          `      return keywords.some((k) => _s.includes(k))`,
          `    })`,
          `  })()`,
          `  const ${s}Final = (${s}Filtered ?? ${s}).filter((r) => {`,
          `    if (statusFilter === 'all') return true`,
          `    const map: Record<string, string[]> = {`,
          `      pending: ['待', 'pending', '审批'],`,
          `      approved: ['通过', 'approved', '完成'],`,
          `      rejected: ['驳回', '拒绝', 'rejected'],`,
          `    }`,
          `    const keywords = map[statusFilter] || []`,
          `    const _s = String(r.data?.status ?? '')`,
          `    return keywords.some((k) => _s.includes(k))`,
          `  })`,
        ].join('\n')
      : ''

    // 状态筛选 UI 标签
    const filterBarJsx = hasSearch
      ? [
          '      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>',
          "        {(['all','pending','approved','rejected'] as const).map((k) => (",
          '          <button',
          '            key={k}',
          "            className={'ds-btn ' + (statusFilter === k ? 'ds-btn-primary' : 'ds-btn-outline') + ' ds-btn-small'}",
          "            onClick={() => setStatusFilter(k)}",
          '          >',
          "            {({all:'全部',pending:'待处理',approved:'已通过',rejected:'已驳回'} as const)[k]}",
          '          </button>',
          '        ))}',
          '      </div>',
        ].join('\n')
      : ''

    return {
      jsx: statsJsx + '\n' + filterBarJsx,
      hook: statusFilterHook,
      extraImports: hasSearch, // 需要 useState 已存在；useMemo 不需要所以不必引入
    }
  }

  /**
   * 递归收集组件树中引用的数据源（Table/Form 的 dataSource prop）。
   */
  private collectDataSources(components: ComponentNode[]): string[] {
    const sources = new Set<string>()
    const walk = (nodes: ComponentNode[]) => {
      for (const node of nodes) {
        const ds = node.props?.dataSource
        if (ds && typeof ds === 'string' && ds.length > 0) {
          sources.add(ds)
        }
        if (node.children) walk(node.children)
      }
    }
    walk(components)
    return Array.from(sources)
  }

  /**
   * 分析页面组件树，确定需要注入的数据访问能力与交互。
   * 这是 Builder 的「确定性兜底」：即使 Planner 未显式提供交互，
   * 只要组件结构表达了 CRUD 意图（Table dataSsource + actions / Detail paramId / Form paramId），
   * Builder 都会生成可用的真实逻辑。
   */
  private analyzePage(components: ComponentNode[]): PageAnalysis {
    const analysis: PageAnalysis = {
      sources: this.collectDataSources(components),
      needsDelete: false,
      needsGet: false,
      needsUpdate: false,
      hasTable: false,
      hasSearchableTable: false,
      tableActions: [],
      hasDetail: false,
      hasFormWithParam: false,
    }
    const walk = (nodes: ComponentNode[]) => {
      for (const node of nodes) {
        const ds = node.props?.dataSource
        const dsStr = ds && typeof ds === 'string' ? ds : ''
        if (node.type === 'Table' && dsStr) {
          analysis.hasTable = true
          if (node.props.searchable !== false) analysis.hasSearchableTable = true
          const actions = Array.isArray(node.props.actions) ? (node.props.actions as string[]) : []
          analysis.tableActions = Array.from(new Set([...analysis.tableActions, ...actions]))
          if (actions.includes('delete')) analysis.needsDelete = true
        }
        if (node.type === 'Detail' && dsStr) {
          analysis.hasDetail = true
          analysis.needsGet = true
        }
        if (node.type === 'Form' && dsStr) {
          const paramId = node.props.paramId
          if (typeof paramId === 'string' && paramId.startsWith(':')) {
            analysis.hasFormWithParam = true
            analysis.formParamId = paramId.slice(1)
            analysis.formDataSource = dsStr
            analysis.needsGet = true
            analysis.needsUpdate = true
          }
        }
        if (node.children) walk(node.children)
      }
    }
    walk(components)
    return analysis
  }

  /** 从 AppModel 的 dataSources schema 推断字段名列表（供 Detail 等组件渲染） */
  private inferFields(appModel: AppModel, dataSource: string): string[] {
    const all = appModel.schema?.dataSources ?? []
    const ds = all.find((d) => d.id === dataSource || d.id === `database.${dataSource}`)
    if (!ds) return []
    // 字段来源：data 数组首元素的 key（DataSource 结构为 { data: [...] }）
    const rows = Array.isArray(ds.data) ? (ds.data as unknown[]) : []
    const first = rows[0] as Record<string, unknown> | undefined
    if (first && typeof first === 'object') {
      return Object.keys(first)
    }
    return []
  }

  /**
   * 从数据源示例数据推断字段类型（供 Form 提交做类型归一化）。
   * 依据 data 首元素的运行时类型：number/boolean → 对应类型，否则 string。
   * 返回 { 字段名: 'number'|'boolean'|'string' }。
   */
  private inferFieldTypes(appModel: AppModel, dataSource: string): Record<string, 'number' | 'boolean' | 'string'> {
    const all = appModel.schema?.dataSources ?? []
    const ds = all.find((d) => d.id === dataSource || d.id === `database.${dataSource}`)
    if (!ds) return {}
    const rows = Array.isArray(ds.data) ? (ds.data as unknown[]) : []
    const first = rows[0] as Record<string, unknown> | undefined
    if (!first || typeof first !== 'object') return {}
    const types: Record<string, 'number' | 'boolean' | 'string'> = {}
    for (const [key, value] of Object.entries(first)) {
      if (typeof value === 'number') types[key] = 'number'
      else if (typeof value === 'boolean') types[key] = 'boolean'
      else types[key] = 'string'
    }
    return types
  }

  /**
   * 生成表单提交前的类型归一化代码：把 form state 中的字符串值按字段类型转换，
   * 避免后端严格类型校验（number/boolean）因前端字符串提交而失败。
   * 返回形如：
   *   const payload = { ...databaseProductsForm, price: Number(databaseProductsForm['price']), stock: Number(databaseProductsForm['stock']) }
   */
  private buildFormPayloadCode(formStateName: string, fieldTypes: Record<string, 'number' | 'boolean' | 'string'>, pad: string): string {
    const convertFields = Object.entries(fieldTypes).filter(([, type]) => type === 'number' || type === 'boolean')
    if (convertFields.length === 0) {
      // 无需要转换的字段：直接使用 form state
      return `${pad}      const payload = ${formStateName}`
    }
    const parts = convertFields.map(([key, type]) => {
      const convert = type === 'number' ? 'Number' : 'Boolean'
      return `'${this.escapeJsString(key)}': ${formStateName}['${this.escapeJsString(key)}'] === '' || ${formStateName}['${this.escapeJsString(key)}'] === undefined ? undefined : ${convert}(${formStateName}['${this.escapeJsString(key)}'])`
    })
    return `${pad}      const payload = { ...${formStateName}, ${parts.join(', ')} }`
  }

  /** 递归判断组件树是否包含任何输入类组件（Input/Textarea/Select） */
  private hasInputInTree(nodes: ComponentNode[]): boolean {
    const inputTypes = new Set(['Input', 'Textarea', 'Select'])
    const walk = (list: ComponentNode[]): boolean => {
      for (const n of list) {
        if (inputTypes.has(n.type)) return true
        if (n.children && walk(n.children)) return true
      }
      return false
    }
    return walk(nodes)
  }

  /**
   * 生成运行时动态表单字段：当 Planner 未在 Form 子树中放置 Input 时，
   * 兜底在运行时根据已加载数据（customersFallback[0] 或后端第一条记录）的 keys
   * 动态渲染受控 Input 组件，确保新增/编辑页在预览中始终可填写。
   *
   * 由于字段名在运行时才能确定，这里生成一个内嵌的 .map() JSX 表达式，
   * 遍历字段数组渲染多个 Input 控件。
   */
  private generateRuntimeFormFields(
    dataSource: string,
    formStateName: string,
    setFormName: string,
    pad: string,
  ): string {
    // fallback 数据变量名（与 api.ts 中 ${toCamelCase(ds.name)}Fallback 一致）
    const fallbackName = `${this.toCamelCase(dataSource.replace(/^database\./, ''))}Fallback`
    // 生成的 JSX：
    //  1) 优先用后端加载的 ${stateName}[0]?.data 的 keys；
    //  2) 否则用 ${fallbackName}[0] 的 keys；
    //  3) 都没有则显示提示
    return `${pad}  {(() => {\n${pad}    const allKeys = (${fallbackName}[0] ? Object.keys(${fallbackName}[0]) : [])\n${pad}    // 排除系统主键字段（id 等不应作为可编辑字段）\n${pad}    const skip = new Set(['id', '_id', 'createdAt', 'updatedAt', 'created_at', 'updated_at', 'remark', 'remarks', 'note', 'notes'])\n${pad}    const fields = allKeys.filter((k) => !skip.has(k))\n${pad}    if (fields.length === 0) return <div style={{ color: 'var(--ds-color-text-tertiary)', padding: '12px 0' }}>暂无可编辑字段</div>\n${pad}    return (\n${pad}      <div>\n${pad}        {fields.map((f) => (\n${pad}          <div key={f} style={{ marginBottom: '12px' }}>\n${pad}            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>{f}</label>\n${pad}            <input type="text" placeholder={\`请输入\${f}\`} value={${formStateName}[f] ?? ''} onChange={(e) => ${setFormName}({ ...${formStateName}, [f]: e.target.value })} />\n${pad}          </div>\n${pad}        ))}\n${pad}      </div>\n${pad}    )\n${pad}  })()}`
  }

  /**
   * 为数据源生成数据加载 Hook。
   * 生成 useState（数据 + 表单） + useEffect（加载 listRecords）。
   */
  private generateDataHook(dataSource: string): string {
    const stateName = `${this.toCamelCase(dataSource)}Data`
    const loadName = `load${this.toCamelCase(dataSource).charAt(0).toUpperCase()}${this.toCamelCase(dataSource).slice(1)}`
    return `  // ─── 数据源：${dataSource} ───
  const [${stateName}, set${this.capitalize(stateName)}] = useState<Array<{ id: string; data: Record<string, unknown> }>>([])
  const [${this.toCamelCase(dataSource)}Form, set${this.capitalize(this.toCamelCase(dataSource))}Form] = useState<Record<string, string>>({})

  const ${loadName} = async () => {
    try {
      const res = await listRecords('${dataSource}')
      set${this.capitalize(stateName)}(res.records)
    } catch (err) {
      console.error('加载 ${dataSource} 数据失败:', err)
    }
  }

  useEffect(() => {
    void ${loadName}()
  }, [])`
  }

  // ─── 组件渲染（ComponentNode → JSX） ────────────────────

  private renderComponent(node: ComponentNode, indent: number, formDataSource?: string, appModel?: AppModel): string {
    const pad = ' '.repeat(indent)
    const children = node.children || []
    const childJsx = children.map((c) => this.renderComponent(c, indent + 2, formDataSource, appModel)).join('\n')

    switch (node.type) {
      case 'Container':
        return `${pad}<div style={{ maxWidth: ${this.jsStr(node.props.maxWidth)}, padding: ${this.jsStr(node.props.padding)}, background: ${this.jsStr(node.props.background)} }}>\n${childJsx}\n${pad}</div>`

      case 'Grid':
        return `${pad}<div style={{ display: 'grid', gridTemplateColumns: \`repeat(${node.props.columns || 3}, 1fr)\`, gap: ${this.jsStr(node.props.gap)} }}>\n${childJsx}\n${pad}</div>`

      case 'Flex':
        return `${pad}<div style={{ display: 'flex', flexDirection: ${this.jsStr(node.props.direction)}, justifyContent: ${this.jsStr(node.props.justify)}, alignItems: ${this.jsStr(node.props.align)}, gap: ${this.jsStr(node.props.gap)} }}>\n${childJsx}\n${pad}</div>`

      case 'Section':
        const sectionTitle = node.props.title
          ? `${pad}  <h2 style={{ marginBottom: '16px' }}>${this.escapeHtml(String(node.props.title))}</h2>\n`
          : ''
        return `${pad}<section style={{ background: ${this.jsStr(node.props.background)}, padding: ${this.jsStr(node.props.padding)} }}>\n${sectionTitle}${childJsx}\n${pad}</section>`

      case 'Heading':
        return `${pad}<${this.normalizeHeadingLevel(node.props.level)} style={{ color: ${this.jsStr(node.props.color)}, textAlign: ${this.jsStr(node.props.align)} }}>${this.escapeHtml(String(node.props.text || ''))}</${this.normalizeHeadingLevel(node.props.level)}>`

      case 'Text':
        return `${pad}<span style={{ fontSize: ${this.jsStr(node.props.fontSize)}, color: ${this.jsStr(node.props.color)}, textAlign: ${this.jsStr(node.props.align)}, display: 'inline-block' }}>${this.escapeHtml(String(node.props.text || ''))}</span>`

      case 'Paragraph':
        return `${pad}<p style={{ fontSize: ${this.jsStr(node.props.fontSize)}, lineHeight: ${this.jsStr(node.props.lineHeight)}, color: ${this.jsStr(node.props.color)} }}>${this.escapeHtml(String(node.props.text || ''))}</p>`

      case 'Button': {
        // onClick 支持跳转语义：'/path' 或 'navigate:/path' → 客户端跳转
        const onClick = node.props.onClick
        let clickAttr = ''
        if (typeof onClick === 'string' && onClick.length > 0) {
          const target = onClick.startsWith('navigate:') ? onClick.slice('navigate:'.length) : onClick
          if (target.startsWith('/')) {
            clickAttr = ` onClick={() => { window.location.href = '${this.escapeJsString(target)}' }}`
          } else {
            clickAttr = ` onClick={() => { ${this.escapeJsString(onClick)} }}`
          }
        }
        return `${pad}<button${clickAttr} className="ds-btn ds-btn-${this.normalizeVariant(node.props.variant)} ds-btn-${this.normalizeSize(node.props.size)}" disabled={${node.props.disabled || false}}>${this.escapeHtml(String(node.props.text || ''))}</button>`
      }

      case 'Link':
        return `${pad}<a href={${this.jsStr(node.props.href)}} target={${this.jsStr(node.props.target)}}>${this.escapeHtml(String(node.props.text || ''))}</a>`

      case 'Input': {
        const inputLabel = node.props.label
          ? `${pad}  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>${this.escapeHtml(String(node.props.label))}</label>\n`
          : ''
        // 处于表单上下文时，生成受控输入（绑定 form state）
        if (formDataSource) {
          const formStateName = `${this.toCamelCase(formDataSource)}Form`
          const setFormName = `set${this.capitalize(this.toCamelCase(formDataSource))}Form`
          const fieldKey = this.normalizeFieldKey(String(node.props.field || node.props.name || node.id))
          return `${pad}<div style={{ marginBottom: '12px' }}>\n${inputLabel}${pad}  <input type=${this.jsStr(node.props.type || 'text')} placeholder=${this.jsStr(node.props.placeholder)} value={${formStateName}['${this.escapeJsString(fieldKey)}'] || ''} onChange={(e) => ${setFormName}({ ...${formStateName}, '${this.escapeJsString(fieldKey)}': e.target.value })} required={${node.props.required || false}} />\n${pad}</div>`
        }
        return `${pad}<div style={{ marginBottom: '12px' }}>\n${inputLabel}${pad}  <input type=${this.jsStr(node.props.type || 'text')} placeholder=${this.jsStr(node.props.placeholder)} required={${node.props.required || false}} />\n${pad}</div>`
      }

      case 'Textarea': {
        const taLabel = node.props.label
          ? `${pad}  <label style={{ display: 'block', marginBottom: '4px' }}>${this.escapeHtml(String(node.props.label))}</label>\n`
          : ''
        if (formDataSource) {
          const formStateName = `${this.toCamelCase(formDataSource)}Form`
          const setFormName = `set${this.capitalize(this.toCamelCase(formDataSource))}Form`
          const fieldKey = this.normalizeFieldKey(String(node.props.field || node.props.name || node.id))
          return `${pad}<div style={{ marginBottom: '12px' }}>\n${taLabel}${pad}  <textarea rows={${node.props.rows || 4}} placeholder=${this.jsStr(node.props.placeholder)} value={${formStateName}['${this.escapeJsString(fieldKey)}'] || ''} onChange={(e) => ${setFormName}({ ...${formStateName}, '${this.escapeJsString(fieldKey)}': e.target.value })} />\n${pad}</div>`
        }
        return `${pad}<div style={{ marginBottom: '12px' }}>\n${taLabel}${pad}  <textarea rows={${node.props.rows || 4}} placeholder=${this.jsStr(node.props.placeholder)} />\n${pad}</div>`
      }

      case 'Select': {
        const selLabel = node.props.label
          ? `${pad}  <label style={{ display: 'block', marginBottom: '4px' }}>${this.escapeHtml(String(node.props.label))}</label>\n`
          : ''
        // options 兼容两种格式：字符串数组 ['活跃'] 或 对象数组 [{label:'活跃', value:'active'}]
        const options = Array.isArray(node.props.options)
          ? (node.props.options as Array<unknown>)
              .map((opt) => {
                if (opt && typeof opt === 'object') {
                  const o = opt as Record<string, unknown>
                  const label = String(o.label ?? o.text ?? o.title ?? '')
                  const value = String(o.value ?? label)
                  return `${pad}    <option value="${this.escapeHtml(value)}">${this.escapeHtml(label)}</option>`
                }
                const s = String(opt)
                return `${pad}    <option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`
              })
              .join('\n')
          : ''
        if (formDataSource) {
          const formStateName = `${this.toCamelCase(formDataSource)}Form`
          const setFormName = `set${this.capitalize(this.toCamelCase(formDataSource))}Form`
          const fieldKey = this.normalizeFieldKey(String(node.props.field || node.props.name || node.id))
          return `${pad}<div style={{ marginBottom: '12px' }}>\n${selLabel}${pad}  <select value={${formStateName}['${this.escapeJsString(fieldKey)}'] || ''} onChange={(e) => ${setFormName}({ ...${formStateName}, '${this.escapeJsString(fieldKey)}': e.target.value })}>\n${pad}    <option value="">请选择</option>\n${options}\n${pad}  </select>\n${pad}</div>`
        }
        return `${pad}<div style={{ marginBottom: '12px' }}>\n${selLabel}${pad}  <select>\n${options}\n${pad}  </select>\n${pad}</div>`
      }

      case 'Checkbox':
        return `${pad}<label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>\n${pad}  <input type="checkbox" defaultChecked={${node.props.checked || false}} />\n${pad}  <span>${this.escapeHtml(String(node.props.label || ''))}</span>\n${pad}</label>`

      case 'Form': {
        const formTitle = node.props.title
          ? `${pad}  <h3 style={{ marginBottom: '16px' }}>${this.escapeHtml(String(node.props.title))}</h3>\n`
          : ''
        const dataSource = node.props.dataSource
        const paramId = node.props.paramId
        const isEdit = typeof paramId === 'string' && paramId.startsWith(':')

        // 有 dataSource 时，提交调用 createRecord（新增）或 updateRecord（编辑）；子组件绑定到 form state
        if (dataSource && typeof dataSource === 'string') {
          const formStateName = `${this.toCamelCase(dataSource)}Form`
          const setFormName = `set${this.capitalize(this.toCamelCase(dataSource))}Form`
          const loadName = `load${this.capitalize(this.toCamelCase(dataSource))}`
          // 子组件绑定到 form state；但若 Form 子树中没有任何输入组件
          // （Planner 未生成 Input / 生成了空 Section），则根据数据源字段自动
          // 生成受控输入，确保新增/编辑表单在预览中可用
          const hasInputs = children.length > 0 && this.hasInputInTree(children)
          // Form 兜底：Planner 可能没生成 Input 组件（children 为空或只有 Header/Section）。
          // 此时用运行时动态生成——从数据源加载后的第一条记录取字段名，渲染受控输入。
          // 这样无论 Planner 生成什么结构的 Form 树，新增/编辑都能填写并保存。
          const formChildJsx = hasInputs
            ? children.map((c) => this.renderComponent(c, indent + 2, dataSource, appModel)).join('\n')
            : this.generateRuntimeFormFields(dataSource, formStateName, setFormName, pad)
          // 编辑模式：提交时携带 :id 调用 updateRecord
          // 提交前做类型归一化：把 number/boolean 字段的字符串值转成正确类型，
          // 避免后端严格类型校验（typeof number）因前端字符串提交而失败。
          const fieldTypes = appModel ? this.inferFieldTypes(appModel, dataSource) : {}
          const payloadCode = this.buildFormPayloadCode(formStateName, fieldTypes, `${pad}      `)
          const submitBody = isEdit
            ? `${pad}      await updateRecord('${dataSource}', props.id ?? '', payload)`
            : `${pad}      await createRecord('${dataSource}', payload)`
          const afterSubmit = isEdit
            ? `${pad}      window.alert('保存成功')`
            : `${pad}      ${setFormName}({})\n${pad}      await ${loadName}()`
          return `${pad}<form onSubmit={async (e) => {
${pad}    e.preventDefault()
${pad}    try {
${payloadCode}
${submitBody}
${afterSubmit}
${pad}    } catch (err) {
${pad}      console.error('提交失败:', err)
${pad}      alert('提交失败，请重试')
${pad}    }
${pad}  }} style={{ display: ${this.jsStr(node.props.layout === 'horizontal' ? 'flex' : 'block')}, gap: '12px' }}>\n${formTitle}${formChildJsx}\n${pad}  <button type="submit" className="ds-btn ds-btn-primary ds-btn-medium">${this.escapeHtml(String(node.props.submitText || '提交'))}</button>\n${pad}</form>`
        }

        return `${pad}<form onSubmit={(e) => e.preventDefault()} style={{ display: ${this.jsStr(node.props.layout === 'horizontal' ? 'flex' : 'block')}, gap: '12px' }}>\n${formTitle}${childJsx}\n${pad}  <button type="submit" className="ds-btn ds-btn-primary ds-btn-medium">${this.escapeHtml(String(node.props.submitText || '提交'))}</button>\n${pad}</form>`
      }

      case 'Image':
        return `${pad}<img src=${this.jsStr(node.props.src)} alt=${this.jsStr(node.props.alt)} style={{ width: ${this.jsStr(node.props.width)}, height: ${this.jsStr(node.props.height)}, borderRadius: ${this.jsStr(node.props.radius)}, objectFit: 'cover' }} />`

      case 'Card':
        const cardTitle = node.props.title
          ? `${pad}  <h3 style={{ marginBottom: '12px' }}>${this.escapeHtml(String(node.props.title))}</h3>\n`
          : ''
        return `${pad}<div className="ds-card" style={{ borderRadius: ${this.jsStr(node.props.radius)}, padding: ${this.jsStr(node.props.padding)} }}>\n${cardTitle}${childJsx}\n${pad}</div>`

      case 'List': {
        // 优先渲染子组件；其次渲染 LLM 提供的静态 items；都没有则显示占位，避免空白
        const items = Array.isArray(node.props.items)
          ? (node.props.items as Array<string | Record<string, unknown>>)
          : []
        const staticItems = items
          .map(
            (item) =>
              `${pad}  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--ds-color-border)', color: 'var(--ds-color-text)' }}>${this.escapeHtml(
                typeof item === 'string' ? item : String(item.text ?? item.title ?? JSON.stringify(item)),
              )}</div>`,
          )
          .join('\n')
        const body =
          childJsx ||
          staticItems ||
          `${pad}  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ds-color-text-tertiary)' }}>暂无数据</div>\n`
        return `${pad}<div style={{ display: 'flex', flexDirection: 'column', gap: ${this.jsStr(node.props.gap)} }}>\n${body}\n${pad}</div>`
      }

      case 'Detail': {
        // 详情组件：从页面级 record state（已由路由参数 :id 加载）渲染字段。
        // 字段来源优先级：
        //   1) 组件声明的 fields（兼容字符串[] 或 {key,label}[]）
        //   2) 数据源推断字段
        //   3) 运行时直接遍历 record.data 的所有 key（最稳健兜底）
        const dataSource = node.props.dataSource
        const dsBase = typeof dataSource === 'string' ? dataSource.replace(/^database\./, '') : ''
        const rawFields = Array.isArray(node.props.fields) ? (node.props.fields as Array<unknown>) : []
        const declaredFields: Array<{ key: string; label: string }> = rawFields.length
          ? rawFields.map((f) => {
              if (typeof f === 'string') return { key: f, label: f }
              const o = (f as Record<string, unknown>) || {}
              const k = String(o.key ?? o.name ?? o.field ?? '')
              return { key: k, label: String(o.label ?? o.title ?? k) }
            }).filter((f) => f.key)
          : []
        const fieldList = declaredFields.length
          ? declaredFields
          : dataSource && typeof dataSource === 'string' && appModel
            ? this.inferFields(appModel, dataSource).map((k) => ({ key: k, label: k }))
            : []

        // 优先用声明的/推断的字段；若为空，则运行时遍历 record.data 渲染
        const declaredRows = fieldList
          .map(
            (f) =>
              `${pad}  <div style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--ds-color-border)' }}>\n${pad}    <span style={{ width: '120px', color: 'var(--ds-color-text-secondary)' }}>${this.escapeHtml(f.label)}</span>\n${pad}    <span>{String(record?.data?.['${this.escapeJsString(f.key)}'] ?? '')}</span>\n${pad}  </div>`,
          )
          .join('\n')

        // 兜底：当 record 已加载但声明字段为空时，遍历 record.data 所有 key
        const dynamicRows = `${pad}  {record ? (\n${pad}    Object.keys(record.data).map((k) => (\n${pad}      <div key={k} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--ds-color-border)' }}>\n${pad}        <span style={{ width: '120px', color: 'var(--ds-color-text-secondary)' }}>{k}</span>\n${pad}        <span>{String(record.data[k] ?? '')}</span>\n${pad}      </div>\n${pad}    ))\n${pad}  ) : (\n${pad}    <div className="ds-loading" style={{ padding: '16px 0' }}><span className="ds-spinner"></span>加载中...</div>\n${pad}  )}`

        const rowsJsx = fieldList.length > 0 ? declaredRows : dynamicRows
        const title = node.props.title
          ? `${pad}<h2 style={{ marginBottom: '16px' }}>${this.escapeHtml(String(node.props.title))}</h2>\n`
          : ''
        const backBtn = dataSource
          ? `${pad}<a className="ds-btn ds-btn-outline ds-btn-medium" href="/${dsBase}" style={{ marginBottom: '16px', display: 'inline-block' }}>返回列表</a>\n`
          : ''
        return `${title}${backBtn}<div className="ds-card" style={{ padding: '20px' }}>\n${rowsJsx}\n${pad}</div>`
      }

      case 'Table': {
        // columns：优先用组件声明的列；若缺失或 key 为空，则从数据源 schema 推断字段补全
        const rawColumns = Array.isArray(node.props.columns)
          ? (node.props.columns as Array<{ key?: string; title?: string }>)
          : []
        const dsId = node.props.dataSource
        const inferredFields = dsId && typeof dsId === 'string' && appModel ? this.inferFields(appModel, dsId) : []
        let columns: Array<{ key: string; title: string }>
        if (rawColumns.length > 0 && rawColumns.some((c) => c.key && c.key.length > 0)) {
          columns = rawColumns
            .filter((c) => c.key && c.key.length > 0)
            .map((c) => ({ key: String(c.key), title: String(c.title || c.key) }))
        } else if (inferredFields.length > 0) {
          columns = inferredFields.map((f) => ({ key: f, title: f }))
        } else {
          columns = []
        }
        // 当没有可用的列定义时，采用运行时动态列：从第一条记录取字段渲染，避免列表空表头
        const dynamicCols = columns.length === 0

        // 有 dataSource 时，从后端加载的数据渲染；否则用静态 rows
        const dataSource = node.props.dataSource
        if (dataSource && typeof dataSource === 'string') {
          // 路由链接使用数据源 short name（去掉 database. 前缀），与 App 路由 /<name>/* 保持一致
          const dsBase = dataSource.replace(/^database\./, '')
          // 从 Blueprint 中推断新增/详情页面 path（避免硬编码 /<dsBase>/new 与 Blueprint 实际 page path 不一致）
          // 查找规则（按优先级）：
          //   1) pageType=form 且 tableId=数据源 short name
          //   2) pageType=form 任何页面（LLM 可能未填 tableId）
          //   3) 兜底 /<dsBase>/new
          // 详情页查找规则类似。
          const pages = appModel?.schema?.pages ?? []
          const formPage = pages.find(
            (pg) => pg.pageType === 'form' && (pg.tableId === dsBase || pg.tableId === dataSource),
          ) || pages.find((pg) => pg.pageType === 'form')
          const detailPage = pages.find(
            (pg) => pg.pageType === 'detail' && (pg.tableId === dsBase || pg.tableId === dataSource),
          ) || pages.find((pg) => pg.pageType === 'detail')
          // 兜底：若 Blueprint 没有 form/detail 页（LLM 未生成），用 short name 兜底
          const newLink = formPage?.path || `/${dsBase}/new`
          // 详情链接：Blueprint 的 detail 页面 path 通常是 '/<base>/:id'，把 :id 替换为 \${rec.id}
          const detailLinkTpl = detailPage?.path
            ? `/${detailPage.path.replace(/^\//, '').replace(/:id/g, '${rec.id}')}`
            : `/${dsBase}/\${rec.id}`
          const stateName = `${this.toCamelCase(dataSource)}Data`
          const searchable = node.props.searchable !== false
          // 搜索时优先使用页面级过滤状态（*DataFiltered），否则用原数据
          const dataExpr = searchable ? `(${stateName}Filtered ?? ${stateName})` : stateName

          // actions 操作列（详情 / 编辑 / 删除）
          const actions = Array.isArray(node.props.actions)
            ? (node.props.actions as string[])
            : []
          const hasActions = actions.length > 0
          const actionHead = hasActions ? `<th>操作</th>` : ''
          const actionCells =
            hasActions
              ? `\n${pad}          <td>\n${pad}            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>\n${
                  actions
                    .map((act) => {
                      const label =
                        act === 'detail' ? '详情' : act === 'edit' ? '编辑' : act === 'delete' ? '删除' : act
                      if (act === 'delete') {
                        // handleDelete 使用完整 dataSource id（与 api.ts 的 TABLES key 一致）
                        return `${pad}              <button className="ds-btn ds-btn-danger ds-btn-small" onClick={() => handleDelete('${dataSource}', rec.id)}>${label}</button>`
                      }
                      // 链接使用 Blueprint 实际页面 path（而不是硬编码 /<dsBase>/*），避免与路由不一致
                      // 必须用 JSX 模板表达式包裹（href={`...`}），否则 ${rec.id} 会变成字面量。
                      const hrefTpl =
                        act === 'detail'
                          ? detailLinkTpl
                          : `${detailLinkTpl}/edit`
                      return `${pad}              <a className="ds-btn ds-btn-outline ds-btn-small" href={\`${hrefTpl}\`}>${label}</a>`
                    })
                    .join('\n')
                }\n${pad}            </div>\n${pad}          </td>`
              : ''

          // 表头：动态列或静态列；操作列（若有）放入同一 <tr>，避免 DOM 嵌套错误
          const dynamicHead =
            dynamicCols
              ? `${pad}  <thead>\n${pad}    <tr>\n${pad}      {(${stateName}[0] ? Object.keys(${stateName}[0].data) : []).map((k) => (\n${pad}        <th key={k}>{k}</th>\n${pad}      ))}${actionHead ? `\n${pad}      ${actionHead}` : ''}\n${pad}    </tr>\n${pad}  </thead>\n`
              : `${pad}  <thead>\n${pad}    <tr>\n${columns.map((col) => `${pad}      <th>${this.escapeHtml(col.title || col.key)}</th>`).join('\n')}${actionHead ? `\n${pad}      ${actionHead}` : ''}\n${pad}    </tr>\n${pad}  </thead>\n`
          const headJsx = columns.length > 0 || dynamicCols ? dynamicHead : ''

          // 行渲染：动态列时遍历 rec.data 所有 key，否则按 columns 渲染
          const rowCells = dynamicCols
            ? `${pad}          {Object.keys(rec.data).map((k) => (\n${pad}            <td key={k}>{String(rec.data[k] ?? '')}</td>\n${pad}          ))}`
            : columns
                .map((col) => `${pad}          <td>{String(rec.data['${this.escapeJsString(col.key)}'] ?? '')}</td>`)
                .join('\n')
          // 暂无数据行的 colSpan：静态列用列数+操作列；动态列在运行时计算实际列数
          const emptyColSpan = dynamicCols
            ? `Math.max(${stateName}[0] ? Object.keys(${stateName}[0].data).length : 0, 1)${hasActions ? ' + 1' : ''}`
            : `${Math.max(columns.length, 1) + (hasActions ? 1 : 0)}`
          const bodyJsx = `${pad}  <tbody>\n${pad}    {${dataExpr}.length > 0 ? (\n${pad}      ${dataExpr}.map((rec) => (\n${pad}        <tr key={rec.id}>\n${rowCells}${actionCells}\n${pad}        </tr>\n${pad}      ))\n${pad}    ) : (\n${pad}      <tr>\n${pad}        <td colSpan={${emptyColSpan}} style={{ padding: '24px', textAlign: 'center', color: 'var(--ds-color-text-tertiary)' }}>暂无数据</td>\n${pad}      </tr>\n${pad}    )}\n${pad}  </tbody>\n`

          // 搜索框 + 新增按钮（CRUD 工具栏）；链接使用 Blueprint 实际的 form page path，避免与路由不一致
          const toolbar = searchable
            ? `${pad}<div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>\n${pad}  <input className="ds-input" placeholder="搜索..." value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />\n${pad}  <a className="ds-btn ds-btn-primary ds-btn-medium" href="${newLink}">新增</a>\n${pad}</div>`
            : `${pad}<div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>\n${pad}  <a className="ds-btn ds-btn-primary ds-btn-medium" href="${newLink}">新增</a>\n${pad}</div>`

          return `${toolbar}${pad}<table className="ds-table">\n${headJsx}${bodyJsx}${pad}</table>`
        }

        const rows = Array.isArray(node.props.rows) ? (node.props.rows as Array<Record<string, unknown>>) : []
        // 静态表头：按声明的列渲染（与动态列区分）
        const headJsx =
          columns.length > 0
            ? `${pad}  <thead>\n${pad}    <tr>\n${columns.map((col) => `${pad}      <th>${this.escapeHtml(col.title || col.key)}</th>`).join('\n')}\n${pad}    </tr>\n${pad}  </thead>\n`
            : ''
        const bodyJsx =
          rows.length > 0
            ? `${pad}  <tbody>\n${rows
                .map(
                  (row) =>
                    `${pad}    <tr>\n${columns
                      .map((col) => `${pad}      <td>${this.escapeHtml(String(row[col.key] ?? ''))}</td>`)
                      .join('\n')}\n${pad}    </tr>`,
                )
                .join('\n')}\n${pad}  </tbody>\n`
            : childJsx
        return `${pad}<table className="ds-table">\n${headJsx}${bodyJsx || `${pad}  <tbody>\n${pad}    <tr>\n${pad}      <td style={{ padding: '24px', textAlign: 'center', color: 'var(--ds-color-text-tertiary)' }}>暂无数据</td>\n${pad}    </tr>\n${pad}  </tbody>\n`}${pad}</table>`
      }

      case 'Header':
        const headerLogo = node.props.logo
          ? `${pad}  <img src="${this.escapeHtml(String(node.props.logo))}" alt="logo" style={{ height: '32px' }} />\n`
          : ''
        return `${pad}<header className="ds-navbar" style={{ background: ${this.jsStr(node.props.background)}, height: ${this.jsStr(node.props.height)} }}>\n${headerLogo}${pad}  <h1 className="ds-navbar-title">${this.escapeHtml(String(node.props.title || ''))}</h1>\n${childJsx}\n${pad}</header>`

      case 'Footer':
        return `${pad}<footer style={{ padding: '24px', background: ${this.jsStr(node.props.background)}, color: ${this.jsStr(node.props.color)}, textAlign: 'center' }}>\n${pad}  ${this.escapeHtml(String(node.props.text || ''))}\n${childJsx}\n${pad}</footer>`

      case 'NavBar':
        const navItems = Array.isArray(node.props.items)
          ? (node.props.items as Array<{ text: string; href: string }>)
              .map(
                (item) =>
                  `${pad}  <a href="${this.escapeHtml(item.href || '#')}" style={{ padding: '8px 12px' }}>${this.escapeHtml(item.text || '')}</a>`,
              )
              .join('\n')
          : ''
        return `${pad}<nav style={{ display: 'flex', flexDirection: ${this.jsStr(node.props.orientation === 'vertical' ? 'column' : 'row')}, alignItems: 'center', gap: '4px' }}>\n${navItems}\n${pad}</nav>`

      case 'Tabs':
        return `${pad}<div>\n${pad}  {/* TODO: 实现 Tabs 组件，tabs: ${JSON.stringify(node.props.tabs)} */}\n${childJsx}\n${pad}</div>`

      case 'Alert':
        return `${pad}<div className="ds-alert ds-alert-${this.normalizeAlertVariant(node.props.variant)}" role="alert">\n${pad}  ${this.escapeHtml(String(node.props.text || ''))}\n${pad}</div>`

      case 'Badge':
        return `${pad}<span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: ${this.jsStr(node.props.color)}, background: ${this.jsStr(node.props.background)} }}>${this.escapeHtml(String(node.props.text || ''))}</span>`

      case 'Modal':
        return `${pad}<div className="ds-modal-overlay" style={{ display: ${node.props.visible ? 'flex' : 'none'} }}>\n${pad}  <div className="ds-modal" style={{ maxWidth: ${this.jsStr(node.props.width)} }}>\n${pad}    <div className="ds-modal-header"><div className="ds-modal-title">${this.escapeHtml(String(node.props.title || ''))}</div></div>\n${pad}    <div className="ds-modal-body">${childJsx}</div>\n${pad}  </div>\n${pad}</div>`

      // ─── 高级 / 复合组件（Component Library 复用） ──────
      case 'Dashboard': {
        // 统计卡片 + 子组件（Chart 等）聚合展示
        const cards = Array.isArray(node.props.cards)
          ? (node.props.cards as Array<Record<string, unknown>>)
          : []
        const cardJsx = cards
          .map(
            (card) =>
              `${pad}    <div className="ds-card" style={{ flex: 1, minWidth: '180px' }}>\n${pad}      <div style={{ fontSize: '13px', color: 'var(--ds-color-text-secondary)' }}>${this.escapeHtml(String(card.label ?? ''))}</div>\n${pad}      <div style={{ fontSize: '24px', fontWeight: 600, marginTop: '4px' }}>${this.escapeHtml(String(card.value ?? ''))}</div>\n${pad}      ${card.trend ? `<div style={{ fontSize: '12px', color: '${String(card.trend ?? '').startsWith('-') ? 'var(--ds-color-error)' : 'var(--ds-color-success)'}' }}>${this.escapeHtml(String(card.trend))}</div>` : ''}\n${pad}    </div>`,
          )
          .join('\n')
        const title = node.props.title
          ? `${pad}  <h1 style={{ fontSize: '22px', marginBottom: '16px' }}>${this.escapeHtml(String(node.props.title))}</h1>\n`
          : ''
        return `${title}${pad}<div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>\n${cardJsx}\n${pad}</div>\n${childJsx}`
      }

      case 'StatCard': {
        const label = node.props.label
        const value = node.props.value
        const trend = node.props.trend
        return `${pad}<div className="ds-card">\n${pad}  <div style={{ fontSize: '13px', color: 'var(--ds-color-text-secondary)' }}>${this.escapeHtml(String(label ?? ''))}</div>\n${pad}  <div style={{ fontSize: '24px', fontWeight: 600, marginTop: '4px' }}>${this.escapeHtml(String(value ?? ''))}</div>\n${pad}  ${trend ? `<div style={{ fontSize: '12px', color: '${String(trend).startsWith('-') ? 'var(--ds-color-error)' : 'var(--ds-color-success)'}' }}>${this.escapeHtml(String(trend))}</div>` : ''}\n${pad}</div>`
      }

      case 'Chart': {
        const chartType = node.props.type || 'bar'
        const dataSource = node.props.dataSource
        const title = node.props.title
        const titleJsx = title ? `${pad}  <h3 style={{ marginBottom: '12px' }}>${this.escapeHtml(String(title))}</h3>\n` : ''
        // 简单图表渲染：柱状图/折线图用 CSS 条形/折线，饼图用分段条形
        const stateName = dataSource ? `${this.toCamelCase(String(dataSource))}Data` : ''
        if (chartType === 'pie') {
          return `${titleJsx}${pad}<div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>\n${pad}  <div style={{ flex: 1, display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>\n${pad}    {(${stateName} || []).slice(0, 6).map((rec, i) => (\n${pad}      <div key={i} style={{ flex: 1, background: ['#1677ff', '#52c41a', '#fa8c16', '#f5222d', '#722ed1', '#13c2c2'][i % 6] }} />\n${pad}    ))}\n${pad}  </div>\n${pad}</div>`
        }
        const barHeight = node.props.height || '300px'
        return `${titleJsx}${pad}<div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: ${this.jsStr(barHeight)}, padding: '12px', background: 'var(--ds-color-surface-hover)', borderRadius: '8px' }}>\n${pad}  {(${stateName} || []).slice(0, 12).map((rec, i) => (\n${pad}    <div key={i} style={{ flex: 1, background: 'var(--ds-color-primary)', borderRadius: '4px 4px 0 0', minHeight: '4px', height: \`calc(\${(rec.data ? Object.values(rec.data)[0] : i + 1) || 1}px * ${Math.max(1, 300 / (1000))})\`, maxHeight: '100%' }} />\n${pad}  ))}\n${pad}</div>`
      }

      case 'Login': {
        const title = node.props.title || '欢迎登录'
        const submitText = node.props.submitText || '登录'
        const usernameLabel = node.props.usernameLabel || '用户名'
        const passwordLabel = node.props.passwordLabel || '密码'
        return `${pad}<div style={{ maxWidth: '360px', margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>\n${pad}  <h1 style={{ marginBottom: '32px' }}>${this.escapeHtml(String(title))}</h1>\n${pad}  <form onSubmit={(e) => { e.preventDefault(); window.alert('登录成功'); }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>\n${pad}    <div style={{ textAlign: 'left' }}>\n${pad}      <label style={{ display: 'block', marginBottom: '6px' }}>${this.escapeHtml(String(usernameLabel))}</label>\n${pad}      <input type="text" placeholder="请输入用户名" className="ds-input" style={{ width: '100%' }} />\n${pad}    </div>\n${pad}    <div style={{ textAlign: 'left' }}>\n${pad}      <label style={{ display: 'block', marginBottom: '6px' }}>${this.escapeHtml(String(passwordLabel))}</label>\n${pad}      <input type="password" placeholder="请输入密码" className="ds-input" style={{ width: '100%' }} />\n${pad}    </div>\n${pad}    <button type="submit" className="btn btn-primary btn-medium" style={{ width: '100%' }}>${this.escapeHtml(String(submitText))}</button>\n${pad}  </form>\n${pad}</div>`
      }

      default:
        return `${pad}<div>{/* 未知组件: ${node.type} */}</div>`
    }
  }

  // ─── 数据访问层生成 ─────────────────────────────────────

  /**
   * 生成前端数据访问层（src/api.ts）。
   * 基于 AI快搭 统一 Data API（/api/data），提供类型安全的 CRUD 方法。
   * 让 AI 生成的应用拥有真实的后端数据存取能力，而非仅前端 Mock。
   */
  private generateDataFile(appModel: AppModel, appId?: string): GeneratedFile {
    const dataSources = appModel.schema.dataSources
    const tableEntries = dataSources
      .map((ds) => {
        // tableId 必须与后端 backend-init.service 建表的主键完全一致：
        // 后端使用 `${appId}:${dataSource.name}` 作为 data_models.id，
        // 因此前端请求也须使用相同的 tableId 才能命中后端表。
        // 若没有 appId（如单测直接调用 Builder），则退回使用 dataSource.name，
        // 此时后端 resolveTable 按 name 也能定位（见 routes/data.ts）。
        const tableId = appId ? `${appId}:${ds.name}` : ds.id || ds.name
        // 同时注册多个别名 key（ds.id / ds.name / database.<name>），
        // 以兼容 Builder 生成页面时的不同调用参数（如 'customers' 或 'database.customers'）。
        const keys = new Set<string>()
        if (ds.id) keys.add(ds.id)
        if (ds.name) keys.add(ds.name)
        if (ds.name) keys.add(`database.${ds.name}`)
        return Array.from(keys)
          .map((k) => `  ${JSON.stringify(k)}: { tableId: '${tableId}' },`)
          .join('\n')
      })
      .join('\n')

    const staticExports = dataSources
      .map((ds) => {
        // fallback 变量名以 ds.id 为准（去除 database. 前缀后转 camelCase），
        // 与 generateRuntimeFormFields 中 fallbackName 计算保持一致，
        // 避免 LLM 给的中文 name（如"客户表"）导致变量名不匹配。
        const idBase = (ds.id || ds.name || '').replace(/^database\./, '')
        return `export const ${this.toCamelCase(idBase)}Fallback = ${JSON.stringify(ds.data, null, 2)};`
      })
      .join('\n\n')

    return {
      path: 'src/api.ts',
      content: `// 自动生成的数据访问层
// 由 AI快搭 Builder Agent 生成
// 基于统一 Data API（/api/data），提供真实的后端数据存取能力。

export interface TableRef {
  tableId: string
}

// 数据表引用（tableId 对应后端 data_models 表）
export const TABLES: Record<string, TableRef> = {
${tableEntries || '  // 无数据表'}
}

// ─── 通用 CRUD 方法 ─────────────────────────────────────

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(\`API 请求失败 (\${res.status}): \${body}\`)
  }
  return res.json() as Promise<T>
}

/** 查询记录（支持 search / filter / sort / pagination） */
export async function listRecords(tableName: string, query: Record<string, unknown> = {}) {
  const table = TABLES[tableName]
  if (!table) throw new Error(\`未知数据表: \${tableName}\`)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    params.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const qs = params.toString()
  return request<{ records: Array<{ id: string; data: Record<string, unknown> }>; total: number }>(
    \`/api/data/tables/\${table.tableId}/records\${qs ? \`?\${qs}\` : ''}\`,
  )
}

/** 创建记录 */
export async function createRecord(tableName: string, data: Record<string, unknown>) {
  const table = TABLES[tableName]
  if (!table) throw new Error(\`未知数据表: \${tableName}\`)
  return request<{ record: { id: string; data: Record<string, unknown> } }>(
    \`/api/data/tables/\${table.tableId}/records\`,
    { method: 'POST', body: JSON.stringify({ data }) },
  )
}

/** 更新记录 */
export async function updateRecord(tableName: string, id: string, data: Record<string, unknown>) {
  return request<{ record: { id: string; data: Record<string, unknown> } }>(
    \`/api/data/records/\${id}\`,
    { method: 'PATCH', body: JSON.stringify({ data }) },
  )
}

/** 删除记录 */
export async function deleteRecord(tableName: string, id: string) {
  return request<{ success: boolean }>(\`/api/data/records/\${id}\`, { method: 'DELETE' })
}

/** 查询单条记录（按 recordId） */
export async function getRecord(tableName: string, id: string) {
  return request<{ record: { id: string; data: Record<string, unknown> } | null }>(\`/api/data/records/\${id}\`)
}

// ─── 静态数据 Fallback（后端不可用时） ───────────────────

${staticExports}
`,
    }
  }

  /** 将 snake_case / 空格 / 点号 转为 camelCase（点号常见于 dataSource id 如 'database.customers'） */
  private toCamelCase(name: string): string {
    return name
      .split(/[\s_\-\.]+/)
      .filter((p) => p.length > 0)
      .map((part, i) => (i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
      .join('')
  }

  /**
   * 规范化表单字段 key：去除 LLM 常加的 input_/select_/textarea_/field_ 前缀，
   * 使提交的数据字段名（name/phone/...）与后端数据表字段一致。
   */
  private normalizeFieldKey(raw: string): string {
    if (!raw) return raw
    // 反复去掉各种可能的输入组件前缀（new_input_/edit_select_/input_/field_...），直到稳定。
    // 注意：不要把单词开头的普通字符误判为前缀（如 "company" 的 "c"），所以
    // 通用单词（input/select/...）需要下划线/连字符边界；动词前缀用下划线边界。
    let cur = raw
    for (let i = 0; i < 3; i++) {
      const next = cur.replace(
        /^(new|edit|view|add|create|update)_|(?:^|_)input_|(?:^|_)select_|(?:^|_)textarea_|(?:^|_)field_|(?:^|_)form_|(?:^|_)control_|(?:^|_)ctrl_|(?:^|_)cmp_/i,
        '',
      )
      if (next === cur) break
      cur = next
    }
    return cur
  }

  /** 首字母大写 */
  private capitalize(name: string): string {
    if (!name) return name
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  // ─── 辅助方法 ───────────────────────────────────────────

  private pageComponentName(pageId: string): string {
    // 将 page_home → PageHome
    return (
      'Page' +
      pageId
        .split('_')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
    )
  }

  /** 将字符串值转为 JS 字符串字面量，空值返回 undefined 避免 CSS 无效值 */
  private jsStr(value: unknown): string {
    if (value === undefined || value === null || value === '') return 'undefined'
    if (typeof value === 'string') return `"${this.escapeJsString(value)}"`
    return String(value)
  }

  /** 规范化标题级别，确保输出 h1-h6 标签 */
  private normalizeHeadingLevel(level: unknown): string {
    if (typeof level === 'string' && /^h[1-6]$/.test(level)) return level
    if (typeof level === 'number' && level >= 1 && level <= 6) return `h${level}`
    if (typeof level === 'string' && /^[1-6]$/.test(level)) return `h${level}`
    return 'h2'
  }

  /** 规范化按钮变体名称 */
  private normalizeVariant(variant: unknown): string {
    const v = String(variant || 'primary').toLowerCase()
    const map: Record<string, string> = {
      contained: 'primary',
      solid: 'primary',
      outline: 'outline',
      bordered: 'outline',
      ghost: 'ghost',
      text: 'ghost',
      danger: 'danger',
      destructive: 'danger',
      secondary: 'secondary',
      default: 'secondary',
    }
    return map[v] || 'primary'
  }

  /** 规范化按钮尺寸 */
  private normalizeSize(size: unknown): string {
    const s = String(size || 'medium').toLowerCase()
    const map: Record<string, string> = {
      sm: 'small',
      lg: 'large',
      xl: 'large',
      small: 'small',
      medium: 'medium',
      large: 'large',
    }
    return map[s] || 'medium'
  }

  /** 规范化阴影级别 */
  private normalizeShadow(shadow: unknown): string {
    const s = String(shadow || 'medium').toLowerCase()
    const map: Record<string, string> = {
      none: 'none',
      sm: 'small',
      md: 'medium',
      lg: 'large',
      small: 'small',
      medium: 'medium',
      large: 'large',
    }
    return map[s] || 'medium'
  }

  /** 规范化 Alert 变体 */
  private normalizeAlertVariant(variant: unknown): string {
    const v = String(variant || 'info').toLowerCase()
    const map: Record<string, string> = {
      info: 'info',
      success: 'success',
      warning: 'warning',
      warn: 'warning',
      error: 'error',
      danger: 'error',
      destructive: 'error',
    }
    return map[v] || 'info'
  }

  /**
   * 将任意值安全转为字符串后转义。
   * LLM 生成的 props 可能包含数字、布尔值或嵌套对象，
   * 直接调用 .replace 会抛 "str.replace is not a function"。
   */
  private toSafeString(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  private escapeJsString(value: unknown): string {
    return this.toSafeString(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  }

  private escapeHtml(value: unknown): string {
    return this.toSafeString(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}
