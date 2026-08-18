import { describe, it, expect, beforeAll } from 'vitest'
import { initializeBackend } from '../backend-init.service'
import { getDb } from '../../db/index.js'
import type { AppModel } from '@aikd/shared'

// ─── 集成测试：真实 SQLite 建表 + 写记录 ─────────────────
//
// 验证 initializeBackend 在真实数据库上：
// 1. 根据 dataSources 创建数据表（data_models）
// 2. 将数据写入数据记录（data_records）
// 3. 可被 Data API 仓储层查询

const TEST_USER_ID = 'test-user'
const TEST_TASK_ID = 'test-task'

beforeAll(async () => {
  // 创建测试用户 + 任务（满足外键约束）
  const db = getDb()
  try {
    await db.users.create({
      id: TEST_USER_ID,
      provider: 'local',
      externalId: 'test',
      accessToken: '',
      username: 'test',
    })
  } catch {
    // 已存在则忽略
  }
  try {
    await db.tasks.create({
      id: TEST_TASK_ID,
      userId: TEST_USER_ID,
      prompt: '测试任务',
      title: '测试任务',
    })
  } catch {
    // 已存在则忽略
  }
})

function makeCrmAppModel(): AppModel {
  return {
    id: 'crm_app',
    name: '客户管理系统',
    type: 'web',
    version: '0.1.0',
    schema: {
      pages: [
        { id: 'page_list', path: '/', title: '客户列表', layout: 'web', components: [] },
      ],
      routes: [{ path: '/', pageId: 'page_list' }],
      theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
      dataSources: [
        {
          id: 'customers',
          name: 'customers',
          type: 'static',
          data: [
            { name: '张三', phone: '13800000001', email: 'zhang@a.com', status: 'active' },
            { name: '李四', phone: '13900000002', email: 'li@a.com', status: 'inactive' },
          ],
        },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('initializeBackend - 集成测试（真实 SQLite）', () => {
  it('应根据 dataSources 建表并写入数据', async () => {
    const appModel = makeCrmAppModel()
    const result = await initializeBackend(TEST_TASK_ID, appModel)

    // 1. 建表成功
    expect(result.tableIds).toHaveLength(1)
    expect(result.warnings).toEqual([])

    // 2. 写入了 2 条记录
    expect(result.recordCount).toBe(2)

    // 3. 通过仓储层验证表存在
    const table = await getDb().dataModels.findByAppIdAndName(TEST_TASK_ID, 'customers')
    expect(table).toBeTruthy()
    expect(table!.appId).toBe(TEST_TASK_ID)

    // 4. 通过仓储层验证记录存在
    const records = await getDb().dataRecords.findByTableId(table!.id)
    expect(records).toHaveLength(2)

    // 5. 验证记录数据正确（JSON 反序列化）
    const data1 = JSON.parse(records[0].dataJson)
    expect(data1.name).toBeTruthy()
    expect(data1.phone).toBeTruthy()
  })

  it('重复初始化应幂等（更新而非重复建表）', async () => {
    const appModel = makeCrmAppModel()
    const result = await initializeBackend(TEST_TASK_ID, appModel)

    // 表已存在，应更新字段而非重复创建
    expect(result.tableIds).toHaveLength(1)
    expect(result.warnings).toEqual([])

    // 重复初始化不应再写入数据（recordCount 为 0）
    expect(result.recordCount).toBe(0)

    // 表数量仍为 1
    const tables = await getDb().dataModels.findByAppId(TEST_TASK_ID)
    expect(tables).toHaveLength(1)

    // 记录数量仍为初始的 2 条，未累积
    const records = await getDb().dataRecords.findByTableId(tables[0].id)
    expect(records).toHaveLength(2)
  })

  it('空数据源应跳过', async () => {
    const appModel = makeCrmAppModel()
    appModel.schema.dataSources = []
    const result = await initializeBackend(TEST_TASK_ID, appModel)

    expect(result.tableIds).toHaveLength(0)
    expect(result.recordCount).toBe(0)
  })

  it('多个数据源共享相同 id 时不应触发主键冲突', async () => {
    // AI 生成的 App Model 中，多个 dataSource 可能使用相同（或占位）id，
    // 这曾导致 "UNIQUE constraint failed: data_models.id"。
    // 修复后应使用 appId+name 生成稳定 id，彼此不冲突。
    const db = getDb()
    try {
      await db.tasks.create({
        id: 'dup_id_task',
        userId: TEST_USER_ID,
        prompt: '共享 id 任务',
        title: '共享 id 任务',
      })
    } catch {
      // 已存在则忽略
    }

    const appModel: AppModel = {
      id: 'dup_id_app',
      name: '共享 id 应用',
      type: 'web',
      version: '0.1.0',
      schema: {
        pages: [],
        routes: [],
        theme: { primaryColor: '#000', fontFamily: 'Arial' },
        dataSources: [
          { id: 'same_id', name: 'todos', type: 'static', data: [{ title: '任务1', done: false }] },
          { id: 'same_id', name: 'notes', type: 'static', data: [{ text: '备注1' }] },
        ],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = await initializeBackend('dup_id_task', appModel)

    // 两个数据源都应成功建表（无主键冲突），warnings 为空
    expect(result.tableIds).toHaveLength(2)
    expect(result.warnings).toEqual([])

    // 两张表应有不同的 id
    const tables = await getDb().dataModels.findByAppId('dup_id_task')
    expect(tables).toHaveLength(2)
    expect(new Set(tables.map((t) => t.id)).size).toBe(2)
  })

  it('旧表使用 dataSource.id 作主键时应迁移为 appId:name', async () => {
    const db = getDb()
    const taskId = 'migrate_task'
    try {
      await db.tasks.create({ id: taskId, userId: TEST_USER_ID, prompt: '迁移任务', title: '迁移任务' })
    } catch {
      // 已存在则忽略
    }

    // 模拟旧版本：表主键 = dataSource.id（而非 appId:name）
    try {
      await db.dataModels.create({
        id: 'customers', // 旧规则：直接用 dataSource.id
        appId: taskId,
        name: 'customers',
        fieldsJson: '[]',
      })
    } catch {
      // 已存在则忽略
    }

    const appModel = makeCrmAppModel()
    const result = await initializeBackend(taskId, appModel)

    // 表应被迁移为 appId:name 规则
    expect(result.tableIds).toEqual([`${taskId}:customers`])
    expect(result.warnings).toEqual([])

    // 旧表应被删除（级联删除记录），新表按新规则重建并写入数据
    const tables = await getDb().dataModels.findByAppId(taskId)
    expect(tables).toHaveLength(1)
    expect(tables[0].id).toBe(`${taskId}:customers`)

    // 新表下写入的记录数应等于样例数据条数
    const records = await getDb().dataRecords.findByTableId(`${taskId}:customers`)
    expect(records.length).toBeGreaterThan(0)
  })
})
