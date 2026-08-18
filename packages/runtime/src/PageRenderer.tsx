// ─── Page Renderer ───────────────────────────────────────
//
// 根据当前路由，找到对应页面并渲染其组件树。

import type { AppSchema } from '@aikd/shared'
import { useRuntime } from './state/runtime-state'
import { ComponentRenderer } from './components/component-renderer'

export interface PageRendererProps {
  schema: AppSchema
}

export function PageRenderer({ schema }: PageRendererProps) {
  const { state } = useRuntime()
  const { path } = state

  // 找到当前路由对应的页面
  const route = schema.routes.find((r) => r.path === path) ?? schema.routes.find((r) => r.path === '/')
  const page = schema.pages.find((p) => p.id === route?.pageId) ?? schema.pages[0]

  if (!page) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#999' }}>
        <p>页面未找到</p>
      </div>
    )
  }

  const isMobile = page.layout === 'mobile'

  return (
    <div className="page" style={isMobile ? { minHeight: '100vh', maxWidth: '480px', margin: '0 auto' } : undefined}>
      {page.components.length > 0 ? (
        page.components.map((comp) => <ComponentRenderer key={comp.id} node={comp} />)
      ) : (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#999' }}>
          <p>此页面暂无内容</p>
        </div>
      )}
    </div>
  )
}
