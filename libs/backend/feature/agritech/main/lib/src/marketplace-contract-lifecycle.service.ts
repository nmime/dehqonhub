// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplaceContractArtifactStorageProviderInjectToken,
  MarketplaceContractLifecycleRepositoryInjectToken,
  MarketplaceDirectPaymentProviderInjectToken,
  MarketplaceDisputeEvidenceStorageProviderInjectToken,
  MarketplaceFactoringProviderInjectToken,
  MarketplaceProviderOperationRepositoryInjectToken,
  MarketplaceQualifiedSignatureProviderInjectToken,
  type MarketplaceContractArtifactStorageProvider,
  type MarketplaceContractLifecycleRepository,
  type MarketplaceDirectPaymentProvider,
  type MarketplaceDisputeEvidenceStorageProvider,
  type MarketplaceFactoringProvider,
  type MarketplaceProviderOperationRepository,
  type MarketplaceQualifiedSignatureProvider,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceContractLifecycleDomainService } from './marketplace-contract-lifecycle.domain-service';
import { MarketplaceProviderConfigInjectToken, type MarketplaceProviderConfig } from './marketplace-provider.config';

@Injectable()
export class MarketplaceContractLifecycleService extends MarketplaceContractLifecycleDomainService {
  constructor(
    @Inject(MarketplaceContractLifecycleRepositoryInjectToken)
    lifecycleRepository: MarketplaceContractLifecycleRepository,
    @Inject(MarketplaceProviderOperationRepositoryInjectToken)
    providerOperations: MarketplaceProviderOperationRepository,
    @Inject(MarketplaceContractArtifactStorageProviderInjectToken)
    artifactStorage: MarketplaceContractArtifactStorageProvider,
    @Inject(MarketplaceQualifiedSignatureProviderInjectToken)
    qualifiedSignature: MarketplaceQualifiedSignatureProvider,
    @Inject(MarketplaceDirectPaymentProviderInjectToken)
    directPayment: MarketplaceDirectPaymentProvider,
    @Inject(MarketplaceFactoringProviderInjectToken)
    factoring: MarketplaceFactoringProvider,
    @Inject(MarketplaceDisputeEvidenceStorageProviderInjectToken)
    disputeEvidenceStorage: MarketplaceDisputeEvidenceStorageProvider,
    @Inject(MarketplaceProviderConfigInjectToken) config: MarketplaceProviderConfig,
  ) {
    super(
      lifecycleRepository,
      providerOperations,
      artifactStorage,
      qualifiedSignature,
      directPayment,
      factoring,
      disputeEvidenceStorage,
      {
        artifactStorageTimeoutMs: config.contractArtifactStorage.timeoutMs,
        directPaymentTimeoutMs: config.directPayment.timeoutMs,
        disputeEvidenceStorageTimeoutMs: config.disputeEvidenceStorage.timeoutMs,
        factoringTimeoutMs: config.factoring.timeoutMs,
        qualifiedSignatureTimeoutMs: config.qualifiedSignature.timeoutMs,
      },
    );
  }
}
