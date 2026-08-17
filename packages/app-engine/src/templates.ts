import type { AppModel, AppType } from '@aikd/shared'

// ─── 内置页面模板 ────────────────────────────────────────
//
// 三种 starter 模板，用于新建应用时的初始 App Model。
// Planner Agent 可以基于这些模板进行修改和扩展。

function createStarterModel(type: AppType, name: string): AppModel {
  const now = Date.now()
  const baseId = `app_${type}_${now}`

  if (type === 'web') {
    return createWebStarter(baseId, name, now)
  }
  if (type === 'h5') {
    return createH5Starter(baseId, name, now)
  }
  return createStaticStarter(baseId, name, now)
}

function createWebStarter(id: string, name: string, ts: number): AppModel {
  return {
    id,
    name,
    type: 'web',
    version: '0.1.0',
    schema: {
      pages: [
        {
          id: 'page_home',
          path: '/',
          title: '首页',
          layout: 'web',
          components: [
            {
              id: 'c_header',
              type: 'Header',
              props: { title: name, background: '#ffffff', height: '64px' },
            },
            {
              id: 'c_hero',
              type: 'Section',
              props: { title: '', background: '#f8fafc', padding: '48px' },
              children: [
                {
                  id: 'c_hero_title',
                  type: 'Heading',
                  props: { text: '欢迎来到' + name, level: 'h1', align: 'center', color: '#1a1a1a' },
                },
                {
                  id: 'c_hero_desc',
                  type: 'Paragraph',
                  props: {
                    text: '这是一个基于 AI快搭 创建的 Web 应用。',
                    fontSize: '18px',
                    lineHeight: '1.6',
                    color: '#666666',
                    align: 'center',
                  },
                },
                {
                  id: 'c_hero_btn',
                  type: 'Button',
                  props: { text: '开始使用', variant: 'primary', size: 'large' },
                },
              ],
            },
            {
              id: 'c_footer',
              type: 'Footer',
              props: { text: '© 2026 ' + name, background: '#f5f5f5', color: '#666666' },
            },
          ],
        },
      ],
      routes: [{ path: '/', pageId: 'page_home' }],
      theme: {
        primaryColor: '#3b82f6',
        fontFamily: 'Inter, system-ui, sans-serif',
        backgroundColor: '#ffffff',
        textColor: '#1a1a1a',
      },
      dataSources: [],
    },
    createdAt: ts,
    updatedAt: ts,
  }
}

function createH5Starter(id: string, name: string, ts: number): AppModel {
  return {
    id,
    name,
    type: 'h5',
    version: '0.1.0',
    schema: {
      pages: [
        {
          id: 'page_home',
          path: '/',
          title: '首页',
          layout: 'mobile',
          components: [
            {
              id: 'c_nav',
              type: 'NavBar',
              props: {
                items: [
                  { text: '首页', href: '/' },
                  { text: '关于', href: '/about' },
                ],
                orientation: 'horizontal',
              },
            },
            {
              id: 'c_content',
              type: 'Container',
              props: { maxWidth: '100%', padding: '16px', background: '#ffffff' },
              children: [
                {
                  id: 'c_title',
                  type: 'Heading',
                  props: { text: name, level: 'h2', align: 'center', color: '#1a1a1a' },
                },
                {
                  id: 'c_desc',
                  type: 'Text',
                  props: { text: '移动端 H5 应用', fontSize: '14px', color: '#666666', align: 'center' },
                },
                {
                  id: 'c_card',
                  type: 'Card',
                  props: { title: '功能卡片', shadow: 'small', radius: '12px', padding: '16px' },
                  children: [
                    {
                      id: 'c_card_text',
                      type: 'Paragraph',
                      props: { text: '这里是卡片内容区域。', fontSize: '14px', lineHeight: '1.5', color: '#333333' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      routes: [{ path: '/', pageId: 'page_home' }],
      theme: {
        primaryColor: '#6366f1',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        backgroundColor: '#ffffff',
        textColor: '#1a1a1a',
      },
      dataSources: [],
    },
    createdAt: ts,
    updatedAt: ts,
  }
}

function createStaticStarter(id: string, name: string, ts: number): AppModel {
  return {
    id,
    name,
    type: 'static',
    version: '0.1.0',
    schema: {
      pages: [
        {
          id: 'page_home',
          path: '/',
          title: '首页',
          layout: 'web',
          components: [
            {
              id: 'c_container',
              type: 'Container',
              props: { maxWidth: '800px', padding: '40px', background: '#ffffff' },
              children: [
                {
                  id: 'c_title',
                  type: 'Heading',
                  props: { text: name, level: 'h1', align: 'center', color: '#1a1a1a' },
                },
                {
                  id: 'c_desc',
                  type: 'Paragraph',
                  props: {
                    text: '这是一个静态页面，适合落地页和简单展示。',
                    fontSize: '16px',
                    lineHeight: '1.8',
                    color: '#666666',
                    align: 'center',
                  },
                },
              ],
            },
          ],
        },
      ],
      routes: [{ path: '/', pageId: 'page_home' }],
      theme: {
        primaryColor: '#0f172a',
        fontFamily: 'Georgia, serif',
        backgroundColor: '#ffffff',
        textColor: '#1a1a1a',
      },
      dataSources: [],
    },
    createdAt: ts,
    updatedAt: ts,
  }
}

// ─── 模板导出 ────────────────────────────────────────────

export interface StarterTemplate {
  type: AppType
  name: string
  description: string
  create: (appName: string) => AppModel
}

export const starterTemplates: Record<AppType, StarterTemplate> = {
  web: {
    type: 'web',
    name: 'Web 应用',
    description: '桌面端 Web 应用，包含页头、内容区和页脚',
    create: (appName: string) => createStarterModel('web', appName),
  },
  h5: {
    type: 'h5',
    name: 'H5 移动端',
    description: '移动端 H5 页面，移动端优化布局',
    create: (appName: string) => createStarterModel('h5', appName),
  },
  static: {
    type: 'static',
    name: '静态页面',
    description: '简洁静态页面，适合落地页和展示',
    create: (appName: string) => createStarterModel('static', appName),
  },
}

/** 根据应用类型获取 starter 模板 */
export function getStarterTemplate(type: AppType): StarterTemplate {
  return starterTemplates[type]
}

/** 创建 starter App Model */
export function createStarterAppModel(type: AppType, name: string): AppModel {
  return getStarterTemplate(type).create(name)
}
