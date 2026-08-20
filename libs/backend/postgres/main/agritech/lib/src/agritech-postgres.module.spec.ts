// @requirements REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-ADMIN-025
import { describe, expect, it } from 'vitest';
import { EntitySchema } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import * as agritechEntities from './entities';
import { AgriTechPostgresModule } from './agritech-postgres.module';

/**
 * Every entity schema this library exports must be registered with the runtime
 * module. An unregistered schema still type-checks and still passes component
 * tests — those build their own ORM from an explicit schema list — and then
 * fails in production with MikroORM's `Metadata for entity ... not found`,
 * which surfaces as an untyped 500 on whichever route touches it first.
 */
describe('AgriTechPostgresModule', () => {
  it('registers every exported entity schema with the runtime ORM feature list', () => {
    const imports = (Reflect.getMetadata('imports', AgriTechPostgresModule) ?? []) as {
      providers?: { provide?: unknown }[];
    }[];
    const registeredTokens = new Set(
      imports.flatMap((entry) => (entry.providers ?? []).map((provider) => provider.provide)),
    );
    const exported = Object.entries(agritechEntities).filter(
      (entry): entry is [string, EntitySchema] => entry[1] instanceof EntitySchema,
    );

    expect(exported.length).toBeGreaterThan(0);
    const missing = exported
      .filter(([, schema]) => !registeredTokens.has(getRepositoryToken(schema)))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });
});
