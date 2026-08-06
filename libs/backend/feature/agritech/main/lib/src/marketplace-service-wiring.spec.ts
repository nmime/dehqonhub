// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { describe, expect, it, vi } from 'vitest';
import type {
  MarketplaceContractArtifactStorageProvider,
  MarketplaceContractLifecycleRepository,
  MarketplaceDashboardAiRepository,
  MarketplaceDirectPaymentProvider,
  MarketplaceDisputeEvidenceStorageProvider,
  MarketplaceEngagementRepository,
  MarketplaceFactoringProvider,
  MarketplaceProviderOperationRepository,
  MarketplacePublicRepository,
  MarketplaceQualifiedSignatureProvider,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceContractLifecycleService } from './marketplace-contract-lifecycle.service';
import { MarketplaceDashboardAiService } from './marketplace-dashboard-ai.service';
import { MarketplaceEngagementService } from './marketplace-engagement.service';
import { MarketplacePromotionService } from './marketplace-promotion.service';
import { MarketplacePublicService } from './marketplace-public.service';
import type { MarketplacePromotionRepository } from '@app/backend-feature-agritech-shared';

describe('marketplace Nest service wiring', () => {
  it('constructs each thin runtime subclass with its repository and timeout dependencies', () => {
    const repository = {};
    expect(new MarketplaceDashboardAiService(repository as MarketplaceDashboardAiRepository)).toBeInstanceOf(
      MarketplaceDashboardAiService,
    );
    expect(new MarketplaceEngagementService(repository as MarketplaceEngagementRepository)).toBeInstanceOf(
      MarketplaceEngagementService,
    );
    expect(new MarketplacePromotionService(repository as MarketplacePromotionRepository)).toBeInstanceOf(
      MarketplacePromotionService,
    );
    expect(new MarketplacePublicService(repository as MarketplacePublicRepository)).toBeInstanceOf(
      MarketplacePublicService,
    );
    const provider = { mode: 'mock', name: 'mock' };
    const service = new MarketplaceContractLifecycleService(
      repository as MarketplaceContractLifecycleRepository,
      repository as MarketplaceProviderOperationRepository,
      provider as MarketplaceContractArtifactStorageProvider,
      provider as MarketplaceQualifiedSignatureProvider,
      provider as MarketplaceDirectPaymentProvider,
      provider as MarketplaceFactoringProvider,
      provider as MarketplaceDisputeEvidenceStorageProvider,
      {
        contractArtifactStorage: { mode: 'mock', providerName: 'mock', timeoutMs: 1 },
        directPayment: { mode: 'mock', providerName: 'mock', timeoutMs: 2 },
        disputeEvidenceStorage: { mode: 'mock', providerName: 'mock', timeoutMs: 3 },
        factoring: { mode: 'mock', providerName: 'mock', timeoutMs: 4 },
        notificationDelivery: { mode: 'disabled', providerName: null, timeoutMs: 5 },
        oneId: { mode: 'disabled', providerName: null, timeoutMs: 6 },
        promotionBilling: { mode: 'disabled', providerName: null, timeoutMs: 7 },
        qualifiedSignature: { mode: 'mock', providerName: 'mock', timeoutMs: 8 },
        verificationDocuments: { mode: 'disabled', providerName: null, timeoutMs: 9 },
      },
    );
    expect(service).toBeInstanceOf(MarketplaceContractLifecycleService);
    expect(vi.isMockFunction(repository)).toBe(false);
  });
});
