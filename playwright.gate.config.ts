import { defineConfig, devices } from '@playwright/test';

// Deliberately uses the documented, already-running Astro background preview.
// It never starts/stops another checkout's server or opens a live client site.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /(follow-floor|refinements)\.spec\.ts/,
  outputDir: './output/playwright/results',
  fullyParallel: false, workers: 1, retries: 0, timeout: 45_000,
  reporter: 'list',
  use: { baseURL: process.env.GATE_URL || 'http://127.0.0.1:4333', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'phone-webkit', use: { ...devices['iPhone 15 Pro'] } },
  ],
});
