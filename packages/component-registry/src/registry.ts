import type { ComponentDefinition, ComponentCategory } from './types'
import { Container, Grid, Flex, Section } from './components/layout'
import { Heading, Text, Paragraph } from './components/text'
import { Button, Link } from './components/button'
import { Input, Textarea, Select, Checkbox, Form } from './components/form'
import { Image, Card, List, Table, Detail } from './components/display'
import { Header, Footer, NavBar, Tabs } from './components/navigation'
import { Alert, Badge, Modal } from './components/feedback'

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
]

// ─── Registry 实现 ───────────────────────────────────────

const componentMap = new Map<string, ComponentDefinition>()
for (const comp of builtinComponents) {
  componentMap.set(comp.type, comp)
}

export class ComponentRegistry {
  private components = new Map<string, ComponentDefinition>()

  constructor(initial?: ComponentDefinition[]) {
    if (initial) {
      for (const comp of initial) {
        this.components.set(comp.type, comp)
      }
    }
  }

  /** 注册组件 */
  register(component: ComponentDefinition): void {
    this.components.set(component.type, component)
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

  /** 生成组件描述清单（给 Planner Agent 使用） */
  toPromptDescription(): string {
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
      }
      lines.push('')
    }

    return lines.join('\n')
  }
}

// ─── 默认注册表实例 ──────────────────────────────────────

export const registry = new ComponentRegistry(builtinComponents)

export { builtinComponents }
