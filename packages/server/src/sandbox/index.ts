/**
 * Sandbox Module (AI快搭 V1)
 *
 * 两种实现：
 *   - docker（默认）：每个应用一个 Docker 容器，隔离性好
 *   - node：直接在主机以子进程运行 Vite Dev Server，无需 Docker
 *
 * 通过 SANDBOX_MODE 环境变量切换（默认 docker）。
 */

export { LocalDockerSandbox } from './local-docker-sandbox.js'
export type { SandboxInstance, CreateSandboxOptions } from './local-docker-sandbox.js'
export { LocalNodeSandbox } from './local-node-sandbox.js'
export { PortAllocator, getPortAllocator } from './port-allocator.js'

import { LocalDockerSandbox } from './local-docker-sandbox.js'
import { LocalNodeSandbox } from './local-node-sandbox.js'
import type { SandboxInstance, CreateSandboxOptions } from './local-docker-sandbox.js'

/** 沙箱统一接口（Docker / Node 两种实现） */
export interface Sandbox {
  create(options: CreateSandboxOptions): Promise<SandboxInstance>
  destroy(appId: string): Promise<void>
  stop(appId: string): Promise<void>
  start(appId: string): Promise<SandboxInstance | null>
  get(appId: string): SandboxInstance | undefined
  list(): SandboxInstance[]
  isAvailable(): Promise<boolean>
  ensureImage(): Promise<void>
  /** 清理服务器重启后遗留的孤儿沙箱进程（可选实现） */
  cleanup?(): Promise<void>
}

let _sandbox: Sandbox | null = null

/** 根据 SANDBOX_MODE 环境变量返回沙箱实例 */
export function getSandbox(): Sandbox {
  if (!_sandbox) {
    const mode = process.env.SANDBOX_MODE || 'docker'
    if (mode === 'node') {
      _sandbox = new LocalNodeSandbox()
    } else {
      _sandbox = new LocalDockerSandbox()
    }
  }
  return _sandbox
}
