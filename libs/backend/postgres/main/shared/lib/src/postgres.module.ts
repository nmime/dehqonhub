import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DynamicModule, Global, Module, type OnModuleInit } from '@nestjs/common';
import {
  assertDurableDatabaseEnvironment,
  DurableDatabaseRuntimeInjectToken,
  type BackendSessionStoreOptions,
  type DurableDatabaseRuntime,
} from '@app/backend-common-bootstrap';
import { createPostgresMikroOrmOptions, type PostgresMikroOrmOverrides } from './data-source-options';
import type { PostgresHealthIndicatorOptions } from './type';
import {
  MikroOrmPostgresHealthAdapter,
  PostgresHealthAdapter,
  PostgresMigrationsHealthIndicator,
  PostgresReadinessHealthIndicator,
  PostgresReadinessHealthOptions,
} from './postgres.health';
import { PostgresSessionStore } from './postgres-session.store';

class PostgresDurableDatabaseRuntime implements DurableDatabaseRuntime, OnModuleInit {
  readonly provider = 'postgres' as const;

  constructor(readiness: PostgresReadinessHealthIndicator, migrations: PostgresMigrationsHealthIndicator) {
    this.healthIndicators = [readiness, migrations];
  }

  readonly healthIndicators: DurableDatabaseRuntime['healthIndicators'];

  onModuleInit(): void {
    assertDurableDatabaseEnvironment(this.provider);
  }

  createSessionStore(options: BackendSessionStoreOptions): PostgresSessionStore {
    const databaseUrl = options.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for PostgreSQL-backed server-side sessions.');
    }
    return new PostgresSessionStore(databaseUrl, options.defaultMaxAgeSeconds, options.sweepIntervalMs);
  }
}

@Global()
@Module({})
export class PostgresMainModule {
  static forRoot(overrides: PostgresMikroOrmOverrides = {}): DynamicModule {
    return {
      module: PostgresMainModule,
      imports: [MikroOrmModule.forRoot(createPostgresMikroOrmOptions(overrides))],
      providers: [
        MikroOrmPostgresHealthAdapter,
        {
          provide: PostgresHealthAdapter,
          useExisting: MikroOrmPostgresHealthAdapter,
        },
        // Importing this module *is* the declaration that PostgreSQL is the
        // selected durable provider, so its readiness is mandatory: an absent
        // adapter or an unreachable database has to surface as an error rather
        // than as an optional "skipped" pass.
        {
          provide: PostgresReadinessHealthOptions,
          useValue: { mandatory: true } satisfies PostgresHealthIndicatorOptions,
        },
        PostgresReadinessHealthIndicator,
        PostgresMigrationsHealthIndicator,
        {
          provide: PostgresDurableDatabaseRuntime,
          inject: [PostgresReadinessHealthIndicator, PostgresMigrationsHealthIndicator],
          useFactory: (readiness: PostgresReadinessHealthIndicator, migrations: PostgresMigrationsHealthIndicator) =>
            new PostgresDurableDatabaseRuntime(readiness, migrations),
        },
        { provide: DurableDatabaseRuntimeInjectToken, useExisting: PostgresDurableDatabaseRuntime },
      ],
      exports: [
        PostgresHealthAdapter,
        PostgresReadinessHealthIndicator,
        PostgresMigrationsHealthIndicator,
        DurableDatabaseRuntimeInjectToken,
      ],
    };
  }
}
