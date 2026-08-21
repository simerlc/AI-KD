// ─── playwright 动态导入的类型声明 ─────────────────────────
//
// UI 视觉评审通过动态 import('playwright') 在运行时按需加载截图能力。
// playwright 为根目录开发依赖，不直接声明在 @aikd/agent 中，
// 因此这里提供最小化的环境类型声明，供 tsc 解析动态导入的类型。
// 运行时通过 try/catch 兜底：playwright 不可用时自动降级为静态规则检查。

declare module 'playwright' {
  export interface Browser {
    newPage(options?: {
      viewport?: { width: number; height: number }
    }): Promise<Page>
    close(): Promise<void>
  }
  export interface Page {
    goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>
    evaluate<T>(fn: () => T): Promise<T>
    screenshot(options: { path?: string }): Promise<Buffer>
  }
  export interface Chromium {
    launch(options: { headless: boolean }): Promise<Browser>
  }
  export const chromium: Chromium
}
