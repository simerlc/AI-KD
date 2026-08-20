// ─── Design System · 样式生成器 ──────────────────────────
//
// 把 Design Tokens + 组件样式生成为完整的 CSS 文本。
// Builder 在生成应用时，将这段 CSS 注入 src/index.css，
// 使生成应用默认拥有统一、现代、商业级的视觉基础，
// 并包含 Loading / Empty / Error / Success 等状态样式。

import { tokensToCssVariables, type DesignTokens } from './tokens'
import { DESIGN_SYSTEM_COMPONENTS } from './components'

/**
 * 生成 Design System 的完整 CSS（含 token 变量 + 基础组件样式 + 状态样式）。
 * @param tokens 设计令牌（默认 DEFAULT_TOKENS）
 */
export function generateDesignSystemCss(tokens?: DesignTokens): string {
  const vars = tokensToCssVariables(tokens)
  return `${vars}

/* ═══════ Design System 基础样式（AI快搭 自动生成，禁止手写覆盖语义色） ═══════ */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--ds-font-family);
  font-size: var(--ds-font-size-base);
  line-height: var(--ds-line-height-normal);
  color: var(--ds-color-text);
  background-color: var(--ds-color-background);
}

#root {
  min-height: 100vh;
}

a {
  color: var(--ds-color-primary);
  text-decoration: none;
}
a:hover {
  color: var(--ds-color-primary-hover);
}

/* ─── 按钮 ─── */
.ds-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-2);
  border: 1px solid transparent;
  border-radius: var(--ds-radius-medium);
  font-family: inherit;
  font-weight: var(--ds-font-weight-medium);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  outline: none;
}
.ds-btn:focus-visible {
  box-shadow: 0 0 0 3px var(--ds-color-primary-subtle);
}
.ds-btn-small { height: 28px; padding: 0 var(--ds-space-3); font-size: var(--ds-font-size-xs); border-radius: var(--ds-radius-small); }
.ds-btn-medium { height: 36px; padding: 0 var(--ds-space-4); font-size: var(--ds-font-size-sm); }
.ds-btn-large { height: 44px; padding: 0 var(--ds-space-6); font-size: var(--ds-font-size-base); }

.ds-btn-primary { background: var(--ds-color-primary); color: var(--ds-color-text-on-primary); }
.ds-btn-primary:hover:not(:disabled) { background: var(--ds-color-primary-hover); }
.ds-btn-primary:active:not(:disabled) { background: var(--ds-color-primary-active); }

.ds-btn-secondary { background: var(--ds-color-secondary); color: #fff; }
.ds-btn-secondary:hover:not(:disabled) { background: var(--ds-color-secondary-hover); }

.ds-btn-outline { background: var(--ds-color-surface); color: var(--ds-color-text); border-color: var(--ds-color-border-strong); }
.ds-btn-outline:hover:not(:disabled) { background: var(--ds-color-surface-hover); }

.ds-btn-ghost { background: transparent; color: var(--ds-color-text-secondary); }
.ds-btn-ghost:hover:not(:disabled) { background: var(--ds-color-surface-hover); color: var(--ds-color-text); }

.ds-btn-danger { background: var(--ds-color-error); color: #fff; }
.ds-btn-danger:hover:not(:disabled) { opacity: 0.9; }

.ds-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 按钮 Loading */
.ds-btn-loading { position: relative; color: transparent !important; pointer-events: none; }
.ds-btn-loading::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ds-spin 0.6s linear infinite;
}

/* ─── 卡片 ─── */
.ds-card {
  background: var(--ds-color-surface);
  border-radius: var(--ds-radius-large);
  box-shadow: var(--ds-shadow-card);
  border: 1px solid var(--ds-color-border);
  padding: var(--ds-space-6);
}
.ds-card-bordered { box-shadow: none; border-color: var(--ds-color-border); }
.ds-card-elevated { box-shadow: var(--ds-shadow-floating); }
.ds-card-title { font-size: var(--ds-font-size-lg); font-weight: var(--ds-font-weight-semibold); color: var(--ds-color-text); margin-bottom: var(--ds-space-2); }
.ds-card-subtitle { font-size: var(--ds-font-size-sm); color: var(--ds-color-text-secondary); margin-bottom: var(--ds-space-4); }

/* ─── 输入框 ─── */
.ds-field { display: flex; flex-direction: column; gap: var(--ds-space-2); margin-bottom: var(--ds-space-4); }
.ds-label { font-size: var(--ds-font-size-sm); font-weight: var(--ds-font-weight-medium); color: var(--ds-color-text); }
.ds-input,
.ds-select,
.ds-textarea {
  width: 100%;
  padding: 0 var(--ds-space-3);
  height: 36px;
  border: 1px solid var(--ds-color-border-strong);
  border-radius: var(--ds-radius-medium);
  font-family: inherit;
  font-size: var(--ds-font-size-sm);
  color: var(--ds-color-text);
  background: var(--ds-color-surface);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}
.ds-textarea { height: auto; padding: var(--ds-space-2) var(--ds-space-3); min-height: 88px; resize: vertical; }
.ds-input:focus,
.ds-select:focus,
.ds-textarea:focus {
  border-color: var(--ds-color-primary);
  box-shadow: 0 0 0 3px var(--ds-color-primary-subtle);
}
.ds-input-error,
.ds-select-error,
.ds-textarea-error { border-color: var(--ds-color-error); }
.ds-input-error:focus,
.ds-select-error:focus { box-shadow: 0 0 0 3px var(--ds-color-error-subtle); }
.ds-field-error { font-size: var(--ds-font-size-xs); color: var(--ds-color-error); margin-top: var(--ds-space-1); }
.ds-input:disabled,
.ds-select:disabled { background: var(--ds-color-surface-hover); cursor: not-allowed; }

/* ─── 表格 ─── */
.ds-table-wrap { width: 100%; overflow-x: auto; }
.ds-table { width: 100%; border-collapse: collapse; font-size: var(--ds-font-size-sm); }
.ds-table thead th {
  text-align: left;
  padding: var(--ds-space-3) var(--ds-space-4);
  font-weight: var(--ds-font-weight-semibold);
  color: var(--ds-color-text-secondary);
  background: var(--ds-color-surface-hover);
  border-bottom: 1px solid var(--ds-color-border);
  white-space: nowrap;
}
.ds-table tbody td {
  padding: var(--ds-space-3) var(--ds-space-4);
  border-bottom: 1px solid var(--ds-color-border);
  color: var(--ds-color-text);
}
.ds-table tbody tr:hover { background: var(--ds-color-surface-hover); }
.ds-table tbody tr:last-child td { border-bottom: none; }

/* ─── 徽章 ─── */
.ds-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  padding: 2px var(--ds-space-2);
  border-radius: var(--ds-radius-full);
  font-size: var(--ds-font-size-xs);
  font-weight: var(--ds-font-weight-medium);
  line-height: 1.4;
}
.ds-badge-success { background: var(--ds-color-success-subtle); color: var(--ds-color-success); }
.ds-badge-warning { background: var(--ds-color-warning-subtle); color: var(--ds-color-warning); }
.ds-badge-error { background: var(--ds-color-error-subtle); color: var(--ds-color-error); }
.ds-badge-info { background: var(--ds-color-info-subtle); color: var(--ds-color-info); }
.ds-badge-neutral { background: var(--ds-color-surface-hover); color: var(--ds-color-text-secondary); }
.ds-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

/* ─── 头像 ─── */
.ds-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-primary-subtle);
  color: var(--ds-color-primary);
  font-weight: var(--ds-font-weight-semibold);
  overflow: hidden;
}
.ds-avatar img { width: 100%; height: 100%; object-fit: cover; }
.ds-avatar-small { width: 24px; height: 24px; font-size: var(--ds-font-size-xs); }
.ds-avatar-medium { width: 32px; height: 32px; font-size: var(--ds-font-size-sm); }
.ds-avatar-large { width: 40px; height: 40px; font-size: var(--ds-font-size-base); }

/* ─── 状态（Loading / Empty / Error / Success） ─── */
.ds-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-2);
  padding: var(--ds-space-12);
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-font-size-sm);
}
.ds-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--ds-color-border);
  border-top-color: var(--ds-color-primary);
  border-radius: 50%;
  animation: ds-spin 0.6s linear infinite;
}
.ds-skeleton {
  background: linear-gradient(90deg, var(--ds-color-surface-hover) 25%, var(--ds-color-border) 37%, var(--ds-color-surface-hover) 63%);
  background-size: 400% 100%;
  animation: ds-skeleton 1.4s ease infinite;
  border-radius: var(--ds-radius-small);
}
@keyframes ds-spin { to { transform: rotate(360deg); } }
@keyframes ds-skeleton { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

.ds-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-3);
  padding: var(--ds-space-12) var(--ds-space-6);
  text-align: center;
}
.ds-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-color-surface-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ds-color-text-tertiary);
}
.ds-empty-title { font-size: var(--ds-font-size-base); font-weight: var(--ds-font-weight-medium); color: var(--ds-color-text); }
.ds-empty-desc { font-size: var(--ds-font-size-sm); color: var(--ds-color-text-secondary); max-width: 320px; }

.ds-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-3);
  padding: var(--ds-space-12) var(--ds-space-6);
  text-align: center;
}
.ds-error-icon { color: var(--ds-color-error); }
.ds-error-title { font-size: var(--ds-font-size-base); font-weight: var(--ds-font-weight-medium); color: var(--ds-color-text); }
.ds-error-message { font-size: var(--ds-font-size-sm); color: var(--ds-color-text-secondary); max-width: 360px; }

.ds-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-2);
  padding: var(--ds-space-3) var(--ds-space-4);
  border-radius: var(--ds-radius-medium);
  font-size: var(--ds-font-size-sm);
  margin-bottom: var(--ds-space-3);
}
.ds-alert-success { background: var(--ds-color-success-subtle); color: var(--ds-color-success); }
.ds-alert-warning { background: var(--ds-color-warning-subtle); color: var(--ds-color-warning); }
.ds-alert-error { background: var(--ds-color-error-subtle); color: var(--ds-color-error); }
.ds-alert-info { background: var(--ds-color-info-subtle); color: var(--ds-color-info); }

/* ─── 布局 ─── */
.ds-layout { display: flex; min-height: 100vh; }
.ds-layout-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ds-layout-content { flex: 1; padding: var(--ds-space-6); }

.ds-navbar {
  display: flex;
  align-items: center;
  gap: var(--ds-space-4);
  height: 56px;
  padding: 0 var(--ds-space-6);
  background: var(--ds-color-surface);
  border-bottom: 1px solid var(--ds-color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.ds-navbar-title { font-size: var(--ds-font-size-lg); font-weight: var(--ds-font-weight-semibold); }
.ds-navbar-nav { display: flex; align-items: center; gap: var(--ds-space-1); flex: 1; }
.ds-navbar-nav a { padding: var(--ds-space-2) var(--ds-space-3); border-radius: var(--ds-radius-medium); color: var(--ds-color-text-secondary); font-size: var(--ds-font-size-sm); }
.ds-navbar-nav a:hover { background: var(--ds-color-surface-hover); color: var(--ds-color-text); }
.ds-navbar-nav a.ds-active { color: var(--ds-color-primary); background: var(--ds-color-primary-subtle); }

.ds-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--ds-color-surface);
  border-right: 1px solid var(--ds-color-border);
  padding: var(--ds-space-4) var(--ds-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-1);
}
.ds-sidebar a {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding: var(--ds-space-2) var(--ds-space-3);
  border-radius: var(--ds-radius-medium);
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-font-size-sm);
}
.ds-sidebar a:hover { background: var(--ds-color-surface-hover); color: var(--ds-color-text); }
.ds-sidebar a.ds-active { color: var(--ds-color-primary); background: var(--ds-color-primary-subtle); font-weight: var(--ds-font-weight-medium); }

/* ─── Tabs ─── */
.ds-tabs { display: flex; gap: var(--ds-space-1); border-bottom: 1px solid var(--ds-color-border); margin-bottom: var(--ds-space-4); }
.ds-tab {
  padding: var(--ds-space-2) var(--ds-space-4);
  font-size: var(--ds-font-size-sm);
  color: var(--ds-color-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
  font-family: inherit;
}
.ds-tab:hover { color: var(--ds-color-text); }
.ds-tab.ds-active { color: var(--ds-color-primary); border-bottom-color: var(--ds-color-primary); font-weight: var(--ds-font-weight-medium); }

/* ─── Modal ─── */
.ds-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--ds-color-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--ds-space-4);
}
.ds-modal {
  background: var(--ds-color-surface);
  border-radius: var(--ds-radius-large);
  box-shadow: var(--ds-shadow-modal);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}
.ds-modal-header { display: flex; align-items: center; justify-content: space-between; padding: var(--ds-space-4) var(--ds-space-6); border-bottom: 1px solid var(--ds-color-border); }
.ds-modal-title { font-size: var(--ds-font-size-lg); font-weight: var(--ds-font-weight-semibold); }
.ds-modal-body { padding: var(--ds-space-6); }
.ds-modal-footer { display: flex; justify-content: flex-end; gap: var(--ds-space-2); padding: var(--ds-space-4) var(--ds-space-6); border-top: 1px solid var(--ds-color-border); }

/* ─── Dropdown ─── */
.ds-dropdown { position: relative; display: inline-block; }
.ds-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  min-width: 160px;
  background: var(--ds-color-surface);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-medium);
  box-shadow: var(--ds-shadow-floating);
  padding: var(--ds-space-1);
  z-index: 100;
}
.ds-dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--ds-space-2) var(--ds-space-3);
  border-radius: var(--ds-radius-small);
  font-size: var(--ds-font-size-sm);
  color: var(--ds-color-text);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.ds-dropdown-item:hover { background: var(--ds-color-surface-hover); }
.ds-dropdown-item.ds-danger { color: var(--ds-color-error); }

/* ─── 栅格工具 ─── */
.ds-grid { display: grid; gap: var(--ds-space-4); }
.ds-grid-2 { grid-template-columns: repeat(2, 1fr); }
.ds-grid-3 { grid-template-columns: repeat(3, 1fr); }
.ds-grid-4 { grid-template-columns: repeat(4, 1fr); }
.ds-flex { display: flex; }
.ds-flex-between { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-3); }

/* ─── 响应式 ─── */
@media (max-width: 768px) {
  .ds-grid-2, .ds-grid-3, .ds-grid-4 { grid-template-columns: 1fr; }
  .ds-sidebar { display: none; }
  .ds-layout-content { padding: var(--ds-space-4); }
  .ds-navbar { padding: 0 var(--ds-space-4); }
}
`
}

/** 组件元数据清单（供 Prompt 注入） */
export function componentsToPromptDescription(): string {
  return DESIGN_SYSTEM_COMPONENTS.map((c) => {
    const variants = c.variants.map((v) => v.name).join('/')
    const sizes = c.sizes.join('/')
    const states = [
      c.states.disabled ? 'disabled' : '',
      c.states.loading ? 'loading' : '',
      c.states.error ? 'error' : '',
      c.states.responsive ? 'responsive' : '',
    ].filter(Boolean).join('/')
    return `- ${c.type}（${c.className}）: ${c.description}\n  variant: ${variants} | size: ${sizes} | states: ${states} | props: ${c.props.join(', ')}`
  }).join('\n')
}
