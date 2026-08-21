# AI快搭 (AIKD)

> 通过自然语言生成 App Model / Blueprint → Multi-Agent 生成 React 应用，自动测试与修复后支持本地沙箱预览与版本管理。

AI快搭（AIKD）是一个基于 TypeScript 的 pnpm monorepo 低代码搭建平台。用户输入自然语言需求，系统经 **Multi-Agent 编排**（需求分析 → Blueprint → 代码生成）产出 React + Vite 应用，生成后自动执行**全功能测试与自动修复闭环**（五大维度校验，未达标准自动修复并重测，最多 5 轮），通过后再进入本地沙箱实时预览。

## 文档

| 文档 | 说明 |
|------|------|
| [AIKD-V1-PLAN.md](AIKD-V1-PLAN.md) | V1 产品规格与实施计划（最高优先级需求文档） |
| [DEVELOPER.md](DEVELOPER.md) | 开发与运行说明（环境、架构、调试、构建、V1.1 迭代记录） |
| [NOTICE](NOTICE) | 开源 / 许可证声明 |

## 仓库结构

```
AIKD-V1/
├── AIKD-V1-PLAN.md        # V1 产品规格与实施计划
├── DEVELOPER.md           # 开发与运行说明
├── NOTICE                 # 许可证声明
├── package.json           # 根 workspace 脚本（dev / build / lint / type-check）
├── pnpm-workspace.yaml    # workspace 包声明
├── tsconfig.json          # 全局 TS 配置
├── scripts/               # 仓库级脚本（初始化、构建、部署）
└── packages/
    ├── web/               # @aikd/web    前端（React + Vite，对话驱动的迭代修改预览）
    ├── server/            # @aikd/server 后端（Hono + SQLite + 沙箱 + Provider 管理）
    ├── shared/            # @aikd/shared 共享类型与协议定义（含 App Model V1.1 高级特性）
    ├── app-engine/        # @aikd/app-engine App Model schema / 校验 / 版本 / 模板
    ├── component-registry/# @aikd/component-registry 内置组件 + props schema + Ant Design 适配
    └── agent/             # @aikd/agent  Multi-Agent 编排（LLM 驱动 Builder）+ 自动测试与修复 + UI 视觉评审 + 增量迭代
```

各包详细职责与目录树见 [DEVELOPER.md · 仓库结构](DEVELOPER.md#仓库结构)。

## 技术栈

- **Monorepo**：pnpm workspace + TypeScript
- **前端**：React 19 + Vite
- **UI**：**Ant Design**（antd）+ styled-components + react-router-dom v6
- **状态管理**：**Zustand**（应用内全局状态）
- **网络**：axios / fetch（统一封装到 `src/api.ts`）
- **后端**：Hono + `@hono/node-server`（Node ≥ 22）
- **数据库**：SQLite（better-sqlite3 + drizzle-orm）
- **LLM**：OpenAI 兼容接口（兼容 DeepSeek / OpenAI / Anthropic / Gemini / Qwen / 自定义 OpenAI Compatible Provider）
- **模型管理**：内置 Provider + 自定义 Provider，支持 API Key 配置、连接测试、动态切换与持久化
- **测试**：Vitest（agent 单元测试）、**Playwright**（UI 视觉评审截图）、**axe-core**（可访问性）
- **沙箱预览**：Node 本地子进程（默认）或 Docker 容器，每应用独立 Vite Dev Server

## 核心能力

- **自然语言生成应用**：Multi-Agent 编排（需求分析 → Blueprint → 代码生成），产出 React + Vite 应用
- **LLM 驱动代码生成**：Builder 生成多文件、工程化代码（函数组件 + antd + Zustand + axios + styled-components + react-router v6），带静态完整性校验与确定性兜底
- **自动测试与修复闭环**：五大维度校验，未达标自动修复并重测（最多 5 轮）
- **UI 视觉评审**：Playwright 截图（或静态规则降级）对布局/色彩/字体/间距/操作反馈打分，低于阈值自动回传 Builder 优化（≤2 轮）
- **对话驱动的迭代修改**：在聊天框继续输入修改指令即可增量更新应用（保留主题与数据源），完成后自动刷新预览

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 初始化（生成 .env 模板）
node scripts/init.mjs

# 3. 启动开发环境（前后端并行）
pnpm dev

# 单独启动前端 / 后端
pnpm --filter @aikd/web dev
pnpm --filter @aikd/server dev
```

环境变量（LLM、端口、沙箱等）在 `packages/server/.env` 中配置，详见 [DEVELOPER.md · 环境变量](DEVELOPER.md#环境变量)。

## 模型配置（AI Provider）

平台支持在「模型」页面（`/models`）统一管理 LLM Provider，配置后即可在生成任务时选择对应模型。

### 内置 Provider

默认内置 5 个 Provider，可通过「编辑」填入 API Key / Base URL / 模型名后使用：

- **DeepSeek** (`deepseek`)
- **OpenAI** (`openai`)
- **Anthropic** (`anthropic`)
- **Google Gemini** (`gemini`)
- **Qwen** (`qwen`)

内置 Provider 不允许删除。

### 自定义 Provider

支持配置任意 **OpenAI Compatible API**（`POST {baseUrl}/chat/completions`）：

| 字段 | 说明 |
|------|------|
| 名称 | 自定义 Provider 显示名 |
| API Base URL | OpenAI 兼容端点，如 `https://api.deepseek.com/v1` |
| API Key | 服务端存储，前端不持久化明文 |
| 模型 | 模型名称，如 `deepseek-chat` |

### 配置持久化

- Provider 配置保存在 **服务端**（`~/.aikd/providers.json`），由 `/api/providers` 提供 CRUD 与测试接口
- API Key 以明文仅存于服务端文件，**API 返回时脱敏**（只返回 `hasApiKey` 布尔值），前端不持久化密钥
- 刷新页面后配置不丢失

### 模型选择与生成

- 首页任务表单的模型下拉会按「Provider / 模型」层级展示所有可用模型
- 选中的模型以 `providerId::modelId` 格式随任务提交
- 后端按所选 Provider 的配置动态创建 LLM Client，业务代码不感知具体 Provider 实现

## 常用脚本

```bash
pnpm dev          # 前后端并行开发
pnpm build        # 构建全部包（web + server）
pnpm start        # 启动 server（使用构建产物）
pnpm type-check   # 类型检查
pnpm lint         # ESLint
pnpm --filter @aikd/agent test   # agent 单元测试（生成/LLM Builder/测试闭环/UI 评审/增量迭代等）
pnpm db:studio    # 打开 drizzle-studio 查看数据库
```

## 提交规范

```
type(scope): description

type: feat/fix/docs/refactor/chore
scope: aikd|agent|app-engine|component-registry|web|server
```

示例：`feat(agent): add planner retry logic`

详见 [AIKD-V1-PLAN.md · 提交规范](AIKD-V1-PLAN.md#11-提交规范)。
