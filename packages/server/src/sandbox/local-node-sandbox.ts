import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { getPortAllocator } from './port-allocator.js'
import { getWorkspacePath } from '../lib/workspace.js'

// ─── Local Node Sandbox ────────────────────────────────
//
// Docker 不可用时的备选方案：直接在主机上以子进程方式运行 Vite Dev Server。
//
// 工作流程：
//   1. 在 workspaces/{appId}/ 目录下执行 `npm install`
//   2. 启动 `npx vite --host 0.0.0.0 --port {port} --strictPort`
//   3. 健康检查通过后返回预览 URL
//
// 适用场景：本地开发、无 Docker 环境、CI 测试。
// 限制：无隔离，依赖主机 Node 环境。

const HEALTH_CHECK_TIMEOUT_MS = 60_000
const HEALTH_CHECK_INTERVAL_MS = 1000

export interface SandboxInstance {
  id: string
  appId: string
  containerId: string
  containerName: string
  hostPort: number
  url: string
  status: 'running' | 'stopped' | 'error'
}

export interface CreateSandboxOptions {
  appId: string
  image?: string
  waitForHealthy?: boolean
}

export class LocalNodeSandbox {
  /** appId → 进程 */
  private readonly processes = new Map<string, ChildProcess>()
  /** appId → 实例信息 */
  private readonly instances = new Map<string, SandboxInstance>()

  async create(options: CreateSandboxOptions): Promise<SandboxInstance> {
    const { appId, waitForHealthy = true } = options

    // 已存在且运行中则直接返回
    const existing = this.instances.get(appId)
    if (existing && existing.status === 'running') {
      return existing
    }

    // 1. 分配端口
    const hostPort = await getPortAllocator().allocate(appId)

    // 2. 工作区路径
    const workspacePath = getWorkspacePath(appId)
    const absWorkspace = path.resolve(workspacePath)

    // 3. 安装依赖（同步等待，避免 vite 启动时找不到依赖）
    await this.runNpmInstall(absWorkspace)

    // 4. 启动 Vite Dev Server
    // 注入 VITE_API_TARGET 指向后端 Data API 真实地址，
    // 让生成的应用里 /api 请求能代理到宿主机后端（而非容器内部）。
    const backendPort = Number(process.env.PORT) || 3001
    const apiTarget = process.env.VITE_API_TARGET || `http://localhost:${backendPort}`
    const child = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', String(hostPort), '--strictPort'], {
      cwd: absWorkspace,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VITE_API_TARGET: apiTarget,
      },
    })

    child.on('error', () => {
      const inst = this.instances.get(appId)
      if (inst) inst.status = 'error'
    })

    child.on('exit', () => {
      const inst = this.instances.get(appId)
      if (inst && inst.status === 'running') {
        inst.status = 'stopped'
      }
    })

    const url = `http://localhost:${hostPort}`
    const instance: SandboxInstance = {
      id: `local-${appId.slice(0, 8)}`,
      appId,
      containerId: `pid-${child.pid ?? 'unknown'}`,
      containerName: `local-sandbox-${appId}`,
      hostPort,
      url,
      status: 'running',
    }
    this.processes.set(appId, child)
    this.instances.set(appId, instance)

    // 5. 健康检查
    if (waitForHealthy) {
      try {
        await this.waitForHealthy(url)
      } catch (err) {
        instance.status = 'error'
        throw err
      }
    }

    return instance
  }

  async destroy(appId: string): Promise<void> {
    const child = this.processes.get(appId)
    if (child && !child.killed) {
      child.kill('SIGTERM')
      // 给进程 3 秒优雅退出
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL')
          resolve()
        }, 3000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    this.processes.delete(appId)
    getPortAllocator().release(appId)
    this.instances.delete(appId)
  }

  async stop(appId: string): Promise<void> {
    await this.destroy(appId)
  }

  async start(appId: string): Promise<SandboxInstance | null> {
    // 本地模式下 stop 即 destroy，重启需重新 create
    return this.create({ appId }).catch(() => null)
  }

  get(appId: string): SandboxInstance | undefined {
    return this.instances.get(appId)
  }

  list(): SandboxInstance[] {
    return Array.from(this.instances.values())
  }

  async isAvailable(): Promise<boolean> {
    // 本地模式始终可用（只要 Node 可用）
    return true
  }

  async ensureImage(): Promise<void> {
    // 本地模式无需镜像
  }

  /**
   * 清理服务器重启后遗留的孤儿沙箱 Vite 进程。
   * 这些进程不在当前内存管理中，但持续占用端口，会导致新启动的沙箱端口
   * 与实际服务错配，从而让预览加载到错误的（旧）应用内容。
   */
  async cleanup(): Promise<void> {
    try {
      if (process.platform === 'win32') {
        execFileSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -match 'vite' -and $_.CommandLine -match '--strictPort' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
          ],
          { encoding: 'utf-8', windowsHide: true, timeout: 15_000 },
        )
      }
    } catch {
      // 清理失败不阻塞启动
    }
    // 清空内存中的进程与端口分配
    this.processes.clear()
    this.instances.clear()
    getPortAllocator().releaseAll?.()
  }

  // ─── 内部辅助 ──────────────────────────────────────

  private async runNpmInstall(cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['install', '--no-audit', '--no-fund'], {
        cwd,
        shell: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.on('error', (err) => reject(err))
      child.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`npm install failed with code ${code}\n${stderr.slice(-500)}`))
      })
    })
  }

  private async waitForHealthy(url: string): Promise<void> {
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await this.probe(url)) return
      await sleep(HEALTH_CHECK_INTERVAL_MS)
    }
    throw new Error(`Sandbox health check timeout: ${url}`)
  }

  private probe(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.destroy()
        resolve(res.statusCode !== undefined && res.statusCode < 500)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(3000, () => {
        req.destroy()
        resolve(false)
      })
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
