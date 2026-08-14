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
      // Budget for four guards no input can falsify. Two `codePointAt(0) ?? 0`
      // fallbacks (the evidence file-name scan and the PDF font picker) read a
      // character produced by iterating a string, which always has a code point.
      // Two `if (current)` else-paths in the PDF text wrapper cannot run either:
      // the accumulator is empty only before the first word, and a word wider
      // than the column always leaves a remainder behind. Deleting them to reach
      // 100% would remove the guard, not the risk.
      { branches: -4 },
    ),
  },
});
