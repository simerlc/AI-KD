import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    // 串行执行测试文件，避免多个文件争用同一个 SQLite 单例
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@aikd/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
})
