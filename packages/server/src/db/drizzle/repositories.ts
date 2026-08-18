import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { drizzleDb } from './client'
import {
  users,
  localCredentials,
  tasks,
  settings,
  deployments,
  appModels,
  appVersions,
  dataModels,
  dataRecords,
} from '../schema'
import type {
  User,
  NewUser,
  LocalCredential,
  NewLocalCredential,
  Task,
  NewTask,
  Setting,
  NewSetting,
  Deployment,
  NewDeployment,
  AppModelRecord,
  NewAppModelRecord,
  AppVersionRecord,
  NewAppVersionRecord,
  DataModelRecord,
  NewDataModelRecord,
  DataRecordRow,
  NewDataRecordRow,
  UserRepository,
  LocalCredentialRepository,
  TaskRepository,
  SettingRepository,
  DeploymentRepository,
  AppModelRepository,
  AppVersionRepository,
  DataModelRepository,
  DataRecordRepository,
  DatabaseProvider,
} from '../types'

const now = () => Date.now()

// ─── User Repository ────────────────────────────────────────────────────────

class DrizzleUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    const [row] = await drizzleDb.select().from(users).where(eq(users.id, id)).limit(1)
    return (row as User) ?? null
  }

  async findByProviderAndExternalId(provider: string, externalId: string): Promise<User | null> {
    const [row] = await drizzleDb
      .select()
      .from(users)
      .where(and(eq(users.provider, provider), eq(users.externalId, externalId)))
      .limit(1)
    return (row as User) ?? null
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    const [row] = await drizzleDb.select().from(users).where(eq(users.apiKey, apiKey)).limit(1)
    return (row as User) ?? null
  }

  async create(user: NewUser): Promise<User> {
    const ts = now()
    const values = {
      ...user,
      createdAt: user.createdAt ?? ts,
      updatedAt: user.updatedAt ?? ts,
      lastLoginAt: user.lastLoginAt ?? ts,
    }
    await drizzleDb.insert(users).values(values)
    return values as User
  }

  async update(id: string, data: Partial<Omit<User, 'id'>>): Promise<User | null> {
    const ts = now()
    await drizzleDb
      .update(users)
      .set({ ...data, updatedAt: ts })
      .where(eq(users.id, id))
    return this.findById(id)
  }

  async deleteById(id: string): Promise<void> {
    await drizzleDb.delete(users).where(eq(users.id, id))
  }

  async findAll(limit = 100, offset = 0): Promise<User[]> {
    return drizzleDb.select().from(users).limit(limit).offset(offset).orderBy(desc(users.createdAt)) as Promise<User[]>
  }

  async count(): Promise<number> {
    const [result] = await drizzleDb.select({ count: sql<number>`count(*)` }).from(users)
    return result?.count ?? 0
  }
}

// ─── Local Credential Repository ────────────────────────────────────────────

class DrizzleLocalCredentialRepository implements LocalCredentialRepository {
  async findByUserId(userId: string): Promise<LocalCredential | null> {
    const [row] = await drizzleDb.select().from(localCredentials).where(eq(localCredentials.userId, userId)).limit(1)
    return (row as LocalCredential) ?? null
  }

  async create(credential: NewLocalCredential): Promise<LocalCredential> {
    const ts = now()
    const values = {
      ...credential,
      createdAt: credential.createdAt ?? ts,
      updatedAt: credential.updatedAt ?? ts,
    }
    await drizzleDb.insert(localCredentials).values(values)
    return values as LocalCredential
  }

  async update(userId: string, data: Partial<Omit<LocalCredential, 'userId'>>): Promise<LocalCredential | null> {
    const ts = now()
    await drizzleDb
      .update(localCredentials)
      .set({ ...data, updatedAt: ts })
      .where(eq(localCredentials.userId, userId))
    return this.findByUserId(userId)
  }
}

// ─── Task Repository ────────────────────────────────────────────────────────

class DrizzleTaskRepository implements TaskRepository {
  async findById(id: string): Promise<Task | null> {
    const [row] = await drizzleDb.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    return (row as Task) ?? null
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Task | null> {
    const [row] = await drizzleDb
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1)
    return (row as Task) ?? null
  }

