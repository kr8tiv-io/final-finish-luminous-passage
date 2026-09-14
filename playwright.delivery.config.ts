import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /readability-capture\.spec\.ts/,
  outputDir: './output/playwright/readability-delivery',
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4334', video: 'on', trace: 'retain-on-failure' },
  projects: [
    { name: 'built-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'built-phone', use: { ...devices['iPhone 15 Pro'] } },
  ],
});
