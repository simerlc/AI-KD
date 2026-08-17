import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import http from 'node:http'
import { getPortAllocator } from './port-allocator.js'
import { getWorkspacePath } from '../lib/workspace.js'

const execFileAsync = promisify(execFile)

// ─── Local Docker Sandbox ──────────────────────────────
//
// 通过 docker CLI 管理本地容器：
//   1. 端口动态分配（5173–5199）
//   2. 工作区挂载（./workspaces/{appId} → /app）
//   3. 健康检查（HTTP 探测 Vite Dev Server）
//   4. 容器生命周期（create/stop/rm/status）
//
// 依赖：用户已安装 Docker（Docker Desktop on Windows/Mac，dockerd on Linux）。

const DEFAULT_IMAGE = 'aikd/sandbox:latest'
const CONTAINER_PORT = 5173
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
  /** 覆盖默认镜像 */
  image?: string
  /** 启动时是否执行健康检查（默认 true） */
  waitForHealthy?: boolean
}

export class LocalDockerSandbox {
  private readonly image: string
  /** appId → SandboxInstance（内存缓存） */
  private readonly instances = new Map<string, SandboxInstance>()

  constructor(image?: string) {
    this.image = image || process.env.SANDBOX_IMAGE || DEFAULT_IMAGE
  }

  /** 创建并启动一个沙箱容器 */
  async create(options: CreateSandboxOptions): Promise<SandboxInstance> {
    const { appId, waitForHealthy = true } = options

    // 已存在则直接返回
    const existing = this.instances.get(appId)
    if (existing && existing.status === 'running') {
      return existing
    }

    // 1. 分配主机端口
    const hostPort = await getPortAllocator().allocate(appId)

    // 2. 解析工作区绝对路径
    const workspacePath = getWorkspacePath(appId)
    const absWorkspace = path.resolve(workspacePath)

    // 3. 构造容器名
    const containerName = `aikd-sandbox-${appId}`

    // 4. 先清理同名旧容器（可能上次未正常销毁）
    await this.removeContainer(containerName).catch(() => {})

    // 5. docker run 创建并启动容器
    const args = [
      'run',
      '-d',
      '--name',
      containerName,
      '-p',
      `${hostPort}:${CONTAINER_PORT}`,
      '-v',
      `${absWorkspace}:/app`,
      '-w',
      '/app',
      this.image,
    ]

    let containerId: string
    try {
      const { stdout } = await execFileAsync('docker', args, {
        windowsHide: true,
        timeout: 30_000,
      })
      containerId = stdout.trim()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to start sandbox container: ${message}`)
    }

    const url = `http://localhost:${hostPort}`
    const instance: SandboxInstance = {
      id: containerId.slice(0, 12),
      appId,
      containerId,
      containerName,
      hostPort,
      url,
      status: 'running',
    }
    this.instances.set(appId, instance)

    // 6. 健康检查（等待 Vite Dev Server 就绪）
    if (waitForHealthy) {
      try {
        await this.waitForHealthy(url)
      } catch (err) {
        // 健康检查失败，标记为 error 但保留容器以便排查
        instance.status = 'error'
        throw err
      }
    }

    return instance
  }

  /** 停止并销毁容器 */
  async destroy(appId: string): Promise<void> {
    const instance = this.instances.get(appId)
    if (!instance) return

    await this.removeContainer(instance.containerName).catch(() => {})
    getPortAllocator().release(appId)
    this.instances.delete(appId)
  }

  /** 仅停止容器（保留容器配置，可重启） */
  async stop(appId: string): Promise<void> {
    const instance = this.instances.get(appId)
    if (!instance || instance.status !== 'running') return

    try {
      await execFileAsync('docker', ['stop', instance.containerName], {
        windowsHide: true,
        timeout: 15_000,
      })
      instance.status = 'stopped'
    } catch {
      // 忽略
    }
  }

  /** 重启已停止的容器 */
  async start(appId: string): Promise<SandboxInstance | null> {
    const instance = this.instances.get(appId)
    if (!instance || instance.status !== 'stopped') return null

    try {
      await execFileAsync('docker', ['start', instance.containerName], {
        windowsHide: true,
        timeout: 15_000,
      })
      instance.status = 'running'
      await this.waitForHealthy(instance.url)
      return instance
    } catch {
      instance.status = 'error'
      return null
    }
  }

  /** 查询实例信息（不存在返回 undefined） */
  get(appId: string): SandboxInstance | undefined {
    return this.instances.get(appId)
  }

  /** 查询所有实例 */
  list(): SandboxInstance[] {
    return Array.from(this.instances.values())
  }

  /** 检查 Docker 是否可用 */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], {
        windowsHide: true,
        timeout: 5000,
      })
      return true
    } catch {
      return false
    }
  }

  /** 检查镜像是否存在，不存在则尝试构建 */
  async ensureImage(): Promise<void> {
    try {
      await execFileAsync('docker', ['image', 'inspect', this.image], {
        windowsHide: true,
        timeout: 10_000,
      })
    } catch {
      // 镜像不存在，尝试从 scripts/sandbox-image 构建
      throw new Error(
        `Sandbox image "${this.image}" not found. Build it first:\n` +
          `  docker build -t ${this.image} scripts/sandbox-image/`,
      )
    }
  }

  // ─── 内部辅助 ──────────────────────────────────────

  /** 轮询 URL 直到 200 或超时 */
  private async waitForHealthy(url: string): Promise<void> {
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS

    while (Date.now() < deadline) {
      const ok = await this.probe(url)
      if (ok) return
      await sleep(HEALTH_CHECK_INTERVAL_MS)
    }

    throw new Error(`Sandbox health check timeout: ${url}`)
  }

  /** HTTP 探测 URL 是否可访问 */
  private probe(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        // 任何 HTTP 响应都说明 Vite Dev Server 已启动
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

  /** 删除容器（不存在则静默） */
  private async removeContainer(name: string): Promise<void> {
    await execFileAsync('docker', ['rm', '-f', name], {
      windowsHide: true,
      timeout: 15_000,
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── 全局单例 ──────────────────────────────────────────

let _sandbox: LocalDockerSandbox | null = null

export function getSandbox(): LocalDockerSandbox {
  if (!_sandbox) {
    _sandbox = new LocalDockerSandbox()
  }
  return _sandbox
}
