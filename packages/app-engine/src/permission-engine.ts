// ─── Permission Engine ───────────────────────────────────
//
// RBAC 权限判定引擎。Runtime 和 Backend 共享同一判定逻辑，
// 保证「前后端都执行权限校验」。
//
// 权限类型：
//   - Page Permission：能否访问某个页面
//   - Data Permission：能否对某表执行读/写/删
//   - Action Permission：能否执行某个动作
//
// 数据行权限：owner_id = current_user.id 的表达式判定。

import type {
  Permission,
  PermissionRequest,
  PermissionResult,
  RbacContext,
  Role,
  RowPermission,
} from '@aikd/shared'

// ─── Permission Engine ───────────────────────────────────

export class PermissionEngine {
  /**
   * 判定用户是否有权限执行某个操作。
   *
   * @param context RBAC 上下文（用户 + 组织）
   * @param request 权限请求（资源 + 动作 + 数据）
   */
  can(context: RbacContext, request: PermissionRequest): PermissionResult {
    const { user, organization } = context

    // 收集用户所有角色的权限
    const permissions = this.collectPermissions(user.roleIds, organization.roles)

    // 查找匹配的权限（资源精确匹配或 * 通配）
    const matched = permissions.some(
      (p) =>
        p.action === request.action &&
        (p.resource === request.resource || p.resource === '*'),
    )

    if (!matched) {
      return {
        allowed: false,
        reason: `缺少权限: ${request.action} ${request.resource}`,
      }
    }

    return { allowed: true }
  }

  /** 收集用户所有角色的权限（去重） */
  collectPermissions(roleIds: string[], roles: Role[]): Permission[] {
    const result: Permission[] = []
    const seen = new Set<string>()

    for (const roleId of roleIds) {
      const role = roles.find((r) => r.id === roleId)
      if (!role) continue
      for (const permission of role.permissions) {
        const key = `${permission.action}:${permission.resource}`
        if (!seen.has(key)) {
          seen.add(key)
          result.push(permission)
        }
      }
    }

    return result
  }
}

// ─── 数据行权限 ──────────────────────────────────────────

/**
 * 判定用户能否访问某条数据行（行级权限）。
 *
 * 规则：若存在行权限表达式，则要求数据行的字段值匹配。
 * 例如 { field: 'owner_id', op: '==', value: '{{user.id}}' }，
 * 要求 record.owner_id === user.id。
 */
export function checkRowPermission(
  row: Record<string, unknown>,
  rowPermissions: RowPermission[],
  user: { id: string },
): boolean {
  // 无行权限限制则放行
  if (rowPermissions.length === 0) return true

  return rowPermissions.every((rp) => {
    const fieldValue = row[rp.field]
    const expected = resolveUserValue(rp.value, user)
    return compare(fieldValue, expected, rp.op)
  })
}

/** 解析行权限表达式中的 {{user.id}} 变量 */
function resolveUserValue(value: string, user: { id: string }): string {
  return value.replace(/\{\{\s*user\.id\s*\}\}/g, user.id)
}

function compare(a: unknown, b: unknown, op: string): boolean {
  switch (op) {
    case '==':
      return String(a ?? '') === String(b ?? '')
    case '!=':
      return String(a ?? '') !== String(b ?? '')
    case '>':
      return Number(a) > Number(b)
    case '<':
      return Number(a) < Number(b)
    case '>=':
      return Number(a) >= Number(b)
    case '<=':
      return Number(a) <= Number(b)
    default:
      return false
  }
}

// ─── 便捷函数：过滤数据行 ────────────────────────────────

/**
 * 根据行权限过滤数据行。
 * 用于 Backend 在返回数据前过滤，保证「后端也执行权限校验」。
 */
export function filterRowsByPermission<T extends Record<string, unknown>>(
  rows: T[],
  rowPermissions: RowPermission[],
  user: { id: string },
): T[] {
  return rows.filter((row) => checkRowPermission(row, rowPermissions, user))
}

// ─── 预设角色构造器 ──────────────────────────────────────

/**
 * 创建 Admin 角色：拥有所有权限。
 */
export function createAdminRole(resources: string[]): Role {
  return {
    id: 'role_admin',
    name: 'admin',
    permissions: resources.flatMap((resource) => [
      { action: 'data.read', resource },
      { action: 'data.create', resource },
      { action: 'data.update', resource },
      { action: 'data.delete', resource },
    ]),
  }
}

/**
 * 创建 Sales 角色：只读 + 创建。
 */
export function createSalesRole(resources: string[]): Role {
  return {
    id: 'role_sales',
    name: 'sales',
    permissions: resources.flatMap((resource) => [
      { action: 'data.read', resource },
      { action: 'data.create', resource },
    ]),
  }
}
