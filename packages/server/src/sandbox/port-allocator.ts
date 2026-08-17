import net from 'node:net'

// ─── 端口分配器 ─────────────────────────────────────────
//
// 为每个沙箱容器分配一个主机端口（默认 5273–5299）。
// 注意：默认范围刻意避开前端 dev server 端口（5174 等），
// 避免沙箱端口与前端重叠导致「预览加载到前端页面」或前端启动时被沙箱抢占端口。
// 分配策略：
//   1. 优先从已释放的端口中复用
//   2. 否则从范围内取下一个空闲端口（通过 TCP listen 探测）
//   3. 持久化在内存 Map<appId, port>，便于查询与回收
// 可通过 SANDBOX_PORT_RANGE_START / SANDBOX_PORT_RANGE_END 覆盖范围。

const DEFAULT_START = 5273
const DEFAULT_END = 5299

export interface PortAllocatorOptions {
  start?: number
  end?: number
}

export class PortAllocator {
  private readonly start: number
  private readonly end: number
  /** appId → 已分配端口 */
  private readonly allocated = new Map<string, number>()
  /** 已释放但尚未回收的端口（优先复用） */
  private readonly recycled: number[] = []

  constructor(options: PortAllocatorOptions = {}) {
    this.start = options.start ?? DEFAULT_START
    this.end = options.end ?? DEFAULT_END
  }

  /** 为指定 appId 分配一个可用端口 */
  async allocate(appId: string): Promise<number> {
    // 已分配过则直接返回
    const existing = this.allocated.get(appId)
    if (existing !== undefined) return existing

    // 优先复用已释放端口
    while (this.recycled.length > 0) {
      const port = this.recycled.pop()!
      if (await this.isPortFree(port)) {
        this.allocated.set(appId, port)
        return port
      }
    }

    // 否则从范围内扫描
    for (let port = this.start; port <= this.end; port++) {
      // 跳过已被其他 appId 占用的端口
      if (Array.from(this.allocated.values()).includes(port)) continue
      if (await this.isPortFree(port)) {
        this.allocated.set(appId, port)
        return port
      }
    }

    throw new Error(`No available port in range ${this.start}-${this.end}`)
  }

  /** 释放 appId 占用的端口（可被复用） */
  release(appId: string): void {
    const port = this.allocated.get(appId)
    if (port === undefined) return
    this.allocated.delete(appId)
    this.recycled.push(port)
  }

  /** 查询 appId 当前端口（未分配返回 undefined） */
  get(appId: string): number | undefined {
    return this.allocated.get(appId)
  }

  /** 释放全部端口分配（服务器重启后清理孤儿状态使用） */
  releaseAll(): void {
    for (const port of this.allocated.values()) {
      this.recycled.push(port)
    }
    this.allocated.clear()
  }

  /** 检查端口是否空闲（未被任何进程监听） */
  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net.createServer()
      tester.once('error', () => resolve(false))
      tester.once('listening', () => {
        tester.close(() => resolve(true))
      })
      // 不指定 host，让 Node 尝试双栈（IPv4 + IPv6）绑定，
      // 避免主前端只监听 127.0.0.1/::1 时被 0.0.0.0 探测误判为空闲
      tester.listen(port)
    })
  }
}

/** 全局单例 */
let _allocator: PortAllocator | null = null

export function getPortAllocator(): PortAllocator {
  if (!_allocator) {
    const start = process.env.SANDBOX_PORT_RANGE_START ? Number(process.env.SANDBOX_PORT_RANGE_START) : undefined
    const end = process.env.SANDBOX_PORT_RANGE_END ? Number(process.env.SANDBOX_PORT_RANGE_END) : undefined
    _allocator = new PortAllocator({ start, end })
  }
  return _allocator
}
