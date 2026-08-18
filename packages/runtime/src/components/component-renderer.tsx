// ─── Component Renderer ──────────────────────────────────
//
// 将 ComponentNode 渲染为 React 元素。
// 页面、组件、数据、Action 解耦：Renderer 只负责「组件 → UI」，
// 事件通过 EventEngine 触发，数据通过 DataClient 绑定。

import type { ReactNode, CSSProperties } from 'react'
import type { ComponentNode } from '@aikd/shared'
import { useRuntime } from '../state/runtime-state'
import { useEventHandlers, type EventHandlers } from './use-event-handlers'

// ─── 渲染入口 ────────────────────────────────────────────

export interface ComponentRendererProps {
  node: ComponentNode
}

/** 渲染单个组件节点（含子组件递归） */
export function ComponentRenderer({ node }: ComponentRendererProps) {
  const handlers = useEventHandlers(node)
  return renderNode(node, handlers)
}

// ─── 节点渲染（递归） ────────────────────────────────────

function renderNode(node: ComponentNode, handlers: EventHandlers): ReactNode {
  const props = node.props ?? {}
  const children = (node.children ?? []).map((child) => renderNode(child, handlers))
  const key = node.id

  switch (node.type) {
    // ── 布局 ──
    case 'Container':
      return (
        <div key={key} style={{ maxWidth: str(props.maxWidth), padding: str(props.padding), background: str(props.background) }}>
          {children}
        </div>
      )
    case 'Grid':
      return (
        <div key={key} style={{ display: 'grid', gridTemplateColumns: `repeat(${num(props.columns, 3)}, 1fr)`, gap: str(props.gap) }}>
          {children}
        </div>
      )
    case 'Flex':
      return (
        <div
          key={key}
          style={{
            display: 'flex',
            flexDirection: (str(props.direction) as React.CSSProperties['flexDirection']) || 'row',
            justifyContent: str(props.justify) as React.CSSProperties['justifyContent'],
            alignItems: str(props.align) as React.CSSProperties['alignItems'],
            gap: str(props.gap),
          }}
        >
          {children}
        </div>
      )
    case 'Section':
      return (
        <section key={key} style={{ background: str(props.background), padding: str(props.padding) }}>
          {props.title ? <h2 style={{ marginBottom: '16px' }}>{String(props.title)}</h2> : null}
          {children}
        </section>
      )

    // ── 文本 ──
    case 'Heading': {
      const Tag = normalizeHeading(props.level)
      return (
        <Tag key={key} style={{ color: str(props.color), textAlign: str(props.align) as React.CSSProperties['textAlign'] }}>
          {String(props.text ?? '')}
        </Tag>
      )
    }
    case 'Text':
      return (
        <span key={key} style={{ fontSize: str(props.fontSize), color: str(props.color), display: 'inline-block' }}>
          {String(props.text ?? '')}
        </span>
      )
    case 'Paragraph':
      return (
        <p key={key} style={{ fontSize: str(props.fontSize), lineHeight: str(props.lineHeight), color: str(props.color) }}>
          {String(props.text ?? '')}
        </p>
      )

    // ── 按钮 ──
    case 'Button':
      return (
        <button
          key={key}
          onClick={handlers.onClick}
          disabled={Boolean(props.disabled)}
          style={buttonStyle(props)}
        >
          {String(props.text ?? '')}
        </button>
      )
    case 'Link':
      return (
        <a key={key} href={str(props.href) ?? '#'} target={str(props.target)}>
          {String(props.text ?? '')}
        </a>
      )

    // ── 表单 ──
    case 'Input':
      return (
        <div key={key} style={{ marginBottom: '12px' }}>
          {props.label ? <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>{String(props.label)}</label> : null}
          <InputField nodeId={node.id} placeholder={str(props.placeholder)} type={str(props.type) || 'text'} />
        </div>
      )
    case 'Textarea':
      return (
        <div key={key} style={{ marginBottom: '12px' }}>
          {props.label ? <label style={{ display: 'block', marginBottom: '4px' }}>{String(props.label)}</label> : null}
          <TextareaField nodeId={node.id} placeholder={str(props.placeholder)} />
        </div>
      )
    case 'Select':
      return (
        <div key={key} style={{ marginBottom: '12px' }}>
          {props.label ? <label style={{ display: 'block', marginBottom: '4px' }}>{String(props.label)}</label> : null}
          <SelectField nodeId={node.id} options={Array.isArray(props.options) ? (props.options as string[]) : []} />
        </div>
      )
    case 'Checkbox':
      return (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckboxField nodeId={node.id} />
          <span>{String(props.label ?? '')}</span>
        </label>
      )
    case 'Form':
      return (
        <form key={key} onSubmit={(e) => { e.preventDefault(); handlers.onSubmit?.() }}>
          {props.title ? <h3 style={{ marginBottom: '16px' }}>{String(props.title)}</h3> : null}
          {children}
          <button type="submit" style={{ ...buttonStyle({ variant: 'primary' }), marginTop: '8px' }}>
            {String(props.submitText ?? '提交')}
          </button>
        </form>
      )

    // ── 展示 ──
    case 'Image':
      return (
        <img
          key={key}
          src={str(props.src) ?? ''}
          alt={str(props.alt)}
          style={{ width: str(props.width), height: str(props.height), borderRadius: str(props.radius), objectFit: 'cover' }}
        />
      )
    case 'Card':
      return (
        <div key={key} style={{ borderRadius: str(props.radius), padding: str(props.padding), background: 'white', boxShadow: shadowValue(props.shadow) }}>
          {props.title ? <h3 style={{ marginBottom: '12px' }}>{String(props.title)}</h3> : null}
          {children}
        </div>
      )
    case 'List':
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: str(props.gap) }}>
          {children.length > 0 ? children : <EmptyHint />}
        </div>
      )
    case 'Table':
      return <TableRenderer node={node} />

    // ── 导航 ──
    case 'Header':
      return (
        <header key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 24px', height: str(props.height), background: str(props.background), borderBottom: '1px solid #e5e7eb' }}>
          {props.logo ? <img src={String(props.logo)} alt="logo" style={{ height: '32px' }} /> : null}
          <h1 style={{ fontSize: '18px' }}>{String(props.title ?? '')}</h1>
          {children}
        </header>
      )
    case 'Footer':
      return (
        <footer key={key} style={{ padding: '24px', background: str(props.background), color: str(props.color), textAlign: 'center' }}>
          {String(props.text ?? '')}
          {children}
        </footer>
      )
    case 'NavBar': {
      const items = Array.isArray(props.items) ? (props.items as Array<{ text: string; href: string }>) : []
      return (
        <nav key={key} style={{ display: 'flex', flexDirection: str(props.orientation) === 'vertical' ? 'column' : 'row', gap: '4px' }}>
          {items.map((item, i) => (
            <a key={i} href={item.href || '#'} style={{ padding: '8px 12px' }}>
              {item.text || ''}
            </a>
          ))}
        </nav>
      )
    }
    case 'Tabs':
      return <div key={key}>{children}</div>

    // ── 反馈 ──
    case 'Alert': {
      const variant = str(props.variant) || 'info'
      const bg = { info: '#dbeafe', success: '#d1fae5', warning: '#fef3c7', error: '#fee2e2' }[variant] ?? '#dbeafe'
      return (
        <div key={key} style={{ padding: '12px 16px', borderRadius: '6px', background: bg }}>
          {String(props.text ?? '')}
        </div>
      )
    }
    case 'Badge':
      return (
        <span key={key} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: str(props.color), background: str(props.background) }}>
          {String(props.text ?? '')}
        </span>
      )
    case 'Modal':
      return <ModalRenderer node={node}>{children}</ModalRenderer>

    default:
      return (
        <div key={key} style={{ padding: '8px', color: '#999' }}>
          {`未知组件: ${node.type}`}
        </div>
      )
  }
}