  async findByUserId(userId: string, limit = 50): Promise<Task[]> {
    return drizzleDb
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .limit(limit)
      .orderBy(desc(tasks.createdAt)) as Promise<Task[]>
  }

  async findAll(limit: number, offset: number, filters?: { userId?: string; status?: string }): Promise<Task[]> {
    const conditions = [isNull(tasks.deletedAt)]
    if (filters?.userId) conditions.push(eq(tasks.userId, filters.userId))
    if (filters?.status) conditions.push(eq(tasks.status, filters.status))

    return drizzleDb
      .select()
      .from(tasks)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(tasks.createdAt)) as Promise<Task[]>
  }

  async count(filters?: { userId?: string; status?: string }): Promise<number> {
    const conditions = [isNull(tasks.deletedAt)]
    if (filters?.userId) conditions.push(eq(tasks.userId, filters.userId))
    if (filters?.status) conditions.push(eq(tasks.status, filters.status))

    const [result] = await drizzleDb
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(...conditions))
    return result?.count ?? 0
  }

  async create(task: NewTask): Promise<Task> {
    const ts = now()
    const values = {
      ...task,
      createdAt: task.createdAt ?? ts,
      updatedAt: task.updatedAt ?? ts,
    }
    await drizzleDb.insert(tasks).values(values)
    return values as Task
  }

  async update(id: string, data: Partial<Omit<Task, 'id'>>): Promise<Task | null> {
    const ts = now()
    await drizzleDb
      .update(tasks)
      .set({ ...data, updatedAt: ts })
      .where(eq(tasks.id, id))
    return this.findById(id)
  }

  async softDelete(id: string): Promise<void> {
    const ts = now()
    await drizzleDb.update(tasks).set({ deletedAt: ts }).where(eq(tasks.id, id))
  }
}

// ─── Setting Repository ─────────────────────────────────────────────────────

class DrizzleSettingRepository implements SettingRepository {
  async findByUserIdAndKey(userId: string, key: string): Promise<Setting | null> {
    const [row] = await drizzleDb
      .select()
      .from(settings)
      .where(and(eq(settings.userId, userId), eq(settings.key, key)))
      .limit(1)
    return (row as Setting) ?? null
  }

  async findByUserId(userId: string): Promise<Setting[]> {
    return drizzleDb.select().from(settings).where(eq(settings.userId, userId)) as Promise<Setting[]>
  }

  async upsert(setting: NewSetting): Promise<Setting> {
    const ts = now()
    const values = {
      ...setting,
      createdAt: setting.createdAt ?? ts,
      updatedAt: ts,
    }
    await drizzleDb
      .insert(settings)
      .values(values)
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value: setting.value, updatedAt: ts },
      })
    if (setting.userId) {
      return (await this.findByUserIdAndKey(setting.userId, setting.key))!
    }
    const [row] = await drizzleDb
      .select()
      .from(settings)
      .where(and(isNull(settings.userId), eq(settings.key, setting.key)))
      .limit(1)
    return row as Setting
  }

  async findSystemSetting(key: string): Promise<Setting | null> {
    const [row] = await drizzleDb
      .select()
      .from(settings)
      .where(and(isNull(settings.userId), eq(settings.key, key)))
      .limit(1)
    return (row as Setting) ?? null
  }

  async upsertSystemSetting(key: string, value: string): Promise<Setting> {
    const ts = now()
    await drizzleDb
      .insert(settings)
      .values({ id: `${key}_${ts}`, userId: null, key, value, createdAt: ts, updatedAt: ts })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value, updatedAt: ts },
      })
    return (await this.findSystemSetting(key))!
  }

  async deleteSystemSetting(key: string): Promise<boolean> {
    const result = await drizzleDb.delete(settings).where(and(isNull(settings.userId), eq(settings.key, key)))
    return result.changes > 0
  }

  async findAllSystemSettings(): Promise<Setting[]> {
    return drizzleDb.select().from(settings).where(isNull(settings.userId)) as Promise<Setting[]>
  }
}

