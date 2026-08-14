/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../packages/tooling/src/testing/vitest-coverage.mts';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vitest/apps/frontend/app',
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://app.local.test/',
      },
    },
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    maxWorkers: 4,
    passWithNoTests: false,
    // The page specs drive whole screens — dozens of queries, awaited fetches and
    // route transitions each, now including the lazily imported route chunks — so
    // a cold or instrumented run where Vite is still transforming modules can push
    // one past the 5s default even though it passes in well under a second of
    // actual work. The higher ceilings keep a machine under load from reporting
    // timeouts as regressions; the hook ceiling covers the `beforeAll` blocks that
    // boot the whole app once per file.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    setupFiles: ['../../../packages/tooling/src/testing/vitest-dom-cleanup.ts'],
    coverage: fullCoverage('coverage/apps/frontend/app', ['src/**/*.{ts,tsx}'], [], {
      branches: -23,
      functions: -3,
      lines: -15,
      statements: -15,
    }),
  },
});
