import type { AppModel, AppType, ComponentNode } from '@aikd/shared'
import type {
  LLMClient,
  OrchestratorConfig,
  OrchestratorResult,
  ProgressCallback,
  GeneratedFile,
  TestResult,
  AgentPhase,
} from './types'
import { PlannerAgent } from './planner'
import { BuilderAgent } from './builder'
import { TesterAgent } from './tester'
import { registry } from '@aikd/component-registry'

// ─── Orchestrator ────────────────────────────────────────
//
// 协调 Planner / Builder / Tester 三个 Agent 的多轮编排。
//
// 流程:
// 1. Planner: 用户需求 → App Model JSON（带验证 + 重试）
// 2. Builder: App Model → React 代码文件
// 3. Tester: 验证代码文件
// 4. 如果 Tester 失败且有重试次数，回到步骤 2 修复

export interface RunOptions {
  /** 用户需求描述 */
  prompt: string
  /** 应用类型 */
  appType?: AppType
  /** 应用名称 */
  appName?: string
  /** 已有的 App Model（修改模式） */
  existingAppModel?: AppModel
  /** 多轮对话历史（user/assistant 消息，用于修改模式上下文） */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** 进度回调 */
  onProgress?: ProgressCallback
  /** 配置 */
  config?: OrchestratorConfig
}

export class Orchestrator {
  private planner: PlannerAgent
  private builder: BuilderAgent
  private tester: TesterAgent

  constructor(private llm: LLMClient) {
    this.planner = new PlannerAgent(llm)
    this.builder = new BuilderAgent(llm)
    this.tester = new TesterAgent(llm)
  }

  async run(options: RunOptions): Promise<OrchestratorResult> {
    const config = options.config ?? {}
    const maxPlannerRetries = config.maxPlannerRetries ?? 3
    const maxBuilderRetries = config.maxBuilderRetries ?? 2
    const signal = config.signal
    const onProgress = options.onProgress

    let appModel: AppModel
    let totalRetries = 0

    // ─── Phase 1: Planning ───────────────────────────────

    if (options.existingAppModel) {
      // 修改模式：Planner 基于已有 App Model + 新需求 + 历史上下文生成更新后的模型
      this.emitProgress(onProgress, 'planning', '正在根据修改需求更新应用模型...')

      const plannerResult = await this.planner.plan({
        prompt: options.prompt,
        appType: options.existingAppModel.type,
        appName: options.existingAppModel.name,
        existingAppModel: options.existingAppModel,
        history: options.history,
        maxRetries: maxPlannerRetries,
        signal,
      })

      appModel = plannerResult.appModel
      totalRetries += plannerResult.retries

      if (plannerResult.retries > 0) {
        this.emitProgress(onProgress, 'planning', `应用模型更新完成（重试 ${plannerResult.retries} 次）`, appModel)
      } else {
        this.emitProgress(onProgress, 'planning', '应用模型更新完成', appModel)
      }
    } else {
      // 新建模式：Planner 生成 App Model
      this.emitProgress(onProgress, 'planning', '正在分析需求并生成应用模型...')

      const plannerResult = await this.planner.plan({
        prompt: options.prompt,
        appType: options.appType,
        appName: options.appName,
        maxRetries: maxPlannerRetries,
        signal,
      })

      appModel = plannerResult.appModel
      totalRetries += plannerResult.retries

      if (plannerResult.retries > 0) {
        this.emitProgress(onProgress, 'planning', `App Model 生成完成（重试 ${plannerResult.retries} 次）`, appModel)
      } else {
        this.emitProgress(onProgress, 'planning', 'App Model 生成完成', appModel)
      }
    }

    // ─── Phase 2 & 3: Build + Test 循环 ──────────────────

    let files: GeneratedFile[] = []
    let testResult: TestResult = { passed: false, errors: [], warnings: [], suggestions: [] }

    for (let attempt = 0; attempt <= maxBuilderRetries; attempt++) {
      if (signal?.aborted) {
        throw new Error('Orchestrator aborted')
      }

      // Build
      this.emitProgress(
        onProgress,
        'building',
        attempt === 0 ? '正在生成代码...' : `正在修复代码（第 ${attempt} 次重试）...`,
      )

      const buildResult = await this.builder.build({ appModel, signal })
      files = buildResult.files

      this.emitProgress(onProgress, 'building', `代码生成完成，共 ${files.length} 个文件`)

      // Test
      this.emitProgress(onProgress, 'testing', '正在验证代码...')

      testResult = await this.tester.test({ appModel, files, signal })

      if (testResult.passed) {
        this.emitProgress(onProgress, 'testing', '代码验证通过')
        break
      }

      if (attempt < maxBuilderRetries) {
        this.emitProgress(onProgress, 'testing', `验证发现 ${testResult.errors.length} 个错误，准备修复...`)
        totalRetries++

        // 将 Tester 的反馈传递给 App Model（修复已知问题）
        // 在 V1 中，Builder 是确定性的，所以我们通过修复 App Model 来修复代码
        appModel = this.applyFixes(appModel, testResult)
      } else {
        this.emitProgress(onProgress, 'testing', `验证仍有问题，已达到最大重试次数 (${maxBuilderRetries})`)
      }
    }

    // ─── Done ────────────────────────────────────────────

    const phase: AgentPhase = testResult.passed ? 'done' : 'error'
    this.emitProgress(onProgress, phase, testResult.passed ? '应用生成完成' : '应用生成完成（有警告）')

    return {
      appModel,
      files,
      testResult,
      retries: totalRetries,
    }
  }

  /** 将 Tester 的反馈应用到 App Model */
  private applyFixes(appModel: AppModel, testResult: TestResult): AppModel {
    // V1 的 Builder 是确定性的，大部分错误来自 App Model 中的组件引用问题
    // 这里移除引用了未注册组件的节点
    const fixComponent = (node: ComponentNode): ComponentNode | null => {
      if (!registry.has(node.type)) {
        return null
      }
      if (node.children) {
        node.children = node.children.map((c) => fixComponent(c)).filter((c): c is ComponentNode => c !== null)
      }
      return node
    }

    const fixedPages = appModel.schema.pages.map((page) => ({
      ...page,
      components: page.components.map((c) => fixComponent(c)).filter((c): c is ComponentNode => c !== null),
    }))

    return {
      ...appModel,
      schema: {
        ...appModel.schema,
        pages: fixedPages,
      },
      updatedAt: Date.now(),
    }
  }

  private emitProgress(
    onProgress: ProgressCallback | undefined,
    phase: AgentPhase,
    message: string,
    data?: unknown,
  ): void {
    if (onProgress) {
      onProgress({ phase, message, data })
    }
  }
}
