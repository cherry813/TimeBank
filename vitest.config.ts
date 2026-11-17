import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'threads',
    include: ['server/src/**/*.test.ts'],
  },
})