// ─── Deployment Repository ──────────────────────────────────────────────────

class DrizzleDeploymentRepository implements DeploymentRepository {
  async findByTaskId(taskId: string): Promise<Deployment[]> {
    return drizzleDb
      .select()
      .from(deployments)
      .where(and(eq(deployments.taskId, taskId), isNull(deployments.deletedAt)))
      .orderBy(desc(deployments.createdAt)) as Promise<Deployment[]>
  }

  async create(deployment: NewDeployment): Promise<Deployment> {
    const ts = now()
    const values = {
      ...deployment,
      createdAt: deployment.createdAt ?? ts,
      updatedAt: deployment.updatedAt ?? ts,
    }
    await drizzleDb.insert(deployments).values(values)
    return values as Deployment
  }

  async update(id: string, data: Partial<Omit<Deployment, 'id'>>): Promise<Deployment | null> {
    const ts = now()
    await drizzleDb
      .update(deployments)
      .set({ ...data, updatedAt: ts })
      .where(eq(deployments.id, id))
    const [row] = await drizzleDb.select().from(deployments).where(eq(deployments.id, id)).limit(1)
    return (row as Deployment) ?? null
  }

  async softDelete(id: string): Promise<void> {
    const ts = now()
    await drizzleDb.update(deployments).set({ deletedAt: ts }).where(eq(deployments.id, id))
  }
}

// ─── App Model Repository ───────────────────────────────────────────────────

class DrizzleAppModelRepository implements AppModelRepository {
  async findById(id: string): Promise<AppModelRecord | null> {
    const [row] = await drizzleDb.select().from(appModels).where(eq(appModels.id, id)).limit(1)
    return (row as AppModelRecord) ?? null
  }

  async findByAppId(appId: string): Promise<AppModelRecord[]> {
    return drizzleDb
      .select()
      .from(appModels)
      .where(eq(appModels.appId, appId))
      .orderBy(desc(appModels.createdAt)) as Promise<AppModelRecord[]>
  }

  async findLatestByAppId(appId: string): Promise<AppModelRecord | null> {
    const [row] = await drizzleDb
      .select()
      .from(appModels)
      .where(eq(appModels.appId, appId))
      .orderBy(desc(appModels.createdAt))
      .limit(1)
    return (row as AppModelRecord) ?? null
  }

  async create(record: NewAppModelRecord): Promise<AppModelRecord> {
    const ts = now()
    const values = {
      ...record,
      createdAt: record.createdAt ?? ts,
      updatedAt: record.updatedAt ?? ts,
    }
    await drizzleDb.insert(appModels).values(values)
    return values as AppModelRecord
  }

  async update(id: string, data: Partial<Omit<AppModelRecord, 'id'>>): Promise<AppModelRecord | null> {
    const ts = now()
    await drizzleDb
      .update(appModels)
      .set({ ...data, updatedAt: ts })
      .where(eq(appModels.id, id))
    return this.findById(id)
  }

  async deleteById(id: string): Promise<void> {
    await drizzleDb.delete(appModels).where(eq(appModels.id, id))
  }
}

// ─── App Version Repository ─────────────────────────────────────────────────

class DrizzleAppVersionRepository implements AppVersionRepository {
  async findById(id: string): Promise<AppVersionRecord | null> {
    const [row] = await drizzleDb.select().from(appVersions).where(eq(appVersions.id, id)).limit(1)
    return (row as AppVersionRecord) ?? null
  }

  async findByAppId(appId: string): Promise<AppVersionRecord[]> {
    return drizzleDb
      .select()
      .from(appVersions)
      .where(eq(appVersions.appId, appId))
      .orderBy(desc(appVersions.createdAt)) as Promise<AppVersionRecord[]>
  }

  async create(record: NewAppVersionRecord): Promise<AppVersionRecord> {
    const ts = now()
    const values = {
      ...record,
      createdAt: record.createdAt ?? ts,
    }
    await drizzleDb.insert(appVersions).values(values)
    return values as AppVersionRecord
  }

  async deleteById(id: string): Promise<void> {
    await drizzleDb.delete(appVersions).where(eq(appVersions.id, id))
  }
}

