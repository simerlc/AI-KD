// ─── RBAC 权限系统类型定义 ──────────────────────────────
//
// 用户、组织、角色、权限的四层 RBAC 模型。
// 权限分为三类：Page（页面）、Data（数据）、Action（动作）。
// 权限判定由 PermissionEngine 统一处理，Runtime 和 Backend 共享同一判定逻辑。

// ─── 权限动作 ────────────────────────────────────────────

/** 权限动作（资源.操作） */
export type RbacPermissionAction =
  /** 数据操作 */
  | 'data.read'
  | 'data.create'
  | 'data.update'
  | 'data.delete'
  /** 页面访问 */
  | 'page.view'
  /** 应用动作执行 */
  | 'action.execute'

/** 资源标识（如 customer / order / page_list） */
export type ResourceId = string

// ─── Permission ──────────────────────────────────────────

/**
 * 单个权限：允许某个角色对某个资源执行某个动作。
 * 例如：{ action: 'data.read', resource: 'customer' }
 */
export interface Permission {
  /** 权限动作 */
  action: RbacPermissionAction
  /** 资源 ID（表名 / 页面 ID / 动作 ID），* 表示所有 */
  resource: ResourceId
}

/** 权限 ID（如 customer.read，规范化形式） */
export type PermissionKey = `${string}.${string}`

// ─── Role ────────────────────────────────────────────────

/**
 * 角色：一组权限的集合。
 * 例如：Admin 拥有 customer.* 全部权限，Sales 只有 customer.read/create。
 */
export interface Role {
  /** 角色唯一 ID */
  id: string
  /** 角色名称（如 admin / sales） */
  name: string
  /** 角色拥有的权限列表 */
  permissions: Permission[]
  /** 描述 */
  description?: string
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ─── Organization ────────────────────────────────────────

/** 组织：用户的归属单位，角色在组织内生效 */
export interface Organization {
  /** 组织唯一 ID */
  id: string
  /** 组织名称 */
  name: string
  /** 组织内的角色定义 */
  roles: Role[]
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ─── User ────────────────────────────────────────────────

/** RBAC 中的用户主体 */
export interface RbacUser {
  /** 用户唯一 ID */
  id: string
  /** 用户名 */
  username?: string
  /** 所属组织 ID */
  organizationId: string
  /** 用户的角色 ID 列表 */
  roleIds: string[]
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ─── 数据行权限 ──────────────────────────────────────────

/**
 * 数据行权限表达式。
 * 用于限定用户只能访问特定数据行。
 * 例如：{ field: 'owner_id', op: '==', value: '{{user.id}}' }
 */
export interface RowPermission {
  /** 字段名（如 owner_id） */
  field: string
  /** 比较运算符 */
  op: '==' | '!=' | '>' | '<' | '>=' | '<='
  /** 比较值（支持 {{user.id}} 变量表达式） */
  value: string
}

// ─── 权限判定上下文 ──────────────────────────────────────

/** 权限判定请求：请求访问的页面/数据/动作 */
export interface PermissionRequest {
  /** 请求的资源（表名/页面 ID/动作 ID） */
  resource: ResourceId
  /** 请求的动作 */
  action: RbacPermissionAction
  /** 请求的数据（data 权限判定时传入，用于行权限） */
  data?: Record<string, unknown>
}

/** 权限判定结果 */
export interface PermissionResult {
  /** 是否允许 */
  allowed: boolean
  /** 拒绝原因（可选） */
  reason?: string
}

// ─── RBAC 上下文（传给 PermissionEngine） ────────────────

export interface RbacContext {
  /** 当前用户 */
  user: RbacUser
  /** 组织（含角色定义） */
  organization: Organization
}
