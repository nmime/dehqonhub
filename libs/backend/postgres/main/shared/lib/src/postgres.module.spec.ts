// @requirements REQ-RUNTIME-DATABASE-008 REQ-RUNTIME-HEALTH-001
import { MikroORM } from '@mikro-orm/core';
import { Test } from '@nestjs/testing';
import type { Provider } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresMainModule } from './postgres.module';
import { PostgresReadinessHealthIndicator } from './postgres.health';
import { PostgresSessionStore } from './postgres-session.store';

interface DurableRuntimeForTest {
  readonly healthIndicators: readonly unknown[];
  readonly provider: 'postgres';
  createSessionStore(options: {
    defaultMaxAgeSeconds: number;
    env: NodeJS.ProcessEnv;
    sweepIntervalMs: number;
  }): PostgresSessionStore;
  onModuleInit(): void;
}

function durableRuntimeFactory(): (readiness: unknown, migrations: unknown) => DurableRuntimeForTest {
  const providers = PostgresMainModule.forRoot().providers;
  const provider = providers?.find(
    (candidate) =>
      typeof candidate !== 'function' &&
      'provide' in candidate &&
      typeof candidate.provide === 'function' &&
      candidate.provide.name === 'PostgresDurableDatabaseRuntime',
  );
  if (provider === undefined || typeof provider === 'function' || !('useFactory' in provider)) {
    throw new Error('Expected the PostgreSQL durable database runtime provider.');
  }
  return provider.useFactory as (readiness: unknown, migrations: unknown) => DurableRuntimeForTest;
}

/**
 * Compiles the module's own providers through the Nest container, which is the
 * only place the reflected injection metadata of the health adapter is
 * exercised: constructing the adapter by hand cannot prove that a wired app
 * really receives an ORM to query.
 */
async function resolveReadinessIndicator(orm?: unknown): Promise<PostgresReadinessHealthIndicator> {
  const providers = (PostgresMainModule.forRoot().providers ?? []) as Provider[];
  const moduleRef = await Test.createTestingModule({
    providers: [...(orm === undefined ? [] : [{ provide: MikroORM, useValue: orm }]), ...providers],
  }).compile();
  const indicator = moduleRef.get(PostgresReadinessHealthIndicator);
  await moduleRef.close();
  return indicator;
}

describe('PostgresMainModule dependency health wiring', () => {
  it('resolves a readiness indicator that queries the container-provided ORM', async () => {
    const execute = vi.fn(() => Promise.resolve([{ '?column?': 1 }]));
    const indicator = await resolveReadinessIndicator({ em: { getConnection: () => ({ execute }) } });

    await expect(indicator.check()).resolves.toEqual({
      name: 'postgres',
      status: 'ok',
      details: { skipped: false },
    });
    expect(execute).toHaveBeenCalledWith('select 1');
  });

  it('reports an unreachable database as an error instead of throwing', async () => {
    const execute = vi.fn(() => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432')));
    const indicator = await resolveReadinessIndicator({ em: { getConnection: () => ({ execute }) } });

    await expect(indicator.check()).resolves.toEqual({
      name: 'postgres',
      status: 'error',
      details: { message: 'connect ECONNREFUSED 127.0.0.1:5432', type: 'Error' },
    });
    expect(execute).toHaveBeenCalledWith('select 1');
  });

  it('fails readiness when the selected provider exposes no ORM to query', async () => {
    const indicator = await resolveReadinessIndicator();

    await expect(indicator.check()).resolves.toMatchObject({
      name: 'postgres',
      status: 'error',
      details: { skipped: false, reason: 'not_configured' },
    });
  });
});

describe('PostgresMainModule', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it('creates a dynamic MikroORM root module', async () => {
    const dynamicModule = PostgresMainModule.forRoot({
      dbName: 'module_test',
    });

    expect(dynamicModule.module).toBe(PostgresMainModule);
    expect(dynamicModule.imports).toHaveLength(1);
    await expect(dynamicModule.imports?.[0]).resolves.toMatchObject({
      module: expect.any(Function) as unknown,
    });
  });

  it('exposes the selected provider and its health indicators through the durable runtime', () => {
    process.env = {
      ...originalEnvironment,
      AUTH_PERSISTENCE: 'postgres',
      DATABASE_ENGINE: 'postgres',
      NODE_ENV: 'test',
    };
    const readiness = { name: 'readiness' };
    const migrations = { name: 'migrations' };
    const runtime = durableRuntimeFactory()(readiness, migrations);

    expect(runtime.provider).toBe('postgres');
    expect(runtime.healthIndicators).toEqual([readiness, migrations]);
    expect(() => {
      runtime.onModuleInit();
    }).not.toThrow();
  });

  it('requires a database URL when creating a PostgreSQL session store', async () => {
    const runtime = durableRuntimeFactory()({}, {});
    const options = { defaultMaxAgeSeconds: 3600, env: {}, sweepIntervalMs: 60_000 };

    expect(() => runtime.createSessionStore(options)).toThrow(
      'DATABASE_URL is required for PostgreSQL-backed server-side sessions.',
    );

    const store = runtime.createSessionStore({
      ...options,
      env: { DATABASE_URL: '  postgres://database/app  ' },
    });
    expect(store).toBeInstanceOf(PostgresSessionStore);
    await store.close();
  });
});
