import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
      branches: 90,
      lines: 90,
      functions: 90,
      statements: 90,
      exclude: ['**/tests/**', '**/*.test.*', '**/*.spec.*'],
    },
  },
});


