import { describe, it, expect } from 'vitest'
import { BuilderAgent } from '../builder'
import type { AppModel } from '@aikd/shared'
import type { LLMClient } from '../types'

const mockLLM: LLMClient = {
  async complete() {
    return ''
  },
  async stream(_m, _o, onChunk) {
    onChunk('')
    return ''
  },
}

/** 构造带 number 字段的商品管理 AppModel（含新增表单 + 列表） */
function makeProductAppModel(): AppModel {
  return {
    id: 'product_app',
    name: '商品管理',
    type: 'web',
    version: '0.1.0',
    schema: {
      pages: [
        {
          id: 'page_list',
          path: '/',
          title: '商品列表',
          layout: 'web',
          components: [
            {
              id: 'form',
              type: 'Form',
              props: { title: '新增商品', submitText: '创建', dataSource: 'products' },
              children: [
                { id: 'name', type: 'Input', props: { label: '名称', field: 'name' } },
                { id: 'price', type: 'Input', props: { label: '价格', field: 'price', type: 'number' } },
                { id: 'stock', type: 'Input', props: { label: '库存', field: 'stock', type: 'number' } },
                { id: 'desc', type: 'Textarea', props: { label: '描述', field: 'description' } },
              ],
            },
            {
              id: 'table',
              type: 'Table',
              props: {
                dataSource: 'products',
                searchable: true,
                actions: ['detail', 'edit', 'delete'],
              },
            },
          ],
        },
      ],
      routes: [{ path: '/', pageId: 'page_list' }],
      theme: { primaryColor: '#1677ff', fontFamily: 'Inter' },
      dataSources: [
        {
          id: 'products',
          name: 'products',
          type: 'mock',
          data: [
            { name: '苹果', price: 5.5, stock: 100, description: '红富士' },
            { name: '香蕉', price: 3, stock: 200, description: '进口' },
          ],
        },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('BuilderAgent CRUD 生成修复', () => {
  it('Form 提交生成 number/boolean 字段类型归一化（避免后端严格校验失败）', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeProductAppModel(), appId: 'p1' })
    const page = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    expect(page).toBeDefined()

    // 提交前应生成 payload，并生成类型转换辅助函数
    expect(page.content).toContain('const __num =')
    expect(page.content).toContain('const payload = { ...productsForm')
    // number 字段走 __num 转换
    expect(page.content).toContain("__num(productsForm['price'])")
    expect(page.content).toContain("__num(productsForm['stock'])")
    // 提交用 payload 而非原始 form state
    expect(page.content).toContain("createRecord('products', payload)")
    // 不应再把字符串直接传给 createRecord
    expect(page.content).not.toContain("createRecord('products', productsForm)")
  })

  it('boolean 字符串正确转换：false 字符串不会变成 true', async () => {
    const appModel: AppModel = {
      id: 'todo_app',
      name: '待办事项',
      type: 'web',
      version: '0.1.0',
      schema: {
        pages: [
          {
            id: 'page_new',
            path: '/todos/new',
            title: '新增待办事项',
            layout: 'web',
            pageType: 'form',
            tableId: 'todos',
            components: [
              {
                id: 'form1',
                type: 'Form',
                props: { title: '新增待办事项', dataSource: 'todos', submitText: '保存', layout: 'vertical' },
                children: [
                  { id: 'i1', type: 'Input', props: { label: 'title', field: 'title' } },
                  { id: 'i2', type: 'Select', props: { label: 'completed', field: 'completed', options: [{ label: '是', value: 'true' }, { label: '否', value: 'false' }] } },
                ],
              },
            ],
          },
        ],
        routes: [{ path: '/todos/new', pageId: 'page_new' }],
        dataSources: [
          {
            id: 'todos',
            name: 'todos',
            type: 'static',
            data: [{ id: '1', title: 'A', completed: false }],
          },
        ],
      },
    }
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel, appId: 'todo_app' })
    const page = files.find((f) => f.path === 'src/pages/page_new.tsx')!
    expect(page.content).toContain('const __bool =')
    // __bool 必须能识别 'false' / '0' / 'no' / '' 为 false，而不是 Boolean('false') === true
    expect(page.content).toMatch(/s === 'true' \|\| s === '1' \|\| s === 'yes' \|\| s === 'on'/)
    expect(page.content).toContain("__bool(todosForm['completed'])")
  })

  it('Table 操作列使用 div 包裹（而非把 flex 直接放 td），杜绝被覆盖', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeProductAppModel(), appId: 'p1' })
    const page = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    expect(page).toBeDefined()

    // 操作列 td 内应包一层 flex div
    expect(page.content).toContain('<td>')
    expect(page.content).toContain('<div style={{ display: \'flex\', gap: \'8px\', alignItems: \'center\' }}>')
    // 不应再把 display:flex 直接放 td 上
    expect(page.content).not.toContain("<td style={{ display: 'flex'")
    // 详情/编辑/删除按钮仍在
    expect(page.content).toContain('详情')
    expect(page.content).toContain('编辑')
    expect(page.content).toContain('删除')
  })

  it('暂无数据行的 colSpan 等于实际列数（含操作列）', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeProductAppModel(), appId: 'p1' })
    const page = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    // 数据源 4 字段列（name/price/stock/description）+ 1 操作列 = 5
    // 若 dynamicCols（运行时列数）则用 Math.max(...) 动态表达式
    expect(page.content).toMatch(/colSpan=\{5\}|colSpan=\{Math\.max\(productsData/)
  })

  it('列表+详情缺少 form 页时，自动补创建页且「新增」可跳到 /products/new 而非 /products/:id', async () => {
    // 复现截图问题：LLM 只生成列表页 + 详情页（动态路由 /products/:id），没有 form 页。
    // 此前「新增」会跳到 /products/new，被 /products/:id 当成 id=new 命中，导致进错页。
    const appModel: AppModel = {
      id: 'mall_app',
      name: '在线商城',
      type: 'web',
      version: '0.1.0',
      schema: {
        pages: [
          {
            id: 'page_list',
            path: '/',
            title: '商品列表',
            layout: 'web',
            pageType: 'list',
            tableId: 'products',
            components: [
              { id: 't1', type: 'Table', props: { dataSource: 'products', searchable: true } },
            ],
          },
          {
            id: 'page_detail',
            path: '/products/:id',
            title: '商品详情',
            layout: 'web',
            pageType: 'detail',
            tableId: 'products',
            components: [
              { id: 'd1', type: 'Detail', props: { dataSource: 'products' } },
            ],
          },
        ],
        routes: [
          { path: '/', pageId: 'page_list' },
          { path: '/products/:id', pageId: 'page_detail' },
        ],
        dataSources: [
          {
            id: 'products',
            name: 'products',
            type: 'static',
            data: [
              { id: '1', name: '商品A', price: 10 },
            ],
          },
        ],
      },
    }

    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel, appId: 'm1' })

    // 1) 应自动生成创建页 /products/new
    const createPage = files.find((f) => f.path === 'src/pages/page_products_new.tsx')
    expect(createPage).toBeDefined()
    // 创建页使用 createRecord 提交
    expect(createPage!.content).toContain("createRecord('products', payload)")

    // 2) 列表页「新增」链接指向 /products/new
    const listPage = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    expect(listPage.content).toContain('href="/products/new"')

    // 3) App.tsx 路由匹配：静态路由 /products/new 必须先于动态路由 /products/:id
    const appTsx = files.find((f) => f.path === 'src/App.tsx')!
    const newIdx = appTsx.content.indexOf("path === '/products/new'")
    const detailIdx = appTsx.content.indexOf("segs.slice(0, 1).join('/') === 'products'")
    expect(newIdx).toBeGreaterThanOrEqual(0)
    expect(detailIdx).toBeGreaterThanOrEqual(0)
    expect(newIdx).toBeLessThan(detailIdx)
  })

  it('LLM 给中文 label 时，Builder 自动把表单字段对齐到数据源真实字段名（提交不再失败）', async () => {
    // 复现截图问题：LLM 把 Input 的 label 设为中文「待办内容/状态」，
    // 但 DataSource 字段是英文 title/completed。
    // 旧逻辑会按中文 label 生成 form state key，导致 payload key 与后端 schema 不一致 → 校验失败。
    const appModel: AppModel = {
      id: 'todo_app',
      name: '暖色待办事项应用',
      type: 'web',
      version: '0.1.0',
      schema: {
        pages: [
          {
            id: 'page_edit',
            path: '/todos/:id/edit',
            title: '编辑待办',
            layout: 'web',
            pageType: 'form',
            tableId: 'todos',
            components: [
              {
                id: 'form1',
                type: 'Form',
                props: { title: '编辑待办事项', dataSource: 'todos', paramId: ':id', submitText: '保存', layout: 'vertical' },
                children: [
                  // LLM 没填 field，只填了中文 label —— 模拟最常见的失败场景
                  { id: 'i1', type: 'Input', props: { label: '待办内容', placeholder: '请输入待办内容' } },
                  { id: 'i2', type: 'Select', props: { label: '状态', options: [{ label: '已完成', value: 'true' }, { label: '未完成', value: 'false' }] } },
                ],
              },
            ],
          },
        ],
        routes: [{ path: '/todos/:id/edit', pageId: 'page_edit' }],
        dataSources: [
          {
            id: 'todos',
            name: 'todos',
            type: 'static',
            data: [{ id: '1', title: '购买生活用品', completed: false }],
          },
        ],
      },
    }

    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel, appId: 'todo_app' })
    const page = files.find((f) => f.path === 'src/pages/page_edit.tsx')!

    // 1) form state 必须用真实数据源字段名（title / completed），不能再用中文 label
    expect(page.content).not.toContain("formStateName['待办内容']")
    expect(page.content).not.toContain("formStateName['状态']")
    expect(page.content).toContain("todosForm['title']")
    expect(page.content).toContain("todosForm['completed']")

    // 2) payload 提交必须是英文 key，且能命中后端 schema
    expect(page.content).toMatch(/\{[\s\S]*'title'[\s\S]*'completed'[\s\S]*\}\s*=>\s*createRecord|updateRecord\('todos'/)

    // 3) 布尔字段字符串转换：'false' → false（避免 Boolean('false') === true）
    expect(page.content).toContain("__bool(todosForm['completed'])")
  })

  it('自动补的创建页使用数据源真实字段，而非硬编码 name/description', async () => {
    const appModel: AppModel = {
      id: 'mall_app',
      name: '电商库存',
      type: 'web',
      version: '0.1.0',
      schema: {
        pages: [
          {
            id: 'page_list',
            path: '/',
            title: '商品列表',
            layout: 'web',
            pageType: 'list',
            tableId: 'products',
            components: [{ id: 't1', type: 'Table', props: { dataSource: 'products', searchable: true } }],
          },
        ],
        routes: [{ path: '/', pageId: 'page_list' }],
        dataSources: [
          {
            id: 'products',
            name: 'products',
            type: 'static',
            data: [{ id: '1', title: 'A', price: 10, stock: 5 }],
          },
        ],
      },
    }
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel, appId: 'm1' })
    const createPage = files.find((f) => f.path === 'src/pages/page_products_new.tsx')!
    // 必须用数据源真实字段（title / price / stock），不能再用硬编码 name/description
    expect(createPage.content).toContain("productsForm['title']")
    expect(createPage.content).toContain("productsForm['price']")
    expect(createPage.content).toContain("productsForm['stock']")
    expect(createPage.content).not.toContain("productsForm['name']")
    expect(createPage.content).not.toContain("productsForm['description']")
    // number 字段做 Number 转换（避免字符串提交被严格校验拒绝）
    expect(createPage.content).toContain("__num(productsForm['price'])")
    expect(createPage.content).toContain("__num(productsForm['stock'])")
  })
})
