# AI快搭 V1 开发规格与实施方案

> 基于 OpenVibeCoding 二次开发，将 "AI Coding / Vibe Coding 平台" 改造为 "AI 应用搭建平台 AI快搭"。
>
> 本文档是 AI快搭 V1 的正式开发规格与执行计划，Coding Agent 必须将其视为最高优先级产品与工程要求之一。

---

## 0. 项目目标

将 OpenVibeCoding 从"AI Coding / Vibe Coding 平台"二次开发为"AI 应用搭建平台 AI快搭"。

### 核心体验闭环

```
用户
  ↓
创建应用
  ↓
输入自然语言需求
  ↓
Planner Agent
  ↓
生成 App Model
  ↓
Builder Agent
  ↓
生成代码
  ↓
Sandbox（本地 Docker）
  ↓
Preview
  ↓
Tester Agent
  ↓
自动修复
  ↓
Ready
  ↓
用户继续对话修改
  ↓
创建 Version
  ↓
Deploy
```

V1 不实现完整传统低代码拖拽编辑器。V1 的主要交互方式是"自然语言 + 实时预览"。

---

## 1. 产品定位

### 1.1 产品名称

- 产品名称：**AI快搭**
- 英文内部名称：**AIAppBuilder**
- package namespace：`@aikd/*`
- App Engine：`app-engine`
- Agent Engine：`agent`
- Component Registry：`component-registry`

### 1.2 V1 范围

| 项目 | 选择 |
|------|------|
| CloudBase 依赖 | **完全移除** |
| 沙箱运行方案 | **本地 Docker 容器** |
| App Model 形态 | **JSON Schema 低代码模型** |
| 支持应用类型 | Web 应用 / 移动端 H5 / 静态页面/落地页 |
| LLM 接入 | 用户自接 OpenAI 兼容 API |
| 复杂度 | 简化优先，避免过度工程化 |

### 1.3 不在 V1 范围

- 传统低代码拖拽编辑器
- 全栈应用（含后端 API + 数据库 schema）
- 微信小程序部署
- 多用户协作 / Admin 后台
- GitHub 集成 / PR / 代码归档
- 定时任务（cron）
- CloudBase 上云部署

---

## 2. 技术决策

### 2.1 已确认决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| CloudBase | 完全移除 | 本地优先，简化部署 |
| 沙箱 | 本地 Docker 容器 | 隔离性好，预览体验佳 |
| App Model | JSON Schema 低代码模型 | 可版本化、可二次编辑 |
| 应用类型 | Web / H5 / 静态页 | 覆盖主流前端场景 |
| LLM | OpenAI 兼容 API | 兼容 OpenAI/DeepSeek/智谱/Ollama 等 |
| 数据库 | SQLite only | 本地零依赖 |
| 认证 | 本地账号 | 单用户/本地运行 |

### 2.2 关键建议

1. **CodeBuddy SDK（`@tencent-ai/agent-sdk`）**：移除。统一走 OpenAI 兼容 API。
2. **OpenCode ACP runtime**：移除。简化为直接 LLM 调用 + tool calling 循环。
3. **ACP JSON-RPC + SSE 协议**：保留。前端已大量基于此构建，避免重写聊天 UI。
4. **认证**：保留本地账号，移除 GitHub OAuth。
5. **Admin 后台**：移除。V1 单用户/本地运行不需要。

---

## 3. 整体架构

### 3.1 包结构（精简后）

```
packages/
├── web/                  # @aikd/web - 前端 UI（React 19 + Vite）
├── server/               # @aikd/server - Hono 后端
├── shared/               # @aikd/shared - 共享类型（ACP 协议、App Model、Task）
├── app-engine/           # @aikd/app-engine 【新】App Model schema + 版本管理
├── component-registry/   # @aikd/component-registry 【新】组件注册表
└── agent/                # @aikd/agent 【新】Planner/Builder/Tester + Orchestrator
```

**删除的包**：
- `packages/dashboard/`（CloudBase 资源管理 UI，不再需要）
- `packages/open-agent-kernel/`（过于复杂，V1 不需要）
- `packages/chat-playground/`（开发示例）
- `packages/chat-core/`（合并入 `@aikd/web`，作为内部组件）

### 3.2 数据库（SQLite only）

#### 保留表

| 表 | 说明 |
|----|------|
| `users` | 本地用户（精简：移除 GitHub 字段） |
| `local_credentials` | 本地账号密码 |
| `settings` | 系统配置（LLM 配置等） |
| `deployments` | 部署记录 |

