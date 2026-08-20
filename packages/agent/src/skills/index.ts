// ─── AI Skill System 统一入口 ────────────────────────────
//
// AI快搭 技能系统。让大模型在生成应用前根据任务需求自动识别并加载
// 相关开发技能，调用专业技能生成更专业、完整、差异化的应用。
//
// 流程：需求分析 → Skill 识别 → 加载技能 → 生成应用方案 → 代码开发 → 测试优化
//
// 模块：
//   - Skill Registry（技能注册中心）
//   - Skill Selector（技能选择 Agent）
//   - Skill Context Loader（技能上下文加载器）
//   - Skill Feedback Loop（技能进化反馈）

export * from './types'
export * from './builtin'
export * from './registry'
export * from './skill-selector'
export * from './context-loader'
export * from './feedback'
