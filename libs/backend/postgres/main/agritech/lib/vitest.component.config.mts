/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { workspaceTsconfigAliases } from '../../../../../../config/vite/workspace-tsconfig-aliases.mjs';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      ...workspaceTsconfigAliases(),
      // `URL.pathname` is percent-encoded and keeps a leading slash before the
      // Windows drive letter, so it cannot be resolved from a non-ASCII
      // checkout path. `fileURLToPath` is the portable spelling.
      '@app/backend-common-component-test': fileURLToPath(
        new URL('../../../../common/component-test/lib/src/index.ts', import.meta.url),
      ),
    },
  },
  cacheDir: '../../../../../../node_modules/.vitest/libs/backend/postgres/main/agritech/lib-component',
  test: {
    environment: 'node',
    include: ['src/**/*.component-spec.ts'],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: { enabled: false },
  },
});
