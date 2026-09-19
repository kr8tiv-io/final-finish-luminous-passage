import { defineConfig } from '@playwright/test';

// Same escape hatch `playwright.config.ts` carries: a worktree agent (or CI)
// running against its own built app on its own port instead of the shared dev
// server on 4333. Nothing else about this config changes.
const externalBaseUrl = process.env.FFE_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /finishing-review\.spec\.ts/,
  outputDir: './output/playwright/finishing-review',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: { baseURL: externalBaseUrl ?? 'http://127.0.0.1:4333', video: 'on', trace: 'retain-on-failure' },
  projects: [
    { name: 'review-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'review-phone', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
});
