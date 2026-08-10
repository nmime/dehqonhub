// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@app/backend-common-exception';
import type { MarketplaceRepository } from '@app/backend-feature-agritech-shared';
import { MarketplaceService } from './marketplace.service';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const now = new Date('2026-08-09T00:00:00Z');
const ok = <T>(value: T) => ({ status: 'ok' as const, value });
function fixture() {
  const repository = {
    getVerification: vi.fn(),
    reviewVerification: vi.fn(),
    listVerifications: vi.fn(),
    isApprovedOrganization: vi.fn().mockResolvedValue(true),
    getCart: vi.fn(),
    listCarts: vi.fn(),
    addToCart: vi.fn(),
    updateCartItem: vi.fn(),
    removeCartItem: vi.fn(),
    checkoutCart: vi.fn(),
    requestSample: vi.fn(),
    listSamples: vi.fn(),
    sampleUsageThisMonth: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    listFavorites: vi.fn(),
    addReview: vi.fn(),
    listProductReviews: vi.fn(),
    createRequest: vi.fn(),
    listRequests: vi.fn(),
    listMyRequests: vi.fn(),
    makeOffer: vi.fn(),
    listOffers: vi.fn(),
    chooseOffer: vi.fn(),
    updateContractDeliveryQuote: vi.fn(),
    signContract: vi.fn(),
    listContracts: vi.fn(),
    listTenantContracts: vi.fn(),
    askAi: vi.fn(),
    listAiConsultations: vi.fn(),
    roleOf: vi.fn(),
  };
  const service = new MarketplaceService(repository as unknown as MarketplaceRepository);
  return { repository, service };
}

