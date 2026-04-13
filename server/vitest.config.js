import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.spec.js'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['src/db/migrations/**'],
    },
  },
})
