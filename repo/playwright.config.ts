import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:43120'
const extraChromiumArgs =
  process.env.PLAYWRIGHT_BASE_URL === 'http://harborfresh'
    ? ['--unsafely-treat-insecure-origin-as-secure=http://harborfresh']
    : []

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
    headless: true,
    trace: 'on-first-retry',
    launchOptions: {
      args: extraChromiumArgs,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // When running inside Docker, PLAYWRIGHT_BASE_URL points to the nginx container.
  // No local webServer needed in that case.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'VITE_TEST_SEED=true npm run dev -- --host 127.0.0.1 --port 43120',
        url: 'http://127.0.0.1:43120',
        reuseExistingServer: false,
        timeout: 120_000,
      },
})
