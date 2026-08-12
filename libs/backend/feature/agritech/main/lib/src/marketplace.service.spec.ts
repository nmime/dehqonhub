// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  DemoBuyerRequests,
  demoProductReviews,
  type MarketplaceRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceService } from './marketplace.service';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
/** The demo listing the demo ratings are attached to. */
const reviewedDemoProductId = demoProductReviews('dec0de00-0000-4000-8000-000000000001')[0]!.productId;
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

  it('answers a tenant with no buyer requests from the demo feed', async () => {
    const { repository, service } = fixture();
    repository.listRequests.mockResolvedValue([]);

    await expect(service.listRequests(owner.tenantId)).resolves.toEqual([...DemoBuyerRequests]);
  });

  it('filters the demo feed by status the way the repository would', async () => {
    const { repository, service } = fixture();
    repository.listRequests.mockResolvedValue([]);

    const offering = await service.listRequests(owner.tenantId, 'offering');

    expect(offering.length).toBeGreaterThan(0);
    expect(offering.every((request) => request.status === 'offering')).toBe(true);
  });

  it('leaves a tenant that has its own requests untouched', async () => {
    const { repository, service } = fixture();
    const own = [{ id: 'request-1', status: 'open' }];
    repository.listRequests.mockResolvedValue(own);

    await expect(service.listRequests(owner.tenantId, 'open')).resolves.toBe(own);
  });

  // A status filter matching none of a tenant's own requests is a real empty
  // feed, not a new tenant, so the demo rows must stay out of it.
  it('keeps a filtered empty feed empty when the tenant does have requests', async () => {
    const { repository, service } = fixture();
    repository.listRequests.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'request-1', status: 'open' }]);

    await expect(service.listRequests(owner.tenantId, 'closed')).resolves.toEqual([]);
  });

  it('shows demo ratings for a product nobody has reviewed yet', async () => {
    const { repository, service } = fixture();
    repository.listProductReviews.mockResolvedValue([]);

    const reviews = await service.listProductReviews(owner.tenantId, reviewedDemoProductId);

    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((review) => review.productId === reviewedDemoProductId)).toBe(true);
  });

  it('keeps real ratings alone once a product has any', async () => {
    const { repository, service } = fixture();
    const own = [{ id: 'review-1', productId: reviewedDemoProductId, rating: 3 }];
    repository.listProductReviews.mockResolvedValue(own);

    await expect(service.listProductReviews(owner.tenantId, reviewedDemoProductId)).resolves.toBe(own);
  });

  it('passes every read straight through to the repository', async () => {
    const { repository, service } = fixture();
    const verifications = [{ id: 'verification-1' }];
    const carts = [{ id: 'cart-1' }];
    const samples = [{ id: 'sample-1' }];
    const favorites = [{ productId: 'product-1' }];
    const contracts = [{ id: 'contract-1' }];
    const consultations = [{ id: 'consultation-1' }];
    repository.listVerifications.mockResolvedValue(verifications);
    repository.listCarts.mockResolvedValue(carts);
    repository.listSamples.mockResolvedValue(samples);
    repository.listFavorites.mockResolvedValue(favorites);
    repository.listTenantContracts.mockResolvedValue(contracts);
    repository.listAiConsultations.mockResolvedValue(consultations);

    await expect(service.listVerifications(owner.tenantId)).resolves.toBe(verifications);
    await expect(service.listCarts(owner)).resolves.toBe(carts);
    await expect(service.listSamples(owner)).resolves.toBe(samples);
    await expect(service.listFavorites(owner)).resolves.toBe(favorites);
    await expect(service.listTenantContracts(owner.tenantId)).resolves.toBe(contracts);
    await expect(service.listAiConsultations(owner)).resolves.toBe(consultations);
    expect(repository.listVerifications).toHaveBeenCalledWith(owner.tenantId);
    expect(repository.listTenantContracts).toHaveBeenCalledWith(owner.tenantId);
  });

  it('reads one basket and reports a basket that is not there', async () => {
    const { repository, service } = fixture();
    const cart = { id: 'cart-1' };
    repository.getCart.mockResolvedValueOnce(cart).mockResolvedValueOnce(undefined);

    await expect(service.getCart(owner, 'cart-1')).resolves.toBe(cart);
    await expect(service.getCart(owner, 'cart-404')).rejects.toThrow(ResourceNotFoundException);
  });

  it('refuses a basket line that asks for nothing before touching the repository', async () => {
    const { repository, service } = fixture();

    await expect(service.addToCart(owner, { productId: 'product-1', quantity: 0 })).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.addToCart).not.toHaveBeenCalled();

    repository.addToCart.mockResolvedValue(ok({ id: 'cart-1' }));
    await expect(service.addToCart(owner, { productId: 'product-1', quantity: 2 })).resolves.toMatchObject({
      id: 'cart-1',
    });
  });

  it('changes and clears basket lines through the repository', async () => {
    const { repository, service } = fixture();
    repository.updateCartItem.mockResolvedValue(ok({ id: 'cart-1', items: [{ productId: 'product-1', quantity: 3 }] }));
    repository.removeCartItem.mockResolvedValue(ok({ id: 'cart-1', items: [] }));

    await expect(service.updateCartItem(owner, 'cart-1', 'product-1', 3)).resolves.toMatchObject({ id: 'cart-1' });
    await expect(service.removeCartItem(owner, 'cart-1', 'product-1')).resolves.toMatchObject({ items: [] });
    expect(repository.updateCartItem).toHaveBeenCalledWith(owner, 'cart-1', 'product-1', 3);
    expect(repository.removeCartItem).toHaveBeenCalledWith(owner, 'cart-1', 'product-1');
  });

  it('adds and drops a favourite, and reports one the catalog does not have', async () => {
    const { repository, service } = fixture();
    repository.addFavorite.mockResolvedValue(ok({ productId: 'product-1' }));
    repository.removeFavorite.mockResolvedValueOnce(ok({ productId: 'product-1' })).mockResolvedValueOnce({
      field: 'productId',
      status: 'not_found',
    });

    await expect(service.addFavorite(owner, 'product-1')).resolves.toEqual({ productId: 'product-1' });
    await expect(service.removeFavorite(owner, 'product-1')).resolves.toEqual({ productId: 'product-1' });
    await expect(service.removeFavorite(owner, 'product-404')).rejects.toThrow(ResourceNotFoundException);
  });

  it('answers an advice question and surfaces an unavailable adviser', async () => {
    const { repository, service } = fixture();
    repository.askAi
      .mockResolvedValueOnce(ok({ answer: 'catalog_match', id: 'consultation-1' }))
      .mockResolvedValueOnce({
        status: 'invalid_state',
      });

    await expect(service.askAi(owner, 'generic', 'What should I sow?')).resolves.toMatchObject({
      id: 'consultation-1',
    });
    await expect(service.askAi(owner, 'generic', 'What should I sow?')).rejects.toThrow(BadRequestException);
  });

  // A repository may refuse a command for a reason the HTTP layer has no distinct
  // status for; those must still arrive as a bad request rather than a 500.
  it('maps a forbidden or unrecognized repository refusal onto a canonical failure', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.checkoutCart.mockResolvedValueOnce({ field: 'sellerId', status: 'forbidden' }).mockResolvedValueOnce({
      field: 'quantity',
      status: 'insufficient_quantity',
    });

    await expect(service.checkoutCart(owner, 'cart-1', { deliveryTerms: 'pickup' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.checkoutCart(owner, 'cart-1', { deliveryTerms: 'pickup' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
