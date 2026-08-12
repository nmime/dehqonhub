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
    // Fully measured: the two type-narrowing branches this app used to keep as an
    // uncovered budget are gone, so it holds the shared 100% contract with no
    // exemption of its own.
    coverage: fullCoverage('coverage/apps/frontend/app', ['src/**/*.{ts,tsx}']),
  },
});
