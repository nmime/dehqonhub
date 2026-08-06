// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Module } from '@nestjs/common';
import {
  MarketplaceDocumentProviderInjectToken,
  MarketplaceContractArtifactStorageProviderInjectToken,
  MarketplaceDirectPaymentProviderInjectToken,
  MarketplaceDisputeEvidenceStorageProviderInjectToken,
  MarketplaceFactoringProviderInjectToken,
  MarketplaceIdentityProviderInjectToken,
  MarketplaceQualifiedSignatureProviderInjectToken,
} from '@app/backend-feature-agritech-shared';
import { AgriTechOperationsController } from './agritech.controller';
import { AgriTechNotificationPublisher } from './agritech-notification.publisher';
import { AgriTechOperationsService } from './agritech.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplacePublicController } from './marketplace-public.controller';
import { MarketplacePublicationController } from './marketplace-publication.controller';
import { MarketplacePromotionController } from './marketplace-promotion.controller';
import { MarketplacePublicService } from './marketplace-public.service';
import { MarketplacePromotionService } from './marketplace-promotion.service';
import { MarketplaceService } from './marketplace.service';
import {
  MarketplaceProviderConfigInjectToken,
  resolveMarketplaceProviderConfig,
  type MarketplaceProviderConfig,
} from './marketplace-provider.config';
import { createMarketplaceDocumentProvider, createMarketplaceIdentityProvider } from './marketplace.mock-providers';
import { MarketplaceVerificationService } from './marketplace-verification.service';
import { MarketplaceContractLifecycleController } from './marketplace-contract-lifecycle.controller';
import { MarketplaceContractLifecycleService } from './marketplace-contract-lifecycle.service';
import { MarketplaceContractNotificationController } from './marketplace-contract-notification.controller';
import { MarketplaceContractNotificationQueryService } from './marketplace-contract-notification.service';
import { MarketplaceDashboardAiController } from './marketplace-dashboard-ai.controller';
import { MarketplaceDashboardAiService } from './marketplace-dashboard-ai.service';
import {
  MarketplaceEngagementController,
  MarketplacePublicEngagementController,
} from './marketplace-engagement.controller';
import { MarketplaceEngagementService } from './marketplace-engagement.service';
import {
  createContractArtifactStorageProvider,
  createDirectPaymentProvider,
  createDisputeEvidenceStorageProvider,
  createFactoringProvider,
  createQualifiedSignatureProvider,
} from './marketplace-contract.mock-providers';

const marketplaceProviderConfig = {
  provide: MarketplaceProviderConfigInjectToken,
  useFactory: resolveMarketplaceProviderConfig,
};

const marketplaceIdentityProvider = {
  provide: MarketplaceIdentityProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createMarketplaceIdentityProvider(config),
};

const marketplaceDocumentProvider = {
  provide: MarketplaceDocumentProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createMarketplaceDocumentProvider(config),
};

const marketplaceContractArtifactStorageProvider = {
  provide: MarketplaceContractArtifactStorageProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createContractArtifactStorageProvider(config),
};

const marketplaceQualifiedSignatureProvider = {
  provide: MarketplaceQualifiedSignatureProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createQualifiedSignatureProvider(config),
};

const marketplaceDirectPaymentProvider = {
  provide: MarketplaceDirectPaymentProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createDirectPaymentProvider(config),
};

const marketplaceDisputeEvidenceStorageProvider = {
  provide: MarketplaceDisputeEvidenceStorageProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createDisputeEvidenceStorageProvider(config),
};

const marketplaceFactoringProvider = {
  provide: MarketplaceFactoringProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createFactoringProvider(config),
};

@Module({
  providers: [
    AgriTechNotificationPublisher,
    AgriTechOperationsService,
    MarketplaceService,
    MarketplacePublicService,
    MarketplacePromotionService,
    MarketplaceVerificationService,
    MarketplaceContractLifecycleService,
    MarketplaceContractNotificationQueryService,
    MarketplaceDashboardAiService,
    MarketplaceEngagementService,
    marketplaceProviderConfig,
    marketplaceIdentityProvider,
    marketplaceDocumentProvider,
    marketplaceContractArtifactStorageProvider,
    marketplaceQualifiedSignatureProvider,
    marketplaceDirectPaymentProvider,
    marketplaceDisputeEvidenceStorageProvider,
    marketplaceFactoringProvider,
  ],
  exports: [
    AgriTechOperationsService,
    MarketplaceService,
    MarketplacePublicService,
    MarketplacePromotionService,
    MarketplaceVerificationService,
    MarketplaceContractLifecycleService,
    MarketplaceContractNotificationQueryService,
    MarketplaceDashboardAiService,
    MarketplaceEngagementService,
  ],
})
export class AgriTechCoreModule {}

@Module({
  imports: [AgriTechCoreModule],
  controllers: [
    AgriTechOperationsController,
    MarketplaceController,
    MarketplacePublicController,
    MarketplacePublicationController,
    MarketplacePromotionController,
    MarketplaceContractLifecycleController,
    MarketplaceContractNotificationController,
    MarketplaceDashboardAiController,
    MarketplaceEngagementController,
    MarketplacePublicEngagementController,
  ],
  exports: [AgriTechCoreModule],
})
export class AgriTechMainModule {}
