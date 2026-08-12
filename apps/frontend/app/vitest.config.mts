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
    passWithNoTests: false,
    setupFiles: ['../../../packages/tooling/src/testing/vitest-dom-cleanup.ts'],
    // Every statement, line and function of this app is exercised. Two branches are
    // not, and neither can be reached from a test: the non-string side of a
    // `FormData` value in the registration steps (text inputs only ever yield
    // strings), and the non-`HTMLElement` side of `document.activeElement` in the
    // confirmation dialog's focus restore. Both are type narrowing, so they stay as
    // a two-branch budget rather than becoming untested production code.
    coverage: fullCoverage('coverage/apps/frontend/app', ['src/**/*.{ts,tsx}'], [], {
      branches: -2,
      functions: 100,
      lines: 100,
      statements: 100,
    }),
  },
});
