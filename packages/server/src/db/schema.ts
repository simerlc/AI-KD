import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const now = () => Date.now()

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    accessToken: text('access_token').notNull().default(''),
    username: text('username').notNull(),
    email: text('email'),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    role: text('role').notNull().default('user'),
    status: text('status').notNull().default('active'),
    apiKey: text('api_key'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
    lastLoginAt: integer('last_login_at').notNull().$defaultFn(now),
  },
  (table) => ({
    providerExternalIdUnique: uniqueIndex('users_provider_external_id_idx').on(table.provider, table.externalId),
  }),
)

// ─── Local Credentials ────────────────────────────────────────────────────────

export const localCredentials = sqliteTable('local_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(now),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
})

// ─── Tasks (Apps) ────────────────────────────────────────────────────────────

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    title: text('title'),
    appType: text('app_type'), // 'web' | 'h5' | 'static'
    selectedModel: text('selected_model'),
    status: text('status').notNull().default('pending'),
    progress: integer('progress').default(0),
    logs: text('logs'),
    error: text('error'),
    agentSessionId: text('agent_session_id'),
    sandboxUrl: text('sandbox_url'),
    previewUrl: text('preview_url'),
    appModelId: text('app_model_id'),
    currentVersion: text('current_version'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
    completedAt: integer('completed_at'),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    userDeletedCreatedIdx: index('tasks_user_deleted_created_idx').on(table.userId, table.deletedAt, table.createdAt),
    deletedStatusCreatedIdx: index('tasks_deleted_status_created_idx').on(
      table.deletedAt,
      table.status,
      table.createdAt,
    ),
  }),
)

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = sqliteTable(
  'settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (table) => ({
    userIdKeyUnique: uniqueIndex('settings_user_id_key_idx').on(table.userId, table.key),
  }),
)

// ─── Deployments ─────────────────────────────────────────────────────────────

export const deployments = sqliteTable(
  'deployments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'static' | 'local'
    url: text('url'),
    path: text('path'),
    label: text('label'),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    taskIdIdx: index('deployments_task_id_idx').on(table.taskId),
  }),
)

// ─── App Models ──────────────────────────────────────────────────────────────
// 存储 App Model JSON 快照，每次 Planner 生成或修改 App Model 时创建新记录。

export const appModels = sqliteTable(
  'app_models',
  {
    id: text('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    modelJson: text('model_json').notNull(), // AppModel JSON 字符串
    version: text('version').notNull(), // 语义化版本号
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (table) => ({
    appIdIdx: index('app_models_app_id_idx').on(table.appId),
    appVersionIdx: index('app_models_app_version_idx').on(table.appId, table.version),
  }),
)

// ─── App Versions ────────────────────────────────────────────────────────────
// 应用版本快照，关联 App Model 和代码 hash，用于版本管理和发布。

export const appVersions = sqliteTable(
  'app_versions',
  {
    id: text('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    label: text('label'),
    appModelId: text('app_model_id')
      .notNull()
      .references(() => appModels.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (table) => ({
    appIdIdx: index('app_versions_app_id_idx').on(table.appId),
  }),
)

// ─── Data Models（动态数据表定义）───────────────────────────────────────────
// 存储 AI 生成应用自定义的「表」结构（表名 + 字段定义）。
// 每个应用（task）可定义多张表，字段类型为有限集（string/number/...）。
// 字段定义以 JSON 字符串存储（fieldsJson）。

export const dataModels = sqliteTable(
  'data_models',
  {
    id: text('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // 表名，如 'customers'
    fieldsJson: text('fields_json').notNull(), // TableField[] JSON 字符串
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (table) => ({
    appNameIdx: index('data_models_app_name_idx').on(table.appId, table.name),
  }),
)

// ─── Data Records（动态数据记录）───────────────────────────────────────────
// 存储数据表的具体行。dataJson 为 JSON 对象（字段名 → JSON 值）。
// 通过 appId + tableId 关联到具体应用的表。

export const dataRecords = sqliteTable(
  'data_records',
  {
    id: text('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tableId: text('table_id')
      .notNull()
      .references(() => dataModels.id, { onDelete: 'cascade' }),
    dataJson: text('data_json').notNull(), // 记录 JSON 对象
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (table) => ({
    tableIdx: index('data_records_table_idx').on(table.tableId),
    appTableIdx: index('data_records_app_table_idx').on(table.appId, table.tableId),
  }),
)
