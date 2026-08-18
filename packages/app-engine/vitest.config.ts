import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@aikd/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@aikd/component-registry': path.resolve(__dirname, '../component-registry/src/index.ts'),
    },
  },
})
