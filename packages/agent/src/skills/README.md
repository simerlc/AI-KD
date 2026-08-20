# AI Skill System — 技能系统文档

AI快搭 技能系统，让大模型在生成应用前根据任务需求自动识别并加载相关开发技能，调用专业技能生成更专业、完整、差异化的应用。

## 设计目标

用户输入「生成一个在线商城」，AI 不再直接写代码，而是执行：

```
需求分析 → Skill识别 → 加载相关技能 → 生成应用方案 → 代码开发 → 测试优化
```

## 目录结构

```
skills/
├── types.ts           # Skill / SkillSelection / SkillContext / SkillFeedback 类型
├── builtin.ts         # 内置技能库（15 个技能）
├── registry.ts        # Skill Registry（技能注册中心）
├── skill-selector.ts  # Skill Selector Agent（需求 → 技能列表）
├── context-loader.ts  # Skill Context Loader（生成开发上下文）
├── feedback.ts        # Skill Feedback Loop（测试反馈进化技能）
└── index.ts           # 统一入口
```

## 技能分类

| 分类 | 说明 | 技能 |
|------|------|------|
| foundation（基础） | 所有应用必需 | frontend、ui-design、responsive |
| business（业务） | 特定应用类型 | ecommerce、dashboard、crm、auth、admin-panel、approval-workflow、ticket-workorder、hr-management、project-management、inventory、data-collection、booking-reservation、content-showcase、expense-finance |
| enhancement（增强） | 高级能力 | database、api、animation、testing、ai-feature、payment、analytics |

## 企业业务技能（对齐飞书妙搭常用场景）

飞书妙搭的核心场景：审批流、工单流转、人事管理、项目追踪、库存管理、数据收集表单、预约点餐、内容展示、报销财务等，均已内置为技能：

| 技能 | ID | 适用场景 |
|------|-----|---------|
| 审批流程 | approval-workflow | 请假/报销/采购/合同审批（发起→审批→归档） |
| 工单管理 | ticket-workorder | 问题工单流转（发现→处理→解决） |
| 人事管理 | hr-management | 员工花名册/入职离职/考勤 |
| 项目管理 | project-management | 项目/任务/里程碑跟踪 |
| 库存管理 | inventory | 商品/物料出入库与预警 |
| 数据收集与表单 | data-collection | 问卷/登记/投票采集 |
| 预约与点餐 | booking-reservation | 预约/订座/点餐系统 |
| 内容展示 | content-showcase | 服务介绍/活动宣传/产品手册/电子菜单 |
| 报销与财务 | expense-finance | 费用报销/付款申请/财务记录 |

## Skill 结构

每个 Skill 包含（对应 skill.md）：

- `description` — 技能说明
- `triggers` — 适用场景（关键词，供 SkillSelector 匹配）
- `rules` — 开发规范
- `bestPractices` — 最佳实践
- `components` — 组件推荐
- `prohibitions` — 禁止事项
- `examples` — 示例代码
- `dependencies` — 依赖的其他技能
- `version` — 版本号（Feedback Loop 进化追踪）

## 各模块职责

### 1. Skill Registry（`registry.ts`）

技能注册中心，支持注册/查找/分类检索/更新。`update()` 自动递增版本号。

### 2. Skill Selector（`skill-selector.ts`）

输入用户需求，输出技能列表。匹配策略：关键词打分 + 依赖展开 + 基础技能兜底。

```
"创建一个电商网站" → [ecommerce, frontend, ui-design, responsive, ...]
"创建企业后台"     → [admin-panel, dashboard, frontend, ui-design, ...]
```

### 3. Skill Context Loader（`context-loader.ts`）

代码生成前读取相关技能，生成「开发上下文」注入 Code Agent。上下文按「基础 + 业务 + 增强」分组，包含每个技能的规范/最佳实践/组件推荐/禁止事项。

### 4. Skill Feedback Loop（`feedback.ts`）

应用生成后根据测试结果更新技能，让技能不断进化。

例如：发现「大量商城页面缺少搜索优化」→ 更新 `ecommerce` 技能，增加「搜索规范、过滤组件、排序逻辑」。

## 接入流程（Orchestrator）

```
Requirement（需求分析）
    ↓
Skill Selector（识别技能）
    ↓
Skill Context Loader（加载技能，生成开发上下文）
    ↓
Blueprint（生成应用方案，注入技能上下文）
    ↓
Coding（代码开发）
    ↓
Testing（测试优化）
    ↓
Skill Feedback（测试反馈 → 技能进化）
```

最终目标：让 AI快搭 拥有自己的工程知识库，从「AI 写代码」升级为「AI 调用专业技能开发软件」。
