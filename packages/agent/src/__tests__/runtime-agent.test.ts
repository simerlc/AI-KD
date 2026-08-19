import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RuntimeAgent } from '../runtime-agent/runtime-agent'
import { ToolRegistry } from '../runtime-agent/tool-registry'
import { defaultToolRegistry } from '../runtime-agent/tool-registry'
import { resolveSafePath, assertSafeCommand } from '../runtime-agent/tools/security'
import { RuntimeAgentAdapter } from '../multi-agent/agents/runtime'
import type { RuntimeToolBackend } from '../runtime-agent/types'

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aikd-runtime-test-'))
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

/** 构造一个模拟 RuntimeToolBackend */
function makeBackend(): RuntimeToolBackend {
  return {
    async npmInstall() {
      return { success: true, output: 'npm install ok' }
    },
    async startServer() {
      return { success: true, url: 'http://localhost:5173', output: 'vite ready' }
    },
    async getRuntimeErrors() {
      return { hasErrors: false, errors: [] }
    },
  }
}

describe('安全边界（workspace 限制）', () => {
  it('resolveSafePath 拒绝路径穿越', () => {
    expect(() => resolveSafePath('/ws/app', '../../etc/passwd')).toThrow()
    expect(() => resolveSafePath('/ws/app', '/etc/passwd')).toThrow()
  })

  it('resolveSafePath 允许 workspace 内路径', () => {
    const root = path.resolve('/ws/app')
    const abs = resolveSafePath(root, 'src/App.tsx')
    expect(abs).toBe(path.join(root, 'src', 'App.tsx'))
  })

  it('assertSafeCommand 拒绝危险命令与命令注入', () => {
    expect(() => assertSafeCommand('rm -rf /')).toThrow()
    expect(() => assertSafeCommand('bash -c "x"')).toThrow()
    expect(() => assertSafeCommand('npm install && rm -rf')).toThrow()
    expect(() => assertSafeCommand('curl http://x')).toThrow()
  })

  it('assertSafeCommand 允许白名单命令', () => {
    expect(() => assertSafeCommand('npm install')).not.toThrow()
    expect(() => assertSafeCommand('npx vite --host 0.0.0.0')).not.toThrow()
    expect(() => assertSafeCommand('node -v')).not.toThrow()
  })
})

describe('Tool Calling（filesystem.* / terminal.* / browser.*）', () => {
  it('工具注册中心包含全部命名空间工具', () => {
    const names = defaultToolRegistry.listNames()
    expect(names).toContain('filesystem.create')
    expect(names).toContain('filesystem.read')
    expect(names).toContain('filesystem.write')
    expect(names).toContain('filesystem.list')
    expect(names).toContain('filesystem.delete')
    expect(names).toContain('terminal.run')
    expect(names).toContain('browser.open')
    expect(names).toContain('browser.getRuntimeErrors')
  })

  it('filesystem.create + read + list 工作', async () => {
    const registry = new ToolRegistry(defaultToolRegistry.listDefinitions().map((d) => {
      const tool = defaultToolRegistry.get(d.name)!
      return { definition: d, execute: tool.execute.bind(tool) }
    }))
    const ctx = { workspacePath: tmpRoot }
    const create = await registry.execute('filesystem.create', { path: 'src/App.tsx', content: 'hello' }, ctx)
    expect(create.success).toBe(true)
    const read = await registry.execute('filesystem.read', { path: 'src/App.tsx' }, ctx)
    expect(read.data).toEqual({ path: 'src/App.tsx', content: 'hello' })
    const list = await registry.execute('filesystem.list', { path: 'src' }, ctx)
    const listData = list.data as { items: Array<{ name: string; type: string }> }
    expect(listData.items).toContainEqual({ name: 'App.tsx', type: 'file' })
    // 记录调用日志
    expect(registry.getCallLog().length).toBe(3)
  })

  it('filesystem 拒绝越界路径', async () => {
    const registry = new ToolRegistry()
    // 只注册 filesystem
    const fsModule = await import('../runtime-agent/tools/filesystem')
    registry.registerAll(fsModule.filesystemTools)
    const ctx = { workspacePath: tmpRoot }
    const res = await registry.execute('filesystem.create', { path: '../../evil.txt', content: 'x' }, ctx)
    expect(res.success).toBe(false)
    expect(res.error).toContain('越界')
  })
})

describe('RuntimeAgent 全流程', () => {
  it('创建项目文件 + npm install + 启动 Vite', async () => {
    const agent = new RuntimeAgent({
      workspaceRoot: tmpRoot,
      runtimeBackend: makeBackend(),
    })
    const result = await agent.run({
      appId: 'app-demo',
      files: [{ path: 'src/App.tsx', content: 'export default function App() { return <h1>demo</h1> }' }],
      install: true,
      startServer: true,
      collectErrors: true,
    })

    expect(result.success).toBe(true)
    expect(result.appId).toBe('app-demo')
    // 文件已写入
    const content = await fs.readFile(path.join(tmpRoot, 'app-demo', 'src', 'App.tsx'), 'utf-8')
    expect(content).toContain('demo')
    // 有工具调用记录
    expect(result.toolCalls.some((c) => c.tool === 'filesystem.create')).toBe(true)
    expect(result.toolCalls.some((c) => c.tool === 'terminal.run')).toBe(true)
  })

  it('modifyFile 步骤能修改代码', async () => {
    const agent = new RuntimeAgent({ workspaceRoot: tmpRoot, runtimeBackend: makeBackend() })
    const result = await agent.run({
      appId: 'app-fix',
      files: [{ path: 'index.html', content: '<html></html>' }],
      steps: [{ type: 'modifyFile', path: 'index.html', content: '<html><body>updated</body></html>' }],
      collectErrors: false,
    })
    expect(result.success).toBe(true)
    const content = await fs.readFile(path.join(tmpRoot, 'app-fix', 'index.html'), 'utf-8')
    expect(content).toContain('updated')
  })
})

describe('Runtime Agent 多 Agent 集成', () => {
  it('RuntimeAgentAdapter 可作为多 Agent 的 runtime 角色', async () => {
    const adapter = new RuntimeAgentAdapter({
      workspaceRoot: tmpRoot,
      runtimeBackend: makeBackend(),
    })
    expect(adapter.role).toBe('runtime')
    const output = await adapter.execute(
      {
        appId: 'app-adapter',
        files: [{ path: 'src/main.tsx', content: 'console.log(1)' }],
        install: true,
      } as never,
      { sessionId: 's1', llm: {} as never, appId: 'app-adapter' },
    )
    expect(output.success).toBe(true)
    expect(output.appId).toBe('app-adapter')
    expect(output.steps.some((s) => s.name === 'createFiles')).toBe(true)
  })
})
