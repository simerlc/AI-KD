import fs from 'fs'
import path from 'path'
import initSqlJs from 'sql.js'

async function main() {
  const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db')
  if (!fs.existsSync(DB_PATH)) {
    console.error('Database file not found at', DB_PATH)
    process.exit(1)
  }

  const SQL = await initSqlJs({ locateFile: (file) => new URL('../node_modules/sql.js/dist/' + file, import.meta.url).href })

  const fileBuffer = fs.readFileSync(DB_PATH)
  const u8 = new Uint8Array(fileBuffer)
  const db = new SQL.Database(u8)

  // List tables for debugging
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table';")
  console.log('Tables in DB:', tables[0] ? tables[0].values.map((r) => r[0]) : [])

  // Count before (if tasks table exists)
  let beforeCount = 0
  try {
    const before = db.exec("SELECT COUNT(*) as c FROM tasks WHERE user_id = 'default-user' AND deleted_at IS NULL;")
    beforeCount = (before[0] && before[0].values && before[0].values[0] && before[0].values[0][0]) || 0
  } catch (e) {
    console.warn('tasks table not found or query failed')
  }
  console.log('Tasks to delete (before):', beforeCount)

  const ts = Date.now()
  const stmt = db.prepare('UPDATE tasks SET deleted_at = $ts WHERE user_id = $uid AND deleted_at IS NULL')
  stmt.bind({ $ts: ts, $uid: 'default-user' })
  stmt.step()
  stmt.free()

  // Count after
  const after = db.exec("SELECT COUNT(*) as c FROM tasks WHERE user_id = 'default-user' AND deleted_at IS NOT NULL;")
  const afterCount = (after[0] && after[0].values && after[0].values[0] && after[0].values[0][0]) || 0
  console.log('Tasks deleted (after):', afterCount)

  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
  console.log('Database updated at', DB_PATH)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
