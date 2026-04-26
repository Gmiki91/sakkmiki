import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/app/tests/integration/*.spec.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'forks',
    maxWorkers:1
  },
});