// ─── 表单受控组件 ────────────────────────────────────────

function InputField({ nodeId, placeholder, type }: { nodeId: string; placeholder?: string; type: string }) {
  const { state, actions } = useRuntime()
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={String(state.formData[nodeId] ?? '')}
      onChange={(e) => actions.setFormField(nodeId, e.target.value)}
      style={inputStyle()}
    />
  )
}

function TextareaField({ nodeId, placeholder }: { nodeId: string; placeholder?: string }) {
  const { state, actions } = useRuntime()
  return (
    <textarea
      placeholder={placeholder}
      value={String(state.formData[nodeId] ?? '')}
      onChange={(e) => actions.setFormField(nodeId, e.target.value)}
      style={inputStyle()}
    />
  )
}

function SelectField({ nodeId, options }: { nodeId: string; options: string[] }) {
  const { state, actions } = useRuntime()
  return (
    <select value={String(state.formData[nodeId] ?? '')} onChange={(e) => actions.setFormField(nodeId, e.target.value)} style={inputStyle()}>
      <option value="">请选择</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}

function CheckboxField({ nodeId }: { nodeId: string }) {
  const { state, actions } = useRuntime()
  return (
    <input
      type="checkbox"
      checked={Boolean(state.formData[nodeId] ?? false)}
      onChange={(e) => actions.setFormField(nodeId, e.target.checked)}
    />
  )
}

// ─── Table 渲染（绑定 DataClient） ────────────────────────

function TableRenderer({ node }: { node: ComponentNode }) {
  const { state } = useRuntime()
  const props = node.props ?? {}
  const columns = Array.isArray(props.columns) ? (props.columns as Array<{ key: string; title: string }>) : []
  const rows = Array.isArray(props.rows) ? (props.rows as Array<Record<string, unknown>>) : []

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      {columns.length > 0 ? (
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                {col.title || col.key}
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.length > 0 ? (
          rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col, j) => (
                <td key={j} style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>
                  {String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td style={{ padding: '24px', textAlign: 'center', color: '#999' }} colSpan={columns.length || 1}>
              暂无数据
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

// ─── Modal 渲染 ──────────────────────────────────────────

function ModalRenderer({ node, children }: { node: ComponentNode; children: ReactNode }) {
  const { state, actions } = useRuntime()
  const props = node.props ?? {}
  const visible = state.modal?.visible ?? Boolean(props.visible)
  if (!visible) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} onClick={actions.closeModal}>
      <div
        style={{ maxWidth: str(props.width) || '480px', margin: '100px auto', background: 'white', borderRadius: '8px', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{String(props.title ?? '')}</h3>
        {children}
      </div>
    </div>
  )
}

// ─── 辅助函数 ────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return v === undefined || v === null || v === '' ? undefined : String(v)
}

function num(v: unknown, dft: number): number {
  const n = Number(v)
  return Number.isNaN(n) ? dft : n
}

function normalizeHeading(level: unknown): 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  const s = String(level || 'h2')
  if (/^h[1-6]$/.test(s)) return s as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  if (/^[1-6]$/.test(s)) return `h${s}` as 'h2'
  return 'h2'
}

function shadowValue(shadow: unknown): string {
  const map: Record<string, string> = {
    none: 'none',
    small: '0 1px 2px rgba(0,0,0,0.05)',
    medium: '0 4px 6px rgba(0,0,0,0.1)',
    large: '0 10px 15px rgba(0,0,0,0.1)',
  }
  return map[String(shadow)] ?? map.medium
}

function buttonStyle(props: Record<string, unknown>): React.CSSProperties {
  const variant = String(props.variant ?? 'primary')
  const size = String(props.size ?? 'medium')
  const colorMap: Record<string, string> = {
    primary: '#3b82f6',
    secondary: '#6b7280',
    outline: 'transparent',
    ghost: 'transparent',
    danger: '#ef4444',
  }
  const bg = colorMap[variant] ?? colorMap.primary
  const isOutline = variant === 'outline'
  const isGhost = variant === 'ghost'
  const paddingMap: Record<string, string> = { small: '4px 12px', medium: '8px 16px', large: '12px 24px' }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: isOutline ? `1px solid ${bg}` : 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    padding: paddingMap[size] ?? paddingMap.medium,
    background: isOutline || isGhost ? 'transparent' : bg,
    color: isOutline || isGhost ? bg : 'white',
  }
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  }
}

function EmptyHint() {
  return <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>暂无数据</div>
}
