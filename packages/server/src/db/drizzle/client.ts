import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import * as schema from '../schema'
import path from 'path'
import { mkdirSync } from 'fs'

// 数据库路径：默认 process.cwd()/data/app.db。
// 如需多实例共享或隔离数据，请通过 DATABASE_PATH 环境变量显式指定。
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db')

// Ensure data directory exists
mkdirSync(path.dirname(DB_PATH), { recursive: true })

const sqlite = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Ensure tables exist (lightweight migration for V1)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    access_token TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    api_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_provider_external_id_idx ON users(provider, external_id);

  CREATE TABLE IF NOT EXISTS local_credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    title TEXT,
    app_type TEXT,
    selected_model TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    logs TEXT,
    error TEXT,
    agent_session_id TEXT,
    sandbox_url TEXT,
    preview_url TEXT,
    app_model_id TEXT,
    current_version TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS tasks_user_deleted_created_idx ON tasks(user_id, deleted_at, created_at);
  CREATE INDEX IF NOT EXISTS tasks_deleted_status_created_idx ON tasks(deleted_at, status, created_at);

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS settings_user_id_key_idx ON settings(user_id, key);

  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    url TEXT,
    path TEXT,
    label TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS deployments_task_id_idx ON deployments(task_id);

  CREATE TABLE IF NOT EXISTS app_models (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    model_json TEXT NOT NULL,
    version TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS app_models_app_id_idx ON app_models(app_id);
  CREATE INDEX IF NOT EXISTS app_models_app_version_idx ON app_models(app_id, version);

  CREATE TABLE IF NOT EXISTS app_versions (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    label TEXT,
    app_model_id TEXT NOT NULL REFERENCES app_models(id) ON DELETE CASCADE,
    code_hash TEXT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS app_versions_app_id_idx ON app_versions(app_id);

  CREATE TABLE IF NOT EXISTS data_models (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS data_models_app_name_idx ON data_models(app_id, name);

  CREATE TABLE IF NOT EXISTS data_records (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES data_models(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS data_records_table_idx ON data_records(table_id);
  CREATE INDEX IF NOT EXISTS data_records_app_table_idx ON data_records(app_id, table_id);
`)

export const drizzleDb = drizzle(sqlite, { schema })