#### 改造表

| 原表 | 新表 | 改造内容 |
|------|------|----------|
| `tasks` | `apps` | 移除 PR/sandbox/repo 字段，新增 appModelId、currentVersion |

#### 新增表

| 表 | 说明 |
|----|------|
| `app_versions` | 应用版本快照（version + appModel JSON + 代码 hash） |
| `app_models` | App Model JSON 存储（按 version 关联） |

#### 删除表

`connectors`、`miniprogram_apps`、`cron_tasks`、`accounts`、`keys`、`user_resources`、`env_pool`、`admin_logs`

### 3.3 Agent 编排

```
用户需求
   ↓
Planner Agent → App Model (JSON Schema)
   ↓
Builder Agent → React 代码（基于 App Model + component-registry）
   ↓
Sandbox (Docker) → Vite Dev Server → 实时预览
   ↓
Tester Agent → 验证 → 反馈 Builder 修复
   ↓
Ready → 用户对话修改 → 创建 Version → Deploy
```

- 三个 Agent 共享同一个 LLM Provider，通过不同 system prompt 区分职责
- Orchestrator 协调多 Agent 的多轮对话
- 复用现有 ACP JSON-RPC + SSE 协议层，前端聊天 UI 不重写

### 3.4 LLM 适配

- 统一 **OpenAI 兼容 API**（支持 OpenAI / DeepSeek / 智谱 / Ollama / 本地 LLM）
- 通过 `.env` 配置：
  ```env
  LLM_API_KEY=
  LLM_BASE_URL=        # 如 https://api.deepseek.com/v1
  LLM_MODEL=           # 如 deepseek-chat
  LLM_SUPPORTS_IMAGES= # true/false
  ```
- 自己实现 LLM 调用 + tool calling 循环（替换 CodeBuddy SDK）
- 移除依赖：`@tencent-ai/agent-sdk`、`opencode-ai`、`@opencode-ai/plugin`

### 3.5 沙箱（本地 Docker）

- 每个应用一个 Docker 容器
- 容器内运行 Vite Dev Server
- 端口动态分配（5173–5199）
- 镜像：`node:20-alpine` + 预装 vite
- 工作区按 `appId` 隔离目录：`./workspaces/{appId}/`

---

## 4. App Model 设计

### 4.1 Schema 定义

```typescript
interface AppModel {
  id: string
  name: string
  type: 'web' | 'h5' | 'static'
  version: string
  schema: {
    pages: Page[]
    routes: Route[]
    theme: Theme
    dataSources: DataSource[]  // 静态数据 / mock 数据
  }
  createdAt: number
  updatedAt: number
}

interface Page {
  id: string
  path: string           // 如 '/' '/about'
  title: string
  layout: 'web' | 'mobile'
  components: ComponentNode[]
}

interface ComponentNode {
  id: string
  type: string           // 引用 component-registry 中的组件
  props: Record<string, any>
  children?: ComponentNode[]
}

interface Route {
  path: string
  pageId: string
}

interface Theme {
  primaryColor: string
  fontFamily: string
  // 其他主题字段
}

interface DataSource {
  id: string
  name: string
  type: 'static' | 'mock'
  data: any              // JSON 数据
}
```

### 4.2 App Model 示例

```json
{
  "id": "app_xxx",
  "name": "个人博客",
  "type": "web",
  "version": "0.1.0",
  "schema": {
    "pages": [
      {
        "id": "page_home",
        "path": "/",
        "title": "首页",
        "layout": "web",
        "components": [
          {
            "id": "c1",
            "type": "Header",
            "props": { "title": "我的博客" }
          },
          {
            "id": "c2",
            "type": "PostList",
            "props": { "dataSource": "posts" }
          }
        ]
      }
    ],
    "routes": [
      { "path": "/", "pageId": "page_home" }
    ],
    "theme": {
      "primaryColor": "#3b82f6",
      "fontFamily": "Inter, sans-serif"
    },
    "dataSources": [
      {
        "id": "posts",
        "name": "posts",
        "type": "mock",
        "data": [
          { "title": "第一篇", "content": "..." }
        ]
      }
    ]
  }
}
```

### 4.3 App Model 与代码的关系

