import { defineConfig } from '@playwright/test';

const port = 4213;

export default defineConfig({
  expect: { timeout: 10_000 },
  outputDir: 'test-results/site-browser',
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
    command: `NODE_ENV=production SITE_APP_HOST=127.0.0.1 SITE_APP_PORT=${port} node ../../../dist/apps/frontend/site/server/index.js`,
    reuseExistingServer: false,
    timeout: 30_000,
    url: `http://127.0.0.1:${port}`,
  },
  workers: 1,
});
