import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: /readable-experience\.spec\.ts/,
  outputDir: './output/readability/results', workers: 1, timeout: 45000,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:4333', trace: 'retain-on-failure' },
  projects: [{ name: 'readability-chromium', use: { ...devices['Desktop Chrome'] } }],
});