- **App Model** 是单一可信源（Single Source of Truth）
- **Builder Agent** 将 App Model 渲染为可运行 React 代码
- 用户对话修改 → 更新 App Model → Builder 重新生成代码 → 预览刷新
- 创建 Version = 对当前 App Model 打快照

---

## 5. Component Registry 设计

### 5.1 目标

- 提供可被 Builder Agent 引用的组件清单
- 每个组件有清晰的 props schema（供 Planner 生成 App Model 时引用）
- V1 仅内置基础组件，不支持用户自定义上传

### 5.2 内置组件清单（V1）

| 分类 | 组件 |
|------|------|
| 布局 | `Container`、`Grid`、`Flex`、`Section` |
| 文本 | `Heading`、`Text`、`Paragraph` |
| 按钮 | `Button`、`Link` |
| 表单 | `Input`、`Textarea`、`Select`、`Checkbox`、`Form` |
| 展示 | `Image`、`Card`、`List`、`Table` |
| 导航 | `Header`、`Footer`、`NavBar`、`Tabs` |
| 反馈 | `Alert`、`Badge`、`Modal` |

### 5.3 组件描述格式

```typescript
interface ComponentDefinition {
  type: string                  // 唯一标识，如 'Button'
  name: string                  // 显示名
  category: string              // 分类
  description: string           // 给 Planner 的描述
  propsSchema: JSONSchema       // props 的 JSON Schema
  acceptsChildren: boolean
  defaultProps: Record<string, any>
}
```

---

## 6. 改造阶段（6 阶段）

### 阶段 1: 基础重构（去 CloudBase + 重命名）

**目标**：完成底层依赖切换，让项目能本地启动。

**任务**：
- [ ] `@coder/*` → `@aikd/*` 全量重命名（package.json、import 路径）
- [ ] 移除 CloudBase 相关代码：
  - `packages/server/src/cloudbase/`（整个目录）
  - `packages/server/src/db/cloudbase/`（整个目录）
  - `packages/server/src/middleware/mcp/`（整个目录）
  - `packages/server/src/lib/cloudbase-mcp.ts`
  - `packages/server/src/lib/provision-config.ts`
  - `packages/server/src/lib/sandbox-config.ts` 中的 CloudBase 部分
- [ ] 移除依赖：`@cloudbase/*`、`@tencent-ai/agent-sdk`、`opencode-ai`、`@opencode-ai/plugin`、`cos-nodejs-sdk-v5`、`tencentcloud-sdk-nodejs`
- [ ] 实现 OpenAI 兼容 LLM Provider（新 `packages/server/src/llm/`）
- [ ] 简化数据库为 SQLite only（移除双 Provider 抽象）
- [ ] 简化认证为本地账号（移除 GitHub OAuth）
- [ ] 精简 `.env.example`
- [ ] 验证 `pnpm type-check` 通过

### 阶段 2: App Engine + Component Registry

**目标**：建立 App Model 数据结构与组件库。

**任务**：
- [ ] 新建 `packages/app-engine/`：
  - App Model schema（zod 定义）
  - App Model 验证器
  - 版本管理逻辑
- [ ] 新建 `packages/component-registry/`：
  - 组件定义接口
  - 内置基础组件（15+ 个）
  - 组件 props JSON Schema
- [ ] 新建 `packages/shared/src/types/app-model.ts`
- [ ] 数据库 schema：`apps`、`app_versions`、`app_models` 表
- [ ] 内置页面模板：Web / H5 / Static 三种 starter
- [ ] 验证 `pnpm type-check` 通过

### 阶段 3: Agent 三件套

**目标**：实现 Planner / Builder / Tester 三 Agent 编排。

**任务**：
- [ ] 新建 `packages/agent/`
- [ ] 实现 LLM 调用层（基于阶段 1 的 LLM Provider）
- [ ] **Planner Agent**：
  - system prompt：需求 → App Model JSON
  - 输出强约束 JSON（zod 校验）
  - 失败重试机制
- [ ] **Builder Agent**：
  - system prompt：App Model → React 代码
  - 引用 component-registry 生成 import
  - 生成 `pages/*.tsx` + `App.tsx` + `main.tsx` + `package.json`
- [ ] **Tester Agent**：
  - 验证生成代码可构建（`vite build` dry run）
  - 检查 component-registry 引用合法性
  - 反馈修复建议给 Builder
- [ ] **Orchestrator**：多 Agent 编排（基于现有 ACP 协议层）
- [ ] 改造 `routes/acp.ts`：移除 opencode 相关，接入新 Orchestrator
- [ ] 验证端到端：需求 → App Model → 代码 → 构建

