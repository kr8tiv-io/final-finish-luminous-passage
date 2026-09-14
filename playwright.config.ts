import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Astro's Windows dev server can stall while compiling several fresh routes at once.
  // Keep browser coverage deterministic; individual assertions are fast enough serially.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4333',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4333',
    url: 'http://127.0.0.1:4333',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ASTRO_DEV_BACKGROUND: '0',
      SITE_ENV: 'staging',
      PUBLIC_SITE_URL: 'http://127.0.0.1:4333',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15 Pro'] } },
  ],
});
