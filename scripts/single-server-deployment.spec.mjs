// @requirements REQ-RUNTIME-DELIVERY-009 REQ-AGRITECH-DEPLOYMENT-014 REQ-AGRITECH-NOTIFICATION-022 REQ-AGRITECH-ROUTING-015
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  certificateDomains,
  expectedListeningPorts,
  loadSingleServerConfiguration,
  renderNginx,
} from './single-server-deployment.mjs';

const referenceCoreApps = [
  'admin-app',
  'admin-app-api',
  'auth-app-api',
  'landing-app',
  'mobile-app',
  'site-app',
  'user-app',
  'user-app-api',
];
const profileApps = {
  discord: 'discord-app-api',
  'notification-consumer': 'notification-consumer',
  'notification-scheduler': 'notification-scheduler',
  telegram: 'telegram-bot-api',
};

const fixture = ({
  certificateMode = 'exact-hosts',
  databaseEngine = 'postgres',
  databaseMode = 'bundled-db',
  primaryApp = 'landing-app',
  profiles = '',
  publicMode = 'per-app-domains',
  frontendMode,
  runtimeMode,
  marketplaceProviderMode,
  distRoot = '/srv/nrb/dist/apps/frontend',
  selectedApps,
  selectedServices,
} = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-single-server-'));
  const serverEnv = join(directory, 'server.env');
  const productionEnv = join(directory, '.env.production');
  writeFileSync(
    serverEnv,
    [
      `CERTIFICATE_MODE=${certificateMode}`,
      'CERTIFICATE_NAME=product.example',
      'CERTBOT_EMAIL=ops@product.example',
      'CERTBOT_DNS_PLUGIN=cloudflare',
      ['CERTBOT_DNS_PACKAGE', 'python3-certbot-dns-cloudflare'].join('='),
      ['CERTBOT_DNS_CREDENTIALS', '/etc/letsencrypt/cloudflare.ini'].join('='),
      ...(runtimeMode ? [`RUNTIME_MODE=${runtimeMode}`] : []),
    ].join('\n'),
  );
  writeFileSync(
    productionEnv,
    [
      'PUBLIC_DOMAIN=product.example',
      `PRIMARY_APP=${primaryApp}`,
      `DATABASE_ENGINE=${databaseEngine}`,
      `COMPOSE_DATABASE_MODE=${databaseMode}`,
      'COMPOSE_DOMAIN_MODE=external-proxy',
      'COMPOSE_TLS_MODE=external',
      `EXTERNAL_PROXY_PUBLIC_MODE=${publicMode}`,
      `COMPOSE_PROFILES=${profiles}`,
      'ADMIN_APP_API_PORT=3101',
      'USER_APP_API_PORT=3102',
      'AUTH_APP_API_PORT=3103',
      'DISCORD_APP_API_PORT=3107',
      'TELEGRAM_BOT_API_PORT=3113',
      'ADMIN_APP_PORT=4100',
      'USER_APP_PORT=4101',
      'LANDING_APP_PORT=4102',
      'SITE_APP_PORT=4103',
      'MOBILE_APP_PORT=4104',
      `FRONTEND_DIST_ROOT=${distRoot}`,
      ...(marketplaceProviderMode ? [`${marketplaceProviderMode.key}=${marketplaceProviderMode.value}`] : []),
      ...(frontendMode ? [`EXTERNAL_PROXY_FRONTEND_MODE=${frontendMode}`] : []),
    ].join('\n'),
  );
  const fixtureSelectedApps =
    selectedApps ??
    [
      ...referenceCoreApps,
      ...profiles
        .split(',')
        .map((profile) => profileApps[profile])
        .filter(Boolean),
    ].sort();
  const fixtureSelectedServices =
    selectedServices ?? [...fixtureSelectedApps, 'alertmanager', 'grafana', 'otel-collector', 'prometheus'].sort();
  const dependencies = {
    readProductionClosure: () => ({
      provider: databaseEngine,
      selectedApps: fixtureSelectedApps,
      services: fixtureSelectedServices,
    }),
  };
  try {
    const load = () => loadSingleServerConfiguration({ productionEnv, serverEnv }, dependencies);
    const configuration = load();
    return {
      configuration,
      cleanup: () => rmSync(directory, { force: true, recursive: true }),
      load,
    };
  } catch (error) {
    rmSync(directory, { force: true, recursive: true });
    throw error;
  }
};

const astroIndexWithHashedCsp =
  '<meta http-equiv="content-security-policy" content="script-src \'self\' \'sha256-YWJjZA==\';">';
const renderStaticNginx = (configuration) =>
  renderNginx(configuration, 'https', {
    readStaticFile: (path) => {
      assert.match(path, /\/landing\/index\.html$/u);
      return astroIndexWithHashedCsp;
    },
  });

const shellFunction = (source, name) => {
  const match = source.match(new RegExp(`(?:^|\\n)${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}`, 'u'));
  assert.ok(match, `serverctl must define ${name}()`);
  return match[0].trimStart();
};

