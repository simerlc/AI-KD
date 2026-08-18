// ─── Error Boundary ──────────────────────────────────────
//
// React 错误边界：捕获组件渲染/生命周期中的错误，
// 展示结构化错误信息，避免整个应用崩溃。

import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 自定义错误展示（可选） */
  fallback?: (error: Error) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class RuntimeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // 结构化错误日志，供上层收集
    console.error('[Runtime] 渲染错误:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error)
      }
      return (
        <div style={{ padding: '24px', textAlign: 'center', color: '#991b1b', background: '#fee2e2', borderRadius: '8px', margin: '16px' }}>
          <h3>应用渲染出错</h3>
          <p style={{ fontSize: '14px', marginTop: '8px' }}>{this.state.error.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
