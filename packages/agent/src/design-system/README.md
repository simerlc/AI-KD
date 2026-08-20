# AI Native Design System — 设计体系文档

AI快搭 内部设计系统，让 AI 生成的应用默认具备现代 SaaS 风格（Vercel / Linear / Notion / Stripe 级视觉语言）、统一设计语言、高质量交互与完整状态处理。

## 目录

1. [Design Tokens](#design-tokens)
2. [基础组件库](#基础组件库)
3. [页面模板系统](#页面模板系统)
4. [状态处理规范](#状态处理规范)
5. [Design Review](#design-review)

---

## Design Tokens

所有组件与生成应用**禁止硬编码颜色、间距、字体、圆角、阴影**，必须引用 Design Token（CSS 变量）。

### 颜色

| 令牌 | 用途 |
|------|------|
| `--ds-color-primary` | 主色（品牌色，默认 `#2563eb`） |
| `--ds-color-secondary` | 次要色 |
| `--ds-color-background` | 页面背景 |
| `--ds-color-surface` | 卡片/表面 |
| `--ds-color-border` | 边框 |
| `--ds-color-text` | 主文字 |
| `--ds-color-text-secondary` | 次要文字 |
| `--ds-color-success` | 成功 |
| `--ds-color-warning` | 警告 |
| `--ds-color-error` | 错误 |
| `--ds-color-info` | 信息 |

### 间距（4px 栅格）

`--ds-space-1` = 4px、`--ds-space-2` = 8px、`--ds-space-3` = 12px、`--ds-space-4` = 16px、`--ds-space-6` = 24px、`--ds-space-8` = 32px、`--ds-space-12` = 48px

### 圆角

`--ds-radius-small`(6px)、`--ds-radius-medium`(8px)、`--ds-radius-large`(12px)、`--ds-radius-xl`(16px)、`--ds-radius-full`(9999px)

### 阴影

`--ds-shadow-card`（卡片）、`--ds-shadow-modal`（模态框）、`--ds-shadow-floating`（悬浮）

---

## 基础组件库

14 个基础组件，统一 `ds-` 前缀，支持 variant / size / disabled / loading / error / responsive。

| 组件 | 类名 | 变体 | 尺寸 | 状态 |
|------|------|------|------|------|
| Button | `ds-btn` | primary/secondary/outline/ghost/danger | small/medium/large | disabled/loading |
| Card | `ds-card` | default/bordered/elevated | - | loading |
| Input | `ds-input` | default/error | small/medium/large | disabled/error |
| Select | `ds-select` | default | small/medium/large | disabled/loading/error |
| Modal | `ds-modal` | default | small/medium/large | loading |
| Table | `ds-table` | default | - | loading/error |
| Form | `ds-form` | default | - | disabled/loading/error |
| Tabs | `ds-tabs` | default | - | disabled |
| Dropdown | `ds-dropdown` | default | - | disabled |
| Badge | `ds-badge` | success/warning/error/info/neutral | small/medium | - |
| Avatar | `ds-avatar` | default | small/medium/large | - |
| Navbar | `ds-navbar` | default | - | - |
| Sidebar | `ds-sidebar` | default | - | - |
| Layout | `ds-layout` | sidebar/topbar | - | - |

---

## 页面模板系统

AI 生成应用时优先组合模板，而非从零创建页面。

| 模板 | 分类 | 适用场景 |
|------|------|---------|
| SaaS Dashboard | dashboard | 数据看板/指标监控 |
| Admin Panel | admin | 数据管理后台 |
| CRM | crm | 客户关系管理 |
| E-commerce | ecommerce | 电商/商城 |
| Landing Page | landing | 官网/营销落地页 |

---

## 状态处理规范

所有 AI 生成应用必须包含以下状态，禁止空白等待：

- **Loading**：`ds-loading` / `ds-spinner`（数据加载时）
- **Empty**：`ds-empty`（图标 + 描述 + 操作按钮）
- **Error**：`ds-error`（错误信息 + 重试按钮）
- **Success**：`ds-alert-success`（操作成功反馈）

禁止生成：空页面、无响应按钮、placeholder 功能、未处理异常。

---

## Design Review

应用生成后自动执行 UI 审查，产出 `DesignReviewReport`：

```json
{
  "score": 90,
  "issues": ["按钮样式不统一", "缺少Empty状态"],
  "suggestions": ["替换Card组件", "优化页面布局"],
  "passed": true,
  "passThreshold": 90
}
```

评分 < 90 自动进入优化流程。

---

## 使用规范（给 AI 生成）

1. 使用 Design System 组件（`ds-*` 类名），禁止自行创建基础 UI
2. 所有颜色来自 Design Tokens，禁止硬编码
3. 所有布局遵守设计规范（间距/圆角/阴影）
4. 所有页面支持移动端响应式
5. 所有交互必须有状态反馈
6. 所有按钮必须绑定真实逻辑
7. 所有表单必须有校验
8. 所有 API 必须处理异常
