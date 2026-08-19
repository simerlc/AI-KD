// ─── ApplicationTestAgent：应用测试调度总控 ───────────────
//
// 职责（对应需求第二节）：
//   1. 获取生成应用信息（files + blueprint）
//   2. 执行自动测试（Build / Runtime / UI / Feature / API 五大维度）
//   3. 分析测试结果（聚合为 ApplicationTestResult）
//   4. 判断是否允许预览（score >= 95 且无致命维度失败）
//   5. 调度自动修复流程（见 orchestrator 闭环；本 Agent 负责产出 errors 供修复）
//
// 关键约束：任何 status='failed' 的应用都禁止进入 Preview。
// 真实模式下会执行 npm run build / npm run dev；静态模式仅做结构/启发式分析。

import type { Blueprint } from '@aikd/shared'
import type { GeneratedFile } from '../../types'
import {
  composeTestResult,
  emptyDimension,
  type ApplicationTestResult,
  type DimensionResult,
} from './result'
import {
  BuildValidator,
  RuntimeValidator,
  UIValidator,
  FeatureValidator,
  APIValidator,
  type ValidationContext,
} from './validators'

export interface ApplicationTestOptions {
  /** 真实执行 shell（build/dev） */
  allowRealExecution?: boolean
  /** 真实项目目录（allowRealExecution 时必填） */
  projectDir?: string
  /** 测试轮次（用于 meta） */
  round?: number
}

export class ApplicationTestAgent {
  private build = new BuildValidator()
  private runtime = new RuntimeValidator()
  private ui = new UIValidator()
  private feature = new FeatureValidator()
  private api = new APIValidator()

  /**
   * 对生成应用执行完整测试。
   * @returns ApplicationTestResult（含 status / score / errors / tests）
   */
  async test(
    files: GeneratedFile[],
    blueprint: Blueprint,
    opts: ApplicationTestOptions = {},
  ): Promise<ApplicationTestResult> {
    const start = Date.now()
    const ctx: ValidationContext = {
      files,
      blueprint,
      projectDir: opts.projectDir,
      allowRealExecution: opts.allowRealExecution,
      round: opts.round ?? 1,
    }

    const tests: ApplicationTestResult['tests'] = {
      build: emptyDimension('build'),
      runtime: emptyDimension('runtime'),
      ui: emptyDimension('ui'),
      feature: emptyDimension('feature'),
      api: emptyDimension('api'),
    }

    // 顺序执行五大维度（build/runtime 真实模式会起进程，故串行）
    tests.build = await this.build.validate(ctx)
    tests.runtime = await this.runtime.validate(ctx)
    tests.ui = await this.ui.validate(ctx)
    tests.feature = await this.feature.validate(ctx)
    tests.api = await this.api.validate(ctx)

    const realExecution = Boolean(opts.allowRealExecution && opts.projectDir)
    return composeTestResult(tests, {
      round: opts.round ?? 1,
      durationMs: Date.now() - start,
      realExecution,
      timestamp: Date.now(),
    })
  }

  /** 兼容旧接口：返回是否通过（供 orchestrator 直接判断） */
  async isPreviewAllowed(
    files: GeneratedFile[],
    blueprint: Blueprint,
    opts?: ApplicationTestOptions,
  ): Promise<boolean> {
    const r = await this.test(files, blueprint, opts)
    return r.status === 'passed'
  }
}

/** 便捷函数：根据已有维度结果快速组成结果（测试用） */
export function quickResult(dims: Partial<ApplicationTestResult['tests']>): ApplicationTestResult {
  const tests: ApplicationTestResult['tests'] = {
    build: dims.build ?? emptyDimension('build'),
    runtime: dims.runtime ?? emptyDimension('runtime'),
    ui: dims.ui ?? emptyDimension('ui'),
    feature: dims.feature ?? emptyDimension('feature'),
    api: dims.api ?? emptyDimension('api'),
  }
  return composeTestResult(tests, {
    round: 1,
    durationMs: 0,
    realExecution: false,
    timestamp: Date.now(),
  })
}

export type { DimensionResult }
