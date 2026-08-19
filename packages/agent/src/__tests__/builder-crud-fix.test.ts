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

    // 提交前应生成 payload，并对 number 字段做 Number() 转换
    expect(page.content).toContain('const payload = { ...productsForm')
    expect(page.content).toContain("Number(productsForm['price'])")
    expect(page.content).toContain("Number(productsForm['stock'])")
    // 提交用 payload 而非原始 form state
    expect(page.content).toContain("createRecord('products', payload)")
    // 不应再把字符串直接传给 createRecord
    expect(page.content).not.toContain("createRecord('products', productsForm)")
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
})
