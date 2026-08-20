// ─── AI Native Design System 统一入口 ─────────────────────
//
// AI快搭 内部设计系统。让 AI 生成的应用必须基于该设计体系开发，
// 而不是自由生成 HTML/CSS。包含：
//   - Design Tokens（颜色/排版/间距/圆角/阴影）
//   - 基础组件库元数据
//   - 页面模板系统
//   - 样式生成器（生成应用注入的 CSS）
//   - Design Review Agent（见 ./design-review）

export * from './tokens'
export * from './components'
export * from './templates'
export * from './styles'
export * from './design-review'
