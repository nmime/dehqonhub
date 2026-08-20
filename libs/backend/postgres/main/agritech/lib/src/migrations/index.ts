import type { MigrationsOptions } from '@mikro-orm/core';
import { Migration20260802120000CreateAgriTechMarketplace } from './Migration20260802120000CreateAgriTechMarketplace';
import { Migration20260802160000CompleteAgriTechPlatform } from './Migration20260802160000CompleteAgriTechPlatform';
import { Migration20260809000000CreateMarketplace } from './Migration20260809000000CreateMarketplace';
import { Migration20260809120000SecureMarketplaceContracts } from './Migration20260809120000SecureMarketplaceContracts';
import { Migration20260810123000AddUzbekCyrillicProductNames } from './Migration20260810123000AddUzbekCyrillicProductNames';
import { Migration20260810124500AddMarketplaceVerificationProviders } from './Migration20260810124500AddMarketplaceVerificationProviders';
import { Migration20260810130000AddMarketplacePublications } from './Migration20260810130000AddMarketplacePublications';
import { Migration20260810130500AddMarketplaceCommerceParties } from './Migration20260810130500AddMarketplaceCommerceParties';
import { Migration20260810131000AddMarketplacePromotions } from './Migration20260810131000AddMarketplacePromotions';
import { Migration20260810133000GeneralizeMarketplaceProviderOperations } from './Migration20260810133000GeneralizeMarketplaceProviderOperations';
import { Migration20260810134000AddMarketplaceContractLifecycle } from './Migration20260810134000AddMarketplaceContractLifecycle';
import { Migration20260810135000AddMarketplaceDashboardsAndGroundedAi } from './Migration20260810135000AddMarketplaceDashboardsAndGroundedAi';
import { Migration20260810136000AddContractNotificationDelivery } from './Migration20260810136000AddContractNotificationDelivery';
import { Migration20260810137000AddMarketplaceDisputeEvidence } from './Migration20260810137000AddMarketplaceDisputeEvidence';
import { Migration20260810138000AddMarketplaceEngagement } from './Migration20260810138000AddMarketplaceEngagement';
import { Migration20260810139000HardenMarketplaceCommands } from './Migration20260810139000HardenMarketplaceCommands';
import { Migration20260810140000AlignMarketplaceSellerPartyRole } from './Migration20260810140000AlignMarketplaceSellerPartyRole';
import { Migration20260811110000AlignMarketplaceBuyerPartyRole } from './Migration20260811110000AlignMarketplaceBuyerPartyRole';
import { Migration20260812120000GuardMarketplaceOfferSelection } from './Migration20260812120000GuardMarketplaceOfferSelection';
import { Migration20260812130000RequireMarketplacePromotionBilling } from './Migration20260812130000RequireMarketplacePromotionBilling';
import { Migration20260813120000AddMarketplaceMediaUploads } from './Migration20260813120000AddMarketplaceMediaUploads';

export const agritechMigrations = [
  Migration20260802120000CreateAgriTechMarketplace,
  Migration20260802160000CompleteAgriTechPlatform,
  Migration20260809000000CreateMarketplace,
  Migration20260809120000SecureMarketplaceContracts,
  Migration20260810123000AddUzbekCyrillicProductNames,
  Migration20260810124500AddMarketplaceVerificationProviders,
  Migration20260810130000AddMarketplacePublications,
  Migration20260810130500AddMarketplaceCommerceParties,
  Migration20260810131000AddMarketplacePromotions,
  Migration20260810133000GeneralizeMarketplaceProviderOperations,
  Migration20260810134000AddMarketplaceContractLifecycle,
  Migration20260810135000AddMarketplaceDashboardsAndGroundedAi,
  Migration20260810136000AddContractNotificationDelivery,
  Migration20260810137000AddMarketplaceDisputeEvidence,
  Migration20260810138000AddMarketplaceEngagement,
  Migration20260810139000HardenMarketplaceCommands,
  Migration20260810140000AlignMarketplaceSellerPartyRole,
  Migration20260811110000AlignMarketplaceBuyerPartyRole,
  Migration20260812120000GuardMarketplaceOfferSelection,
  Migration20260812130000RequireMarketplacePromotionBilling,
  Migration20260813120000AddMarketplaceMediaUploads,
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
export * from './Migration20260810123000AddUzbekCyrillicProductNames';
export * from './Migration20260810124500AddMarketplaceVerificationProviders';
export * from './Migration20260810130000AddMarketplacePublications';
export * from './Migration20260810130500AddMarketplaceCommerceParties';
export * from './Migration20260810131000AddMarketplacePromotions';
export * from './Migration20260810133000GeneralizeMarketplaceProviderOperations';
export * from './Migration20260810134000AddMarketplaceContractLifecycle';
export * from './Migration20260810135000AddMarketplaceDashboardsAndGroundedAi';
export * from './Migration20260810136000AddContractNotificationDelivery';
export * from './Migration20260810137000AddMarketplaceDisputeEvidence';
export * from './Migration20260810138000AddMarketplaceEngagement';
export * from './Migration20260810139000HardenMarketplaceCommands';
export * from './Migration20260810140000AlignMarketplaceSellerPartyRole';
export * from './Migration20260811110000AlignMarketplaceBuyerPartyRole';
export * from './Migration20260812120000GuardMarketplaceOfferSelection';
export * from './Migration20260812130000RequireMarketplacePromotionBilling';
export * from './Migration20260813120000AddMarketplaceMediaUploads';
