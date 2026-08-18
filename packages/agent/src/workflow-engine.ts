// ─── Workflow Engine ─────────────────────────────────────
//
// 工作流引擎：Trigger → Condition → Action。
//
// 建立在现有 Action Engine 之上：
//   - 动作执行复用 ActionEngine.execute()，不重新实现执行逻辑
//   - Workflow Engine 只负责：触发器匹配、条件求值、分支编排
//
// 触发器类型：record.created / record.updated / record.deleted /
//             button.click / form.submit
// 条件运算：== != > < >= <= + AND/OR/NOT
// 动作：引用 ActionSchema.id，复用 Action Engine

import type {
  ActionContext,
  ActionSchema,
  WorkflowCondition,
  WorkflowResult,
  WorkflowSchema,
  WorkflowStep,
  WorkflowStepResult,
} from '@aikd/shared'
import { ActionEngine } from './action-engine'
import { resolveObject } from './expression'

// ─── Workflow Engine ─────────────────────────────────────

export class WorkflowEngine {
  constructor(private actionEngine: ActionEngine) {}

  /**
   * 执行一个 Workflow。
   *
   * @param workflow 工作流定义
   * @param actions 动作定义列表（通过 id 引用）
   * @param context 执行上下文（表单/记录/用户等）
   */
  async execute(
    workflow: WorkflowSchema,
    actions: ActionSchema[],
    context: ActionContext = {},
  ): Promise<WorkflowResult> {
    const stepResults: WorkflowStepResult[] = []
    let error: string | undefined

    for (const step of workflow.steps) {
      const result = await this.executeStep(step, actions, context)
      stepResults.push(...this.flattenResults(result))

      // 若步骤失败，停止执行（除非是分支内的失败，可继续其他分支）
      const failed = result.find((r) => !r.success)
      if (failed && !error) {
        error = failed.error
      }
    }

    return {
      success: !error,
      stepResults,
      error,
      context,
    }
  }

  /** 执行单个步骤（动作或条件分支），返回结果列表 */
  private async executeStep(
    step: WorkflowStep,
    actions: ActionSchema[],
    context: ActionContext,
  ): Promise<WorkflowStepResult[]> {
    // 动作步骤
    if ('action' in step) {
      const action = actions.find((a) => a.id === step.action)
      if (!action) {
        return [{ success: false, error: `工作流引用了不存在的动作: ${step.action}` }]
      }
      const result = await this.actionEngine.execute(action, context)
      return [{ success: result.success, actionResult: result, error: result.error }]
    }

    // 条件分支步骤
    if ('condition' in step) {
      const branchTaken = evaluateCondition(step.condition, context)

      const branchSteps = branchTaken ? step.then : step.else ?? []
      const branchResults: WorkflowStepResult[] = []

      for (const branchStep of branchSteps) {
        const results = await this.executeStep(branchStep, actions, context)
        branchResults.push(...results)
      }

      // 标记分支
      if (branchResults.length > 0) {
        branchResults[0].branch = branchTaken ? 'then' : 'else'
      }

      return branchResults
    }

    return [{ success: false, error: '未知的步骤类型' }]
  }

  /** 展平嵌套结果（辅助，保持结果扁平） */
  private flattenResults(results: WorkflowStepResult[]): WorkflowStepResult[] {
    return results
  }
}

// ─── 触发器匹配 ──────────────────────────────────────────

/**
 * 判断一个 Workflow 是否匹配给定的触发器。
 * 供外部在 record 创建/更新/删除、按钮点击、表单提交时调用。
 */
export function matchWorkflowTrigger(workflow: WorkflowSchema, triggerType: WorkflowSchema['trigger']['type'], tableId?: string): boolean {
  return workflow.trigger.type === triggerType && (!workflow.trigger.tableId || !tableId || workflow.trigger.tableId === tableId)
}

// ─── 条件求值 ────────────────────────────────────────────

/**
 * 求值条件表达式。
 * 支持比较运算（== != > < >= <=）和逻辑运算（AND/OR/NOT）。
 * field 支持变量表达式（如 {{record.status}}、{{form.approved}}）。
 */
export function evaluateCondition(condition: WorkflowCondition, context: ActionContext): boolean {
  // 逻辑组合
  if ('logic' in condition) {
    const logic = condition.logic
    const subConditions = condition.conditions

    switch (logic) {
      case 'AND':
        return subConditions.every((c) => evaluateCondition(c, context))
      case 'OR':
        return subConditions.some((c) => evaluateCondition(c, context))
      case 'NOT':
        return !evaluateCondition(subConditions[0], context)
      default:
        return false
    }
  }

  // 叶子条件：比较
  const leftValue = resolveValue(condition.field, context)
  const rightValue = resolveValue(condition.value, context)

  return compare(leftValue, rightValue, condition.op)
}

/** 解析字段值（支持 {{var}} 变量表达式） */
function resolveValue(value: unknown, context: ActionContext): unknown {
  if (typeof value === 'string' && value.includes('{{')) {
    return resolveObject(value, context)
  }
  return value
}

/** 比较两个值 */
function compare(left: unknown, right: unknown, op: string): boolean {
  switch (op) {
    case '==':
      return looseEqual(left, right)
    case '!=':
      return !looseEqual(left, right)
    case '>':
      return compareNumeric(left, right) > 0
    case '<':
      return compareNumeric(left, right) < 0
    case '>=':
      return compareNumeric(left, right) >= 0
    case '<=':
      return compareNumeric(left, right) <= 0
    default:
      return false
  }
}

/** 宽松相等（字符串化比较，支持数字/布尔） */
function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // 数字字符串比较
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b)
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b
  // 布尔比较
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return String(a) === String(b)
  }
  return String(a) === String(b)
}

/** 数值比较（支持数字和数字字符串） */
function compareNumeric(a: unknown, b: unknown): number {
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  // 非数值则字符串比较
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  return sa < sb ? -1 : sa > sb ? 1 : 0
}