### 阶段 4: 沙箱本地化

**目标**：实现本地 Docker 沙箱 + 实时预览。

**任务**：
- [ ] 移除 `packages/server/src/sandbox/scf-sandbox-manager.ts`
- [ ] 新建 `packages/server/src/sandbox/local-docker-sandbox.ts`：
  - 容器创建/启动/停止/销毁
  - 端口动态分配（5173–5199）
  - 工作区挂载（`./workspaces/{appId}/` → 容器 `/app`）
  - 健康检查
- [ ] Dockerfile：`node:20-alpine` + vite 预装
- [ ] 容器内 Vite Dev Server 启动脚本
- [ ] 集成到 Builder Agent：生成代码 → 写入工作区 → 启动容器 → 返回预览 URL
- [ ] 实时预览 iframe 集成（复用现有前端）
- [ ] 自动修复反馈：构建错误 → Tester Agent → Builder 修复

### 阶段 5: 前端改造

**目标**：完成品牌切换与 UI 精简。

**任务**：
- [ ] 品牌重命名：所有 "OpenVibeCoding" / "CodeBuddy" → "AI快搭"
- [ ] 简化首页 [home-page-content.tsx](file:///e:/ztgt/AI%E5%9F%B9%E8%AE%AD/%E5%BF%AB%E6%90%AD/OpenVibeCoding-main/packages/web/src/components/home-page-content.tsx)：
  - 移除 GitHub 集成入口
  - 移除多仓库选择
  - 保留 prompt 输入 + 应用类型选择（Web/H5/Static）
- [ ] 改造 [main.tsx](file:///e:/ztgt/AI%E5%9F%B9%E8%AE%AD/%E5%BF%AB%E6%90%AD/OpenVibeCoding-main/packages/web/src/main.tsx) 路由：
  - 移除 `/admin/*`、`/miniprogram`、`/crontask`
  - 改 `/tasks/:taskId` → `/apps/:appId`
- [ ] 新建应用对话流 UI（保留 ACP 聊天框架）
- [ ] App Model 可视化展示（只读树状视图，V1 不做拖拽编辑）
- [ ] 版本列表 UI
- [ ] 移除前端无用组件：`admin/`、`connectors/`、`pr-*.tsx`、`*-dialog.tsx`（GitHub 相关）

### 阶段 6: 版本与发布

**目标**：完成 Version + Deploy 闭环。

**任务**：
- [ ] App Version 数据模型完善
- [ ] 创建版本 API：当前 App Model 打快照
- [ ] 版本列表 / 切换 / 对比
- [ ] 导出静态文件：`vite build` → `dist/`
- [ ] 本地静态服务（可选 `serve` 或内置 Hono 静态服务）
- [ ] Deployments 表记录发布历史

---

## 7. 删除范围清单

### 7.1 整个删除的目录/文件

**packages**：
- `packages/dashboard/`（整个）
- `packages/open-agent-kernel/`（整个）
- `packages/chat-playground/`（整个）

**server**：
- `packages/server/src/cloudbase/`（整个）
- `packages/server/src/middleware/mcp/`（整个）
- `packages/server/src/services/cron-scheduler.ts`
- `packages/server/src/services/git/`（整个）
- `packages/server/src/sandbox/git-archive.ts`
- `packages/server/src/sandbox/git-personal.ts`
- `packages/server/src/sandbox/scf-sandbox-manager.ts`（阶段 4 替换）
- `packages/server/src/db/cloudbase/`（整个）
- `packages/server/src/plugins/opencode-skill-plugin.ts`
- `packages/server/src/agent/runtime/opencode-*.ts`（所有 opencode 相关）
- `packages/server/src/agent/cloudbase-agent.service.ts`（重构为新 agent service）

**routes**：
- `github.ts`、`github-auth.ts`
- `cloudbase-auth.ts`、`cloudbase-mcp.ts`
- `miniprogram.ts`、`crontask.ts`
- `capi.ts`、`database.ts`、`storage.ts`、`functions.ts`、`sql.ts`
- `connectors.ts`、`repos.ts`、`api-keys.ts`、`skills.ts`
- `admin.ts`

**web**：
- `packages/web/src/components/admin/`（整个）
- `packages/web/src/components/connectors/`（整个）
- `packages/web/src/pages/admin/`（整个）
- `packages/web/src/pages/miniprogram-page.tsx`
- `packages/web/src/pages/crontask-page.tsx`
- `packages/web/src/pages/tool-renderers-preview.tsx`
- GitHub 相关：`pr-*.tsx`、`create-pr-dialog.tsx`、`merge-pr-dialog.tsx`、`revert-commit-dialog.tsx`、`multi-repo-dialog.tsx`、`open-repo-url-dialog.tsx`、`repo-selector.tsx`、`github-stars-button.tsx`、`sandboxes-dialog.tsx`

### 7.2 依赖删除清单

```json
// 从 root package.json 移除
"@cloudbase/manager-node",
"@cloudbase/node-sdk",
"opencode-ai",
"tencentcloud-sdk-nodejs"

// 从 packages/server/package.json 移除
"@agentclientprotocol/sdk",  // 保留（ACP 协议需要）
"@anthropic-ai/claude-agent-sdk",
"@cloudbase/manager-node",
"@cloudbase/node-sdk",
"@cloudbase/signature-nodejs",
"@cloudbase/toolbox",
"@opencode-ai/plugin",
"@tencent-ai/agent-sdk",
"cos-nodejs-sdk-v5",
"got",
"tencentcloud-sdk-nodejs"
```

---

## 8. 环境变量（V1 精简版）

```env
# ==================== Required ====================

# Session 加密密钥
JWE_SECRET=
ENCRYPTION_KEY=

# ==================== Auth ====================
# 仅本地账号
NEXT_PUBLIC_AUTH_PROVIDERS=local

# ==================== LLM ====================
# OpenAI 兼容 API
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_SUPPORTS_IMAGES=false

# ==================== Sandbox ====================
# 工作区根目录（默认 ./workspaces）
WORKSPACE_ROOT=./workspaces

# Docker 沙箱配置
SANDBOX_IMAGE=node:20-alpine
SANDBOX_PORT_RANGE_START=5173
SANDBOX_PORT_RANGE_END=5199

# ==================== Rate Limiting ====================
MAX_MESSAGES_PER_DAY=50
MAX_SANDBOX_DURATION=300

# ==================== Optional ====================
# 本地静态服务端口（用于发布预览）
DEPLOY_PORT=8080
```

---

## 9. 验证清单

### 9.1 阶段验证

每个阶段完成时必须通过：
- [ ] `pnpm type-check` 无错误
- [ ] `pnpm lint` 无错误
- [ ] `pnpm format` 通过
- [ ] 日志中无动态值（无 `${...}` 模板字符串）
- [ ] 敏感变量未暴露

### 9.2 端到端验证（V1 完成）

- [ ] 用户本地启动：`pnpm dev`
- [ ] 配置 LLM API Key 后可正常对话
- [ ] 输入需求 → 生成 App Model → 生成代码 → 预览
- [ ] Docker 沙箱正常启动，预览可访问
- [ ] Tester Agent 自动修复构建错误
- [ ] 创建版本 → 版本列表正常
- [ ] 导出静态文件 → 本地访问正常

---

## 10. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| LLM 输出 App Model 格式不稳定 | zod 严格校验 + 失败重试（最多 3 次） |
| Builder 生成代码不可构建 | Tester Agent 反馈循环 + 自动修复 |
| Docker 沙箱用户未装 Docker | 启动时检测 + 友好提示 + 文档说明 |
| 组件库覆盖不足 | V1 内置 15+ 基础组件，覆盖常见场景 |
| 移除 CloudBase 后持久化弱 | SQLite 文件备份说明 + 工作区目录说明 |

---

## 11. 提交规范

```
type(scope): description

feat/fix/docs/refactor/chore(aikd|agent|app-engine|component-registry|web|server): 简短描述
```

Co-Author 格式（如果由 AI 辅助）：
```
Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 12. 执行顺序建议

1. **阶段 1**（基础重构）→ 必须先完成，解锁后续
2. **阶段 2**（App Engine + Component Registry）→ 可与阶段 3 部分并行
3. **阶段 3**（Agent 三件套）→ 核心逻辑
4. **阶段 4**（沙箱本地化）→ 依赖阶段 3 输出代码
5. **阶段 5**（前端改造）→ 可与阶段 3/4 并行
6. **阶段 6**（版本与发布）→ 最后完成闭环

---

**文档版本**：V1.0
**创建日期**：2026-08-12
**状态**：已确认，待执行