// ─── Data Model Repository ──────────────────────────────────────────────────

class DrizzleDataModelRepository implements DataModelRepository {
  async findById(id: string): Promise<DataModelRecord | null> {
    const [row] = await drizzleDb.select().from(dataModels).where(eq(dataModels.id, id)).limit(1)
    return (row as DataModelRecord) ?? null
  }

  async findByAppId(appId: string): Promise<DataModelRecord[]> {
    return drizzleDb
      .select()
      .from(dataModels)
      .where(eq(dataModels.appId, appId))
      .orderBy(desc(dataModels.createdAt)) as Promise<DataModelRecord[]>
  }

  async findByAppIdAndName(appId: string, name: string): Promise<DataModelRecord | null> {
    const [row] = await drizzleDb
      .select()
      .from(dataModels)
      .where(and(eq(dataModels.appId, appId), eq(dataModels.name, name)))
      .limit(1)
    return (row as DataModelRecord) ?? null
  }

  async create(record: NewDataModelRecord): Promise<DataModelRecord> {
    const ts = now()
    const values = {
      ...record,
      createdAt: record.createdAt ?? ts,
      updatedAt: record.updatedAt ?? ts,
    }
    await drizzleDb.insert(dataModels).values(values)
    return values as DataModelRecord
  }

  async update(id: string, data: Partial<Omit<DataModelRecord, 'id'>>): Promise<DataModelRecord | null> {
    const ts = now()
    await drizzleDb
      .update(dataModels)
      .set({ ...data, updatedAt: ts })
      .where(eq(dataModels.id, id))
    return this.findById(id)
  }

  async deleteById(id: string): Promise<void> {
    await drizzleDb.delete(dataModels).where(eq(dataModels.id, id))
  }
}

// ─── Data Record Repository ────────────────────────────────────────────────

class DrizzleDataRecordRepository implements DataRecordRepository {
  async findById(id: string): Promise<DataRecordRow | null> {
    const [row] = await drizzleDb.select().from(dataRecords).where(eq(dataRecords.id, id)).limit(1)
    return (row as DataRecordRow) ?? null
  }

  async findByTableId(tableId: string): Promise<DataRecordRow[]> {
    return drizzleDb
      .select()
      .from(dataRecords)
      .where(eq(dataRecords.tableId, tableId))
      .orderBy(desc(dataRecords.createdAt)) as Promise<DataRecordRow[]>
  }

  async create(record: NewDataRecordRow): Promise<DataRecordRow> {
    const ts = now()
    const values = {
      ...record,
      createdAt: record.createdAt ?? ts,
      updatedAt: record.updatedAt ?? ts,
    }
    await drizzleDb.insert(dataRecords).values(values)
    return values as DataRecordRow
  }

  async update(id: string, dataJson: string): Promise<DataRecordRow | null> {
    const ts = now()
    await drizzleDb.update(dataRecords).set({ dataJson, updatedAt: ts }).where(eq(dataRecords.id, id))
    return this.findById(id)
  }

  async deleteById(id: string): Promise<void> {
    await drizzleDb.delete(dataRecords).where(eq(dataRecords.id, id))
  }

  async countByTableId(tableId: string): Promise<number> {
    const [result] = await drizzleDb
      .select({ count: sql<number>`count(*)` })
      .from(dataRecords)
      .where(eq(dataRecords.tableId, tableId))
    return result?.count ?? 0
  }
}

// ─── Provider Factory ───────────────────────────────────────────────────────

export function createDrizzleProvider(): DatabaseProvider {
  return {
    users: new DrizzleUserRepository(),
    localCredentials: new DrizzleLocalCredentialRepository(),
    tasks: new DrizzleTaskRepository(),
    settings: new DrizzleSettingRepository(),
    deployments: new DrizzleDeploymentRepository(),
    appModels: new DrizzleAppModelRepository(),
    appVersions: new DrizzleAppVersionRepository(),
    dataModels: new DrizzleDataModelRepository(),
    dataRecords: new DrizzleDataRecordRepository(),
  }
}
