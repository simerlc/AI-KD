#!/usr/bin/env node

// opencode setup script is archived: OpenCode integration removed from default workflow.
// To restore, extract the original from backups/docs-backup-*.zip

console.log('opencode setup script is archived and disabled by default.');
console.log('Restore from backups/docs-backup-*.zip to re-enable.');
process.exit(0);

/**
 * 收集"已存在但缺 env 的 provider"的 env 值。
 * 与 collectApiKeys 区别：这里是补齐，不需要再写 provider 对象到 opencode.json。
 */
async function collectMissingEnvs(envId, rows) {
  const updates = {}
  // 把所有 row 的 missingEnv 去重展开成一个待补齐列表
  const todoMap = new Map() // envKey -> Set<providerId>
  for (const r of rows) {
    for (const k of r.missingEnv) {
      if (!todoMap.has(k)) todoMap.set(k, new Set())
      todoMap.get(k).add(r.id)
    }
  }
  if (todoMap.size === 0) return updates

  console.log('')
  console.log(
    `${colors.bold}补齐缺失的 env${colors.reset} ${colors.dim}（这些 provider 已在 opencode.json 声明，但当前 .env 缺凭证）${colors.reset}`,
  )
  console.log(`${colors.dim}回车留空 = 跳过该项${colors.reset}`)

  for (const [envKey, providers] of todoMap) {
    console.log('')
    let extraHint = ''
    if (envKey === 'CLOUDBASE_API_KEY') {
      extraHint = `${colors.dim}(可从 https://tcb.cloud.tencent.com/dev?envId=${envId}#/env/apikey 创建获取) ${colors.reset}`
    }
    console.log(`  ${colors.bold}${envKey}${colors.reset} ${colors.dim} (用于: ${[...providers].join(', ')}) ${colors.reset}` + extraHint)

    const value = await prompt(`  ${envKey}`, { hidden: true })
    if (value && value.trim() !== '') {
      updates[envKey] = value.trim()
    }
  }
  return updates
}

async function pickDefaultModel(catalog, selected, currentDefault) {
  const candidates = []
  for (const it of selected) {
    const models = catalog[it.id]?.models ?? {}
    for (const mid of Object.keys(models)) {
      const m = models[mid]
      if (m && m.status === 'deprecated') continue
      candidates.push({
        id: `${it.id}/${mid}`,
        name: m?.name || mid,
        provider: it.name,
      })
    }
  }
  if (candidates.length === 0) return currentDefault || ''

  // 如果当前默认还在候选里，保留为默认
  const current = candidates.find((c) => c.id === currentDefault)
  const defaultIdx = current ? candidates.indexOf(current) : 0

  console.log('')
  console.log(`选择默认模型（会写入 opencode.json 的 "model" 字段）：`)
  const showTop = Math.min(candidates.length, 20)
  for (let i = 0; i < showTop; i++) {
    const c = candidates[i]
    const mark = i === defaultIdx ? `${colors.green}*${colors.reset}` : ' '
    console.log(`  ${mark} ${String(i + 1).padStart(2, ' ')}) ${c.id}  ${colors.dim}(${c.provider})${colors.reset}`)
  }
  if (candidates.length > showTop) {
    console.log(`  ${colors.dim}... 及其他 ${candidates.length - showTop} 个，输入序号或完整 id${colors.reset}`)
  }
  const answer = await prompt(`模型序号或 provider/model`, {
    defaultValue: candidates[defaultIdx].id,
  })

  if (!answer) return candidates[defaultIdx].id
  const idx = Number(answer) - 1
  if (Number.isInteger(idx) && idx >= 0 && idx < candidates.length) {
    return candidates[idx].id
  }
  // 允许用户直接输入完整 id（即便不在展示的前 20 个）
  if (candidates.some((c) => c.id === answer)) return answer
  log(`输入无效，使用 ${candidates[defaultIdx].id}`, 'warn')
  return candidates[defaultIdx].id
}

function getManager(envId, secretId, secretKey) {
  if (managerApp) return managerApp
  managerApp = new CloudBaseManager({
    envId,
    secretId,
    secretKey
  })
  return managerApp
}

