import type { ComponentDefinition, ComponentCategory, UsageExample } from './types'
import { Container, Grid, Flex, Section } from './components/layout'
import { Heading, Text, Paragraph } from './components/text'
import { Button, Link } from './components/button'
import { Input, Textarea, Select, Checkbox, Form } from './components/form'
import { Image, Card, List, Table, Detail } from './components/display'
import { Header, Footer, NavBar, Tabs } from './components/navigation'
import { Alert, Badge, Modal } from './components/feedback'
import { Dashboard, StatCard, Chart, Login } from './components/advanced'
import { defaultUsageExamples } from './usage-examples'

// ─── 内置组件注册表 ──────────────────────────────────────

const builtinComponents: ComponentDefinition[] = [
  // layout
  Container,
  Grid,
  Flex,
  Section,
  // text
  Heading,
  Text,
  Paragraph,
  // button
  Button,
  Link,
  // form
  Input,
  Textarea,
  Select,
  Checkbox,
  Form,
  // display
  Image,
  Card,
  List,
  Table,
  Detail,
  // navigation
  Header,
  Footer,
  NavBar,
  Tabs,
  // feedback
  Alert,
  Badge,
  Modal,
  // advanced（新增：仪表盘 / 图表 / 登录，让 Agent 优先复用）
  Dashboard,
  StatCard,
  Chart,
  Login,
]

// ─── Registry 实现 ───────────────────────────────────────

/**
 * 组件注册中心（Component Library 核心）。
 *
 * 特性：
 * - 组件注册/注销/查找，可按分类检索
 * - 组件扩展：register() 或 new ComponentRegistry(initial) 即可加入新组件
 * - 用法示例：自动合并 defaultUsageExamples，Blueprint/Coding Agent 可复用
 * - 组件选择（recommend）：根据需求关键词推荐最合适的组件
 */
export class ComponentRegistry {
  private components = new Map<string, ComponentDefinition>()

  constructor(initial?: ComponentDefinition[]) {
    if (initial) {
      for (const comp of initial) {
        this.register(comp)
      }
    }
  }

  /**
   * 注册组件（可扩展：未来新增组件直接调用 register 即可）。
   * 若组件未提供 usageExamples，自动合并 defaultUsageExamples。
   */
  register(component: ComponentDefinition): void {
    const withExamples: ComponentDefinition = {
      ...component,
      usageExamples:
        component.usageExamples && component.usageExamples.length > 0
          ? component.usageExamples
          : defaultUsageExamples[component.type] ?? [],
    }
    this.components.set(component.type, withExamples)
  }

  /** 批量注册组件 */
  registerAll(components: ComponentDefinition[]): void {
    for (const comp of components) {
      this.register(comp)
    }
  }

  /** 注销组件 */
  unregister(type: string): void {
    this.components.delete(type)
  }

  /** 获取组件定义 */
  get(type: string): ComponentDefinition | undefined {
    return this.components.get(type)
  }

  /** 检查组件是否存在 */
  has(type: string): boolean {
    return this.components.has(type)
  }

  /** 获取所有组件 */
  list(): ComponentDefinition[] {
    return Array.from(this.components.values())
  }

  /** 按分类获取组件 */
  listByCategory(category: ComponentCategory): ComponentDefinition[] {
    return this.list().filter((c) => c.category === category)
  }

  /** 获取所有分类 */
  categories(): ComponentCategory[] {
    const set = new Set<ComponentCategory>()
    for (const comp of this.components.values()) {
      set.add(comp.category)
    }
    return Array.from(set)
  }

  /** 获取组件的用法示例 */
  getUsageExamples(type: string): UsageExample[] {
    return this.components.get(type)?.usageExamples ?? []
  }

  /**
   * 组件选择能力：根据需求描述与数据模型，推荐最合适的组件。
   * 让 BlueprintAgent 在做页面规划时优先复用已有组件。
   *
   * 策略：基于关键词匹配 + 分类加权，返回按相关度排序的组件列表。
   */
  recommend(input: {
    /** 页面用途/需求描述 */
    description?: string
    /** 页面类型（list/form/detail/home/dashboard 等） */
    pageType?: string
    /** 目标分类，限制推荐范围 */
    category?: ComponentCategory
    /** 最大返回数量 */
    limit?: number
  }): ComponentDefinition[] {
    const limit = input.limit ?? 3
    const text = `${input.description ?? ''} ${input.pageType ?? ''}`.toLowerCase()

    const score = (comp: ComponentDefinition): number => {
      let s = 0
      // 分类限制
      if (input.category && comp.category !== input.category) return -1

      // 基于页面类型直接匹配（最强信号）
      const typeMap: Record<string, string[]> = {
        dashboard: ['dashboard', 'chart', 'statcard', 'table'],
        home: ['dashboard', 'card', 'list', 'chart', 'heading'],
        list: ['table', 'list'],
        detail: ['detail', 'card'],
        form: ['form', 'input', 'select', 'textarea'],
        login: ['login', 'form'],
      }
      const matched = typeMap[input.pageType ?? ''] ?? []
      if (matched.includes(comp.type.toLowerCase())) s += 3

      // 关键词匹配组件名/描述
      const haystack = `${comp.name} ${comp.description} ${comp.type}`.toLowerCase()
      const keywords = ['图', '看板', '仪表', '统计', '表格', '数据', '列表', '登录', '表单', '详情', '图表']
      for (const kw of keywords) {
        if (haystack.includes(kw)) s += 1
      }
      if (text) {
        for (const kw of text.split(/[\s,，。]+/)) {
          if (kw.length >= 2 && haystack.includes(kw)) s += 2
        }
      }
      return s
    }

    return this.list()
      .map((comp) => ({ comp, s: score(comp) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.comp)
  }

  /**
   * 生成组件清单（给 Planner/Blueprint Agent 使用），
   * 包含每个组件的 name / description / props / usageExamples，便于组件选择。
   */
  toPromptDescription(opts?: { includeExamples?: boolean }): string {
    const includeExamples = opts?.includeExamples ?? true
    const lines: string[] = []
    const byCategory = new Map<ComponentCategory, ComponentDefinition[]>()

    for (const comp of this.components.values()) {
      let group = byCategory.get(comp.category)
      if (!group) {
        group = []
        byCategory.set(comp.category, group)
      }
      group.push(comp)
    }

    for (const [category, comps] of byCategory) {
      lines.push(`## ${category}`)
      for (const comp of comps) {
        const propsHint = comp.propsSchema.map((p) => `${p.name}(${p.type})${p.required ? '*' : ''}`).join(', ')
        const childrenHint = comp.acceptsChildren ? ' [accepts children]' : ''
        lines.push(`- ${comp.type}: ${comp.description}${childrenHint}`)
        if (propsHint) {
          lines.push(`  props: ${propsHint}`)
        }
        if (includeExamples && comp.usageExamples && comp.usageExamples.length > 0) {
          const example = comp.usageExamples[0]
          lines.push(`  示例(${example.name}): ${JSON.stringify(example.component)}`)
        }
      }
      lines.push('')
    }

    return lines.join('\n')
  }
}

// ─── 默认注册表实例 ──────────────────────────────────────

export const registry = new ComponentRegistry(builtinComponents)

export { builtinComponents }
