import type { MigrationsOptions } from '@mikro-orm/core';
import { Migration20260802120000CreateAgriTechMarketplace } from './Migration20260802120000CreateAgriTechMarketplace';

export const agritechMigrations = [Migration20260802120000CreateAgriTechMarketplace] as const;
export const agritechMigrationOptions: MigrationsOptions = {
  tableName: 'mikro_orm_migrations',
  transactional: true,
  allOrNothing: true,
  silent: true,
  snapshot: false,
  migrationsList: [...agritechMigrations],
};

export * from './Migration20260802120000CreateAgriTechMarketplace';
