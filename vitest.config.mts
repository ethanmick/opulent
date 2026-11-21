import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'renderer/src/**/*.test.ts'],
    globalSetup: ['test/compile-main.ts'],
  },
})
