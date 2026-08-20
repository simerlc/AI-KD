# AI快搭 (AIKD) — 开发记录

## 概览

- **项目名**: AI快搭 (AIKD)
- **类型**: TypeScript monorepo（pnpm workspace）
- **目标**: 通过自然语言生成 App Model / Blueprint → 由 Multi-Agent 编排生成 React 应用，生成后自动执行全功能测试与自动修复（≤5 轮闭环），通过后再进入本地沙箱预览与版本管理。参考计划: [AIKD-V1-PLAN.md](AIKD-V1-PLAN.md)
- **后端框架**: Hono + @hono/node-server，运行于 Node ≥ 22
- **数据库**: SQLite（better-sqlite3 + drizzle-orm）
- **LLM 接入**: OpenAI 兼容接口（兼容 DeepSeek / OpenAI / Anthropic / Gemini / Qwen / 自定义 OpenAI Compatible Provider）
- **模型管理**: 内置 + 自定义 Provider 统一管理，支持 API Key 配置、连接测试、动态切换与持久化（`~/.aikd/providers.json`）

---

## 仓库结构

本仓库为 pnpm monorepo，根目录只放工程配置与文档，所有源码按职责拆分到 `packages/*`。

```
AIKD-V1/
├── AIKD-V1-PLAN.md        # V1 产品规格与实施计划（最高优先级需求文档）
├── DEVELOPER.md           # 本文档：开发与运行说明
├── NOTICE                 # 开源声明 / 许可证声明
├── package.json           # 根 workspace 脚本（dev / build / lint / type-check 等）
├── pnpm-workspace.yaml    # workspace 包声明
├── tsconfig.json          # 全局 TS 配置（base）
├── scripts/               # 仓库级脚本（初始化、构建、部署等）
└── packages/
    ├── web/               # @aikd/web    前端（React 19 + Vite）
    ├── server/            # @aikd/server 后端（Hono + SQLite + 沙箱）
    ├── shared/            # @aikd/shared 共享类型与协议定义
    ├── app-engine/        # @aikd/app-engine App Model schema / 校验 / 版本 / 模板
    ├── component-registry/# @aikd/component-registry 内置组件 + props schema
    └── agent/             # @aikd/agent  Multi-Agent 编排 + 应用自动测试与修复 + Runtime/自愈
```

### 各包职责速览

| 包 | 命名空间 | 职责 | 入口 / 关键文件 |
|----|----------|------|-----------------|
| `packages/web/` | `@aikd/web` | 前端 UI（React + Vite），ACP 聊天、预览 iframe、版本列表 | `src/main.tsx`、`src/pages/`、`src/components/`、`src/hooks/`（如 `use-preview-bridge.ts`） |
| `packages/server/` | `@aikd/server` | 后端服务（Hono）、HTTP 路由、沙箱管理、DB、LLM 适配 | `src/index.ts` |
| `packages/shared/` | `@aikd/shared` | 跨端共享类型与接口（ACP 协议、App Model、Task） | `src/index.ts`、`src/types/app-model.ts` |
| `packages/app-engine/` | `@aikd/app-engine` | App Model schema、校验器、版本管理、页面模板 | `src/schema.ts`、`src/validator.ts`、`src/version.ts`、`src/templates.ts` |
| `packages/component-registry/` | `@aikd/component-registry` | 内置组件定义与 props schema（供 Planner/Builder 引用） | `src/index.ts`、`src/registry.ts`、`src/types.ts`、`src/components/` |
| `packages/agent/` | `@aikd/agent` | Multi-Agent 编排（Requirement/Blueprint/Coding/Review/Fix）、应用生成后自动全功能测试与自动修复、Runtime Agent（Tool Calling）、Auto-Debug 自愈循环 | `src/multi-agent/`（orchestrator / agents / blueprint / tester）、`src/builder.ts`、`src/auto-debug/`、`src/runtime-agent/`、`src/planner.ts`、`src/types.ts`、`src/utils.ts` |

### `packages/server/src/` 内部结构

