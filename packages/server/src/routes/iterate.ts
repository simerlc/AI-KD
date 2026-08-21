import { Hono } from 'hono'
import { Orchestrator } from '@aikd/agent'
import type { AppType, AppModel } from '@aikd/shared'
import { requireAuth, type AppEnv } from '../middleware/auth'
import { getDb } from '../db/index.js'
import { createProviderFromModel } from '../llm/index.js'
import { createLLMClient } from '../llm/adapter.js'
import { writeWorkspaceFiles } from '../lib/workspace.js'
import { initializeBackend } from '../services/backend-init.service.js'
import { getSandbox } from '../sandbox/index.js'

// ─── 用户迭代修改 API ─────────────────────────────────────
//
// 允许用户在预览后通过自然语言继续提出修改（如"增加一个统计页面"）。
// 流程：
//   1. 读取任务关联的最新 App Model（蓝图）
//   2. 调用 Planner 的增量生成方法（保留主题/数据源，只改被提及元素）
//   3. 驱动 Builder + Tester 重新生成代码
//   4. 写文件 + 重启沙箱预览，返回新的文件列表
const iterate = new Hono<AppEnv>()

iterate.post('/', async (c) => {
  const authErr = requireAuth(c)
  if (authErr) return authErr
  const session = c.get('session')!

  const body = await c.req.json().catch(() => ({})) as {
    sessionId?: string
    instruction?: string
  }
  const sessionId = body.sessionId
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''

  if (!sessionId) {
    return c.json({ error: 'sessionId is required' }, 400)
  }
  if (!instruction) {
    return c.json({ error: 'instruction is required' }, 400)
  }

  const task = await getDb().tasks.findByIdAndUserId(sessionId, session.user.id)
  if (!task) {
    return c.json({ error: 'Session not found' }, 404)
  }

  // ── 读取当前蓝图（App Model）──
  let existingAppModel: AppModel | undefined
  if (task.appModelId) {
    const record = await getDb().appModels.findById(task.appModelId)
    if (record) {
      try {
        existingAppModel = JSON.parse(record.modelJson) as AppModel
      } catch {
        // JSON 解析失败，视为无蓝图
      }
    }
  }
  if (!existingAppModel) {
    return c.json({ error: 'No app blueprint found for this session. Please generate the app first.' }, 400)
  }

  // ── 动态创建 LLM Provider 与单 agent Orchestrator ──
  let provider
  try {
    const sel = task.selectedModel || ''
    const parts = sel.includes('::') ? sel.split('::') : []
    const providerRef =
      parts.length === 2
        ? { providerId: parts[0], modelId: parts[1] }
        : parts.length === 1
          ? { providerId: parts[0] }
          : undefined
    provider = await createProviderFromModel(providerRef)
  } catch (error) {
    console.error('[Iterate] LLM provider not configured')
    return c.json({ error: (error as Error).message }, 500)
  }

  const llmClient = createLLMClient(provider)
  const orchestrator = new Orchestrator(llmClient)

  try {
    // ── 增量修改：Planner 基于现有蓝图增量生成 → Builder → Tester ──
    const result = await orchestrator.run({
      prompt: instruction,
      appId: sessionId,
      appType: existingAppModel.type as AppType,
      appName: existingAppModel.name,
      existingAppModel,
    })

    // ── 保存更新后的 App Model ──
    const appModelId = result.appModel.id
    const appModelJson = JSON.stringify(result.appModel)
    const existingRecord = await getDb().appModels.findById(appModelId)
    if (existingRecord) {
      await getDb().appModels.update(appModelId, {
        modelJson: appModelJson,
        version: result.appModel.version,
      })
    } else {
      await getDb().appModels.create({
        id: appModelId,
        appId: sessionId,
        modelJson: appModelJson,
        version: result.appModel.version,
      })
    }

    // ── 后端初始化（数据源建表/写入）──
    try {
      await initializeBackend(sessionId, result.appModel)
    } catch (err) {
      console.error('[Iterate] Backend init failed', err)
    }

    // ── 写入多文件到工作区 ──
    await writeWorkspaceFiles(sessionId, result.files)

    // ── 重启沙箱预览（确保加载最新代码）──
    let previewUrl = ''
    const sandbox = getSandbox()
    const existing = sandbox.get(sessionId)
    if (existing && existing.status === 'running') {
      try {
        await sandbox.destroy(sessionId)
      } catch {
        // 忽略销毁失败
      }
    }
    try {
      const instance = await sandbox.create({ appId: sessionId })
      previewUrl = instance.url
    } catch (err) {
      console.error('[Iterate] Sandbox start failed', err)
    }

    // 更新 task（新 previewUrl / 版本）
    try {
      await getDb().tasks.update(sessionId, {
        appModelId,
        currentVersion: result.appModel.version,
        appType: result.appModel.type,
        ...(previewUrl && { previewUrl, sandboxUrl: previewUrl }),
        updatedAt: Date.now(),
      })
    } catch {
      // non-critical
    }

    return c.json({
      appModel: result.appModel,
      files: result.files,
      previewUrl,
      testResult: {
        passed: result.testResult.passed,
        errors: result.testResult.errors,
        warnings: result.testResult.warnings,
      },
      retries: result.retries,
      message: `增量修改完成：新增 ${result.appModel.schema.pages.length} 个页面`,
    })
  } catch (error) {
    console.error('[Iterate] Orchestrator error', error)
    return c.json({ error: (error as Error).message }, 500)
  }
})

export default iterate
