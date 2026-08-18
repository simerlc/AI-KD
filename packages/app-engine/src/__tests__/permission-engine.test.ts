import { describe, it, expect } from 'vitest'
import {
  PermissionEngine,
  checkRowPermission,
  filterRowsByPermission,
  createAdminRole,
  createSalesRole,
} from '../permission-engine'
import type { Organization, RbacContext, RbacUser, Role } from '@aikd/shared'

// ─── 测试工具：构建组织 + 角色 + 用户 ─────────────────────

const customerResource = 'customer'

function makeOrganization(): Organization {
  return {
    id: 'org_1',
    name: '测试组织',
    roles: [
      createAdminRole([customerResource]),
      createSalesRole([customerResource]),
    ],
  }
}

function makeUser(roleIds: string[]): RbacUser {
  return {
    id: 'user_1',
    username: 'test',
    organizationId: 'org_1',
    roleIds,
  }
}

function makeContext(user: RbacUser, org: Organization): RbacContext {
  return { user, organization: org }
}

// ─── 权限判定测试 ────────────────────────────────────────

describe('PermissionEngine - Admin vs Sales', () => {
  const engine = new PermissionEngine()
  const org = makeOrganization()

  it('Admin 应有 customer 的全部权限', () => {
    const admin = makeUser(['role_admin'])
    const context = makeContext(admin, org)

    expect(engine.can(context, { resource: 'customer', action: 'data.read' }).allowed).toBe(true)
    expect(engine.can(context, { resource: 'customer', action: 'data.create' }).allowed).toBe(true)
    expect(engine.can(context, { resource: 'customer', action: 'data.update' }).allowed).toBe(true)
    expect(engine.can(context, { resource: 'customer', action: 'data.delete' }).allowed).toBe(true)
  })

  it('Sales 应有 customer.read 和 customer.create', () => {
    const sales = makeUser(['role_sales'])
    const context = makeContext(sales, org)

    expect(engine.can(context, { resource: 'customer', action: 'data.read' }).allowed).toBe(true)
    expect(engine.can(context, { resource: 'customer', action: 'data.create' }).allowed).toBe(true)
  })

  it('Sales 不应有 customer.update 和 customer.delete', () => {
    const sales = makeUser(['role_sales'])
    const context = makeContext(sales, org)

    expect(engine.can(context, { resource: 'customer', action: 'data.update' }).allowed).toBe(false)
    expect(engine.can(context, { resource: 'customer', action: 'data.delete' }).allowed).toBe(false)
  })

  it('拒绝时应返回原因', () => {
    const sales = makeUser(['role_sales'])
    const context = makeContext(sales, org)

    const result = engine.can(context, { resource: 'customer', action: 'data.delete' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('data.delete')
    expect(result.reason).toContain('customer')
  })

  it('应支持 * 通配符（所有资源）', () => {
    const orgWithWildcard: Organization = {
      id: 'org_2',
      name: '通配组织',
      roles: [
        {
          id: 'role_super',
          name: 'super',
          permissions: [{ action: 'data.read', resource: '*' }],
        },
      ],
    }
    const user = makeUser(['role_super'])
    const context = makeContext(user, orgWithWildcard)

    expect(engine.can(context, { resource: 'customer', action: 'data.read' }).allowed).toBe(true)
    expect(engine.can(context, { resource: 'order', action: 'data.read' }).allowed).toBe(true)
    // 但 * 只匹配 read，不匹配其他动作
    expect(engine.can(context, { resource: 'customer', action: 'data.delete' }).allowed).toBe(false)
  })

  it('多角色应合并权限', () => {
    const multiRoleUser = makeUser(['role_admin', 'role_sales'])
    const context = makeContext(multiRoleUser, org)

    // admin 的 delete 权限 + sales 的 read 权限都应生效
    expect(engine.can(context, { resource: 'customer', action: 'data.delete' }).allowed).toBe(true)
    expect(engine.can(context, { resource: 'customer', action: 'data.read' }).allowed).toBe(true)
  })
})

// ─── 数据行权限测试 ──────────────────────────────────────

describe('数据行权限（owner_id = current_user.id）', () => {
  const user = { id: 'user_1' }

  it('应允许访问自己的数据行', () => {
    const row = { id: 'r1', owner_id: 'user_1', name: '张三' }
    const result = checkRowPermission(
      row,
      [{ field: 'owner_id', op: '==', value: '{{user.id}}' }],
      user,
    )
    expect(result).toBe(true)
  })

  it('应拒绝访问他人的数据行', () => {
    const row = { id: 'r2', owner_id: 'user_2', name: '李四' }
    const result = checkRowPermission(
      row,
      [{ field: 'owner_id', op: '==', value: '{{user.id}}' }],
      user,
    )
    expect(result).toBe(false)
  })

  it('无行权限限制时应放行', () => {
    const row = { id: 'r3', owner_id: 'user_2', name: '李四' }
    expect(checkRowPermission(row, [], user)).toBe(true)
  })

  it('filterRowsByPermission 应过滤出用户自己的数据', () => {
    const rows = [
      { id: 'r1', owner_id: 'user_1', name: '张三' },
      { id: 'r2', owner_id: 'user_2', name: '李四' },
      { id: 'r3', owner_id: 'user_1', name: '王五' },
    ]

    const filtered = filterRowsByPermission(
      rows,
      [{ field: 'owner_id', op: '==', value: '{{user.id}}' }],
      user,
    )

    expect(filtered).toHaveLength(2)
    expect(filtered.map((r) => r.id)).toEqual(['r1', 'r3'])
    expect(filtered.every((r) => r.owner_id === 'user_1')).toBe(true)
  })
})

// ─── 预设角色构造器测试 ──────────────────────────────────

describe('预设角色构造器', () => {
  it('createAdminRole 应包含全部 4 种操作', () => {
    const role = createAdminRole(['customer'])
    expect(role.permissions).toHaveLength(4)
    const actions = role.permissions.map((p) => p.action)
    expect(actions).toContain('data.read')
    expect(actions).toContain('data.create')
    expect(actions).toContain('data.update')
    expect(actions).toContain('data.delete')
  })

  it('createSalesRole 应只包含 read + create', () => {
    const role = createSalesRole(['customer'])
    expect(role.permissions).toHaveLength(2)
    const actions = role.permissions.map((p) => p.action)
    expect(actions).toContain('data.read')
    expect(actions).toContain('data.create')
    expect(actions).not.toContain('data.update')
    expect(actions).not.toContain('data.delete')
  })
})