async function describeAIModes(envId, secretId, secretKey) {
  try {
    const manager = getManager(envId, secretId, secretKey)
    const commonService = manager.commonService('tcb', '2018-06-08')
    const result = await commonService.call({
      Action: 'DescribeAIModels',
      Param: {
        EnvId: envId,
      },
    })
    return result?.AIModels || []
  } catch (err) {
    // Non-fatal: server-side SDK uses admin creds and bypasses rules.
    console.error(
      '[open code setup] Failed to describe ai models',
      err instanceof Error ? err.message : err,
    )
  }
}

async function getCloudBaseModelConfig(envId, secretId, secretKey) {
  const modelList = await describeAIModes(envId, secretId, secretKey)
  let cloudBaseModels = {}
  for (const it of modelList) {
    if (it?.GroupName !== "cloudbase") {
      continue;
    }
    for (const model of it?.Models){
      cloudBaseModels[model.Model] ={
        id : model.Model,
        name : model.Model,
      }
    }
  }

  return {
    id: "cloudbase",
    env: ["CLOUDBASE_API_KEY"],
    npm: "",
    api: `https://${envId}.api.tcloudbasegateway.com/v1/ai/cloudbase`,
    name: "cloudbase",
    doc:"",
    models: cloudBaseModels
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  logSection('OpenCode Provider 配置')

  const envNow = parseEnvFile(SERVER_ENV_FILE)
  const envId = envNow['TCB_ENV_ID']
  const secretId = envNow['TCB_SECRET_ID']
  const secretKey = envNow['TCB_SECRET_KEY']

  // 1. 拉 catalog
  // log('拉取 models.dev catalog...', 'step')
  let catalog = {}
  // 默认不拉取第三方模型
  // try {
  //   catalog = await fetchCatalog()
  //   log(`catalog 已拉取：${Object.keys(catalog).length} providers`, 'ok')
  // } catch (e) {
  //   log(`拉取失败：${e.message}`, 'err')
  //   console.log('')
  //   console.log(`请检查网络或设置 ${colors.bold}MODELS_DEV_CATALOG_URL${colors.reset} env 指向镜像。`)
  //   process.exit(1)
  // }

  // 仅添加 cloudbase 模型
  log('拉取 cloudbase 模型', 'step')
  const cloudBaseModelConfig = await getCloudBaseModelConfig(envId, secretId, secretKey)

  if (Object.keys(cloudBaseModelConfig.models).length === 0) {
    logSection(`未配置 cloudbase 模型, 请前往 https://tcb.cloud.tencent.com/dev?envId=${envId}#/ai?tab=text-aiModel 开启模型配置` )
    process.exit(1)
  }

  catalog['cloudbase'] = cloudBaseModelConfig

  // 2. 读现状
  const existing = readOpencodeJson()

  // 3. 扫描已有 provider，识别缺失 env
  const existingRows = inspectExistingProviders(existing.provider, catalog, envNow)
  renderExistingTable(existingRows)

  // 3a. 如有缺失 env，先邀请用户补齐
  const missingRows = existingRows.filter((r) => r.missingEnv.length > 0)
  let missingEnvUpdates = {}
  if (missingRows.length > 0) {
    console.log('')
    const ans = await prompt(
      `检测到 ${missingRows.length} 个 provider 缺少 env，是否现在补齐？(Y/n)`,
      { defaultValue: 'Y' },
    )
    if (ans.toLowerCase() !== 'n' && ans.toLowerCase() !== 'no') {
      missingEnvUpdates = await collectMissingEnvs(envId,missingRows)
    }
  }

  // 4. 展示 catalog provider 列表（添加新 provider 用）
  const items = listProviders(catalog, existing.provider, { ...envNow, ...missingEnvUpdates })
  if (items.length === 0) {
    log('catalog 中没有可用 provider（这不太可能，请检查 catalog）', 'err')
    process.exit(1)
  }

  console.log('')
  console.log(`${colors.bold}添加 / 启用 catalog provider${colors.reset}`)
  renderProviderTable(items)

  // 5. 用户选
  // const selected = await pickProviders(items)
  // if (selected.length === 0 && Object.keys(missingEnvUpdates).length === 0) {
  //   log('没有任何变更，退出', 'info')
  //   process.exit(0)
  // }
  // 默认仅支持 cloudbase
  let selected = []
  const byId = new Map(items.map((it) => [it.id, it]))
  if (byId.has("cloudbase")) {
    selected.push(byId.get("cloudbase"))
  }


  // 6. 收 key（仅针对新选的 provider；missing 的已在 step 3a 处理）
  let envUpdates = { ...missingEnvUpdates }
  if (selected.length > 0) {
    log(`新增启用：${selected.map((s) => s.id).join(', ')}`, 'ok')
    logSection('API Key（新增 provider）')
    console.log(`${colors.dim}所有 key 将写入 packages/server/.env（已 gitignore）。回车留空则跳过。${colors.reset}`)
    const newKeyUpdates = await collectApiKeys(selected, { ...envNow, ...missingEnvUpdates })
    envUpdates = { ...envUpdates, ...newKeyUpdates }
  }

  // 7. 选默认模型（在并集中选）
  logSection('默认模型')
  const allProvidersForModel = [
    ...selected,
    // 已存在且 catalog 里有的 provider 也作为候选源
    ...existingRows
      .filter((r) => r.isInCatalog && !selected.find((s) => s.id === r.id))
      .map((r) => ({ id: r.id, name: r.name })),
  ]
  const defaultModel =
    allProvidersForModel.length > 0
      ? await pickDefaultModel(catalog, allProvidersForModel, existing.model)
      : existing.model || ''

  // 8. 构造新 opencode.json：从 catalog 取完整字段写入，保留已有 provider
  const nextProvider = { ...existing.provider }
  for (const it of selected) {
    // if (nextProvider[it.id]) continue // 已存在的不覆盖（用户可能手动调过）
    nextProvider[it.id] = buildProviderConfig(catalog, it.id)
  }
  const nextConfig = {
    ...existing,
    provider: nextProvider,
  }
  if (defaultModel) nextConfig.model = defaultModel

  // 9. 落盘
  logSection('写入文件')
  // opencode.json：仅在结构有变化时写
  const configChanged =
    JSON.stringify(existing) !== JSON.stringify(nextConfig) || existing.model !== nextConfig.model
  if (configChanged) {
    writeOpencodeJson(nextConfig)
    log(`已写入 ${path.relative(ROOT, OPENCODE_JSON)}`, 'ok')
  } else {
    log(`${path.relative(ROOT, OPENCODE_JSON)} 无变化`, 'info')
  }

  if (Object.keys(envUpdates).length > 0) {
    const { updated, added } = upsertEnvFile(SERVER_ENV_FILE, envUpdates)
    const parts = []
    if (added.length > 0) parts.push(`新增 ${added.length} 项`)
    if (updated.length > 0) parts.push(`更新 ${updated.length} 项`)
    log(`已写入 ${path.relative(ROOT, SERVER_ENV_FILE)} (${parts.join('，')})`, 'ok')
  } else {
    log(`没有新的 env 变更`, 'info')
  }

  // 9. Summary
  console.log('')
  console.log(`${colors.bold}${colors.green}✓ 完成${colors.reset}`)
  console.log('')
  console.log(`${colors.dim}下一步：${colors.reset}`)
  console.log(`  1) 重启 server（${colors.bold}pnpm dev:server${colors.reset} 或生产环境重启）`)
  console.log(`  2) 访问前端 OpenCode agent，在模型下拉里应看到新模型`)
  console.log(`  3) 如需 whitelist / 自定义 baseURL / 非 catalog provider，请手动编辑 ${colors.bold}.opencode/opencode.json${colors.reset}`)
  console.log('')
}

main()
  .then(() => {
    if (_rl) _rl.close()
  })
  .catch((e) => {
    if (_rl) _rl.close()
    console.error(e)
    process.exit(1)
  })
