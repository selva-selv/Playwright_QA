import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir:       './tests',
  fullyParallel: true,
  forbidOnly:    !!process.env.CI,
  retries:       process.env.CI ? 2 : 1,
  workers:       process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'on-failure', outputFolder: 'playwright-report' }],
    ['./utils/jiraReporter.ts'],
  ],
  use: {
    baseURL:           process.env.BASE_URL ?? 'https://measurement-dashboard-dev.magicktech.com',
    trace:             'retain-on-failure',
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    actionTimeout:     15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome']  } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari']  } },
  ],
});
