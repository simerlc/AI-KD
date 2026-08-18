// ─── 测试全局 setup ──────────────────────────────────────
//
// 在所有测试模块 import 前设置独立的测试数据库路径，
// 避免污染开发数据，也避免多个测试文件并行时争用同一个 SQLite 文件。

import path from 'node:path'
import fs from 'node:fs'

// 使用内存数据库（:memory:）不可行，因为 better-sqlite3 的 :memory: 每个连接独立。
// 这里使用独立的临时文件数据库，测试结束后由各测试文件负责清理。
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-app.db')

// 清理上次测试遗留的数据库文件
for (const suffix of ['', '-wal', '-shm']) {
  const file = TEST_DB_PATH + suffix
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch {
    // 忽略清理失败
  }
}

process.env.DATABASE_PATH = TEST_DB_PATH