describe('MarketplaceService', () => {
  it('represents a missing verification submission as explicit null', async () => {
    const { repository, service } = fixture();
    repository.getVerification.mockResolvedValue(undefined);
    await expect(service.getVerification(owner)).resolves.toBeNull();
  });

  it('maps a stale verification review to a canonical conflict', async () => {
    const { repository, service } = fixture();
    repository.reviewVerification.mockResolvedValue({ status: 'conflict', field: 'status' });

    await expect(
      service.reviewVerification(owner.tenantId, 'verification-1', 'verified', 'reviewer-1'),
    ).rejects.toThrow(ConflictException);
  });

  it.each([
    ['rejected', undefined],
    ['verified', 'criteria_not_met'],
  ] as const)('rejects invalid verification reason provenance for %s', async (decision, reason) => {
    const { repository, service } = fixture();

    await expect(
      service.reviewVerification(owner.tenantId, 'verification-1', decision, 'reviewer-1', reason),
    ).rejects.toThrow(BadRequestException);
    expect(repository.reviewVerification).not.toHaveBeenCalled();
  });

  it('blocks sample requests when the user is not verified', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue(undefined);
    await expect(service.requestSample(owner, 'p-1')).rejects.toThrow(ForbiddenException);
    expect(repository.requestSample).not.toHaveBeenCalled();
  });

  it('blocks sample requests over the monthly limit', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('farmer');
    repository.requestSample.mockResolvedValue({ status: 'invalid_state', field: 'samples' });
    await expect(service.requestSample(owner, 'p-1')).rejects.toThrow(BadRequestException);
  });

  it('allows a sample request within the limit for a verified user', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('farmer');
    repository.requestSample.mockResolvedValue(
      ok({
        id: 's-1',
        tenantId: owner.tenantId,
        userId: owner.userId,
        productId: 'p-1',
        sellerId: 's-1',
        status: 'pending',
        createdAt: now,
      }),
    );
    const result = await service.requestSample(owner, 'p-1');
    expect(result.id).toBe('s-1');
    expect(repository.requestSample).toHaveBeenCalledWith(owner, 'p-1');
  });

  it('returns sample usage summary', async () => {
    const { repository, service } = fixture();
    repository.sampleUsageThisMonth.mockResolvedValue(2);
    const usage = await service.sampleUsage(owner);
    expect(usage).toEqual({ used: 2, limit: 5, remaining: 3 });
  });

  it.each([
    ['add', (service: MarketplaceService) => service.addToCart(owner, { productId: 'p-1', quantity: 1 })],
    ['update', (service: MarketplaceService) => service.updateCartItem(owner, 'c-1', 'p-1', 2)],
    ['remove', (service: MarketplaceService) => service.removeCartItem(owner, 'c-1', 'p-1')],
  ])('blocks an unverified buyer before the %s cart mutation reaches persistence', async (_action, mutate) => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue(undefined);

    await expect(mutate(service)).rejects.toThrow(ForbiddenException);
    expect(repository.isApprovedOrganization).not.toHaveBeenCalled();
    expect(repository.addToCart).not.toHaveBeenCalled();
    expect(repository.updateCartItem).not.toHaveBeenCalled();
    expect(repository.removeCartItem).not.toHaveBeenCalled();
  });

  it('adds a cart item only for a verified buyer in an approved organization', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.addToCart.mockResolvedValue(
      ok({
        id: 'c-1',
        tenantId: owner.tenantId,
        userId: owner.userId,
        sellerId: 'seller-1',
        items: [{ productId: 'p-1', quantity: 1 }],
        status: 'open',
        createdAt: now,
        updatedAt: now,
      }),
    );

    await expect(service.addToCart(owner, { productId: 'p-1', quantity: 1 })).resolves.toMatchObject({
      id: 'c-1',
    });
    expect(repository.isApprovedOrganization).toHaveBeenCalledWith(owner, 'buyer');
    expect(repository.addToCart).toHaveBeenCalledWith(owner, { productId: 'p-1', quantity: 1 });
  });

  it('requires verification before checkout', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue(undefined);
    await expect(service.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' })).rejects.toThrow(ForbiddenException);
  });

  it('rejects checkout for a verified seller-only role', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('seller');
    await expect(service.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' })).rejects.toThrow(ForbiddenException);
    expect(repository.checkoutCart).not.toHaveBeenCalled();
  });

  it('checks out only for a verified buyer role and returns a persisted contract reference', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.checkoutCart.mockResolvedValue(ok({ cartId: 'c-1', contractId: 'contract-1' }));

    await expect(service.checkoutCart(owner, 'c-1', { deliveryTerms: 'seller_delivery' })).resolves.toEqual({
      cartId: 'c-1',
      contractId: 'contract-1',
    });
    expect(repository.checkoutCart).toHaveBeenCalledWith(owner, 'c-1', {
      deliveryTerms: 'seller_delivery',
    });
  });

  it('accepts reviews only from a verified marketplace buyer with repository purchase evidence', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.addReview.mockResolvedValue(
      ok({
        comment: 'Good quality',
        createdAt: new Date('2026-08-09T00:00:00.000Z'),
        id: 'review-1',
        productId: 'product-1',
        rating: 5,
        tenantId: owner.tenantId,
        userId: owner.userId,
      }),
    );

    await expect(service.addReview(owner, 'product-1', 5, 'Good quality')).resolves.toMatchObject({
      id: 'review-1',
    });
    expect(repository.addReview).toHaveBeenCalledWith(owner, 'product-1', 5, 'Good quality');
  });

  it('rejects a review from an unverified account before repository access', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue(undefined);

    await expect(service.addReview(owner, 'product-1', 5)).rejects.toThrow(ForbiddenException);
    expect(repository.addReview).not.toHaveBeenCalled();
  });

  it('requires verification before creating a request', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue(undefined);
    await expect(service.createRequest(owner, { title: 'Corn', region: 'Samarkand' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies a verified buyer without an approved buyer organization', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.isApprovedOrganization.mockResolvedValue(false);

    await expect(service.createRequest(owner, { title: 'Corn', region: 'Samarkand' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('allows offers only from verified seller or farmer roles', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    await expect(service.makeOffer(owner, 'request-1', 5_000_000, 'pickup')).rejects.toThrow(ForbiddenException);
    expect(repository.makeOffer).not.toHaveBeenCalled();

    repository.roleOf.mockResolvedValue('seller');
    repository.makeOffer.mockResolvedValue(ok({ id: 'offer-1' }));
    await expect(service.makeOffer(owner, 'request-1', 5_000_000, 'pickup')).resolves.toMatchObject({ id: 'offer-1' });
  });

  it('returns the persisted contract reference from owner offer selection', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.chooseOffer.mockResolvedValue(
      ok({ requestId: 'request-1', offerId: 'offer-1', sellerUserId: 'seller-1', contractId: 'contract-1' }),
    );

    await expect(service.chooseOffer(owner, 'request-1', 'offer-1')).resolves.toMatchObject({
      contractId: 'contract-1',
    });
  });

  it('maps an already-decided offer selection to a canonical conflict', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.chooseOffer.mockResolvedValue({ status: 'conflict', field: 'status' });

    await expect(service.chooseOffer(owner, 'request-1', 'offer-1')).rejects.toThrow(ConflictException);
  });

  it('allows only a verified seller role to quote seller delivery', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    await expect(
      service.updateContractDeliveryQuote(owner, 'contract-1', { deliveryPriceUzs: 250_000 }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.updateContractDeliveryQuote).not.toHaveBeenCalled();

    repository.roleOf.mockResolvedValue('seller');
    repository.updateContractDeliveryQuote.mockResolvedValue(
      ok({ id: 'contract-1', deliveryTerms: 'seller_delivery', deliveryPriceUzs: 250_000 }),
    );
    await expect(
      service.updateContractDeliveryQuote(owner, 'contract-1', { deliveryPriceUzs: 250_000 }),
    ).resolves.toMatchObject({ deliveryPriceUzs: 250_000 });
  });

  it('requires verified marketplace identity before signing', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue(undefined);
    await expect(service.signContract(owner, 'c-1')).rejects.toThrow(ForbiddenException);
    expect(repository.signContract).not.toHaveBeenCalled();
  });

  it('signs a contract via the repository for a verified party', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('farmer');
    repository.signContract.mockResolvedValue(ok({ id: 'c-1', status: 'signed' }));
    const result = await service.signContract(owner, 'c-1');
    expect(result.status).toBe('signed');
  });
});
