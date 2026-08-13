/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../packages/tooling/src/testing/vitest-coverage.mts';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vitest/apps/frontend/admin',
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
    passWithNoTests: false,
    // The console's page specs drive whole RBAC screens — each one mounts the
    // workspace, resolves access and awaits a fistful of fetches — and pass in
    // well under a second of real work on an idle machine. On a loaded one, with
    // Vite still transforming modules and coverage instrumentation on top, the
    // same specs cross the 5s default and report as regressions. The hook ceiling
    // is the higher of the two because `main.spec.tsx` imports the entry module
    // inside `beforeAll`: that single import transforms the shared UI library,
    // which takes ~17s alone and more while fifteen worker forks compete for the
    // same cores. A genuinely stuck test still fails, just later.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    setupFiles: ['../../../packages/tooling/src/testing/vitest-dom-cleanup.ts'],
    coverage: fullCoverage('coverage/apps/frontend/admin', ['src/**/*.{ts,tsx}'], [], {
      branches: -239,
      functions: -153,
      lines: -315,
      statements: -323,
    }),
  },
});
