// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Module } from '@nestjs/common';
import { S3ConfigService, S3Module, S3Service } from '@app/backend-common-s3';
import {
  MarketplaceDocumentProviderInjectToken,
  MarketplaceContractArtifactStorageProviderInjectToken,
  MarketplaceDirectPaymentProviderInjectToken,
  MarketplaceDisputeEvidenceStorageProviderInjectToken,
  MarketplaceFactoringProviderInjectToken,
  MarketplaceIdentityProviderInjectToken,
  MarketplaceMediaObjectStorageInjectToken,
  MarketplacePromotionBillingProviderInjectToken,
  MarketplaceQualifiedSignatureProviderInjectToken,
} from '@app/backend-feature-agritech-shared';
import { AgriTechOperationsController } from './agritech.controller';
import { AgriTechNotificationPublisher } from './agritech-notification.publisher';
import { AgriTechOperationsService } from './agritech.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplacePublicController } from './marketplace-public.controller';
import { MarketplacePublicProfileController } from './marketplace-public-profile.controller';
import { MarketplacePublicProfileService } from './marketplace-public-profile.service';
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
import { MarketplaceMediaController, MarketplacePublicMediaController } from './marketplace-media.controller';
import { MarketplaceMediaService } from './marketplace-media.service';
import { createMarketplaceMediaObjectStorage } from './marketplace-media.storage';
import {
  createContractArtifactStorageProvider,
  createDirectPaymentProvider,
  createDisputeEvidenceStorageProvider,
  createFactoringProvider,
  createQualifiedSignatureProvider,
} from './marketplace-contract.mock-providers';
import { createPromotionBillingProvider } from './marketplace-promotion.mock-providers';

/**
 * The photograph bucket, resolved from configuration rather than assumed.
 *
 * It is a provider like any other external capability here: the factory decides
 * once whether the deployment has object storage, and the upload route refuses
 * with a typed 503 when it does not. `S3Module.forRoot()` is imported here so
 * this feature carries its own storage wiring instead of depending on an app
 * having wired it — the app's own global registration simply shadows it.
 */
const marketplaceMediaObjectStorage = {
  provide: MarketplaceMediaObjectStorageInjectToken,
  inject: [S3ConfigService, S3Service],
  useFactory: (config: S3ConfigService, storage: S3Service) => createMarketplaceMediaObjectStorage(config, storage),
};

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

const marketplacePromotionBillingProvider = {
  provide: MarketplacePromotionBillingProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createPromotionBillingProvider(config),
};

const marketplaceFactoringProvider = {
  provide: MarketplaceFactoringProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: (config: MarketplaceProviderConfig) => createFactoringProvider(config),
};

@Module({
  imports: [S3Module.forRoot()],
  providers: [
    AgriTechNotificationPublisher,
    AgriTechOperationsService,
    MarketplaceService,
    MarketplacePublicService,
    MarketplacePublicProfileService,
    MarketplacePromotionService,
    MarketplaceVerificationService,
    MarketplaceContractLifecycleService,
    MarketplaceContractNotificationQueryService,
    MarketplaceDashboardAiService,
    MarketplaceEngagementService,
    MarketplaceMediaService,
    marketplaceProviderConfig,
    marketplaceMediaObjectStorage,
    marketplaceIdentityProvider,
    marketplaceDocumentProvider,
    marketplaceContractArtifactStorageProvider,
    marketplaceQualifiedSignatureProvider,
    marketplaceDirectPaymentProvider,
    marketplaceDisputeEvidenceStorageProvider,
    marketplaceFactoringProvider,
    marketplacePromotionBillingProvider,
  ],
  exports: [
    AgriTechOperationsService,
    MarketplaceService,
    MarketplacePublicService,
    MarketplacePublicProfileService,
    MarketplacePromotionService,
    MarketplaceVerificationService,
    MarketplaceContractLifecycleService,
    MarketplaceContractNotificationQueryService,
    MarketplaceDashboardAiService,
    MarketplaceEngagementService,
    MarketplaceMediaService,
  ],
})
export class AgriTechCoreModule {}

@Module({
  imports: [AgriTechCoreModule],
  controllers: [
    AgriTechOperationsController,
    MarketplaceController,
    MarketplacePublicController,
    MarketplacePublicProfileController,
    MarketplacePublicationController,
    MarketplacePromotionController,
    MarketplaceContractLifecycleController,
    MarketplaceContractNotificationController,
    MarketplaceDashboardAiController,
    MarketplaceEngagementController,
    MarketplacePublicEngagementController,
    MarketplaceMediaController,
    MarketplacePublicMediaController,
  ],
  exports: [AgriTechCoreModule],
})
export class AgriTechMainModule {}
