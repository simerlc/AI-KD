#!/usr/bin/env node
/**
 * 测试 CreateCloudRunServer API 的 Items 参数格式
 * 用法：node scripts/test-create-cloudrun.mjs
 */

import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'
import fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 读 packages/server/.env
const envPath = resolve(__dirname, '../packages/server/.env')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const envId = env.TCB_ENV_ID
if (!envId) {
  console.error('TCB_ENV_ID not found in .env')
  process.exit(1)
}

console.log(`[test] EnvId: ${envId}`)
console.log(`[test] SecretId: ${env.TCB_SECRET_ID ? '***' + env.TCB_SECRET_ID.slice(-4) : 'not set'}`)

console.log('test-create-cloudrun script is archived and disabled by default.');
console.log('Restore from backups/docs-backup-*.zip to re-enable cloud-run tests.');
process.exit(0);
