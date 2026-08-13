/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../../config/vite/workspace-tsconfig-aliases.mjs';
// nx-ignore-next-line
import { fullCoverage } from '../../../../../../packages/tooling/src/testing/vitest-coverage.mts';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/feature/agritech/main/lib',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    coverage: fullCoverage(
      'coverage/libs/backend/feature/agritech/main/lib',
      ['src/**/*.ts'],
      ['src/index.ts', 'src/**/*.module.ts', 'src/**/*.controller.ts', 'src/**/*.view-dto.ts'],
      // Every line, branch and function in this project is exercised by a test, so
      // the budget is zero: an unreachable guard is either dropped or restructured
      // out rather than paid for here.
      { branches: 0, functions: 0, lines: 0, statements: 0 },
    ),
  },
});
