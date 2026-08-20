// @requirements REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-PUBLIC-018
import { describe, expect, it, vi } from 'vitest';
import { MarketplaceContractLifecycleService } from './marketplace-contract-lifecycle.service';
import { MarketplaceContractLifecycleDomainService } from './marketplace-contract-lifecycle.domain-service';
import { MarketplaceDashboardAiService } from './marketplace-dashboard-ai.service';
import { MarketplaceDashboardAiDomainService } from './marketplace-dashboard-ai.domain-service';
import { MarketplaceEngagementService } from './marketplace-engagement.service';
import { MarketplaceEngagementDomainService } from './marketplace-engagement.domain-service';
import { MarketplacePromotionService } from './marketplace-promotion.service';
import { MarketplacePromotionDomainService } from './marketplace-promotion.domain-service';
import { MarketplacePublicService } from './marketplace-public.service';
import { MarketplacePublicDomainService } from './marketplace-public.domain-service';
import { MarketplaceVerificationService } from './marketplace-verification.service';
import { MarketplaceVerificationDomainService } from './marketplace-verification.domain-service';
import { resolveMarketplaceProviderConfig } from './marketplace-provider.config';

const owner = { tenantId: 'tenant-wiring', userId: 'user-wiring' };
const config = resolveMarketplaceProviderConfig({});

/**
 * These subclasses exist only to attach Nest's `@Inject` metadata to the
 * framework-independent domain services. The risk they carry is a mis-ordered
 * `super(...)` call — a repository landing where a provider belongs, or a
 * capability timeout read from the wrong config entry — which no controller test
 * would notice because every argument is a structurally similar object. So each
 * one is constructed here and asked to forward a call.
 */
describe('Nest-injected marketplace services', () => {
  it('hands the promotion repository, charge ledger, and billing timeout to the domain service', async () => {
    const repository = {
      findPromotion: vi.fn(),
      listPromotions: vi.fn(),
      reservePromotion: vi.fn(),
      settlePromotion: vi.fn(),
    };
    const providerOperations = {
      completeProviderOperation: vi.fn(),
      failProviderOperation: vi.fn(),
      prepareProviderOperation: vi.fn(),
    };
    const billing = { billListingPromotion: vi.fn(), mode: 'disabled', name: 'disabled' };
    const service = new MarketplacePromotionService(
      repository as never,
      providerOperations as never,
      billing as never,
      { ...config, promotionBilling: { mode: 'disabled', providerName: null, timeoutMs: 4_321 } },
    );

    expect(service).toBeInstanceOf(MarketplacePromotionDomainService);
    expect(service).toMatchObject({ billingTimeoutMs: 4_321, billing, providerOperations, repository });
    await service.listPromotions(owner);
    expect(repository.listPromotions).toHaveBeenCalledWith(owner);
  });

  it('hands the engagement repository straight to the domain service', async () => {
    const repository = { listFavorites: vi.fn().mockResolvedValue([]) };
    const service = new MarketplaceEngagementService(repository as never);

    expect(service).toBeInstanceOf(MarketplaceEngagementDomainService);
    await expect(service.listFavorites(owner)).resolves.toEqual([]);
    expect(repository.listFavorites).toHaveBeenCalledWith(owner);
  });

  it('hands the public catalog repository straight to the domain service', async () => {
    const repository = { findPublishedListing: vi.fn().mockResolvedValue(undefined) };
    const service = new MarketplacePublicService(repository as never);

    expect(service).toBeInstanceOf(MarketplacePublicDomainService);
    await expect(service.getListing('listing-public-1')).resolves.toBeUndefined();
    expect(repository.findPublishedListing).toHaveBeenCalledWith('listing-public-1');
  });

  it('hands the dashboard repository straight to the domain service', async () => {
    const repository = { listAiConsultations: vi.fn().mockResolvedValue([]) };
    const service = new MarketplaceDashboardAiService(repository as never);

    expect(service).toBeInstanceOf(MarketplaceDashboardAiDomainService);
    await expect(service.listAiConsultations(owner)).resolves.toEqual([]);
    expect(repository.listAiConsultations).toHaveBeenCalledWith(owner);
  });

  it('reads each verification timeout from its own capability entry and reports readiness', () => {
    const repository = { findVerification: vi.fn() };
    const service = new MarketplaceVerificationService(repository as never, {} as never, {} as never, config);

    expect(service).toBeInstanceOf(MarketplaceVerificationDomainService);
    expect(service.getProviderReadiness()).toMatchObject({
      oneId: { mode: 'disabled', providerName: null, ready: false, simulation: false },
      verificationDocuments: { mode: 'disabled', providerName: null, ready: false },
    });

    const mocked = new MarketplaceVerificationService(
      repository as never,
      {} as never,
      {} as never,
      resolveMarketplaceProviderConfig({
        MARKETPLACE_DOCUMENT_PROVIDER_MODE: 'mock',
        MARKETPLACE_ONEID_PROVIDER_MODE: 'mock',
        NODE_ENV: 'test',
      }),
    );

    expect(mocked.getProviderReadiness()).toMatchObject({
      oneId: { mode: 'mock', providerName: 'mock-oneid', ready: true, simulation: true },
      verificationDocuments: { mode: 'mock', providerName: 'mock-document-storage', ready: true },
    });
  });

  it('keeps the seven contract lifecycle collaborators in their declared order', () => {
    const lifecycleRepository = { findContractLifecycle: vi.fn() };
    const providerOperations = { recordOperation: vi.fn() };
    const artifactStorage = { storeContractArtifact: vi.fn() };
    const qualifiedSignature = { signContract: vi.fn() };
    const directPayment = { registerDirectPayment: vi.fn() };
    const factoring = { requestFactoring: vi.fn() };
    const disputeEvidenceStorage = { storeDisputeEvidence: vi.fn() };

    const service = new MarketplaceContractLifecycleService(
      lifecycleRepository as never,
      providerOperations as never,
      artifactStorage as never,
      qualifiedSignature as never,
      directPayment as never,
      factoring as never,
      disputeEvidenceStorage as never,
      config,
    );

    expect(service).toBeInstanceOf(MarketplaceContractLifecycleDomainService);
  });
});
