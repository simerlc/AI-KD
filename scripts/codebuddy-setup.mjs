#!/usr/bin/env node

/**
 * CodeBuddy 模型配置引导脚本
 *
 * 作用：
 *   - 从 CloudBase 拉取可用 AI 模型列表（DescribeAIModels）
 *   - 生成 packages/server/.config/.codebuddy/models.json
 *   - 供 @tencent-ai/agent-sdk 读取自定义模型列表
 *
 * 设计约束：
 *   - 只处理项目级配置
#!/usr/bin/env node

// 此脚本已归档：CodeBuddy 的 CloudBase 拉取逻辑不再作为默认集成。
// 如果需要恢复原始行为，请从 backups/docs-backup-*.zip 恢复本脚本。

console.log('codebuddy setup script is archived and disabled by default.');
console.log('Restore from backups/docs-backup-*.zip to re-enable.');
process.exit(0);

// ─── Model config builders ───────────────────────────────────────────────

/**
 * 将 CloudBase DescribeAIModels 返回的模型列表转换为 CodeBuddy models.json 格式
 */
function buildCodeBuddyModelsConfig(modelList, envId) {
  const models = []
  const availableModels = []

  for (const group of modelList) {
    if (group.GroupName !== 'cloudbase') {
      continue
    }
    if (!group?.Models) continue

    for (const model of group.Models) {
      const modelId = model.Model || model.model || model.Id || model.id
      const modelName = model.Name || model.name || modelId
      if (!modelId) continue

      models.push({
        id: modelId,
        name: modelName,
        vendor: group.GroupName || 'cloudbase',
        apiKey: '${CLOUDBASE_API_KEY}',
        url: `https://${envId}.api.tcloudbasegateway.com/v1/ai/cloudbase`,
        supportsToolCall: true,
        supportsImages: true,
      })
      availableModels.push(modelId)
    }
  }

  return { models, availableModels }
}

/**
 * 读取现有的 models.json（如果存在）
 */
