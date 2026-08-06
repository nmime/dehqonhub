// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplaceDocumentProviderInjectToken,
  MarketplaceIdentityProviderInjectToken,
  MarketplaceVerificationRepositoryInjectToken,
  type MarketplaceDocumentProvider,
  type MarketplaceIdentityProvider,
  type MarketplaceVerificationRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceVerificationDomainService } from './marketplace-verification.domain-service';
import {
  marketplaceProviderReadiness,
  MarketplaceProviderConfigInjectToken,
  type MarketplaceProviderConfig,
} from './marketplace-provider.config';

export * from './marketplace-verification.domain-service';

@Injectable()
export class MarketplaceVerificationService extends MarketplaceVerificationDomainService {
  constructor(
    @Inject(MarketplaceVerificationRepositoryInjectToken) repository: MarketplaceVerificationRepository,
    @Inject(MarketplaceIdentityProviderInjectToken) identityProvider: MarketplaceIdentityProvider,
    @Inject(MarketplaceDocumentProviderInjectToken) documentProvider: MarketplaceDocumentProvider,
    @Inject(MarketplaceProviderConfigInjectToken) private readonly config: MarketplaceProviderConfig,
  ) {
    super(repository, identityProvider, documentProvider, {
      documentsTimeoutMs: config.verificationDocuments.timeoutMs,
      oneIdTimeoutMs: config.oneId.timeoutMs,
    });
  }

  getProviderReadiness() {
    return marketplaceProviderReadiness(this.config);
  }
}
