import { describe, it, expect } from 'vitest'
import { BuilderAgent } from '../builder'
import type { AppModel } from '@aikd/shared'
import type { LLMClient } from '../types'

// ─── 测试工具：带数据源的客户管理系统 AppModel ───────────

function makeCrmAppModel(): AppModel {
  return {
    id: 'crm_app',
    name: '客户管理系统',
    type: 'web',
    version: '0.1.0',
    schema: {
      pages: [
        {
          id: 'page_list',
          path: '/',
          title: '客户列表',
          layout: 'web',
          components: [
            { id: 'heading', type: 'Heading', props: { text: '客户列表' } },
            {
              id: 'form',
              type: 'Form',
              props: { title: '新增客户', submitText: '保存', dataSource: 'customers' },
              children: [
                { id: 'name', type: 'Input', props: { label: '客户名称', field: 'name', placeholder: '请输入' } },
                { id: 'phone', type: 'Input', props: { label: '手机号', field: 'phone', placeholder: '请输入' } },
                { id: 'status', type: 'Select', props: { label: '状态', field: 'status', options: ['active', 'inactive'] } },
              ],
            },
            {
              id: 'table',
              type: 'Table',
              props: {
                dataSource: 'customers',
                columns: [
                  { key: 'name', title: '客户名称' },
                  { key: 'phone', title: '手机号' },
                ],
              },
            },
          ],
        },
      ],
      routes: [{ path: '/', pageId: 'page_list' }],
      theme: { primaryColor: '#3b82f6', fontFamily: 'Inter' },
      dataSources: [
        {
          id: 'customers',
          name: 'customers',
          type: 'static',
          data: [{ name: '张三', phone: '138' }],
        },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const mockLLM: LLMClient = {
  async complete() {
    return ''
  },
  async stream(_m, _o, onChunk) {
    onChunk('')
    return ''
  },
}

describe('BuilderAgent - 数据绑定生成', () => {
  it('页面组件应 import useState/useEffect 和 api 方法', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeCrmAppModel() })

    const pageFile = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    expect(pageFile.content).toContain('useState')
    expect(pageFile.content).toContain('useEffect')
    expect(pageFile.content).toContain("from '../api'")
    expect(pageFile.content).toContain('listRecords')
    expect(pageFile.content).toContain('createRecord')
  })

  it('应生成数据加载 Hook（useState + useEffect + listRecords）', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeCrmAppModel() })

    const pageFile = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    const content = pageFile.content

    // 数据 state
    expect(content).toContain('customersData')
    expect(content).toContain('setCustomersData')
    // 表单 state
    expect(content).toContain('customersForm')
    expect(content).toContain('setCustomersForm')
    // 加载函数
    expect(content).toContain('loadCustomers')
    expect(content).toContain("listRecords('customers')")
  })

  it('Table 应从后端数据渲染（而非静态 rows）', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeCrmAppModel() })

    const pageFile = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    const content = pageFile.content

    // Table 使用 customersData.map 渲染
    expect(content).toContain('customersData.map')
    expect(content).toContain("rec.data['name']")
    expect(content).toContain("rec.data['phone']")
  })

  it('Form 提交应调用 createRecord', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeCrmAppModel() })

    const pageFile = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    const content = pageFile.content

    expect(content).toContain("createRecord('customers', customersForm)")
    // 提交后刷新
    expect(content).toContain('await loadCustomers()')
  })

  it('Input 应生成受控组件（value + onChange）', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeCrmAppModel() })

    const pageFile = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    const content = pageFile.content

    // Input 受控
    expect(content).toContain("customersForm['name']")
    expect(content).toContain('onChange={(e) => setCustomersForm')
    expect(content).toContain("'name': e.target.value")
  })

  it('Select 应生成受控组件', async () => {
    const builder = new BuilderAgent(mockLLM)
    const { files } = await builder.build({ appModel: makeCrmAppModel() })

    const pageFile = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    const content = pageFile.content

    expect(content).toContain("customersForm['status']")
    expect(content).toContain('<option value="active">active</option>')
  })

  it('无数据源时页面组件应保持纯静态', async () => {
    const builder = new BuilderAgent(mockLLM)
    const model = makeCrmAppModel()
    // 移除所有 dataSource 引用
    model.schema.pages[0].components = [
      { id: 'heading', type: 'Heading', props: { text: '静态页' } },
    ]
    model.schema.dataSources = []

    const { files } = await builder.build({ appModel: model })
    const pageFile = files.find((f) => f.path === 'src/pages/page_list.tsx')!
    const content = pageFile.content

    // 无 useState/useEffect/api import
    expect(content).not.toContain('useState')
    expect(content).not.toContain("from '../api'")
  })
})
