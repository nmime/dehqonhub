import type { MigrationsOptions } from '@mikro-orm/core';
import { Migration20260802120000CreateAgriTechMarketplace } from './Migration20260802120000CreateAgriTechMarketplace';
import { Migration20260802160000CompleteAgriTechPlatform } from './Migration20260802160000CompleteAgriTechPlatform';
import { Migration20260809000000CreateMarketplace } from './Migration20260809000000CreateMarketplace';
import { Migration20260809120000SecureMarketplaceContracts } from './Migration20260809120000SecureMarketplaceContracts';

export const agritechMigrations = [
  Migration20260802120000CreateAgriTechMarketplace,
  Migration20260802160000CompleteAgriTechPlatform,
  Migration20260809000000CreateMarketplace,
  Migration20260809120000SecureMarketplaceContracts,
] as const;
export const agritechMigrationOptions: MigrationsOptions = {
  tableName: 'mikro_orm_migrations',
  transactional: true,
  allOrNothing: true,
  silent: true,
  snapshot: false,
  migrationsList: [...agritechMigrations],
};

export * from './Migration20260802120000CreateAgriTechMarketplace';
export * from './Migration20260802160000CompleteAgriTechPlatform';
export * from './Migration20260809000000CreateMarketplace';
export * from './Migration20260809120000SecureMarketplaceContracts';