function readExistingModelsConfig() {
  if (!fs.existsSync(MODELS_CONFIG_FILE)) return null
  try {
    const raw = fs.readFileSync(MODELS_CONFIG_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch (e) {
    log(`解析现有 models.json 失败：${e.message}`, 'warn')
    return null
  }
}

/**
 * 写入 models.json
 */
function writeModelsConfig(config) {
  fs.mkdirSync(MODELS_CONFIG_DIR, { recursive: true })
  fs.writeFileSync(MODELS_CONFIG_FILE, JSON.stringify(config, null, 2) + '\n')
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  logSection('CodeBuddy 模型配置')

  const envNow = parseEnvFile(SERVER_ENV_FILE)
  const envId = envNow['TCB_ENV_ID']
  const secretId = envNow['TCB_SECRET_ID']
  const secretKey = envNow['TCB_SECRET_KEY']
  const apiKey = envNow['CLOUDBASE_API_KEY']

  if (!envId || !secretId || !secretKey) {
    log('缺少 CloudBase 凭证，请确保 packages/server/.env 中包含 TCB_ENV_ID、TCB_SECRET_ID、TCB_SECRET_KEY', 'err')
    process.exit(1)
  }

  // 1. 检查 / 引导输入 CLOUDBASE_API_KEY
  if (!apiKey) {
    log('缺少 CLOUDBASE_API_KEY，请确保 packages/server/.env 中已配置', 'warn')
    console.log(`  可从 https://tcb.cloud.tencent.com/dev?envId=${envId}#/env/apikey 创建获取`)
    console.log('')
    const value = await prompt('  CLOUDBASE_API_KEY', { hidden: true })
    if (value && value.trim() !== '') {
      const { added, updated } = upsertEnvFile(SERVER_ENV_FILE, {
        CLOUDBASE_API_KEY: value.trim(),
        CODEBUDDY_USE_CUSTOM_MODELS: 'true',
      })
      if (added.includes('CLOUDBASE_API_KEY')) log('已追加 CLOUDBASE_API_KEY 到 packages/server/.env', 'ok')
      if (updated.includes('CLOUDBASE_API_KEY')) log('已更新 packages/server/.env 中的 CLOUDBASE_API_KEY', 'ok')
      if (added.includes('CODEBUDDY_USE_CUSTOM_MODELS')) log('已追加 CODEBUDDY_USE_CUSTOM_MODELS=true 到 packages/server/.env', 'ok')
      if (updated.includes('CODEBUDDY_USE_CUSTOM_MODELS')) log('已更新 packages/server/.env 中的 CODEBUDDY_USE_CUSTOM_MODELS', 'ok')
      envNow['CLOUDBASE_API_KEY'] = value.trim()
      envNow['CODEBUDDY_USE_CUSTOM_MODELS'] = 'true'
    } else {
      log('未输入 CLOUDBASE_API_KEY，跳过', 'warn')
    }
  }

  // 2. 拉取 CloudBase AI 模型列表
  log('拉取 CloudBase AI 模型列表...', 'step')
  const modelList = await describeAIModes(envId, secretId, secretKey)

  // 3. 构建 CodeBuddy 模型配置
  const newConfig = buildCodeBuddyModelsConfig(modelList, envId)

  if (newConfig.models.length === 0) {
    log('未获取到任何 AI 模型', 'err')
    console.log(`  请前往 https://tcb.cloud.tencent.com/dev?envId=${envId}#/ai?tab=text-aiModel 开启模型配置`)
    process.exit(1)
  }

  log(`模型列表：${newConfig.availableModels.join(', ')}`, 'info')

  // 4. 合并现有配置：
  //    - CloudBase 模型以 API 返回为准（删除已从控制台移除的）
  //    - 仅保留 vendor 非 cloudbase 的真正自定义模型（用户手动添加的第三方）
  const existingConfig = readExistingModelsConfig()
  let finalConfig = newConfig

  if (existingConfig?.models && Array.isArray(existingConfig.models)) {
    const newModelIds = new Set(newConfig.models.map((m) => m.id))
    const preservedCustomModels = existingConfig.models.filter(
      (m) => !newModelIds.has(m.id) && m.vendor !== 'cloudbase',
    )

    if (preservedCustomModels.length > 0) {
      log(`保留 ${preservedCustomModels.length} 个自定义模型`, 'info')
      finalConfig = {
        models: [...newConfig.models, ...preservedCustomModels],
        availableModels: [...newConfig.availableModels, ...preservedCustomModels.map((m) => m.id)],
      }
    }

    // 提示已从 CloudBase 移除的模型
    const removedCloudbaseModels = existingConfig.models.filter(
      (m) => !newModelIds.has(m.id) && m.vendor === 'cloudbase',
    )
    if (removedCloudbaseModels.length > 0) {
      log(
        `已从 models.json 移除 ${removedCloudbaseModels.length} 个模型（已从 CloudBase 控制台删除）：${removedCloudbaseModels.map((m) => m.id).join(', ')}`,
        'info',
      )
    }
  }

  // 5. 落盘
  writeModelsConfig(finalConfig)
  log(`已写入 ${path.relative(ROOT, MODELS_CONFIG_FILE)}`, 'ok')

  // 6. Summary
  console.log('')
  console.log(`${colors.bold}${colors.green}✓ 完成${colors.reset}`)
  console.log('')
  console.log(`${colors.dim}下一步：${colors.reset}`)
  console.log(`  1) 设置环境变量 ${colors.bold}CODEBUDDY_USE_CUSTOM_MODELS=true${colors.reset} 启用自定义模型模式`)
  console.log(`  2) 重启 server（${colors.bold}pnpm dev:server${colors.reset}）`)
  console.log(`  3) 前端模型下拉应看到：${colors.bold}${finalConfig.availableModels.join(', ')}${colors.reset}`)
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