```
server/src/
├── index.ts          # 服务入口：启动 Hono、加载 .env、清理孤儿沙箱
├── routes/           # HTTP 路由层
│   ├── acp.ts        #   ACP 协议 / SSE 流式生成（对话入口）
│   ├── tasks.ts      #   任务（应用）与预览管理
│   ├── data.ts       #   通用数据 API（/api/data，供生成应用读写）
│   ├── providers.ts  #   Provider 管理 API（/api/providers）
│   ├── auth.ts       #   认证（默认本地账号）
│   └── misc.ts       #   杂项 / 健康检查
├── providers/        # AI Provider 管理（内置 + 自定义 + 测试 + 持久化）
│   ├── types.ts      #   ModelProvider / ModelConfig 类型定义
│   ├── builtin.ts    #   内置 Provider 定义（DeepSeek/OpenAI/Anthropic/Gemini/Qwen）
│   ├── storage.ts    #   JSON 文件持久化（~/.aikd/providers.json）+ 内存缓存
│   └── test.ts       #   测试连接（服务端发起 OpenAI Compatible 请求）
├── sandbox/          # 沙箱实现与端口分配
│   ├── index.ts              #   沙箱工厂 / 统一接口
│   ├── local-node-sandbox.ts #   Node 本地子进程模式（默认，无需 Docker）
│   ├── local-docker-sandbox.ts# Docker 容器模式
│   └── port-allocator.ts    #   预览端口分配（默认 5173–5199）
├── llm/              # LLM Provider（OpenAI 兼容）与 Agent 适配层
├── db/               # drizzle schema 与仓储层（SQLite）
├── agent/            # Agent 会话管理（对接 @aikd/agent）
├── services/         # 持久化 / 业务逻辑服务
├── plugins/          # 服务端插件
├── middleware/       # 中间件（认证等）
├── lib/              # 工作区文件管理、通用工具
├── config/           # 配置加载（env → 运行时配置）
├── constant/         # 常量定义
└── util/             # 底层工具函数
```

### `scripts/` 仓库级脚本

| 脚本 | 用途 |
|------|------|
| `init.mjs` | 初始化工程（生成 `.env` 模板等），开发前运行 |
| `deploy.mjs` | 本地部署 / 发布辅助 |
| `clear_tasks_sqljs.mjs` | 清理数据库任务数据 |
| `sandbox-image/` | 沙箱 Docker 镜像构建相关文件 |
| `*.cmd` / `*.ps1` / `*.sh` | Windows / 跨平台构建与启动辅助脚本 |

> 注：部分脚本（如 `opencode-setup.mjs`、`codebuddy-setup.mjs`、`setup-tcr.mjs`、`test-create-cloudrun.mjs`）为早期原型残留，与 V1 当前架构无关，后续清理时可直接删除。

---

## 快速上手（开发环境）

```bash
# 1. 安装依赖
pnpm install

# 2. 初始化（生成 .env 模板等）
node scripts/init.mjs

# 3. 启动开发环境（前后端并行，根 package.json 的 dev 脚本）
pnpm dev

# 单独启动前端 / 后端
pnpm --filter @aikd/web dev
pnpm --filter @aikd/server dev
```

> **注意（Windows）**：`pnpm dev` 使用 `concurrently --raw` 同时启动前后端。务必保留 `--raw` 参数——它解决了 `tsx watch` 在 Windows + concurrently 下 stdout 被管道化导致后端不启动的问题（对应 tsx issue #623）。

---

## 环境变量

在 `packages/server/.env` 中配置（开发时通过 `tsx watch --env-file=.env` 加载）。

| 变量 | 说明 | 示例 |
|------|------|------|
| `LLM_API_KEY` | LLM 服务 API Key | `sk-xxx` |
| `LLM_BASE_URL` | OpenAI 兼容端点 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `LLM_MODEL` | 模型名 | `deepseek-v4-flash-0731` / `deepseek-v3` / `qwen-turbo` |
| `LLM_SUPPORTS_IMAGES` | 是否支持图片输入 | `true` / `false` |
| `PORT` | 后端服务端口 | `3001` |
| `SANDBOX_MODE` | 沙箱模式：`node`（本地子进程，无需 Docker）或 `docker`（Docker 容器） | `docker` |
| `SANDBOX_IMAGE` | Docker 模式下的沙箱镜像 | `aikd/sandbox:latest` |
| `SANDBOX_PORT_RANGE_START` / `_END` | 沙箱预览端口范围（默认 `5173–5199`） | `5173` / `5199` |
| `WORKSPACE_ROOT` | 生成代码工作区根目录（默认 `packages/server/workspaces`） | - |

> **说明**：`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` 为**默认 Provider 配置**。当任务未指定 Provider（或指定 Provider 未配置 key）时，作为回退使用。若在「模型」页面配置了对应 Provider，则优先使用该 Provider 的配置。

---

## 核心概念

