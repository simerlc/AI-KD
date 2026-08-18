// ─── Workflow Schema 类型定义 ────────────────────────────
//
// Workflow Engine 的核心数据结构：
//   Trigger → Condition → Action（复用 Action Engine）
//
// Workflow 描述一个业务流程（如请假审批），由触发器启动，
// 经过条件分支，执行一系列 Action。

import type { ActionContext } from './app-schema'
import type { ActionSchema } from './app-schema'

// ─── Trigger ─────────────────────────────────────────────

/** 工作流触发器类型 */
export type WorkflowTriggerType =
  /** 记录创建 */
  | 'record.created'
  /** 记录更新 */
  | 'record.updated'
  /** 记录删除 */
  | 'record.deleted'
  /** 按钮点击 */
  | 'button.click'
  /** 表单提交 */
  | 'form.submit'

/** 工作流触发器定义 */
export interface WorkflowTrigger {
  /** 触发器类型 */
  type: WorkflowTriggerType
  /** 关联的表 ID（record.* 触发器时） */
  tableId?: string
  /** 关联的组件/按钮 ID（button.click 时） */
  componentId?: string
  /** 关联的表单 ID（form.submit 时） */
  formId?: string
}

// ─── Condition ───────────────────────────────────────────

/** 比较运算符 */
export type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<='

/** 逻辑运算符 */
export type LogicalOperator = 'AND' | 'OR' | 'NOT'

/**
 * 条件表达式（可嵌套，支持 AND/OR/NOT 组合）。
 */
export type WorkflowCondition =
  /** 叶子条件：比较两个值 */
  | {
      /** 左值（字段路径或变量表达式，如 {{record.status}}、{{form.approved}}） */
      field: string
      /** 比较运算符 */
      op: ComparisonOperator
      /** 右值（常量或变量表达式） */
      value: unknown
    }
  /** 逻辑组合 */
  | {
      /** 逻辑运算符 */
      logic: LogicalOperator
      /** 子条件（AND/OR 时为多个，NOT 时为一个） */
      conditions: WorkflowCondition[]
    }

// ─── Workflow 步骤 ───────────────────────────────────────

/** 工作流步骤：一个动作或一个条件分支 */
export type WorkflowStep =
  /** 执行单个动作 */
  | { action: string }
  /** 条件分支 */
  | {
      condition: WorkflowCondition
      /** 条件为真时执行的步骤 */
      then: WorkflowStep[]
      /** 条件为假时执行的步骤 */
      else?: WorkflowStep[]
    }

// ─── Workflow ────────────────────────────────────────────

/**
 * Workflow Schema：业务流程定义。
 * 由触发器启动，按步骤执行（步骤可含条件分支）。
 * 动作通过 ActionSchema.id 引用，复用 Action Engine 执行。
 */
export interface WorkflowSchema {
  /** 工作流唯一 ID */
  id: string
  /** 工作流名称 */
  name: string
  /** 触发器 */
  trigger: WorkflowTrigger
  /** 步骤列表（顺序执行） */
  steps: WorkflowStep[]
  /** 描述 */
  description?: string
  /** 是否启用 */
  enabled?: boolean
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ─── Workflow 执行结果 ───────────────────────────────────

/** 单个步骤执行结果 */
export interface WorkflowStepResult {
  /** 步骤执行是否成功 */
  success: boolean
  /** 执行的 Action 结果（若步骤是动作） */
  actionResult?: { success: boolean; error?: string; data?: unknown }
  /** 分支结果（若步骤是条件分支） */
  branch?: 'then' | 'else'
  /** 错误信息 */
  error?: string
}

/** Workflow 执行结果 */
export interface WorkflowResult {
  /** 整体是否成功 */
  success: boolean
  /** 执行的步骤结果列表 */
  stepResults: WorkflowStepResult[]
  /** 第一个错误 */
  error?: string
  /** 执行上下文（可能被动作更新） */
  context?: ActionContext
}
