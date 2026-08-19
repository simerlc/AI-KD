// ─── MultiAgentOrchestrator ───────────────────────────────
//
// 编排 5 个 Agent 的完整流水线，通过 MessageBus 以 JSON 消息通信：
//
//   Requirement → Blueprint → Coding → Review ──通过──→ Done
//                                     │
//                                     └─失败→ Fix → Review（最多 maxFixRounds 轮）
//
// 每个 Agent 独立运行，通过 AgentManager 统一管理并记录运行日志。

import type {
  AgentContext,
  AgentMessage,
  AgentRole,
  BlueprintProducedPayload,
  CodingProducedPayload,
  FixProducedPayload,
  MultiAgentResult,
  ProgressPayload,
  RequirementAnalyzedPayload,
  ReviewFailedPayload,
  ReviewOutput,
} from './types'
import type { AppModel, AppType, Blueprint } from '@aikd/shared'
import type { LLMClient } from '../types'
import { AgentManager } from './agent-manager'
import { MessageBus } from './message-bus'
import { RequirementAgent } from './agents/requirement'
import { BlueprintAgent } from './agents/blueprint'
import { CodingAgent } from './agents/coding'
import { ReviewAgent } from './agents/review'
import { FixAgent } from './agents/fix'
import { blueprintToAppModel } from './blueprint/convert'
import { checkIntegrity } from './blueprint/integrity-checker'
import {
  ApplicationTestAgent,
  ErrorAnalyzerAgent,
  RepairAgent,
  type ApplicationTestResult,
} from './tester'

export interface MultiAgentRunOptions {
  /** 用户需求 */
  prompt: string
  /** 会话/任务 ID */
  sessionId?: string
  /** 应用 ID */
  appId?: string
  /** 应用类型 */
  appType?: AppType
  /** 应用名称 */
  appName?: string
  /** 修改模式：已有 App Model */
  existingAppModel?: AppModel
  /** 修改模式：已有 Blueprint（用于在原蓝图上做最小化迭代） */
  existingBlueprint?: Blueprint
  /** 多轮对话历史 */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** 进度回调（接收 JSON 消息） */
  onMessage?: (msg: AgentMessage) => void
  /** 中止信号 */
  signal?: AbortSignal
  /** Fix 循环最大轮数（默认 3） */
  maxFixRounds?: number
  /** 应用测试：是否允许执行真实 shell（npm run build / npm run dev） */
  allowRealTest?: boolean
  /** 应用测试：真实项目目录（allowRealTest 时必填） */
  testProjectDir?: string
  /** 应用测试：自动修复最大轮数（默认 5，最多自动修复 5 轮） */
  maxRepairRounds?: number
}

export class MultiAgentOrchestrator {
  private manager: AgentManager
  private bus: MessageBus
  private llm: LLMClient

  constructor(llm: LLMClient, bus?: MessageBus) {
    this.llm = llm
    this.bus = bus ?? new MessageBus()
    this.manager = new AgentManager(this.bus)
    this.registerDefaultAgents()
  }

  /** 注册默认的 5 个 Agent */
  private registerDefaultAgents(): void {
    this.manager.registerOrReplace(new RequirementAgent())
    this.manager.registerOrReplace(new BlueprintAgent(this.llm))
    this.manager.registerOrReplace(new CodingAgent(this.llm))
    this.manager.registerOrReplace(new ReviewAgent(this.llm))
    this.manager.registerOrReplace(new FixAgent(this.llm))
  }

