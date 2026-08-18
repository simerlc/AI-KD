import { describe, it, expect } from 'vitest'
import { resolveExpression, resolveTemplate, resolveObject } from '../expression'
import type { ActionContext } from '@aikd/shared'

const context: ActionContext = {
  form: { name: '张三', phone: '138' },
  record: { id: 'r1', name: '李四' },
  user: { id: 'u1', name: 'admin' },
  nested: { a: { b: 'deep' } },
}

describe('resolveExpression', () => {
  it('应解析 form.name', () => {
    expect(resolveExpression('form.name', context)).toBe('张三')
  })

  it('应解析 record.id', () => {
    expect(resolveExpression('record.id', context)).toBe('r1')
  })

  it('应解析 user.id', () => {
    expect(resolveExpression('user.id', context)).toBe('u1')
  })

  it('应支持任意深度嵌套路径', () => {
    expect(resolveExpression('nested.a.b', context)).toBe('deep')
  })

  it('不存在的路径应返回 undefined', () => {
    expect(resolveExpression('form.missing', context)).toBeUndefined()
  })
})

describe('resolveTemplate', () => {
  it('整个字符串是单个表达式时保留原始类型', () => {
    expect(resolveTemplate('{{record.id}}', context)).toBe('r1')
  })

  it('混合字符串应做字符串替换', () => {
    expect(resolveTemplate('hello {{form.name}}!', context)).toBe('hello 张三!')
  })

  it('多个表达式应全部替换', () => {
    expect(resolveTemplate('{{form.name}}-{{user.id}}', context)).toBe('张三-u1')
  })

  it('undefined 值应替换为空字符串', () => {
    expect(resolveTemplate('x{{form.missing}}y', context)).toBe('xy')
  })
})

describe('resolveObject', () => {
  it('应递归解析对象中的表达式', () => {
    const obj = {
      name: '{{form.name}}',
      id: '{{record.id}}',
      nested: { value: '{{user.id}}' },
      arr: ['{{form.phone}}', 123],
    }
    const result = resolveObject(obj, context) as Record<string, unknown>
    expect(result.name).toBe('张三')
    expect(result.id).toBe('r1')
    expect((result.nested as Record<string, unknown>).value).toBe('u1')
    expect(result.arr).toEqual(['138', 123])
  })

  it('非字符串值应原样返回', () => {
    expect(resolveObject(123, context)).toBe(123)
    expect(resolveObject(null, context)).toBeNull()
  })
})
