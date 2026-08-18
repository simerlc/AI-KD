// ─── CRUD Demo：验证 Action/Event Engine ─────────────────
//
// 演示完整闭环：按钮点击 → database.insert → page.refresh → notification.success
// 以及 database.query/update/delete 的真实 CRUD 流程。
//
// 运行：npx tsx examples/crud-demo.ts

import { ActionEngine, type ActionRuntime } from '../src/action-engine'
import { EventEngine } from '../src/event-engine'
import type { ActionSchema, EventSchema } from '@aikd/shared'

// ─── 内存数据库（模拟真实 Data API 的存储） ──────────────

class MemoryDb {
  private store = new Map<string, Record<string, unknown>>()
  private seq = 0

  insert(row: Record<string, unknown>): { id: string } {
    const id = `rec_${++this.seq}`
    this.store.set(id, { id, ...row })
    return { id }
  }

  query(): Record<string, unknown>[] {
    return Array.from(this.store.values())
  }

  update(id: string, patch: Record<string, unknown>): { affected: number } {
    if (!this.store.has(id)) return { affected: 0 }
    this.store.set(id, { ...this.store.get(id)!, ...patch })
    return { affected: 1 }
  }

  remove(id: string): { affected: number } {
    return { affected: this.store.delete(id) ? 1 : 0 }
  }
}

// ─── 构造 Runtime（绑定内存数据库 + 通知/导航/刷新） ──────

function createRuntime(db: MemoryDb, log: string[]): ActionRuntime {
  return {
    database: {
      query: async () => db.query(),
      insert: async (params) => db.insert(params),
      update: async (params) => db.update(String(params.id), params.data as Record<string, unknown>),
      remove: async (params) => db.remove(String(params.id)),
    },
    http: {
      request: async (params) => {
        log.push(`HTTP ${params.method ?? 'GET'} ${params.url}`)
        return { ok: true }
      },
    },
    notification: {
      success: (msg) => log.push(`✅ ${msg}`),
      error: (msg) => log.push(`❌ ${msg}`),
    },
    navigation: {
      go: (path) => log.push(`🧭 导航到 ${path}`),
    },
    modal: {
      open: (p) => log.push(`📦 打开弹窗: ${JSON.stringify(p)}`),
      close: () => log.push('📦 关闭弹窗'),
    },
    page: {
      refresh: () => log.push('🔄 页面刷新'),
    },
  }
}

// ─── Demo 主流程 ─────────────────────────────────────────

async function main() {
  console.log('========== AI快搭 Action/Event Engine CRUD Demo ==========\n')

  const db = new MemoryDb()
  const log: string[] = []
  const actionEngine = new ActionEngine(createRuntime(db, log))
  const eventEngine = new EventEngine(actionEngine)

  // 1. 定义 Actions
  const actions: ActionSchema[] = [
    { id: 'ins', name: '新增客户', type: 'database.insert', params: { name: '{{form.name}}', phone: '{{form.phone}}' } },
    { id: 'refresh', name: '刷新列表', type: 'page.refresh', params: {} },
    { id: 'notify_ok', name: '成功提示', type: 'notification.success', params: { message: '客户已保存' } },
    { id: 'notify_err', name: '失败提示', type: 'notification.error', params: { message: '保存失败' } },
    { id: 'upd', name: '更新客户', type: 'database.update', params: { id: '{{record.id}}', data: { phone: '{{form.phone}}' } } },
    { id: 'del', name: '删除客户', type: 'database.delete', params: { id: '{{record.id}}' } },
    { id: 'query', name: '查询客户', type: 'database.query', params: {} },
  ]

  // 2. 定义 Events（按钮点击 → insert → refresh → notify）
  const events: EventSchema[] = [
    {
      id: 'evt_save',
      name: '保存按钮点击',
      trigger: 'interaction',
      event: 'click',
      actions: ['ins', 'refresh', 'notify_ok'],
    },
    {
      id: 'evt_delete',
      name: '删除按钮点击',
      trigger: 'interaction',
      event: 'rowClick',
      actions: ['del', 'refresh', 'notify_ok'],
    },
  ]

  // 3. 触发"保存按钮点击"事件（表单填入客户信息）
  console.log('--- 场景 1：新增客户（按钮点击 → insert → refresh → notify） ---')
  let result = await eventEngine.trigger('click', events, actions, {
    form: { name: '张三', phone: '13800000001' },
  })
  console.log('执行结果:', JSON.stringify(result))
  console.log('运行日志:', log.join(' | '))
  console.log('数据库内容:', JSON.stringify(db.query()), '\n')

  log.length = 0

  // 4. 再次新增（李四）
  console.log('--- 场景 2：新增第二个客户 ---')
  await eventEngine.trigger('click', events, actions, {
    form: { name: '李四', phone: '13900000002' },
  })
  console.log('数据库内容:', JSON.stringify(db.query()), '\n')

  log.length = 0

  // 5. 更新客户（直接执行 update action，使用 {{record.id}}）
  console.log('--- 场景 3：更新客户电话（update action + {{record.id}}） ---')
  result = await actionEngine.execute(actions.find((a) => a.id === 'upd')!, {
    record: { id: 'rec_1' },
    form: { phone: '13811112222' },
  })
  console.log('更新结果:', JSON.stringify(result))
  console.log('数据库内容:', JSON.stringify(db.query()), '\n')

  // 6. 删除客户（触发 rowClick 事件，使用 {{record.id}}）
  console.log('--- 场景 4：删除客户（rowClick → delete → refresh → notify） ---')
  result = await eventEngine.trigger('rowClick', events, actions, {
    record: { id: 'rec_2' },
  })
  console.log('删除结果:', JSON.stringify(result))
  console.log('运行日志:', log.join(' | '))
  console.log('数据库内容:', JSON.stringify(db.query()), '\n')

  // 7. 错误处理：执行不存在的动作类型
  console.log('--- 场景 5：错误处理（未知 Action 类型） ---')
  result = await actionEngine.execute({ id: 'x', name: '坏动作', type: 'bad.type' as never, params: {} })
  console.log('错误结果:', JSON.stringify(result), '\n')

  console.log('========== Demo 完成 ==========')
}

main().catch((err) => {
  console.error('Demo 失败:', err)
  process.exit(1)
})
