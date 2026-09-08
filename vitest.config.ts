import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['test/**/*.mjs', 'tests/**/*.mjs', 'tests/e2e/**', 'node_modules/**', 'dist/**', '.worktrees/**'],
  },
});
