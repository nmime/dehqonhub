// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { crossBrowserProjects, installedBrowserForProject } from './browser-matrix';

describe('cross-browser matrix policy', () => {
  it('includes the narrow 320px Chromium contract', () => {
    assert.deepEqual(crossBrowserProjects, [
      'chromium',
      'chromium-320',
      'firefox',
      'webkit',
      'mobile-chrome',
      'mobile-safari',
    ]);
    assert.equal(installedBrowserForProject('chromium-320'), 'chromium');
  });

  it('derives only the selected user/admin app and API URLs from the configured service ports', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:8082',
    };
    for (const name of [
      'POSTGRES_PORT',
      'ADMIN_APP_API_PORT',
      'USER_APP_API_PORT',
      'AUTH_APP_API_PORT',
      'ADMIN_APP_PORT',
      'USER_APP_PORT',
      'FULLSTACK_ADMIN_API_URL',
      'FULLSTACK_USER_API_URL',
      'FULLSTACK_AUTH_API_URL',
      'FULLSTACK_ADMIN_APP_URL',
      'FULLSTACK_USER_APP_URL',
      'ADMIN_APP_API_URL',
      'USER_APP_API_URL',
      'AUTH_APP_API_URL',
      'ADMIN_APP_URL',
      'USER_APP_URL',
    ]) {
      delete env[name];
    }

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'jiti/register',
        'packages/tooling/src/commands/qa/cross-browser-e2e.ts',
        '--dry-run',
        '--project',
        'chromium',
      ],
      { cwd: process.cwd(), encoding: 'utf8', env },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as { env: Record<string, string> };
    assert.deepEqual(report.env, {
      POSTGRES_PORT: '5432',
      ADMIN_APP_API_PORT: '3001',
      USER_APP_API_PORT: '3002',
      AUTH_APP_API_PORT: '3003',
      ADMIN_APP_PORT: '8081',
      USER_APP_PORT: '8082',
      FULLSTACK_ADMIN_API_URL: 'http://127.0.0.1:3001',
      FULLSTACK_USER_API_URL: 'http://127.0.0.1:3002',
      FULLSTACK_AUTH_API_URL: 'http://127.0.0.1:3003',
      FULLSTACK_ADMIN_APP_URL: 'http://127.0.0.1:8081',
      FULLSTACK_USER_APP_URL: 'http://127.0.0.1:8082',
    });
  });

  it('requires only the selected user/admin app and admin/user/auth API URL set', () => {
    const explicitUrls = {
      FULLSTACK_ADMIN_API_URL: 'https://admin-api.example.test',
      FULLSTACK_USER_API_URL: 'https://user-api.example.test',
      FULLSTACK_AUTH_API_URL: 'https://auth-api.example.test',
      FULLSTACK_ADMIN_APP_URL: 'https://admin.example.test',
      FULLSTACK_USER_APP_URL: 'https://app.example.test',
    };
    const runMatrix = (env: NodeJS.ProcessEnv) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'jiti/register',
          'packages/tooling/src/commands/qa/cross-browser-e2e.ts',
          '--dry-run',
          '--project',
          'chromium',
        ],
        { cwd: process.cwd(), encoding: 'utf8', env },
      );
    const completeEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...explicitUrls,
    };
    delete completeEnv.PLAYWRIGHT_BASE_URL;
    delete completeEnv.PLAYWRIGHT_MANAGE_STACK;
    delete completeEnv.FULLSTACK_LANDING_APP_URL;
    delete completeEnv.FULLSTACK_SITE_APP_URL;
    delete completeEnv.LANDING_APP_URL;
    delete completeEnv.SITE_APP_URL;
    const complete = runMatrix(completeEnv);
    assert.equal(complete.status, 0, complete.stderr);

    const { FULLSTACK_AUTH_API_URL: _missingAuthApi, ...partialUrls } = explicitUrls;
    const partialEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...partialUrls,
    };
    delete partialEnv.PLAYWRIGHT_BASE_URL;
    delete partialEnv.PLAYWRIGHT_MANAGE_STACK;
    delete partialEnv.FULLSTACK_AUTH_API_URL;
    delete partialEnv.AUTH_APP_API_URL;
    const partial = runMatrix(partialEnv);
    assert.equal(partial.status, 2);
    assert.match(
      partial.stderr,
      /requires either PLAYWRIGHT_BASE_URL or the complete selected user\/admin app and admin\/user\/auth API URL set/u,
    );
  });
});
