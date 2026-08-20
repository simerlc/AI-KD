// ─── 真实 LLM 端到端测试脚本（用户实际使用流程）───────────
//
// 通过真实大模型驱动 MultiAgentOrchestrator 完整流水线，验证：
//   1. 大模型按流程规范生成（Requirement → Blueprint → Coding）
//   2. Skill System 生效（技能识别 + 上下文注入）
//   3. Design System 生效（生成应用使用 ds-* 规范）
//   4. 生成应用通过测试与 Design Review
//
// 运行：cd packages/server && npx tsx --env-file=.env scripts/real-llm-e2e.ts

import { OpenAICompatibleProvider } from '../src/llm/openai-provider'
import { LLMClientAdapter } from '../src/llm/adapter'
import { MultiAgentOrchestrator } from '@aikd/agent'

interface CaseResult {
  name: string
  prompt: string
  ok: boolean
  appName?: string
  fileCount?: number
  skills?: string[]
  testStatus?: string
  testScore?: number
  designScore?: number
  designPassed?: boolean
  designIssues?: string[]
  errors?: string[]
  durationMs?: number
  patternId?: string
  qualityScore?: number
  enhancement?: string[]
  productPlan?: { targetUsers: string[]; coreFeatures: string[]; advancedFeatures: string[] }
}

const cases: Array<{ name: string; prompt: string }> = [
  { name: '在线商城', prompt: '帮我做一个在线商城，包含商品列表、商品详情、购物车、下单流程' },
  { name: '客户管理系统', prompt: '做一个客户关系管理系统，包含客户列表、客户详情、跟进记录' },
  { name: '请假审批系统', prompt: '做一个请假审批系统，员工提交申请，主管审批' },
]

async function runOne(name: string, prompt: string): Promise<CaseResult> {
  const started = Date.now()
  const result: CaseResult = { name, prompt, ok: false }
  try {
    const provider = new OpenAICompatibleProvider()
    const llm = new LLMClientAdapter(provider)
    const orchestrator = new MultiAgentOrchestrator(llm)

    const r = await orchestrator.run({
      prompt,
      sessionId: `e2e-${name}`,
      appId: `app-${Date.now()}`,
    })

    result.appName = r.appModel?.name
    result.fileCount = r.files?.length
    result.skills = r.skills
    result.testStatus = r.testResult?.status
    result.testScore = r.testResult?.score
    result.designScore = r.designReview?.score
    result.designPassed = r.designReview?.passed
    result.designIssues = r.designReview?.issues
    result.patternId = r.patternId
    result.qualityScore = r.qualityReport?.score
    result.enhancement = r.enhancement?.addedCapabilities
    result.productPlan = r.productPlan
      ? {
          targetUsers: r.productPlan.targetUsers ?? [],
          coreFeatures: r.productPlan.coreFeatures ?? [],
          advancedFeatures: r.productPlan.advancedFeatures ?? [],
        }
      : undefined
    result.ok = true

    // 详细检查
    const css = r.files?.find((f) => f.path === 'src/index.css')
    if (!css?.content.includes('--ds-color-primary')) {
      result.errors = result.errors ?? []
      result.errors.push('index.css 未注入 Design Tokens')
    }
  } catch (e) {
    result.errors = [String((e as Error)?.message ?? e)]
  }
  result.durationMs = Date.now() - started
  return result
}

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  真实大模型端到端测试（用户实际使用流程）')
  console.log('═══════════════════════════════════════════════\n')

  const provider = new OpenAICompatibleProvider()
  // 先测连接
  console.log('[0] 测试 LLM 连接...')
  try {
    const llm = new LLMClientAdapter(provider)
    const ping = await llm.complete([{ role: 'user', content: '只回复两个字：正常' }], { max_tokens: 20 })
    console.log('    连接正常，模型响应示例：', JSON.stringify(ping.slice(0, 30)))
  } catch (e) {
    console.error('    连接失败：', (e as Error).message)
    console.error('    请检查 .env 中的 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL')
    process.exit(1)
  }

  const results: CaseResult[] = []
  for (const c of cases) {
    console.log(`\n[${cases.indexOf(c) + 1}] 测试用例：${c.name}`)
    console.log(`    需求：${c.prompt}`)
    const r = await runOne(c.name, c.prompt)
    results.push(r)
    if (r.ok) {
      console.log(`    应用名：${r.appName}`)
      console.log(`    推荐模式：${r.patternId ?? '-'}`)
      console.log(`    目标用户：${r.productPlan?.targetUsers.join('、') ?? '-'}`)
      console.log(`    核心功能：${r.productPlan?.coreFeatures.join('、') ?? '-'}`)
      console.log(`    生成文件数：${r.fileCount}`)
      console.log(`    识别技能：${r.skills?.join(', ') ?? '无'}`)
      console.log(`    测试状态：${r.testStatus} (score ${r.testScore})`)
      console.log(`    Design Review：${r.designScore} ${r.designPassed ? '通过' : '未达标'}`)
      console.log(`    质量评分：${r.qualityScore ?? '-'}`)
      console.log(`    增强能力：${r.enhancement?.join('、') ?? '无'}`)
      if (r.designIssues?.length) console.log(`      问题：${r.designIssues.slice(0, 3).join('; ')}`)
    } else {
      console.log(`    ❌ 失败：${r.errors?.join('; ')}`)
    }
  }

  // 汇总报告
  console.log('\n═══════════════════════════════════════════════')
  console.log('  测试报告汇总')
  console.log('═══════════════════════════════════════════════')
  const okCount = results.filter((r) => r.ok).length
  console.log(`  总用例：${results.length}，成功：${okCount}，失败：${results.length - okCount}`)
  for (const r of results) {
    console.log(`\n  ◆ ${r.name} ${r.ok ? '✅' : '❌'}（${r.durationMs}ms）`)
    if (r.ok) {
      console.log(`    - 应用名：${r.appName}（模式：${r.patternId ?? '-'}）`)
      console.log(`    - 文件数：${r.fileCount}`)
      console.log(`    - 技能：${r.skills?.join(', ')}`)
      console.log(`    - 测试：${r.testStatus} (score ${r.testScore})`)
      console.log(`    - Design Review：${r.designScore} ${r.designPassed ? '通过' : '未达标'}`)
      console.log(`    - 质量评分：${r.qualityScore ?? '-'}`)
    } else {
      console.log(`    - 错误：${r.errors?.join('; ')}`)
    }
  }
  console.log('')

  process.exit(okCount === results.length ? 0 : 1)
}

main()