### App Model
中心 JSON schema，描述 `pages`、`routes`、`components`、`theme` 与 `dataSources`。类型定义见 `packages/shared/src/types/app-model.ts`。

### Multi-Agent 编排（生成主流程）
主流程由 `packages/agent/src/multi-agent/orchestrator.ts` 驱动，角色见 `multi-agent/agents/`：

1. **RequirementAgent**（`requirement.ts`）：解析用户自然语言需求 → 结构化需求。
2. **BlueprintAgent**（`blueprint.ts` + `blueprint/`）：产出 Blueprint（页面 / 组件 / 数据源 / 流程），经 `validator.ts`、`application-validator.ts`、`integrity-checker.ts` 校验。
3. **CodingAgent**（`coding.ts`）：将 Blueprint 转成代码文件（经由 `builder.ts` 确定性生成 React + Vite 工程，不依赖 LLM）。
4. **ReviewAgent / FixAgent**（`review.ts` / `fix.ts`）：代码评审与定向修复。
5. **ApplicationTestAgent**（见下节）：生成后自动测试，通过后进入 Preview。

> **旧路径（Planner → Builder → Tester）**：`src/planner.ts`、`src/builder.ts`、`src/tester.ts`、`src/orchestrator.ts` 仍保留兼容。
> - Planner 将自然语言转 App Model JSON（含验证 + 重试，默认 3 次）。**注意**：LLM 调用 `max_tokens: 8192`，若使用推理模型（如 `deepseek-v4-flash`）思考会消耗大量 token，token 上限过低会导致返回的 `content` 被截断为空，最终 fallback 到"未命名应用"默认模板；若生成结果始终是默认模板，优先排查 LLM 是否返回空内容。重试全部失败时**会抛错**（不再静默 fallback），错误会透传到前端。
> - Builder 关键文件: `packages/agent/src/builder.ts`。页面文件约定为 `src/pages/{page.id}.tsx`（如 `src/pages/page_home.tsx`），`package.json` 自带 `react-router-dom` / `antd` 依赖。

### 应用生成后自动全功能测试与自动修复（tester）
位于 `packages/agent/src/multi-agent/tester/`，在生成完成后、进入 Preview **之前**强制执行：

```
生成 → ApplicationTestAgent 测试 → 通过（score ≥ 95 且 build/runtime 无致命失败）→ Preview
                              ↓ 失败
                  ErrorAnalyzerAgent 分析（定位出错文件）
                              ↓
                  RepairAgent 修复（Patch-first，不重写整个应用）
                              ↓
                       重测（最多 5 轮）
                              ↓
                 仍未通过 → 拒绝 Preview 并上报错误
```

- **统一结果结构** `ApplicationTestResult`（`result.ts`）：`{ status, score, errors[], tests: { build, runtime, ui, feature, api } }`，`PREVIEW_PASS_SCORE = 95`。
- **五大维度验证器**（`validators/`）：
  | 验证器 | 职责 |
  |--------|------|
  | `build-validator.ts` | 项目结构、页面文件约定、import 可解析性（含项目内 import 与扩展名/index 解析） |
  | `runtime-validator.ts` | `npm run dev` 启动 + 端口探活（真实模式） |
  | `ui-validator.ts` | UI 结构完整性（页面组件命名、入口挂载） |
  | `feature-validator.ts` | 按 Blueprint 校验功能流程页面是否齐全 |
  | `api-validator.ts` | API 调用点与 `/api/data` 数据契约一致性（接口未实现降级为 warning） |
- **自动修复闭环**：`error-analyzer-agent.ts`（错误分类 `categorySummary`、fatal 标记、brokenFiles）→ `repair-agent.ts`（基于 `REPAIR_PROMPT` 生成补丁，`extractFileBlock` 提取文件内容；无 LLM 时返回原内容）。修复 Prompt 包含：用户需求 / Blueprint / 项目结构 / 错误日志 / 出错文件 / 最近修改。
- **真实执行**：默认静态分析；`allowRealExecution + projectDir` 时执行真实 `npm run build` / `npm run dev`。

### Auto-Debug 自愈循环
`packages/agent/src/auto-debug/`：`Generate → Run → Review → Fix → Run Again` 的自动调试闭环（`debug-loop.ts` / `reviewer.ts` / `fixer.ts`）。

### Runtime Agent（工具调用）
`packages/agent/src/runtime-agent/`：以 Tool Calling 方式调用 filesystem / terminal / browser 工具（`tools/`），实现运行时自动化操作。

