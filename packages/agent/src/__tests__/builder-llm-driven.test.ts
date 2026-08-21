import { describe, it, expect } from 'vitest'
import { BuilderAgent } from '../builder'
import type { AppModel } from '@aikd/shared'
import type { LLMClient } from '../types'

function makeAppModel(): AppModel {
  return {
    id: 'todo_app',
    name: '待办事项',
    type: 'web',
    version: '0.1.0',
    schema: {
      pages: [
        { id: 'page_list', path: '/', title: '待办列表', layout: 'web', pageType: 'list', components: [] },
        { id: 'page_new', path: '/todos/new', title: '新增待办', layout: 'web', pageType: 'form', components: [] },
      ],
      routes: [
        { path: '/', pageId: 'page_list' },
        { path: '/todos/new', pageId: 'page_new' },
      ],
      theme: { primaryColor: '#1677ff', fontFamily: 'Inter, sans-serif' },
      dataSources: [{ id: 'todos', name: 'todos', type: 'static', data: [] }],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const validLLM: LLMClient = {
  async complete() {
    // 模拟 LLM 生成的多文件数组：含 App.tsx（antd + 路由）与 pages
    return JSON.stringify([
      {
        path: 'package.json',
        content: '{"name":"todo","dependencies":{"react":"^18.3.0","react-router-dom":"^6.26.0","antd":"^5.20.0","axios":"^1.7.0","zustand":"^4.5.0","styled-components":"^6.1.0"}}',
      },
      {
        path: 'index.html',
        content: '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      },
      {
        path: 'src/main.tsx',
        content: "import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
      },
      {
        path: 'src/App.tsx',
        content: "import { Routes, Route } from 'react-router-dom'; import TodoList from './pages/page_list'; import TodoNew from './pages/page_new'; export default function App(){ return <Routes><Route path='/' element={<TodoList/>} /><Route path='/todos/new' element={<TodoNew/>} /></Routes>; }",
      },
      {
        path: 'src/pages/page_list.tsx',
        content: "import { Table, Input, Button } from 'antd'; import { useNavigate } from 'react-router-dom'; export default function TodoList(){ const navigate = useNavigate(); return <div><Input placeholder='搜索'/><Table dataSource={[]} /><Button onClick={()=>navigate('/todos/new')}>新增</Button></div>; }",
      },
      {
        path: 'src/pages/page_new.tsx',
        content: "import { Form, Input, Button } from 'antd'; export default function TodoNew(){ return <Form><Form.Item label='内容' name='title' rules={[{required:true}]}><Input/></Form.Item><Button htmlType='submit'>提交</Button></Form>; }",
      },
      {
        path: 'src/api.ts',
        content: "import axios from 'axios'; export async function listRecords(){ return (await axios.get('/api/data')).data; }",
      },
    ])
  },
  async stream(_m, _o, onChunk) {
    onChunk('')
    return ''
  },
}

describe('BuilderAgent - LLM 驱动生成（待办示例）', () => {
  it('应通过 LLM 生成多文件，含 App.tsx 与 pages 目录，且代码导入 antd 和路由', async () => {
    const builder = new BuilderAgent(validLLM)
    const { files } = await builder.build({ appModel: makeAppModel() })

    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/App.tsx')
    expect(paths.some((p) => p.startsWith('src/pages/'))).toBe(true)
    expect(paths).toContain('src/main.tsx')
    expect(paths).toContain('src/api.ts')

    const app = files.find((f) => f.path === 'src/App.tsx')!.content
    expect(app).toContain('react-router-dom')
    expect(app).toContain('Routes')

    const list = files.find((f) => f.path === 'src/pages/page_list.tsx')!.content
    expect(list).toContain('antd')
  })
})
