// ─── Application Test 统一结果结构 ─────────────────────────
//
// 这是「应用生成后自动全功能测试与自动修复机制」的核心数据结构。
// ApplicationTestAgent 在 CodingAgent 产出代码之后运行，对生成应用进行完整测试，
// 产出 ApplicationTestResult。只有 score >= 95 的应用才允许进入 Preview。
//
// 该结构同时作为：
//   - 各 Validator（Build/Runtime/UI/Feature/API）的子结果聚合容器
//   - ErrorAnalyzerAgent 的错误输入
//   - RepairAgent 的修复依据
//   - Orchestrator 是否放行 Preview 的唯一判据

/** 单个维度测试的状态 */
export type TestStatus = 'passed' | 'failed' | 'warning' | 'skipped'

/** 单条错误/警告记录 */
export interface TestIssue {
  /** 所属维度 */
  dimension: TestDimension
  /** 严重级别 */
  severity: 'error' | 'warning' | 'info'
  /** 错误/提示信息 */
  message: string
  /** 出错文件（若有） */
  file?: string
  /** 行号（若有） */
  line?: number
  /** 错误上下文/代码片段 */
  context?: string
  /** 问题归类（供 ErrorAnalyzer 定位） */
  category?: 'import' | 'type' | 'jsx' | 'route' | 'component' | 'api' | 'render' | 'runtime' | 'feature' | 'dependency' | 'other'
}

/** 五大测试维度 */
export type TestDimension = 'build' | 'runtime' | 'ui' | 'feature' | 'api'

/** 单个维度的测试结果 */
export interface DimensionResult {
  status: TestStatus
  /** 该维度得分（0-100） */
  score: number
  /** 该维度的检查项总数 */
  checked: number
  /** 该维度通过的检查项数 */
  passed: number
  /** 该维度发现的问题 */
  issues: TestIssue[]
  /** 人类可读摘要 */
  summary: string
}

/**
 * ApplicationTestResult：应用测试的统一结果。
 *
 * 判定规则：
 *   - score >= 95 且所有维度 status 非 'failed' → 允许进入 Preview
 *   - score < 95 或存在 failed 维度      → 禁止进入 Preview，需进入修复闭环
 */
export interface ApplicationTestResult {
  /** 是否允许预览（score >= 95 且 build/ui 维度必须通过） */
  status: 'passed' | 'failed'
  /** 综合得分（0-100），各维度加权 */
  score: number
  /** 错误列表（汇总各维度 severity=error 的问题） */
  errors: TestIssue[]
  /** 五大维度结果 */
  tests: {
    build: DimensionResult
    runtime: DimensionResult
    ui: DimensionResult
    feature: DimensionResult
    api: DimensionResult
  }
  /** 本次测试元信息 */
  meta: {
    /** 测试轮次（第几轮） */
    round: number
    /** 测试耗时（ms） */
    durationMs: number
    /** 是否执行了真实的 npm build/dev（true）还是静态分析（false） */
    realExecution: boolean
    /** 测试时间戳 */
    timestamp: number
  }
}

/** 各维度默认权重 */
export const DIMENSION_WEIGHTS: Record<TestDimension, number> = {
  build: 0.35,
  runtime: 0.25,
  ui: 0.15,
  feature: 0.15,
  api: 0.1,
}

/** 允许进入 Preview 的最低分数 */
export const PREVIEW_PASS_SCORE = 95

/**
 * 根据五个维度结果计算综合得分与是否放行。
 * build / runtime 维度 failed 时直接判定 status='failed'（致命项）。
 */
export function composeTestResult(
  tests: ApplicationTestResult['tests'],
  meta: ApplicationTestResult['meta'],
): ApplicationTestResult {
  const dims = Object.keys(tests) as TestDimension[]
  let score = 0
  for (const d of dims) {
    score += (tests[d].score / 100) * DIMENSION_WEIGHTS[d]
  }
  score = Math.round(score * 100)

  const fatalFailed = tests.build.status === 'failed' || tests.runtime.status === 'failed'
  const anyFailed = dims.some((d) => tests[d].status === 'failed')

  const errors: TestIssue[] = []
  for (const d of dims) errors.push(...tests[d].issues.filter((i) => i.severity === 'error'))

  const status: ApplicationTestResult['status'] =
    !anyFailed && score >= PREVIEW_PASS_SCORE ? 'passed' : 'failed'

  // 严重维度（build/runtime）失败时即便分数够也不放行
  if (fatalFailed) {
    return { status: 'failed', score, errors, tests, meta }
  }
  return { status, score, errors, tests, meta }
}

/** 生成空的单维度结果 */
export function emptyDimension(dimension: TestDimension, summary = '未执行'): DimensionResult {
  return { status: 'skipped', score: 0, checked: 0, passed: 0, issues: [], summary }
}