  /** 运行完整 Multi-Agent 流水线 */
  async run(options: MultiAgentRunOptions): Promise<MultiAgentResult> {
    const sessionId = options.sessionId ?? 'session'
    const maxFixRounds = options.maxFixRounds ?? 3
    const onMessage = options.onMessage

    // 订阅消息：转发给 onMessage 回调
    const unsubscribe = this.bus.subscribe((msg) => {
      onMessage?.(msg)
    })

    try {
      const ctx: AgentContext = {
        sessionId,
        llm: this.llm,
        appId: options.appId,
        signal: options.signal,
        onProgress: (msg) => {
          // 进度消息已经通过 MessageBus 广播，这里无需重复处理
          void msg
        },
      }

      // ── 1. Requirement ────────────────────────────────
      const requirementInput: RequirementAnalyzedPayload = {
        prompt: options.prompt,
        summary: '',
        appType: options.appType ?? 'web',
        appName: options.appName,
        features: [],
        entities: [],
        existingAppModel: options.existingAppModel,
        existingBlueprint: options.existingBlueprint,
        history: options.history,
      }
      const requirementMsg = await this.manager.runAgent(
        'requirement',
        requirementInput,
        ctx,
      )
      const requirement = requirementMsg.payload as RequirementAnalyzedPayload

      // ── 2. Blueprint ──────────────────────────────────
      const blueprintMsg = await this.manager.runAgent(
        'blueprint',
        requirement,
        ctx,
        requirementMsg.id,
      )
      const blueprintOutput = blueprintMsg.payload as BlueprintProducedPayload
      let currentBlueprint: Blueprint = blueprintOutput.blueprint

      // ── 3~5. Coding → Review ↔ Fix 循环 ────────────────
      let appModel: AppModel = blueprintToAppModel(currentBlueprint, options.appId)
      let files: Array<{ path: string; content: string }> = []
      let review: { errors: string[]; warnings: string[]; suggestions: string[] } = {
        errors: [],
        warnings: [],
        suggestions: [],
      }
      let retries = 0

      let fixMsg: AgentMessage | undefined
      // Patch 优先：Blueprint 未变更时，沿用 Fix 产出的文件，不整项目重生成
      let blueprintDirty = true

      for (let round = 0; round <= maxFixRounds; round++) {
        if (options.signal?.aborted) throw new Error('MultiAgentOrchestrator aborted')

        let coding: CodingProducedPayload
        let codingMsgId: string

        if (blueprintDirty) {
          // Blueprint 首次产出或发生结构变更 → 由 Coding 依据合法 Blueprint 生成
          const codingMsg = await this.manager.runAgent(
            'coding',
            {
              blueprint: currentBlueprint,
              notes: '',
              // 关键：透传需求上下文，否则生成前检查无法做功能覆盖度校验
              requirementFeatures: requirement.features,
              requirementEntities: requirement.entities,
            } as BlueprintProducedPayload,
            ctx,
            round === 0 ? blueprintMsg.id : fixMsg?.id,
          )
          coding = codingMsg.payload as CodingProducedPayload
          codingMsgId = codingMsg.id
          files = coding.files
          appModel = coding.appModel
          blueprintDirty = false
        } else {
          // Patch 修复路径：保留 Fix 的增量修改，不重新生成整个项目。
          // 但必须对打过补丁的文件重新做完整性检查，否则修复引入的新
          // import/组件问题会被漏过。
          coding = {
            files,
            blueprint: currentBlueprint,
            appModel,
            integrity: checkIntegrity(files),
            requirementFeatures: requirement.features,
          }
          codingMsgId = fixMsg?.id ?? blueprintMsg.id
        }

        // Review
        const reviewMsg = await this.manager.runAgent('review', coding, ctx, codingMsgId)
        const reviewOutput = reviewMsg.payload as ReviewOutput

        if (reviewOutput.passed) {
          review = { errors: [], warnings: [], suggestions: [] }
          break
        }

        const failed = reviewOutput as ReviewFailedPayload
        review = {
          errors: failed.errors,
          warnings: failed.warnings,
          suggestions: failed.suggestions,
        }

        // Fix
        retries++
        if (round < maxFixRounds) {
          fixMsg = await this.manager.runAgent('fix', failed, ctx, reviewMsg.id)
          const fixOutput = fixMsg.payload as FixProducedPayload
          // Patch 优先：直接采用 Fix 的增量修复结果
          if (Array.isArray(fixOutput.files) && fixOutput.files.length > 0) {
            files = fixOutput.files
          }
          // 仅当确实需要结构变更时，才重新触发 Blueprint（并允许 Coding 重生成）
          if (fixOutput.requiresBlueprintChange) {
            const blueprintUpdate = await this.manager.runAgent(
              'blueprint',
              {
                ...requirement,
                existingAppModel: appModel,
                existingBlueprint: currentBlueprint,
                blueprintChangeRequest: fixOutput.changeRequest,
              } as RequirementAnalyzedPayload,
              ctx,
              fixMsg.id,
            )
            currentBlueprint = (blueprintUpdate.payload as BlueprintProducedPayload).blueprint
            appModel = blueprintToAppModel(currentBlueprint, options.appId)
            blueprintDirty = true
          }
        }
      }

      // ── 6. 应用测试 Agent（生成后必须测试，禁止直接进入 Preview）──
      const testAgent = new ApplicationTestAgent()
      const errorAnalyzer = new ErrorAnalyzerAgent()
      const repairAgent = new RepairAgent(this.llm)
      const maxRepairRounds = options.maxRepairRounds ?? 5

      let testResult: ApplicationTestResult = await testAgent.test(files, currentBlueprint, {
        allowRealExecution: options.allowRealTest,
        projectDir: options.testProjectDir,
        round: 1,
      })
      this.bus.send('tester', '*', 'test.result', {
        round: 1,
        status: testResult.status,
        score: testResult.score,
        errors: testResult.errors.length,
      })

      let repairRounds = 0
      let repairLog: string[] = []
      let lastChanged: string[] = []

      // 测试失败 → 错误分析 → 反馈 LLM → 修复 → 重新测试（最多 5 轮）
      while (testResult.status === 'failed' && repairRounds < maxRepairRounds) {
        repairRounds++
        const repairCtx = errorAnalyzer.analyze(testResult, {
          requirement: options.prompt,
          blueprint: currentBlueprint,
          files,
          recentChanges: lastChanged,
          round: repairRounds,
        })
        if (!repairCtx) break // 无错误可分析（理论上不会发生）

        this.bus.send('tester', '*', 'test.repair.start', {
          repairRound: repairRounds,
          brokenFiles: repairCtx.brokenFiles,
          fatal: repairCtx.fatal,
        })

        const repair = await repairAgent.repair(repairCtx, files)
        files = repair.files
        lastChanged = repair.changedFiles
        appModel = blueprintToAppModel(currentBlueprint, options.appId)
        repairLog.push(repair.note)

        this.bus.send('tester', '*', 'test.repair.done', {
          repairRound: repairRounds,
          changedFiles: repair.changedFiles,
          note: repair.note,
        })

        // 重新测试
        testResult = await testAgent.test(files, currentBlueprint, {
          allowRealExecution: options.allowRealTest,
          projectDir: options.testProjectDir,
          round: repairRounds + 1,
        })
        this.bus.send('tester', '*', 'test.result', {
          round: repairRounds + 1,
          status: testResult.status,
          score: testResult.score,
          errors: testResult.errors.length,
        })
      }

      const testPassed = testResult.status === 'passed'

      // ── 完成：仅测试通过的应用才允许进入 Preview ──────────
      this.bus.send('tester', '*', 'test.done', {
        note: testPassed
          ? '应用测试通过，允许进入 Preview'
          : `应用测试未通过（已达 ${maxRepairRounds} 轮修复上限），禁止进入 Preview`,
        previewAllowed: testPassed,
      })

      return {
        appModel,
        files,
        // passed 判据升级：Review 通过 + 应用测试通过 才允许 Preview
        passed: testPassed,
        review,
        runs: this.manager.getRuns(),
        messages: this.bus.getAll(),
        retries,
        testResult,
        previewAllowed: testPassed,
        repairRounds,
        repairLog,
      }
    } finally {
      unsubscribe()
    }
  }

  /** 获取内部 AgentManager（用于扩展/审查） */
  getManager(): AgentManager {
    return this.manager
  }

  /** 获取消息总线 */
  getBus(): MessageBus {
    return this.bus
  }
}
