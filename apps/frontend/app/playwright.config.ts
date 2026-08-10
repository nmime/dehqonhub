import { defineConfig } from '@playwright/test';

const port = 4211;

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'test-results/user-app-authenticated',
  reporter: [['list']],
  retries: process.env.CI ? 1 : 0,
  testDir: './e2e',
  testMatch: '**/*.e2e-spec.ts',
  timeout: 90_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `../../../node_modules/.bin/vite preview --config vite.config.mts --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
    url: `http://127.0.0.1:${port}`,
  },
  workers: 1,
});
