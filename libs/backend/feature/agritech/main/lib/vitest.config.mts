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
      // Budget for the defence-in-depth guards in the in-memory marketplace store
      // that no command can reach through its own public surface: the second
      // product lookup and the non-positive total in `checkoutCart`, the request
      // and contract transition re-checks in `makeOffer`/`signContract`, the
      // self-selection guard and the terminal-status guard they sit behind, the
      // empty-lines and vanished-product checks around the inventory commit, and
      // the document clone in `cloneVerification` (no fixture carries documents).
      // Deleting them to reach 100% would remove the guard, not the risk.
      { branches: -8, functions: -1, lines: -9, statements: -9 },
    ),
  },
});
