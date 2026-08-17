// ─── Data Types (AI快搭 V1 精简版) ──────────────────────────────────────────

export interface User {
  id: string
  provider: string // 'local'
  externalId: string
  accessToken: string
  username: string
  email: string | null
  name: string | null
  avatarUrl: string | null
  role: string // 'user' | 'admin'
  status: string // 'active' | 'disabled'
  apiKey: string | null
  createdAt: number
  updatedAt: number
  lastLoginAt: number
}

export interface LocalCredential {
  userId: string
  passwordHash: string
  createdAt: number
  updatedAt: number
}

export interface Task {
  id: string
  userId: string
  prompt: string
  title: string | null
  appType: string | null // 'web' | 'h5' | 'static'
  selectedModel: string | null
  status: string
  progress: number | null
  logs: string | null
  error: string | null
  agentSessionId: string | null
  sandboxUrl: string | null
  previewUrl: string | null
  appModelId: string | null // 关联 App Model
  currentVersion: string | null // 当前版本号
  createdAt: number
  updatedAt: number
  completedAt: number | null
  deletedAt: number | null
}

export interface Setting {
  id: string
  userId: string | null
  key: string
  value: string
  createdAt: number
  updatedAt: number
}

export interface Deployment {
  id: string
  taskId: string
  type: string // 'static' | 'local'
  url: string | null
  path: string | null
  label: string | null
  metadata: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

// ─── App Model / App Version Types ──────────────────────────────────────────

export interface AppModelRecord {
  id: string
  appId: string
  modelJson: string // AppModel JSON 字符串
  version: string
  createdAt: number
  updatedAt: number
}

export interface AppVersionRecord {
  id: string
  appId: string
  version: string
  label: string | null
  appModelId: string
  codeHash: string | null
  userId: string
  createdAt: number
}

// ─── Creation Types ─────────────────────────────────────────────────────────

type UserNullableFields = 'email' | 'name' | 'avatarUrl' | 'apiKey'

export type NewUser = Omit<User, 'createdAt' | 'updatedAt' | 'lastLoginAt' | UserNullableFields> &
  Partial<Pick<User, UserNullableFields>> & {
    createdAt?: number
    updatedAt?: number
    lastLoginAt?: number
  }

export type NewLocalCredential = Omit<LocalCredential, 'createdAt' | 'updatedAt'> & {
  createdAt?: number
  updatedAt?: number
}

type TaskNullableFields =
  | 'title'
  | 'appType'
  | 'selectedModel'
  | 'progress'
  | 'logs'
  | 'error'
  | 'agentSessionId'
  | 'sandboxUrl'
  | 'previewUrl'
  | 'appModelId'
  | 'currentVersion'

export type NewTask = Omit<Task, 'createdAt' | 'updatedAt' | 'completedAt' | 'deletedAt' | TaskNullableFields> &
  Partial<Pick<Task, TaskNullableFields>> & {
    createdAt?: number
    updatedAt?: number
    completedAt?: number | null
    deletedAt?: number | null
  }

export type NewSetting = Omit<Setting, 'createdAt' | 'updatedAt'> & {
  createdAt?: number
  updatedAt?: number
}

export type NewDeployment = Omit<Deployment, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt?: number
  updatedAt?: number
  deletedAt?: number | null
}

export type NewAppModelRecord = Omit<AppModelRecord, 'createdAt' | 'updatedAt'> & {
  createdAt?: number
  updatedAt?: number
}

export type NewAppVersionRecord = Omit<AppVersionRecord, 'createdAt'> & {
  createdAt?: number
}

// ─── Repository Interfaces ──────────────────────────────────────────────────

export interface UserRepository {
  findById(id: string): Promise<User | null>
  findByProviderAndExternalId(provider: string, externalId: string): Promise<User | null>
  findByApiKey(apiKey: string): Promise<User | null>
  create(user: NewUser): Promise<User>
  update(id: string, data: Partial<Omit<User, 'id'>>): Promise<User | null>
  deleteById(id: string): Promise<void>
  findAll(limit?: number, offset?: number): Promise<User[]>
  count(): Promise<number>
}

export interface LocalCredentialRepository {
  findByUserId(userId: string): Promise<LocalCredential | null>
  create(credential: NewLocalCredential): Promise<LocalCredential>
  update(userId: string, data: Partial<Omit<LocalCredential, 'userId'>>): Promise<LocalCredential | null>
}

export interface TaskRepository {
  findById(id: string): Promise<Task | null>
  findByIdAndUserId(id: string, userId: string): Promise<Task | null>
  findByUserId(userId: string, limit?: number): Promise<Task[]>
  findAll(limit: number, offset: number, filters?: { userId?: string; status?: string }): Promise<Task[]>
  count(filters?: { userId?: string; status?: string }): Promise<number>
  create(task: NewTask): Promise<Task>
  update(id: string, data: Partial<Omit<Task, 'id'>>): Promise<Task | null>
  softDelete(id: string): Promise<void>
}

export interface SettingRepository {
  findByUserIdAndKey(userId: string, key: string): Promise<Setting | null>
  findByUserId(userId: string): Promise<Setting[]>
  upsert(setting: NewSetting): Promise<Setting>
  findSystemSetting(key: string): Promise<Setting | null>
  upsertSystemSetting(key: string, value: string): Promise<Setting>
  deleteSystemSetting(key: string): Promise<boolean>
  findAllSystemSettings(): Promise<Setting[]>
}

export interface DeploymentRepository {
  findByTaskId(taskId: string): Promise<Deployment[]>
  create(deployment: NewDeployment): Promise<Deployment>
  update(id: string, data: Partial<Omit<Deployment, 'id'>>): Promise<Deployment | null>
  softDelete(id: string): Promise<void>
}

export interface AppModelRepository {
  findById(id: string): Promise<AppModelRecord | null>
  findByAppId(appId: string): Promise<AppModelRecord[]>
  findLatestByAppId(appId: string): Promise<AppModelRecord | null>
  create(record: NewAppModelRecord): Promise<AppModelRecord>
  update(id: string, data: Partial<Omit<AppModelRecord, 'id'>>): Promise<AppModelRecord | null>
  deleteById(id: string): Promise<void>
}

export interface AppVersionRepository {
  findById(id: string): Promise<AppVersionRecord | null>
  findByAppId(appId: string): Promise<AppVersionRecord[]>
  create(record: NewAppVersionRecord): Promise<AppVersionRecord>
  deleteById(id: string): Promise<void>
}

// ─── Database Provider ──────────────────────────────────────────────────────

export interface DatabaseProvider {
  users: UserRepository
  localCredentials: LocalCredentialRepository
  tasks: TaskRepository
  settings: SettingRepository
  deployments: DeploymentRepository
  appModels: AppModelRepository
  appVersions: AppVersionRepository
}