const tlsServerForHost = (nginx, host) => {
  const marker = `server_name ${host};`;
  const markerIndex = nginx.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing TLS server for ${host}`);
  const start = nginx.lastIndexOf('server {', markerIndex);
  const end = nginx.indexOf('\n}', markerIndex);
  assert.notEqual(start, -1, `missing TLS server start for ${host}`);
  assert.notEqual(end, -1, `missing TLS server end for ${host}`);
  return nginx.slice(start, end + 2);
};

test('installs pinned Corepack without replacing an existing corepack command', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-corepack-install-'));
  context.after(() => rmSync(directory, { force: true, recursive: true }));
  const installRoot = join(directory, 'corepack-prefix');
  const shimRoot = join(directory, 'bin');
  const fakeBin = join(directory, 'fake-bin');
  const npmLog = join(directory, 'npm.log');
  const corepackLog = join(directory, 'corepack.log');
  const existingCorepack = join(shimRoot, 'corepack');
  const fakeNpm = join(fakeBin, 'npm');
  const fakeNode = join(fakeBin, 'node');
  mkdirSync(shimRoot, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(existingCorepack, '#!/bin/sh\nprintf unrelated-corepack\\n');
  chmodSync(existingCorepack, 0o755);
  writeFileSync(
    fakeNpm,
    `#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\\n' "$*" >>"\${NPM_LOG}"
[[ "$*" == *'--no-bin-links'* ]]
[[ "$*" != *'--force'* ]]
mkdir -p "\${npm_config_prefix}/lib/node_modules/corepack/dist"
printf 'fixture\\n' >"\${npm_config_prefix}/lib/node_modules/corepack/dist/corepack.js"
`,
  );
  writeFileSync(
    fakeNode,
    `#!/usr/bin/env bash
set -Eeuo pipefail
shift
if [[ "\${1:-}" == '--version' ]]; then
  printf '%s\\n' "\${COREPACK_VERSION}"
  exit 0
fi
printf '%s\\n' "$*" >>"\${COREPACK_LOG}"
`,
  );
  chmodSync(fakeNpm, 0o755);
  chmodSync(fakeNode, 0o755);

  const controller = readFileSync(new URL('../deploy/single-server/serverctl', import.meta.url), 'utf8');
  const script = `set -Eeuo pipefail
COREPACK_VERSION=0.35.0
PNPM_VERSION=11.15.1
export COREPACK_VERSION PNPM_VERSION
die() { printf '%s\\n' "$*" >&2; exit 1; }
${shellFunction(controller, 'install_corepack')}
install_corepack "$1" "$2" "$3"
install_corepack "$1" "$2" "$3"
`;
  const result = spawnSync('bash', ['-c', script, 'corepack-regression', installRoot, shimRoot, fakeNode], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, COREPACK_LOG: corepackLog, NPM_LOG: npmLog, PATH: `${fakeBin}:${process.env.PATH}` },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readFileSync(existingCorepack, 'utf8'), '#!/bin/sh\nprintf unrelated-corepack\\n');
  assert.equal(readFileSync(npmLog, 'utf8').trim().split('\n').length, 1, 'the second convergence must reuse Corepack');
  assert.deepEqual(readFileSync(corepackLog, 'utf8').trim().split('\n'), [
    'install --global pnpm@11.15.1',
    `enable --install-directory ${shimRoot} pnpm`,
    'install --global pnpm@11.15.1',
    `enable --install-directory ${shimRoot} pnpm`,
  ]);
});

test('keeps disabled UFW as a successful no-op under errexit', () => {
  const controller = readFileSync(new URL('../deploy/single-server/serverctl', import.meta.url), 'utf8');
  const script = `set -Eeuo pipefail
ENABLE_UFW=false
${shellFunction(controller, 'install_firewall')}
install_firewall
printf 'continued\\n'
`;
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, 'continued\n');
});

test('doctor rejects running deselected apps without flagging stopped historical containers', () => {
  const controller = readFileSync(new URL('../deploy/single-server/serverctl', import.meta.url), 'utf8');
  const check = shellFunction(controller, 'check_no_deselected_compose_apps');
  assert.match(check, /docker ps/u);
  assert.doesNotMatch(check, /docker ps[^\n]*(?:--all|-a(?:\s|$))/u);
  const script = (running) => `set -Eeuo pipefail
APP_ROOT=/srv/product
deselected_apps() { printf '%s\\n' landing-app site-app; }
run_as_deploy() { printf '%s\\n' ${running}; }
die() { printf '%s\\n' "$*" >&2; exit 1; }
${check}
check_no_deselected_compose_apps
`;
  const healthy = spawnSync('bash', ['-c', script('user-app')], { encoding: 'utf8' });
  assert.equal(healthy.status, 0, healthy.stderr || healthy.stdout);

  const stale = spawnSync('bash', ['-c', script('landing-app')], { encoding: 'utf8' });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /deselected production application is still running: landing-app/u);
});

test('exact-host certificates reject stale SANs after the selected host set shrinks', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-exact-san-'));
  context.after(() => rmSync(directory, { force: true, recursive: true }));
  const issue = (name, sans) => {
    const certificate = join(directory, `${name}.pem`);
    const key = join(directory, `${name}.key`);
    const result = spawnSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-sha256',
        '-days',
        '30',
        '-nodes',
        '-subj',
        '/CN=product.example',
        '-addext',
        `subjectAltName=${sans.map((host) => `DNS:${host}`).join(',')}`,
        '-keyout',
        key,
        '-out',
        certificate,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return certificate;
  };
  const exact = issue('exact', ['product.example', 'admin-app.product.example']);
  const stale = issue('stale', ['product.example', 'admin-app.product.example', 'landing-app.product.example']);
  const controller = readFileSync(new URL('../deploy/single-server/serverctl', import.meta.url), 'utf8');
  const script = `set -Eeuo pipefail
CERTIFICATE_MODE=exact-hosts
public_hosts() { printf '%s\\n' product.example admin-app.product.example; }
${shellFunction(controller, 'certificate_dns_names')}
${shellFunction(controller, 'certificate_covers_domains')}
certificate_covers_domains "$1"
! certificate_covers_domains "$2"
`;
  const result = spawnSync('bash', ['-c', script, 'exact-san-regression', exact, stale], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('builds local images once before systemd activates them without rebuilding', () => {
  const controller = readFileSync(new URL('../deploy/single-server/serverctl', import.meta.url), 'utf8');
  const deploy = shellFunction(controller, 'deploy');
  const unit = shellFunction(controller, 'install_compose_unit');
  const localBuilds = deploy.match(/compose-production\.mjs" build\b/gu) ?? [];
  assert.equal(localBuilds.length, 1, 'the controller must perform exactly one local image build');
  assert.ok(
    deploy.indexOf('compose-production.mjs" build') < deploy.indexOf('install_compose_unit'),
    'the local build must finish before the systemd unit is installed and restarted',
  );
  assert.match(unit, /compose-production\.mjs up[^\n]*--no-build/u);
  assert.doesNotMatch(unit, /\$\{no_build\}/u, 'unit activation must not vary its build behavior by provenance');
  assert.match(unit, /IMAGE_SOURCE.*registry[\s\S]*compose-production\.mjs pull/u);
  assert.match(unit, /COMPOSE_IMAGE_SOURCE=local was prebuilt by nrb-server deploy/u);
});

test('accepts all database engine and ownership combinations independently', (context) => {
  for (const databaseEngine of ['postgres', 'mongodb']) {
    for (const databaseMode of ['bundled-db', 'external-db']) {
      const current = fixture({ databaseEngine, databaseMode });
      context.after(current.cleanup);
      assert.equal(current.configuration.databaseEngine, databaseEngine);
      assert.equal(current.configuration.databaseMode, databaseMode);
    }
  }
});

test('rejects mock marketplace providers in single-server production configuration', () => {
  for (const key of [
    'MARKETPLACE_ONEID_PROVIDER_MODE',
    'MARKETPLACE_DOCUMENT_PROVIDER_MODE',
    'MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_MODE',
    'MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_MODE',
    'MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_MODE',
    'MARKETPLACE_PROMOTION_BILLING_PROVIDER_MODE',
    'MARKETPLACE_DIRECT_PAYMENT_PROVIDER_MODE',
    'MARKETPLACE_FACTORING_PROVIDER_MODE',
    'MARKETPLACE_NOTIFICATION_PROVIDER_MODE',
  ]) {
    assert.throws(
      () => fixture({ marketplaceProviderMode: { key, value: 'mock' } }),
      new RegExp(`${key}=mock is forbidden in production deployment configuration\\.`, 'u'),
    );
  }
});

test('derives every exact app-id host and only enables selected optional APIs', (context) => {
  const { configuration, cleanup } = fixture({ profiles: 'telegram,discord' });
  context.after(cleanup);
  assert.deepEqual(configuration.publicHosts, [
    'product.example',
    'site-app.product.example',
    'user-app.product.example',
    'admin-app.product.example',
    'mobile-app.product.example',
    'auth-app-api.product.example',
    'user-app-api.product.example',
    'admin-app-api.product.example',
    'discord-app-api.product.example',
    'telegram-bot-api.product.example',
  ]);
  assert.deepEqual(certificateDomains(configuration), configuration.publicHosts);
});

test('renders the selected DehqonHub user app on the apex with no removed public artifacts', (context) => {
  const selectedApps = [
    'admin-app',
    'admin-app-api',
    'auth-app-api',
    'mobile-app',
    'notification-consumer',
    'notification-scheduler',
    'telegram-bot-api',
    'user-app',
    'user-app-api',
  ];
  const { configuration, cleanup } = fixture({
    primaryApp: 'user-app',
    selectedApps,
    selectedServices: [...selectedApps, 'migrate', 'postgres', 'redis'],
  });
  context.after(cleanup);

  assert.deepEqual(configuration.publicHosts, [
    'product.example',
    'admin-app.product.example',
    'mobile-app.product.example',
    'auth-app-api.product.example',
    'user-app-api.product.example',
    'admin-app-api.product.example',
    'telegram-bot-api.product.example',
  ]);
  assert.deepEqual(certificateDomains(configuration), configuration.publicHosts);
  assert.deepEqual(configuration.enabledProfiles, ['notification-consumer', 'notification-scheduler', 'telegram']);
  assert.ok(configuration.deselectedApps.includes('landing-app'));
  assert.ok(configuration.deselectedApps.includes('site-app'));
  assert.ok(!configuration.deselectedApps.includes('user-app'));
  assert.equal(Object.hasOwn(configuration.ports, 'LANDING_APP_PORT'), false);
  assert.equal(Object.hasOwn(configuration.ports, 'SITE_APP_PORT'), false);

  const nginx = renderNginx(configuration, 'https');
  const apex = tlsServerForHost(nginx, 'product.example');
  const admin = tlsServerForHost(nginx, 'admin-app.product.example');
  const mobile = tlsServerForHost(nginx, 'mobile-app.product.example');
  assert.match(apex, /location \/ \{\n    proxy_pass http:\/\/127\.0\.0\.1:4101;/u);
  assert.doesNotMatch(nginx, /server_name (?:landing-app|site-app|user-app)\.product\.example;/u);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/127\.0\.0\.1:410[23];/u);
  assert.ok(apex.indexOf('location = /marketplace') < apex.indexOf('location / {'));
  assert.match(apex, /location \^~ \/marketplace\//u);
  assert.match(apex, /location = \/farmer/u);
  assert.doesNotMatch(apex, /location \^~ \/farmer\//u, 'the SPA owns /farmer/register');
  for (const frontend of [apex, admin, mobile]) {
    assert.doesNotMatch(frontend, /location = \/telegram(?:-mini-app)?/u);
    assert.doesNotMatch(frontend, /location = \/discord/u);
  }
  for (const root of [
    'advisories',
    'deliveries',
    'field-agent',
    'field-visits',
    'orders',
    'partners',
    'payments',
    'produce',
    'profile',
    'supplier',
  ]) {
    assert.match(apex, new RegExp(`location \\^~ \\/${root}\\/`, 'u'), `missing direct /${root} API root`);
  }
  assert.deepEqual(
    expectedListeningPorts(configuration)
      .map(({ key }) => key)
      .sort(),
    [
      'ADMIN_APP_API_PORT',
      'ADMIN_APP_PORT',
      'AUTH_APP_API_PORT',
      'MOBILE_APP_PORT',
      'TELEGRAM_BOT_API_PORT',
      'USER_APP_API_PORT',
      'USER_APP_PORT',
    ],
  );
});

test('renders a single-domain site owner with canonical same-origin APIs and bot routes', (context) => {
  const { configuration, cleanup } = fixture({
    primaryApp: 'site-app',
    profiles: 'telegram,discord',
    publicMode: 'single-domain',
  });
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'https');
  assert.deepEqual(configuration.publicHosts, ['product.example']);
  assert.match(nginx, /server_name product\.example;/u);
  assert.match(nginx, /location \/ \{\n    proxy_pass http:\/\/127\.0\.0\.1:4103;/u);
  assert.match(nginx, /location = \/api\/auth/u);
  assert.match(nginx, /location = \/oauth/u);
  assert.match(nginx, /location = \/telegram-mini-app/u);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4101;/u);
  assert.match(nginx, /location = \/discord/u);
  assert.doesNotMatch(nginx, /server_name site-app\.product\.example/u);
});

test('renders separate frontend and API virtual hosts using loopback-only upstreams', (context) => {
  const { configuration, cleanup } = fixture();
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'https');
  assert.match(nginx, /server_name auth-app-api\.product\.example;/u);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3103;/u);
  assert.match(nginx, /server_name admin-app\.product\.example;/u);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4100;/u);
  assert.match(nginx, /ssl_protocols TLSv1\.2 TLSv1\.3;/u);
  assert.match(nginx, /listen 80 default_server;/u);
  assert.match(nginx, /listen 443 ssl http2 default_server;/u);
  assert.match(nginx, /listen 443 ssl http2;/u);
  assert.doesNotMatch(nginx, /http2 on;/u);
  assert.match(nginx, /ssl_reject_handshake on;/u);
  assert.match(nginx, /Strict-Transport-Security/u);
  assert.match(nginx, /location = \/_infra\/health/u);
  assert.doesNotMatch(nginx, /discord-app-api\.product\.example/u);
  assert.doesNotMatch(nginx, /telegram-bot-api\.product\.example/u);
  assert.doesNotMatch(nginx, /location = \/oauth/u);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/(?!127\.0\.0\.1)/u);
  assert.doesNotMatch(nginx, /X-Forwarded-For \$proxy_add_x_forwarded_for/u);

  const landingServer = tlsServerForHost(nginx, 'product.example');
  assert.match(landingServer, /proxy_pass http:\/\/127\.0\.0\.1:4102;/u);
  const siteRedirect = tlsServerForHost(nginx, 'site-app.product.example');
  assert.match(siteRedirect, /location = \/_infra\/health/u, 'redirect host keeps a local health endpoint');
  assert.match(siteRedirect, /return 308 https:\/\/product\.example\$request_uri;/u);
  assert.doesNotMatch(siteRedirect, /proxy_pass/u, 'secondary marketing host never reaches its application');
});

test('redirects the secondary landing host when site-app owns the apex', (context) => {
  const { configuration, cleanup } = fixture({ primaryApp: 'site-app' });
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'https');
  const siteServer = tlsServerForHost(nginx, 'product.example');
  assert.match(siteServer, /proxy_pass http:\/\/127\.0\.0\.1:4103;/u);
  const landingRedirect = tlsServerForHost(nginx, 'landing-app.product.example');
  assert.match(landingRedirect, /location = \/_infra\/health/u);
  assert.match(landingRedirect, /return 308 https:\/\/product\.example\$request_uri;/u);
  assert.doesNotMatch(landingRedirect, /proxy_pass/u);
  assert.ok(portKeys(configuration).includes('SITE_APP_PORT'));
  assert.ok(!portKeys(configuration).includes('LANDING_APP_PORT'));
});

test('renders an HTTP-only ACME bootstrap without referencing a missing certificate', (context) => {
  const { configuration, cleanup } = fixture();
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'http');
  assert.match(nginx, /\.well-known\/acme-challenge/u);
  assert.match(nginx, /return 503/u);
  assert.doesNotMatch(nginx, /listen 443/u);
  assert.doesNotMatch(nginx, /ssl_certificate/u);
});

test('requests apex and wildcard SANs only in DNS wildcard certificate mode', (context) => {
  const { configuration, cleanup } = fixture({ certificateMode: 'dns-wildcard' });
  context.after(cleanup);
  assert.deepEqual(certificateDomains(configuration), ['product.example', '*.product.example']);
});

test('uses a wildcard certificate for exact per-app hosts without accepting arbitrary wildcard hosts', (context) => {
  const { configuration, cleanup } = fixture({ certificateMode: 'dns-wildcard', profiles: 'telegram,discord' });
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'https');
  assert.deepEqual(certificateDomains(configuration), ['product.example', '*.product.example']);
  assert.ok(configuration.publicHosts.includes('auth-app-api.product.example'));
  assert.ok(configuration.publicHosts.includes('telegram-bot-api.product.example'));
  assert.match(nginx, /server_name auth-app-api\.product\.example;/u);
  assert.doesNotMatch(nginx, /server_name \*\.product\.example;/u);
  assert.match(nginx, /ssl_reject_handshake on;/u);
});

test('rejects a Compose-owned edge and unsupported public modes', (context) => {
  const first = fixture();
  context.after(first.cleanup);
  writeFileSync(
    first.configuration.productionPath,
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nDATABASE_ENGINE=postgres\nCOMPOSE_DATABASE_MODE=bundled-db\nCOMPOSE_DOMAIN_MODE=per-app-domains\nCOMPOSE_TLS_MODE=automatic\nEXTERNAL_PROXY_PUBLIC_MODE=per-app-domains\n',
  );
  assert.throws(() => first.load(), /external-proxy/u);

  const second = fixture();
  context.after(second.cleanup);
  writeFileSync(
    second.configuration.productionPath,
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nDATABASE_ENGINE=postgres\nCOMPOSE_DATABASE_MODE=bundled-db\nCOMPOSE_DOMAIN_MODE=external-proxy\nCOMPOSE_TLS_MODE=external\nEXTERNAL_PROXY_PUBLIC_MODE=implicit\n',
  );
  assert.throws(() => second.load(), /EXTERNAL_PROXY_PUBLIC_MODE/u);

  const third = fixture();
  context.after(third.cleanup);
  writeFileSync(
    third.configuration.productionPath,
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nDATABASE_ENGINE=postgres\nCOMPOSE_DATABASE_MODE=bundled-db\nCOMPOSE_DOMAIN_MODE=external-proxy\nCOMPOSE_TLS_MODE=external\nEXTERNAL_PROXY_PUBLIC_MODE=per-app-domains\nADMIN_APP_PORT=3000\n',
  );
  assert.throws(() => third.load(), /both publish host port 3000/u);
});

test('rejects invalid Certbot identity and DNS propagation settings', (context) => {
  const email = fixture();
  context.after(email.cleanup);
  writeFileSync(
    email.configuration.serverPath,
    'CERTIFICATE_MODE=exact-hosts\nCERTIFICATE_NAME=product.example\nCERTBOT_EMAIL=invalid\n',
  );
  assert.throws(() => email.load(), /CERTBOT_EMAIL/u);

  const dns = fixture({ certificateMode: 'dns-wildcard' });
  context.after(dns.cleanup);
  writeFileSync(
    dns.configuration.serverPath,
    [
      'CERTIFICATE_MODE=dns-wildcard',
      'CERTIFICATE_NAME=product.example',
      'CERTBOT_EMAIL=ops@product.example',
      'CERTBOT_DNS_PLUGIN=cloudflare',
      ['CERTBOT_DNS_PACKAGE', 'python3-certbot-dns-cloudflare'].join('='),
      ['CERTBOT_DNS_CREDENTIALS', '/etc/letsencrypt/cloudflare.ini'].join('='),
      'CERTBOT_DNS_PROPAGATION_SECONDS=0',
    ].join('\n'),
  );
  assert.throws(() => dns.load(), /CERTBOT_DNS_PROPAGATION_SECONDS/u);
});

test('static frontend mode serves built SPAs from disk with history fallback', () => {
  const { configuration, cleanup } = fixture({ frontendMode: 'static' });
  try {
    const nginx = renderStaticNginx(configuration);
    // Each SPA is served from its own dist directory, not proxied to a process.
    for (const directory of ['landing', 'app', 'admin', 'mobile']) {
      assert.ok(
        nginx.includes(`root /srv/nrb/dist/apps/frontend/${directory};`),
        `${directory} must be served from disk`,
      );
    }
    assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html;/u, 'SPA history fallback is required');
    assert.match(nginx, /Cache-Control "no-store"/u, 'index.html must never be cached');
    assert.match(nginx, /location \^~ \/assets\/ \{/u, 'only hashed output is cached hard');
    assert.match(nginx, /max-age=31536000, immutable/u, 'hashed assets should be cached hard');
    // The runtime config is rewritten per deployment, so it must not inherit the
    // immutable asset policy, and no extension regex may outrank the API prefixes.
    assert.match(nginx, /location = \/runtime-config\.js \{/u);
    assert.doesNotMatch(nginx, /location ~\* \\\./u, 'an extension regex would shadow /auth, /profile and /admin');
    // add_header does not merge across levels: a location that sets Cache-Control
    // discards every inherited header, so each must restate the security set.
    const indexBlock = nginx.slice(nginx.indexOf('location = /index.html {'));
    for (const header of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Vary Accept']) {
      assert.ok(indexBlock.slice(0, 700).includes(header), `index.html must keep ${header}`);
    }
    assert.match(indexBlock.slice(0, 900), /Content-Security-Policy/u, 'served HTML must carry a CSP');
    const landingServer = nginx.slice(
      nginx.indexOf('server_name product.example;'),
      nginx.indexOf('server_name site-app.product.example;'),
    );
    assert.match(
      landingServer,
      /script-src 'self' 'unsafe-inline'/u,
      'Astro hydration must be admitted by the outer landing policy',
    );
    const userServer = nginx.slice(
      nginx.indexOf('server_name user-app.product.example;'),
      nginx.indexOf('server_name admin-app.product.example;'),
    );
    assert.match(userServer, /script-src 'self';/u, 'non-Astro SPAs must retain the strict outer script policy');
    assert.doesNotMatch(userServer, /script-src 'self' 'unsafe-inline'/u);
    const assetBlock = nginx.slice(nginx.indexOf('location ^~ /assets/ {'));
    assert.ok(assetBlock.slice(0, 600).includes('X-Content-Type-Options'), 'assets must keep nosniff');
    // Swagger UI is proxied on the same vhost and would break under the SPA CSP.
    const docsBlock = nginx.slice(nginx.indexOf('location ^~ /auth/docs/ {'));
    assert.ok(
      !docsBlock.slice(0, 600).includes('Content-Security-Policy'),
      'the API docs must not inherit the SPA CSP',
    );
    assert.match(nginx, /location = \/\.env \{ return 404; \}/u);
    assert.match(nginx, /location \^~ \/\.git\/ \{ return 404; \}/u);
    // The secondary SSR site redirects locally, while APIs stay proxied to loopback.
    const siteRedirect = tlsServerForHost(nginx, 'site-app.product.example');
    assert.match(siteRedirect, /return 308 https:\/\/product\.example\$request_uri;/u);
    assert.doesNotMatch(siteRedirect, /proxy_pass/u);
    assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3103;/u, 'auth API remains proxied');
  } finally {
    cleanup();
  }
});

test('proxy frontend mode remains the default and never serves from disk', () => {
  const { configuration, cleanup } = fixture();
  try {
    assert.equal(configuration.frontendMode, 'proxy');
    const nginx = renderNginx(configuration, 'https');
    assert.ok(!nginx.includes('/srv/nrb/dist/apps/frontend'), 'proxy mode must not reference a dist tree');
    assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4102;/u, 'landing stays proxied');
  } finally {
    cleanup();
  }
});

test('keeps inner frontend directory redirects relative behind the public TLS proxy', () => {
  const { configuration, cleanup } = fixture();
  try {
    const nginx = renderNginx(configuration, 'https');
    const landingServer = tlsServerForHost(nginx, 'product.example');
    assert.match(landingServer, /proxy_redirect ~\^http:\/\/\[\^\/:\]\+:8080\(\/\.\*\)\$ \$1;/u);
    const apiServer = tlsServerForHost(nginx, 'auth-app-api.product.example');
    assert.doesNotMatch(apiServer, /proxy_redirect/u, 'API redirects must not be rewritten as frontend paths');
    const leakedLocation = 'http://product.example:8080/problems/';
    const relativePath = leakedLocation.match(/^http:\/\/[^/:]+:8080(\/.*)$/u)?.[1];
    assert.equal(relativePath, '/problems/');
  } finally {
    cleanup();
  }
});

test('static frontend mode never leaves an SPA route pointing at a process that does not exist', () => {
  const { configuration, cleanup } = fixture({ frontendMode: 'static', profiles: 'telegram' });
  try {
    const nginx = renderStaticNginx(configuration);
    // /auth, /profile and /admin share the `/` handler, so they must be served from
    // disk too — proxying them would reach an SPA process static mode never starts.
    assert.doesNotMatch(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4(100|101|102|104);/u);
    for (const route of ['/auth', '/profile', '/admin']) {
      const block = nginx.slice(nginx.indexOf(`location ${route} {`));
      assert.match(block.slice(0, 220), /try_files \$uri \$uri\/ \/index\.html;/u, `${route} must be served from disk`);
    }
    // The 418 API escape hatches survive the switch to a static handler.
    assert.match(nginx, /error_page 418 = @auth_api;/u);
    assert.match(nginx, /error_page 418 = @user_api;/u);
    assert.match(nginx, /error_page 418 = @admin_api;/u);
    // The Mini App is a user-SPA route; nothing proxies it in static mode.
    assert.doesNotMatch(nginx, /location = \/telegram-mini-app/u);
    assert.doesNotMatch(nginx, /location = \/telegram /u, 'per-app frontends do not alias the bot API');
    const siteRedirect = tlsServerForHost(nginx, 'site-app.product.example');
    assert.match(siteRedirect, /return 308 https:\/\/product\.example\$request_uri;/u);
    assert.doesNotMatch(siteRedirect, /proxy_pass/u, 'the secondary SSR site needs no process');
  } finally {
    cleanup();
  }
});

test('static frontend mode supports the single-domain layout from the primary bundle', () => {
  const { configuration, cleanup } = fixture({ frontendMode: 'static', publicMode: 'single-domain' });
  try {
    const nginx = renderStaticNginx(configuration);
    assert.deepEqual(configuration.publicHosts, ['product.example']);
    assert.ok(nginx.includes('root /srv/nrb/dist/apps/frontend/landing;'), 'the primary bundle is served from disk');
    // Single-domain keeps its extra same-origin auth routes and the API fallbacks.
    assert.match(nginx, /location = \/oauth/u);
    assert.match(nginx, /error_page 418 = @admin_api;/u);
    assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3103;/u, 'same-origin APIs stay proxied');
    assert.doesNotMatch(nginx, /proxy_pass http:\/\/127\.0\.0\.1:410[0-4];/u, 'no SPA process is used');
    // Only the primary bundle is reachable, so no other dist tree is exposed.
    for (const directory of ['app', 'admin', 'mobile']) {
      assert.ok(!nginx.includes(`/srv/nrb/dist/apps/frontend/${directory};`), `${directory} must not be served here`);
    }
  } finally {
    cleanup();
  }
});

test('static landing CSP relaxation requires the built Astro hash policy', () => {
  const { configuration, cleanup } = fixture({ frontendMode: 'static', publicMode: 'single-domain' });
  try {
    assert.throws(
      () => renderNginx(configuration, 'https', { readStaticFile: () => '<html><body></body></html>' }),
      /Astro script-src hash policy/u,
    );
    assert.throws(
      () =>
        renderNginx(configuration, 'https', {
          readStaticFile: () => {
            throw new Error('missing');
          },
        }),
      /missing or unreadable/u,
    );
  } finally {
    cleanup();
  }
});

test('single-domain static keeps an SSR primary proxied instead of serving it from disk', () => {
  const { configuration, cleanup } = fixture({
    frontendMode: 'static',
    publicMode: 'single-domain',
    primaryApp: 'site-app',
  });
  try {
    const nginx = renderNginx(configuration, 'https');
    assert.match(nginx, /location \/ \{\n    proxy_pass http:\/\/127\.0\.0\.1:4103;/u);
    assert.ok(!nginx.includes('/srv/nrb/dist/apps/frontend/'), 'Vike SSR has no static bundle to serve');
  } finally {
    cleanup();
  }
});

test('single-domain static refuses the telegram profile it cannot serve', () => {
  // PRIMARY_APP is landing-app or site-app only, so the single public host can never
  // be the user SPA that owns /telegram-mini-app, and static mode runs no SPA process.
  assert.throws(
    () => fixture({ frontendMode: 'static', publicMode: 'single-domain', profiles: 'telegram' }),
    /per-app-domains/u,
  );
  assert.throws(
    () =>
      fixture({ frontendMode: 'static', publicMode: 'single-domain', primaryApp: 'site-app', profiles: 'telegram' }),
    /per-app-domains/u,
  );
});

const portKeys = (configuration) =>
  expectedListeningPorts(configuration)
    .map(({ key }) => key)
    .sort();

test('expected listening ports cover the Compose topology exactly', () => {
  const { configuration, cleanup } = fixture({ profiles: 'telegram,discord' });
  try {
    // The secondary site host redirects at Nginx, so only the primary landing
    // process and the product frontends join the whole observability stack.
    assert.deepEqual(portKeys(configuration), [
      'ADMIN_APP_API_PORT',
      'ADMIN_APP_PORT',
      'ALERTMANAGER_PORT',
      'AUTH_APP_API_PORT',
      'DISCORD_APP_API_PORT',
      'GRAFANA_PORT',
      'LANDING_APP_PORT',
      'MOBILE_APP_PORT',
      'OTEL_COLLECTOR_GRPC_PORT',
      'OTEL_COLLECTOR_HTTP_PORT',
      'OTEL_PROMETHEUS_PORT',
      'PROMETHEUS_PORT',
      'TELEGRAM_BOT_API_PORT',
      'USER_APP_API_PORT',
      'USER_APP_PORT',
    ]);
    assert.deepEqual(
      expectedListeningPorts(configuration).find(({ key }) => key === 'AUTH_APP_API_PORT'),
      { key: 'AUTH_APP_API_PORT', port: 3103 },
      'ports come from the configured values, not the defaults',
    );
  } finally {
    cleanup();
  }
});

test('the native runtime expects no observability or SPA listeners', () => {
  const { configuration, cleanup } = fixture({ runtimeMode: 'native' });
  try {
    assert.equal(configuration.frontendMode, 'static', 'native defaults to serving SPAs from disk');
    // The primary landing and remaining SPAs are static; the secondary Vike site
    // redirects at Nginx, so only APIs need listeners.
    assert.deepEqual(portKeys(configuration), ['ADMIN_APP_API_PORT', 'AUTH_APP_API_PORT', 'USER_APP_API_PORT']);
  } finally {
    cleanup();
  }
});

test('a single-domain native host expects only the primary listener it renders', () => {
  const { configuration, cleanup } = fixture({ runtimeMode: 'native', publicMode: 'single-domain' });
  try {
    // The landing bundle is served from disk, so nothing but the APIs listens.
    assert.deepEqual(portKeys(configuration), ['ADMIN_APP_API_PORT', 'AUTH_APP_API_PORT', 'USER_APP_API_PORT']);
  } finally {
    cleanup();
  }

  const ssr = fixture({ runtimeMode: 'native', publicMode: 'single-domain', primaryApp: 'site-app' });
  try {
    assert.ok(portKeys(ssr.configuration).includes('SITE_APP_PORT'), 'an SSR primary keeps its process');
  } finally {
    ssr.cleanup();
  }
});

test('the native runtime refuses to proxy SPAs it never starts', () => {
  assert.throws(() => fixture({ runtimeMode: 'native', frontendMode: 'proxy' }), /static/u);
  assert.throws(() => fixture({ runtimeMode: 'kubernetes' }), /RUNTIME_MODE/u);
});

test('accepts every profile the Compose wrapper supports and publishes only the edge ones', () => {
  const { configuration, cleanup } = fixture({ profiles: 'notification-consumer,notification-scheduler' });
  try {
    // serverctl validates notification secrets for these profiles, so rejecting them
    // here made the notification workers impossible to deploy on a single server.
    assert.deepEqual(configuration.enabledProfiles, ['notification-consumer', 'notification-scheduler']);
    const nginx = renderNginx(configuration, 'https');
    assert.doesNotMatch(nginx, /notification/u, 'notification workers have no public surface');
    assert.ok(!portKeys(configuration).includes('TELEGRAM_BOT_API_PORT'));
  } finally {
    cleanup();
  }
});

test('static frontend mode rejects an unsafe dist root', () => {
  assert.throws(() => fixture({ frontendMode: 'static', distRoot: '/srv/a b' }), /whitespace/u);
  assert.throws(() => fixture({ frontendMode: 'static', distRoot: '/srv/../etc' }), /\.\./u);
  assert.throws(() => fixture({ frontendMode: 'static', distRoot: 'relative/path' }), /absolute/u);
});
