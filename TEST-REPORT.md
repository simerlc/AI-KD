# AI快搭 用户实际使用流程测试报告

> 测试日期：2026-08-20
> 测试范围：接入真实大模型（deepseek-v4-flash），验证完整生成流程规范、Skill 系统、Design System、测试闭环的实际效果
> 测试方式：通过 `OpenAICompatibleProvider` + `LLMClientAdapter` 接入真实大模型，驱动 `MultiAgentOrchestrator` 完整流水线

---

## 一、测试目标

验证四个核心问题：

1. **接入的大模型能否按现有流程规范生成应用**（Requirement → Blueprint → Coding）
2. **新增的 Skill System 是否有效**（技能识别 + 上下文注入）
3. **新增的 Design System 是否有效**（生成应用是否遵守设计规范）
4. **生成的应用是否按规范要求生成**（测试闭环 + Design Review）

---

## 二、测试环境

| 项目 | 配置 |
|------|------|
| 大模型 | deepseek-v4-flash（阿里云 DashScope 兼容接口） |
| 测试方式 | 真实 LLM 调用（非 mock） |
| 测试脚本 | `packages/server/scripts/real-llm-e2e.ts` |
| 测试用例 | 3 个真实业务场景 |

---

## 三、测试用例与结果

| 用例 | 需求 | 结果 | 生成文件数 | 测试 | Design Review |
|------|------|------|-----------|------|--------------|
| 在线商城 | 商品列表/详情/购物车/下单 | ✅ 成功 | 16 | passed (100) | **100 通过** |
| 客户管理系统 | 客户列表/详情/跟进记录 | ✅ 成功 | 11 | passed (100) | **100 通过** |
| 请假审批系统 | 申请/审批流程 | ✅ 成功 | 14 | passed (100) | **100 通过** |

**总用例：3，成功：3，失败：0（100% 通过）**

### 技能识别结果

| 用例 | 识别到的技能 |
|------|-------------|
| 在线商城 | `ecommerce, frontend, ui-design, responsive, auth, admin-panel, approval-workflow` |
| 客户管理系统 | `crm, frontend, ui-design, admin-panel, responsive` |
| 请假审批系统 | `approval-workflow, frontend, ui-design, admin-panel, responsive, hr-management` |

**结论**：Skill Selector 正确识别了业务技能（ecommerce/crm/approval-workflow）+ 基础技能（frontend/ui-design）+ 增强技能（responsive/admin-panel/auth），技能识别**有效**。

---

## 四、发现的问题与修复

### 问题 1（严重）：真实 LLM 生成的 Blueprint 因枚举值不合法而失败

**现象**：大模型生成 `crud: "read"`/`"detail"`/`"none"`、`pageType: "cart"` 等同义枚举值，校验器严格拒绝，导致"客户管理""请假审批"两个用例生成失败（重试 3 次后抛错）。

**根因**：真实 LLM 输出存在枚举同义词变体，校验器 `VALID_CRUD` / `VALID_PAGE_TYPES` 只接受严格枚举，缺乏宽容归一化。

**修复**：
1. `blueprint/validator.ts` 新增 `normalizeCrud()` / `normalizePageType()` 归一化函数，将 `read→list`、`detail→get`、`cart→custom` 等常见同义词映射到合法值，并就地修正。
2. `blueprint/generator.ts` 的 Prompt 增加「枚举值约束」章节，明确列出合法枚举值，降低 LLM 犯错概率。

**修复后**：3 个用例全部生成成功（此前 2 个失败）。

### 问题 2（中等）：Builder 生成的代码含硬编码颜色，违反 Design System 规范

**现象**：Design Review 报告"存在 5 处硬编码颜色"（`#f0f0f0`、`#999999`、`#333333` 等），Design Review 得分仅 81-89（<90 未达标）。

**根因**：`builder.ts` 的组件渲染代码（Detail/Table/StatCard/Login/Header/Modal/动态表单）使用了硬编码的内联颜色，与"所有颜色来自 Design Token"的规范矛盾。

**修复**：将 `builder.ts` 中所有硬编码颜色替换为 `var(--ds-color-*)` Design Token 引用，原生 `<table>` 替换为 `className="ds-table"`，原生表单 input 替换为 `ds-input`，Modal 改用 `ds-modal-*` 结构，StatCard/Detail 改用 `ds-card`。

**修复后**：硬编码颜色问题消失，Design Review 得分提升至 100。

### 问题 3（轻微）：Design Review 的 h1 信息层级判定逻辑有误

**现象**：跨页面统计 h1 总数，多页面应用（每页各有一个 h1 是正常的）被误判为"信息层级不清晰"。

**修复**：`design-review.ts` 将判定逻辑从"全应用 h1 总数 > 3"改为"单个页面文件内 h1 > 1 才判定层级混乱"，符合正确语义。

---

## 五、结论

### ✅ 验证通过项

1. **流程规范生效**：Requirement → Skill 识别 → Blueprint → Coding → 测试 → Design Review 全链路正常运行
2. **Skill System 有效**：正确识别业务/基础/增强技能，上下文注入生效
3. **Design System 有效**：生成应用注入 Design Tokens，组件使用 `ds-*` 规范类名
4. **测试闭环生效**：3 个用例均通过 ApplicationTestAgent（score 100）
5. **Design Review 生效**：3 个用例均 100 分达标

### 🔧 本次修复的代码改动

| 文件 | 改动 |
|------|------|
| `packages/agent/src/multi-agent/blueprint/validator.ts` | 新增 crud/pageType 宽容归一化 |
| `packages/agent/src/multi-agent/blueprint/generator.ts` | Prompt 增加枚举值约束 |
| `packages/agent/src/builder.ts` | 硬编码颜色 → Design Token，原生元素 → ds-* 组件 |
| `packages/agent/src/design-system/design-review.ts` | 修正 h1 层级判定逻辑 |

### 📊 最终验证

- 真实 LLM 端到端：**3/3 用例成功，测试 100 分，Design Review 100 分**
- 单元测试：**231 passed**（agent 包全量）
- 类型检查：**0 错误**
- Lint：**0 错误**

---

## 六、遗留说明

1. **Chart 数据系列色板**（`['#1677ff', '#52c41a', ...]`）保留硬编码——这是数据可视化的合理多色系，用于区分数据系列，行业惯例允许。
2. **测试脚本保留**：`packages/server/scripts/real-llm-e2e.ts` 作为可复用的真实 LLM 端到端测试工具，后续可扩展更多用例。
3. **真实沙箱测试**（`npm run build` / `npm run dev`）默认关闭，如需验证运行时行为，可传入 `allowRealTest: true` + `testProjectDir`。
