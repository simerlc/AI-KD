// ─── Agent 管理系统（AgentManager）────────────────────────
//
// 负责统一管理所有 Agent：
// - 注册 / 注销 Agent
// - 按角色查找 Agent
// - 创建 Agent 运行时（AgentRuntime）
// - 记录每次 Agent 运行（AgentRunRecord），提供审计
// - 配合 MessageBus 实现 Agent 间 JSON 通信

import type {
  Agent,
  AgentContext,
  AgentMessage,
  AgentMessagePayload,
  AgentRole,
  AgentRunRecord,
} from './types'
import { AGENT_ROLES } from './types'
import { MessageBus } from './message-bus'
import { generateId } from '../utils'

export class AgentManager {
  private agents = new Map<AgentRole, Agent>()
  private runs = new Map<string, AgentRunRecord>()
  private bus: MessageBus

  constructor(bus?: MessageBus) {
    this.bus = bus ?? new MessageBus()
  }

  /** 注册一个 Agent（同角色只能注册一个，覆盖需先注销或直接用 replace） */
  register(agent: Agent): void {
    if (this.agents.has(agent.role)) {
      throw new Error(`[AgentManager] Agent "${agent.role}" 已注册`)
    }
    this.agents.set(agent.role, agent)
  }

  /** 注册或覆盖 */
  registerOrReplace(agent: Agent): void {
    this.agents.set(agent.role, agent)
  }

  /** 注销一个 Agent */
  unregister(role: AgentRole): void {
    this.agents.delete(role)
  }

  /** 获取指定角色的 Agent */
  get(role: AgentRole): Agent | undefined {
    return this.agents.get(role)
  }

  /** 必须获取到指定角色，否则抛错 */
  require(role: AgentRole): Agent {
    const agent = this.agents.get(role)
    if (!agent) throw new Error(`[AgentManager] 缺少 Agent: "${role}"`)
    return agent
  }

  /** 列出所有已注册的 Agent 角色 */
  listRoles(): AgentRole[] {
    return Array.from(this.agents.keys())
  }

  /** 校验是否已注册全部必需的 Agent */
  assertComplete(): void {
    const registered = new Set(this.agents.keys())
    // 核心 5 Agent 必需；runtime 为可选（需注入运行时后端）
    const coreRoles = AGENT_ROLES.filter((r) => r !== 'runtime')
    for (const role of coreRoles) {
      if (!registered.has(role)) {
        throw new Error(`[AgentManager] 尚未注册必需的 Agent: "${role}"`)
      }
    }
  }

  /** 获取消息总线 */
  getBus(): MessageBus {
    return this.bus
  }

  /** 创建一个 Agent 运行时（携带独立上下文） */
  createContext(
    ctx: Omit<AgentContext, 'onProgress'> & { onProgress?: (msg: AgentMessage) => void },
  ): AgentContext {
    return {
      ...ctx,
      onProgress: ctx.onProgress,
    }
  }

  /**
   * 运行指定角色的 Agent，记录运行结果。
   * @returns 该 Agent 的输出消息（已发布到总线）
   */
  async runAgent(
    role: AgentRole,
    input: AgentMessagePayload,
    ctx: AgentContext,
    replyTo?: string,
  ): Promise<AgentMessage> {
    const agent = this.require(role)
    const runId = generateId('run')
    const record: AgentRunRecord = {
      runId,
      role,
      startedAt: Date.now(),
      status: 'running',
    }
    this.runs.set(runId, record)

    try {
      // 发送输入消息（记录消息链）
      const inputMsg = this.bus.send(role, role, `${role}.execute` as never, input, replyTo)
      record.input = inputMsg

      const output = await agent.execute(input, ctx)
      const outputMsg = this.bus.send(role, role, `${role}.done` as never, output as never, inputMsg.id)

      record.output = outputMsg
      record.status = 'succeeded'
      record.finishedAt = Date.now()
      return outputMsg
    } catch (err) {
      record.status = 'failed'
      record.error = err instanceof Error ? err.message : String(err)
      record.finishedAt = Date.now()
      const errMsg = this.bus.send(role, '*', 'error', {
        message: record.error,
        detail: err,
      })
      throw err
    }
  }

  /** 获取全部运行记录 */
  getRuns(): AgentRunRecord[] {
    return Array.from(this.runs.values())
  }
}
