import { defineConfig } from '@playwright/test';

const port = 4212;

export default defineConfig({
  expect: { timeout: 10_000 },
  outputDir: 'test-results/landing-browser',
  reporter: [['list']],
  testDir: './e2e',
  testMatch: '**/*.e2e-spec.mjs',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec astro preview --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
    url: `http://127.0.0.1:${port}`,
  },
  workers: 1,
});