### 组件注册表
所有可用组件的元信息与 props schema，供 Planner/Builder 使用（`packages/component-registry/src/index.ts`）。

### 沙箱（预览）
每个 app 对应一个独立 Vite Dev Server，工作区挂载于 `./workspaces/{appId}/`。

- **Docker 模式**（`SANDBOX_MODE=docker`，默认）：每个 app 一个 Docker 容器，工作区挂载到容器 `/app`，容器内 Vite 监听 5173，映射到主机端口。实现见 `local-docker-sandbox.ts`。
- **Node 模式**（`SANDBOX_MODE=node`）：直接在主机以子进程运行 `npx vite`，端口范围默认 `5173–5199`。实现见 `packages/server/src/sandbox/local-node-sandbox.ts`。
- **端口分配**：见 `packages/server/src/sandbox/port-allocator.ts`。
- **服务器启动清理**：`index.ts` 启动时会调用沙箱 `cleanup()`，清理服务器重启后遗留的孤儿 Vite 进程，避免端口错配导致预览显示旧内容。

### 预览桥（iframe 通信）
前端预览 iframe 通过 `postMessage` 与应用通信（HMR 状态、导航、构建错误、RPC）。实现见 `packages/web/src/hooks/use-preview-bridge.ts`。

### 模型 / AI Provider 管理
平台通过「模型」页面（`/models`）统一管理 LLM Provider，配置后即可在生成任务时选择模型。

**数据流与分层**：
```
React UI (ModelProviderPage / ProviderCard / ProviderForm ...)
     ↓
jotai Atoms (loadProviders / addProvider / updateProvider / testProvider / selectModel)
     ↓
Provider API Client (packages/web/src/lib/providers/api.ts)
     ↓
Backend /api/providers (routes/providers.ts)
     ↓
Provider Storage (providers/storage.ts → ~/.aikd/providers.json)
     ↓
LLM Provider (按所选配置动态实例化 OpenAICompatibleProvider)
     ↓
OpenAI Compatible /chat/completions
```

**关键点**：

1. **内置 Provider**：`providers/builtin.ts` 定义 5 个内置 Provider（DeepSeek/OpenAI/Anthropic/Gemini/Qwen），不允许删除；可通过「编辑」填入 key 使用。
2. **自定义 Provider**：支持任意 OpenAI Compatible API，`providers/storage.ts` 负责持久化。
3. **测试连接**：`providers/test.ts` 在**服务端**发起最小 `/chat/completions` 请求（`Hello`），返回友好的错误信息（API Key 无效 / Base URL 无法访问 / Model 不存在 / 连接超时）。
4. **API Key 安全**：key 仅存于服务端 `~/.aikd/providers.json`，API 返回时通过 `toPublicProvider` **脱敏**（只返回 `hasApiKey` 布尔值）；前端不持久化密钥，编辑时占位「已配置，留空保持不变」。
5. **模型选择**：首页任务表单模型下拉按「Provider / 模型」层级展示可用模型（`packages/web/src/components/task-form.tsx` 的 `ProviderModelSelect`）。
6. **动态 LLM**：任务以 `providerId::modelId` 格式保存 `selectedModel`，`routes/acp.ts` 的 `handleSessionPrompt` 通过 `createProviderFromModel` 按所选 Provider 配置动态创建 LLM Provider。

---

## 开发流程与常见任务

### 新建应用流程
0. （可选）用户先在「模型」页面配置 Provider 并选择模型
1. 用户在前端输入自然语言需求（模型下拉选中 `providerId::modelId`）→ 前端创建任务并调用 ACP `session/prompt`
2. Multi-Agent 编排生成：Requirement → Blueprint → Coding（Builder 确定性生成代码，写入 `app_models` 表与 `workspaces/{appId}`；**写入前会清理旧源码，避免旧文件残留**）
3. **自动测试闭环**：ApplicationTestAgent 执行五大维度测试 → 未达闸门（score ≥ 95）则 ErrorAnalyzer 分析 → RepairAgent 补丁修复 → 重测（≤ 5 轮）
4. 测试通过后启动/重建沙箱（总是销毁旧沙箱重新启动，确保加载最新代码）→ 进入 Preview（**Preview 必须是最后一步**）
5. 用户在预览中验证并创建版本（快照）

### 添加 / 修改组件
- 在 `packages/component-registry` 中定义新组件与 `propsSchema`
- 如组件有特殊渲染，更新 `packages/agent/src/builder.ts` 的模板逻辑

