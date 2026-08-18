import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    globals: false,
  },
  resolve: {
    alias: {
      '@aikd/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@aikd/agent': path.resolve(__dirname, '../agent/src/index.ts'),
    },
  },
})
