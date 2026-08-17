import type { AppModel, ComponentNode, Page } from '@aikd/shared'
import type { GeneratedFile, LLMClient } from './types'
import { generateId } from './utils'

// ─── Builder Agent ───────────────────────────────────────
//
// Builder 负责将 App Model 转化为可运行的 React 代码文件。
// 使用确定性代码生成（非 LLM），确保输出稳定可靠。
// 生成的代码基于 React 18 + TypeScript + Vite。

export interface BuilderOptions {
  appModel: AppModel
  signal?: AbortSignal
}

export class BuilderAgent {
  constructor(private llm: LLMClient) {}

  async build(options: BuilderOptions): Promise<{ files: GeneratedFile[] }> {
    const { appModel } = options
    const files: GeneratedFile[] = []

    // 1. 静态配置文件
    files.push(this.generatePackageJson(appModel))
    files.push(this.generateIndexHtml(appModel))
    files.push(this.generateViteConfig())
    files.push(this.generateTsConfig())

    // 2. 入口文件
    files.push(this.generateMainTsx())
    files.push(this.generateIndexCss(appModel))

    // 3. App 根组件（含路由）
    files.push(this.generateAppTsx(appModel))

    // 4. 页面组件
    for (const page of appModel.schema.pages) {
      files.push(this.generatePageComponent(page, appModel))
    }

    // 5. 数据源文件
    if (appModel.schema.dataSources.length > 0) {
      files.push(this.generateDataFile(appModel))
    }

    return { files }
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

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
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
    const theme = appModel.schema.theme
    const isMobile = appModel.type === 'h5'

    return {
      path: 'src/index.css',
      content: `:root {
  --primary-color: ${theme.primaryColor};
  --font-family: ${theme.fontFamily};
  --bg-color: ${theme.backgroundColor || '#ffffff'};
  --text-color: ${theme.textColor || '#1a1a1a'};
  --secondary-color: ${theme.secondaryColor || '#6b7280'};
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-family);
  background-color: var(--bg-color);
  color: var(--text-color);
  ${isMobile ? 'max-width: 480px;\n  margin: 0 auto;' : ''}
}

#root {
  min-height: 100vh;
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}
.btn-primary { background: var(--primary-color); color: white; }
.btn-secondary { background: var(--secondary-color); color: white; }
.btn-outline { background: transparent; border: 1px solid var(--primary-color); color: var(--primary-color); }
.btn-ghost { background: transparent; color: var(--primary-color); }
.btn-danger { background: #ef4444; color: white; }
.btn-small { padding: 4px 12px; font-size: 12px; }
.btn-medium { padding: 8px 16px; font-size: 14px; }
.btn-large { padding: 12px 24px; font-size: 16px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 输入框样式 */
input, textarea, select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
input:focus, textarea:focus, select:focus {
  border-color: var(--primary-color);
}

/* 卡片阴影 */
.shadow-none { box-shadow: none; }
.shadow-small { box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.shadow-medium { box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.shadow-large { box-shadow: 0 10px 15px rgba(0,0,0,0.1); }

/* 提示框样式 */
.alert { padding: 12px 16px; border-radius: 6px; margin-bottom: 8px; }
.alert-info { background: #dbeafe; color: #1e40af; }
.alert-success { background: #d1fae5; color: #065f46; }
.alert-warning { background: #fef3c7; color: #92400e; }
.alert-error { background: #fee2e2; color: #991b1b; }

/* 表格样式 */
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
th { background: #f9fafb; font-weight: 600; }

/* 链接样式 */
a { color: var(--primary-color); text-decoration: none; }
a:hover { text-decoration: underline; }
`,
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

    // 多页应用 - 简单路由
    const imports = routes
      .map((r) => {
        const page = appModel.schema.pages.find((p) => p.id === r.pageId)
        return page ? `import ${this.pageComponentName(page.id)} from './pages/${page.id}'` : ''
      })
      .filter(Boolean)
      .join('\n')

    const routeCases = routes
      .map((r) => {
        const page = appModel.schema.pages.find((p) => p.id === r.pageId)
        if (!page) return ''
        return `      case '${r.path}':\n        return <${this.pageComponentName(page.id)} />`
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
    switch (path) {
${routeCases}
      default:
        return <div>404 - 页面未找到</div>
    }
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

    // 兜底：页面没有组件时渲染占位内容，避免预览白屏
    const componentJsx =
      page.components.length > 0
        ? page.components.map((comp) => this.renderComponent(comp, 6)).join('\n')
        : `      <div className="page-empty" style={{ padding: '48px 24px', textAlign: 'center', color: '#999999', fontSize: '14px' }}>
        <p>此页面暂无内容</p>
      </div>`

    return {
      path: `src/pages/${page.id}.tsx`,
      content: `import React from 'react'

export default function ${componentName}() {
  return (
    <div className="page" ${isMobile ? 'style={{ minHeight: "100vh", maxWidth: "480px", margin: "0 auto" }}' : ''}>
${componentJsx}
    </div>
  )
}
`,
    }
  }

  // ─── 组件渲染（ComponentNode → JSX） ────────────────────

  private renderComponent(node: ComponentNode, indent: number): string {
    const pad = ' '.repeat(indent)
    const children = node.children || []
    const childJsx = children.map((c) => this.renderComponent(c, indent + 2)).join('\n')

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

      case 'Button':
        return `${pad}<button className="btn btn-${this.normalizeVariant(node.props.variant)} btn-${this.normalizeSize(node.props.size)}" disabled={${node.props.disabled || false}}>${this.escapeHtml(String(node.props.text || ''))}</button>`

      case 'Link':
        return `${pad}<a href={${this.jsStr(node.props.href)}} target={${this.jsStr(node.props.target)}}>${this.escapeHtml(String(node.props.text || ''))}</a>`

      case 'Input':
        const inputLabel = node.props.label
          ? `${pad}  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>${this.escapeHtml(String(node.props.label))}</label>\n`
          : ''
        return `${pad}<div style={{ marginBottom: '12px' }}>\n${inputLabel}${pad}  <input type=${this.jsStr(node.props.type || 'text')} placeholder=${this.jsStr(node.props.placeholder)} required={${node.props.required || false}} />\n${pad}</div>`

      case 'Textarea':
        const taLabel = node.props.label
          ? `${pad}  <label style={{ display: 'block', marginBottom: '4px' }}>${this.escapeHtml(String(node.props.label))}</label>\n`
          : ''
        return `${pad}<div style={{ marginBottom: '12px' }}>\n${taLabel}${pad}  <textarea rows={${node.props.rows || 4}} placeholder=${this.jsStr(node.props.placeholder)} />\n${pad}</div>`

      case 'Select':
        const selLabel = node.props.label
          ? `${pad}  <label style={{ display: 'block', marginBottom: '4px' }}>${this.escapeHtml(String(node.props.label))}</label>\n`
          : ''
        const options = Array.isArray(node.props.options)
          ? (node.props.options as string[])
              .map((opt) => `${pad}    <option value="${this.escapeHtml(opt)}">${this.escapeHtml(opt)}</option>`)
              .join('\n')
          : ''
        return `${pad}<div style={{ marginBottom: '12px' }}>\n${selLabel}${pad}  <select>\n${options}\n${pad}  </select>\n${pad}</div>`

      case 'Checkbox':
        return `${pad}<label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>\n${pad}  <input type="checkbox" defaultChecked={${node.props.checked || false}} />\n${pad}  <span>${this.escapeHtml(String(node.props.label || ''))}</span>\n${pad}</label>`

      case 'Form':
        const formTitle = node.props.title
          ? `${pad}  <h3 style={{ marginBottom: '16px' }}>${this.escapeHtml(String(node.props.title))}</h3>\n`
          : ''
        return `${pad}<form onSubmit={(e) => e.preventDefault()} style={{ display: ${this.jsStr(node.props.layout === 'horizontal' ? 'flex' : 'block')}, gap: '12px' }}>\n${formTitle}${childJsx}\n${pad}  <button type="submit" className="btn btn-primary btn-medium">${this.escapeHtml(String(node.props.submitText || '提交'))}</button>\n${pad}</form>`

      case 'Image':
        return `${pad}<img src=${this.jsStr(node.props.src)} alt=${this.jsStr(node.props.alt)} style={{ width: ${this.jsStr(node.props.width)}, height: ${this.jsStr(node.props.height)}, borderRadius: ${this.jsStr(node.props.radius)}, objectFit: 'cover' }} />`

      case 'Card':
        const cardTitle = node.props.title
          ? `${pad}  <h3 style={{ marginBottom: '12px' }}>${this.escapeHtml(String(node.props.title))}</h3>\n`
          : ''
        return `${pad}<div className="card shadow-${this.normalizeShadow(node.props.shadow)}" style={{ borderRadius: ${this.jsStr(node.props.radius)}, padding: ${this.jsStr(node.props.padding)}, background: 'white' }}>\n${cardTitle}${childJsx}\n${pad}</div>`

      case 'List': {
        // 优先渲染子组件；其次渲染 LLM 提供的静态 items；都没有则显示占位，避免空白
        const items = Array.isArray(node.props.items)
          ? (node.props.items as Array<string | Record<string, unknown>>)
          : []
        const staticItems = items
          .map(
            (item) =>
              `${pad}  <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0', color: '#333333' }}>${this.escapeHtml(
                typeof item === 'string' ? item : String(item.text ?? item.title ?? JSON.stringify(item)),
              )}</div>`,
          )
          .join('\n')
        const body =
          childJsx ||
          staticItems ||
          `${pad}  <div style={{ padding: '24px', textAlign: 'center', color: '#999999' }}>暂无数据</div>\n`
        return `${pad}<div style={{ display: 'flex', flexDirection: 'column', gap: ${this.jsStr(node.props.gap)} }}>\n${body}\n${pad}</div>`
      }

      case 'Table': {
        const columns = Array.isArray(node.props.columns)
          ? (node.props.columns as Array<{ key: string; title: string }>)
          : []
        const headJsx =
          columns.length > 0
            ? `${pad}  <thead>\n${pad}    <tr>\n${columns.map((col) => `${pad}      <th>${this.escapeHtml(col.title || col.key)}</th>`).join('\n')}\n${pad}    </tr>\n${pad}  </thead>\n`
            : ''
        const rows = Array.isArray(node.props.rows) ? (node.props.rows as Array<Record<string, unknown>>) : []
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
        return `${pad}<table>\n${headJsx}${bodyJsx || `${pad}  <tbody>\n${pad}    <tr>\n${pad}      <td style={{ padding: '24px', textAlign: 'center', color: '#999999' }}>暂无数据</td>\n${pad}    </tr>\n${pad}  </tbody>\n`}${pad}</table>`
      }

      case 'Header':
        const headerLogo = node.props.logo
          ? `${pad}  <img src="${this.escapeHtml(String(node.props.logo))}" alt="logo" style={{ height: '32px' }} />\n`
          : ''
        return `${pad}<header style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 24px', background: ${this.jsStr(node.props.background)}, height: ${this.jsStr(node.props.height)}, borderBottom: '1px solid #e5e7eb' }}>\n${headerLogo}${pad}  <h1 style={{ fontSize: '18px' }}>${this.escapeHtml(String(node.props.title || ''))}</h1>\n${childJsx}\n${pad}</header>`

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
        return `${pad}<div className="alert alert-${this.normalizeAlertVariant(node.props.variant)}" role="alert">\n${pad}  ${this.escapeHtml(String(node.props.text || ''))}\n${pad}</div>`

      case 'Badge':
        return `${pad}<span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: ${this.jsStr(node.props.color)}, background: ${this.jsStr(node.props.background)} }}>${this.escapeHtml(String(node.props.text || ''))}</span>`

      case 'Modal':
        return `${pad}<div style={{ display: ${node.props.visible ? 'block' : 'none'}, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}>\n${pad}  <div style={{ maxWidth: ${this.jsStr(node.props.width)}, margin: '100px auto', background: 'white', borderRadius: '8px', padding: '24px' }}>\n${pad}    <h3>${this.escapeHtml(String(node.props.title || ''))}</h3>\n${childJsx}\n${pad}  </div>\n${pad}</div>`

      default:
        return `${pad}<div>{/* 未知组件: ${node.type} */}</div>`
    }
  }

  // ─── 数据源文件生成 ─────────────────────────────────────

  private generateDataFile(appModel: AppModel): GeneratedFile {
    const dataSources = appModel.schema.dataSources
    const exports = dataSources
      .map((ds) => `export const ${ds.name} = ${JSON.stringify(ds.data, null, 2)};`)
      .join('\n\n')

    return {
      path: 'src/data.ts',
      content: `// 自动生成的数据源文件\n// 由 AI快搭 Builder Agent 生成\n\n${exports}\n`,
    }
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