### 调试 Planner 输出
- 在本地触发 Planner（可通过后端路由或单元测试），将输出的 JSON 用 `packages/app-engine` 的验证器校验

### 排查常见问题
- **预览显示"未命名应用"**：通常是 LLM 调用失败/返回空（推理模型 token 不够）。检查 LLM API 配置与模型名。
- **预览显示旧/错误内容**：重启后端（会自动清理孤儿沙箱进程）；或重新生成应用（旧任务代码不会自动更新）。
- **`/api/*` 返回 `ECONNREFUSED`**：后端 3001 未启动。确认 `pnpm dev` 的后端是否正常监听 3001；若 `better-sqlite3` 原生模块缺失（`Could not locate the bindings file`），执行 `prebuild-install` 重新下载匹配 Node 版本的预编译二进制。

---

## 构建与发布

```bash
# 构建全部包（web + server）
pnpm build

# 仅构建 web 静态文件
pnpm --filter @aikd/web build

# 仅构建 server
pnpm build:server

# 启动 server（使用构建产物）
pnpm start
```

本地发布：`pnpm build` 后，`@aikd/server` 可提供 web 静态服务（`../web/dist`），或用 `serve` / `http-server` 提供静态站点。

---

## 数据库与持久化

- 使用 SQLite 单文件（`packages/server/data/app.db`），schema 位于 `packages/server/src/db/schema.ts`，仓储层位于 `packages/server/src/db/drizzle/`。
- **主要表**：
  - `users` — 用户；`local_credentials` — 本地密码凭据
  - `tasks` — 任务（即"应用"记录，含 `prompt`、`status`、`preview_url`、`sandbox_url`、`app_model_id` 等）
  - `app_models` — App Model JSON 快照（每次生成/修改创建新记录）
  - `app_versions` — 应用版本快照（关联 App Model 与 code hash）
  - `deployments` — 部署记录；`settings` — 键值设置
- 迁移：`pnpm db:generate` / `pnpm db:migrate` / `pnpm db:push` / `pnpm db:studio`

---

## 测试与验证

```bash
pnpm type-check   # 类型检查
pnpm format       # 格式化
pnpm format:check # 格式化检查
pnpm lint         # ESLint

# agent 包单元测试（vitest，含真实三案例：博客 / 商城后台 / 企业 CRM）
pnpm --filter @aikd/agent test
pnpm --filter @aikd/agent test:watch
```

agent 测试覆盖：Builder 生成正确性、Multi-Agent 编排、**应用测试与修复闭环**（悬空 import 定位、修复后重测通过、Patch-first、5 轮上限）、Auto-Debug、Runtime Agent 等。

推荐在 CI 中加入：`pnpm type-check`、`pnpm lint`、`pnpm --filter @aikd/agent test`，以及生成/构建工作流验证 `Builder` 输出。

---

## 贡献规范

- **提交信息格式**：`type(scope): description`
  示例: `feat(agent): add planner retry logic`
- **分支策略**：feature 分支 → PR 到 `master` → CI 校验通过后合并

---

## 安全与敏感信息

- 不要在仓库中提交 `LLM_API_KEY` 或任何密钥。将敏感信息放入 CI/环境变量或本地 `.env`（并确保 `.gitignore` 排除）。
- **Provider API Key**：各 Provider 的 key 保存在服务端 `~/.aikd/providers.json`（**不在版本控制内**，该文件位于用户主目录）。API 返回时一律脱敏，前端与浏览器存储均不持有明文 key。若需在生产环境加固，可替换 `packages/server/src/providers/storage.ts` 为加密存储（如 KMS / 数据库密文），不影响上层代码。

---

## 与 AIKD-V1-PLAN 的对应关系

本文档基于 [AIKD-V1-PLAN.md](AIKD-V1-PLAN.md) 的阶段与决策，已将计划要点浓缩为开发与运行说明。请以 Plan 为来源做阶段性重构与删除清单验证。

---

## 后续计划

- **模型能力增强**：接入更多 Provider 专属能力（函数调用 / 视觉 / 推理），支持流式输出在生成过程的实时展示
- **Provider 加密存储**：将服务端 `providers/storage.ts` 从明文 JSON 升级为加密存储（数据库密文 / KMS），进一步提升密钥安全
- **生成应用能力扩展**：使生成的应用不再只是简单的 web 页面，能够实现更完整的业务功能