import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import istanbul from 'vite-plugin-istanbul';
import {
  applyDefaultFrontendBuildApiBaseUrlMode,
  assertRequiredFrontendBuildApiBaseUrls,
} from '../../libs/frontend/api-support/lib/src/frontend-env';
import { createFrontendDevProxy } from '../../libs/frontend/api-support/lib/src/frontend-dev-proxy';
import { workspaceTsconfigAliases } from './workspace-tsconfig-aliases.mjs';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Third-party code is chunked away from app code because the two change on
 * completely different clocks: a deploy that edits a page should not make a
 * returning reader re-download React, the router, MobX and Radix as well. The
 * groups are coarse on purpose — a chunk per package meant 20+ requests for
 * ~600 kB that always load together — and the catch-all `vendor` group has to
 * stay last, since the first matching group wins.
 */
const vendorChunkGroups = [
  { name: 'vendor-react', test: /node_modules\/(react|react-dom|react-is|scheduler)\//, minSize: 0 },
  { name: 'vendor-tanstack', test: /node_modules\/@tanstack\//, minSize: 0 },
  { name: 'vendor-mobx', test: /node_modules\/mobx[^/]*\//, minSize: 0 },
  {
    name: 'vendor-ui',
    test: /node_modules\/(@radix-ui|@floating-ui|lucide-react|tailwind-merge|clsx|class-variance-authority)\//,
    minSize: 0,
  },
  { name: 'vendor', test: /node_modules\//, minSize: 0 },
];

/**
 * Translated copy is a chunk of its own for the same reason, only more so: the
 * locale catalogs are the largest single block of text in the bundle, they are
 * identical between deploys that touch no copy, and a translator fixing one
 * string should not invalidate the application chunk.
 */
const localeCatalogChunkGroup = {
  name: 'i18n-catalogs',
  // `i18n/<locale>/<namespace>/<catalog>.json`, where the locale is a language
  // code with an optional script suffix (`en`, `ru`, `uz`, `uz-cyrl`). Spelling
  // the locale segment out rather than accepting any lowercase word keeps the
  // group from also claiming the `i18n` *libraries*, whose paths have the same
  // shape but hold source and tsconfigs rather than copy.
  test: /[\\/]i18n[\\/][a-z]{2}(-[a-z]+)?[\\/][a-z-]+[\\/][a-z-]+\.json$/,
  minSize: 0,
};

/**
 * Shared Vite config for the Vite-built frontend apps (user `app`, `admin`,
 * `landing`). They differ only in their directory name and dev/preview port, so
 * everything else — tailwind + react plugins, workspace tsconfig aliases, the
 * build-time API base-url guards, and the optional istanbul E2E-coverage
 * instrumentation — lives here to prevent drift.
 *
 * @param {{ appName: string; port: number }} options
 *   `appName` is the directory under `apps/frontend/`; `port` is the dev/preview port.
 */
export function createFrontendViteConfig({ appName, port }) {
  const appRoot = resolve(workspaceRoot, 'apps/frontend', appName);

  return defineConfig(({ command, mode }) => {
    const isE2eCoverage = process.env.VITE_E2E_COVERAGE === 'true';
    applyDefaultFrontendBuildApiBaseUrlMode(process.env, command, mode);
    assertRequiredFrontendBuildApiBaseUrls(process.env, command, mode);

    return {
      root: appRoot,
      cacheDir: resolve(workspaceRoot, 'node_modules/.vite/apps/frontend', appName),
      resolve: {
        tsconfigPaths: true,
        alias: workspaceTsconfigAliases(),
      },
      // The API base URL is same-origin by design, so both the dev server and the
      // preview server have to route the API prefixes the way a deployment's
      // reverse proxy does. Without this every API path resolves to the SPA
      // fallback and the app boots against a wall of 404s.
      server: {
        port,
        host: 'localhost',
        proxy: createFrontendDevProxy(process.env),
      },
      preview: {
        port,
        host: 'localhost',
        proxy: createFrontendDevProxy(process.env),
      },
      plugins: [
        tailwindcss(),
        react(),
        ...(isE2eCoverage
          ? [
              istanbul({
                cwd: appRoot,
                include: 'src/**/*.{ts,tsx}',
                exclude: ['src/**/*.spec.*', 'src/**/*.test.*'],
                extension: ['.ts', '.tsx'],
                requireEnv: false,
                forceBuildInstrument: true,
                // Vite 8/Rolldown validates pure annotations after Istanbul wraps JSX
                // branch counters. Dropping generated comments keeps the browser
                // coverage build instrumented without emitting invalid annotations.
                generatorOpts: {
                  comments: false,
                },
              }),
            ]
          : []),
      ],
      build: {
        outDir: resolve(workspaceRoot, 'dist/apps/frontend', appName),
        emptyOutDir: true,
        reportCompressedSize: true,
        sourcemap: isE2eCoverage,
        commonjsOptions: {
          transformMixedEsModules: true,
        },
        rolldownOptions: {
          output: {
            // `codeSplitting` rather than the older `advancedChunks`: same shape,
            // but Rolldown 1.1 logs a deprecation warning for the latter on every
            // build of every app.
            codeSplitting: {
              groups: [localeCatalogChunkGroup, ...vendorChunkGroups],
            },
          },
        },
      },
    };
  });
}
