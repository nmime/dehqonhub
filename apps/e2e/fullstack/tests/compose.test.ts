// @requirements REQ-SCAFFOLD-SELECTION-002
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { resolveFullstackSelection, validateFullstackEnvironment } from '../src/selection.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

void describe('fullstack selected closure', () => {
  void it('runs outside the selected roots but requires the core product stack and an explicit provider', () => {
    assert.throws(
      () =>
        resolveFullstackSelection({
          provider: 'postgres',
          roots: ['user-app'],
          services: ['migrate', 'postgres', 'user-app'],
        }),
      /selected product stack: missing admin-app/u,
    );
    assert.throws(() => resolveFullstackSelection({ provider: null, roots: [], services: [] }), /explicitly selected/u);
    assert.doesNotThrow(() =>
      resolveFullstackSelection({
        provider: 'postgres',
        roots: ['admin-app', 'admin-app-api', 'auth-app-api', 'user-app', 'user-app-api'],
        services: ['admin-app', 'admin-app-api', 'auth-app-api', 'migrate', 'postgres', 'user-app', 'user-app-api'],
      }),
    );
  });

  void it('derives every selected application, capability service, provider, and profile', () => {
    const selection = resolveFullstackSelection({
      provider: 'mongodb',
      roots: [
        'admin-app',
        'admin-app-api',
        'auth-app-api',
        'discord-app-api',
        'landing-app',
        'site-app',
        'user-app',
        'user-app-api',
      ],
      services: [
        'admin-app',
        'admin-app-api',
        'auth-app-api',
        'discord-app-api',
        'landing-app',
        'minio',
        'mongodb',
        'mongodb-init',
        'mongodb-migrate',
        'site-app',
        'user-app',
        'user-app-api',
      ],
    });
    assert.deepEqual(selection.applicationServices, [
      'admin-app',
      'admin-app-api',
      'auth-app-api',
      'discord-app-api',
      'user-app',
      'user-app-api',
    ]);
    assert.deepEqual(selection.profiles, [
      'admin-app',
      'admin-app-api',
      'auth-app-api',
      'discord-app-api',
      'mongodb',
      's3',
      'user-app',
      'user-app-api',
    ]);
    assert.equal(selection.migrationService, 'mongodb-migrate');
    assert.equal(selection.databaseService, 'mongodb');
    assert.equal(selection.services.includes('landing-app'), false);
    assert.equal(selection.services.includes('site-app'), false);
  });

  void it('rejects stale profile, provider, opposite-provider, and service-reduction environment leakage', () => {
    const selection = resolveFullstackSelection({
      provider: 'postgres',
      roots: ['admin-app', 'admin-app-api', 'auth-app-api', 'user-app', 'user-app-api'],
      services: ['admin-app', 'admin-app-api', 'auth-app-api', 'migrate', 'postgres', 'user-app', 'user-app-api'],
    });
    assert.doesNotThrow(() => {
      validateFullstackEnvironment(selection, {});
    });
    assert.throws(() => {
      validateFullstackEnvironment(selection, { DATABASE_ENGINE: 'mongodb' });
    }, /conflicts/u);
    assert.throws(() => {
      validateFullstackEnvironment(selection, { MONGODB_URI: 'mongodb://localhost/db' });
    }, /opposite-provider/u);
    assert.throws(() => {
      validateFullstackEnvironment(selection, { COMPOSE_PROFILES: 'postgres,user-app,admin-app' });
    }, /stale or unselected/u);
    assert.throws(() => {
      validateFullstackEnvironment(selection, { FULLSTACK_CRITICAL_ONLY: 'true' });
    }, /unsupported/u);
  });

  void it('loads Compose only from an explicit selected closure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-fullstack-selection-'));
    roots.push(root);
    mkdirSync(join(root, '.nrb'), { recursive: true });
    writeFileSync(
      join(root, '.nrb/closure.json'),
      JSON.stringify({
        provider: 'mongodb',
        roots: ['admin-app', 'admin-app-api', 'auth-app-api', 'user-app', 'user-app-api'],
        services: [
          'admin-app',
          'admin-app-api',
          'auth-app-api',
          'mongodb',
          'mongodb-init',
          'mongodb-migrate',
          'user-app',
          'user-app-api',
        ],
      }),
    );
    const originalRoot = process.env.NRB_WORKSPACE_ROOT;
    const originalMongoPort = process.env.MONGODB_PORT;
    const originalMongoUri = process.env.MONGODB_URI;
    const originalMongoDatabase = process.env.MONGODB_DATABASE;
    const originalDockerMongoUri = process.env.DOCKER_MONGODB_URI;
    const originalLandingPort = process.env.LANDING_APP_PORT;
    const originalLandingUrl = process.env.FULLSTACK_LANDING_APP_URL;
    const originalSitePort = process.env.SITE_APP_PORT;
    const originalSiteUrl = process.env.FULLSTACK_SITE_APP_URL;
    process.env.NRB_WORKSPACE_ROOT = root;
    process.env.MONGODB_PORT = '47123';
    process.env.MONGODB_URI = 'mongodb://mongodb.localhost:27017/stale?replicaSet=rs0&retryWrites=true';
    process.env.MONGODB_DATABASE = 'fullstack_test';
    process.env.FULLSTACK_LANDING_APP_URL = 'https://removed-landing.example.test';
    process.env.FULLSTACK_SITE_APP_URL = 'https://removed-site.example.test';
    process.env.LANDING_APP_PORT = '47983';
    process.env.SITE_APP_PORT = '47984';
    delete process.env.DOCKER_MONGODB_URI;
    try {
      const { composeEnv, databaseProvider, stackServices, urls } = await import(
        `../src/compose.ts?fixture=${Date.now()}`
      );
      assert.equal(databaseProvider, 'mongodb');
      assert.deepEqual(stackServices, [
        'admin-app',
        'admin-app-api',
        'auth-app-api',
        'mongodb',
        'mongodb-init',
        'mongodb-migrate',
        'user-app',
        'user-app-api',
      ]);
      assert.equal(composeEnv.COMPOSE_PROFILES, 'admin-app,admin-app-api,auth-app-api,mongodb,user-app,user-app-api');
      assert.equal(composeEnv.DATABASE_URL, undefined);
      assert.equal(
        composeEnv.MONGODB_URI,
        'mongodb://mongodb.localhost:47123/fullstack_test?replicaSet=rs0&retryWrites=true',
      );
      assert.equal(composeEnv.MONGODB_DATABASE, 'fullstack_test');
      assert.equal(composeEnv.FRONTEND_RUNTIME_ALLOW_LOOPBACK_HTTP, 'true');
      assert.equal(composeEnv.RATE_LIMIT_MAX, '1000');
      assert.equal('landingApp' in urls, false);
      assert.equal('siteApp' in urls, false);
      assert.equal('LANDING_APP_PORT' in composeEnv, false);
      assert.equal('SITE_APP_PORT' in composeEnv, false);
      assert.equal('LANDING_ADMIN_APP_URL' in composeEnv, false);
      assert.equal('LANDING_USER_APP_URL' in composeEnv, false);
      assert.equal(Buffer.from(composeEnv.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY, 'base64').byteLength, 32);
      assert.doesNotMatch(composeEnv.COMPOSE_PROFILES ?? '', /(^|,)postgres(,|$)/u);
    } finally {
      restoreEnv('NRB_WORKSPACE_ROOT', originalRoot);
      restoreEnv('MONGODB_PORT', originalMongoPort);
      restoreEnv('MONGODB_URI', originalMongoUri);
      restoreEnv('MONGODB_DATABASE', originalMongoDatabase);
      restoreEnv('DOCKER_MONGODB_URI', originalDockerMongoUri);
      restoreEnv('LANDING_APP_PORT', originalLandingPort);
      restoreEnv('FULLSTACK_LANDING_APP_URL', originalLandingUrl);
      restoreEnv('SITE_APP_PORT', originalSitePort);
      restoreEnv('FULLSTACK_SITE_APP_URL', originalSiteUrl);
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
