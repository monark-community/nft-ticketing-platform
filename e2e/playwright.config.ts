// End-to-end tests (#336). See README.md in this folder.

import { defineConfig } from '@playwright/test';

import { CONTROL_URL, WEB_URL } from './stack/config.mjs';

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  preserveOutput: 'failures-only', // traces, screenshots and camera videos of failed tests only
  // One chain and one database for everything, so test files run one after another
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    timezoneId: 'America/Toronto',
    locale: 'en-US',
    // Animations off, so they can't make a test flaky
    contextOptions: { reducedMotion: 'reduce' },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    {
      name: 'phone',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],

  // The whole stack (stack/run.mjs). Locally, a stack you started with npm run stack is reused.
  webServer: {
    command: 'node stack/run.mjs',
    url: `${CONTROL_URL}/ready`,
    reuseExistingServer: !CI,
    timeout: 15 * 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
  },
});
