import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'

// 读取后端 .env 的 PORT，使前端代理 target 自动跟随后端端口，无需手动同步。
function getBackendPort(): string {
  if (process.env.VITE_API_PORT) return process.env.VITE_API_PORT
  try {
    const envText = readFileSync(path.resolve(__dirname, '../server/.env'), 'utf-8')
    for (const line of envText.split('\n')) {
      const m = line.match(/^\s*PORT\s*=\s*(\d+)\s*$/)
      if (m) return m[1]
    }
  } catch {
    // 忽略：文件不存在时回退默认值
  }
  return '3001'
}
const API_TARGET = process.env.VITE_API_TARGET || `http://localhost:${getBackendPort()}`

export default defineConfig({
  // 沙箱代理预览时需要设置 base，例如：VITE_BASE=/preview/5173/
  // 本地开发不需要设置，默认为 /
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // 防止 jotai 被重复实例化：web 必须共享同一份 module，
    // 否则 getDefaultStore() 在不同模块里返回的是不同的 store。
    dedupe: ['jotai', 'react', 'react-dom'],
  },
  define: {
    'process.env': {},
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        // 自动跟随后端 PORT（读取 packages/server/.env）。
        // 如需手动覆盖，可设置 VITE_API_TARGET=http://localhost:xxxx 或 VITE_API_PORT=xxxx。
        target: API_TARGET,
        changeOrigin: true,
        // SSE 流式响应需要禁用超时，否则 Vite proxy 会缓冲数据
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
