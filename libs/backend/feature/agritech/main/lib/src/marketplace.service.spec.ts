// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
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
    createRequest: vi.fn(),
    listRequests: vi.fn(),
    listMyRequests: vi.fn(),
    makeOffer: vi.fn(),
    listOffers: vi.fn(),
    chooseOffer: vi.fn(),
    updateContractDeliveryQuote: vi.fn(),
    listContracts: vi.fn(),
    listTenantContracts: vi.fn(),
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
      service.reviewVerification(
        owner.tenantId,
        'verification-1',
        'verified',
        'reviewer-1',
        0,
        'verification-review-0001',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it.each([
    ['rejected', undefined],
    ['verified', 'criteria_not_met'],
  ] as const)('rejects invalid verification reason provenance for %s', async (decision, reason) => {
    const { repository, service } = fixture();

    await expect(
      service.reviewVerification(
        owner.tenantId,
        'verification-1',
        decision,
        'reviewer-1',
        0,
        'verification-review-0001',
        reason,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repository.reviewVerification).not.toHaveBeenCalled();
  });

  it.each([
    [
      'add',
      (service: MarketplaceService) =>
        service.addToCart(
          owner,
          { actingPartnerId: 'buyer-partner', listingPublicationId: 'listing-p-1', quantity: 1 },
          'cart-add-0001',
        ),
    ],
    [
      'update',
      (service: MarketplaceService) => service.updateCartItem(owner, 'c-1', 'listing-p-1', 2, 'cart-update-0001'),
    ],
    [
      'remove',
      (service: MarketplaceService) => service.removeCartItem(owner, 'c-1', 'listing-p-1', 'cart-remove-0001'),
    ],
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
        buyerTenantId: owner.tenantId,
        buyerUserId: owner.userId,
        buyerPartnerId: 'buyer-partner',
        sellerTenantId: 'seller-tenant',
        sellerUserId: 'seller-1',
        sellerPartnerId: 'seller-partner',
        items: [
          {
            listingPublicationId: 'listing-p-1',
            sourceKind: 'product',
            sourceId: 'p-1',
            quantity: 1,
          },
        ],
        status: 'open',
        createdAt: now,
        updatedAt: now,
      }),
    );

    const input = {
      actingPartnerId: 'buyer-partner',
      listingPublicationId: 'listing-p-1',
      quantity: 1,
    };
    await expect(service.addToCart(owner, input, 'cart-add-0001')).resolves.toMatchObject({ id: 'c-1' });
    expect(repository.isApprovedOrganization).not.toHaveBeenCalled();
    expect(repository.addToCart).toHaveBeenCalledWith(owner, input, 'cart-add-0001');
  });

  it('requires verification before checkout', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue(undefined);
    await expect(service.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' }, 'checkout-0001')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects checkout for a verified seller-only role', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('seller');
    await expect(service.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' }, 'checkout-0001')).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.checkoutCart).not.toHaveBeenCalled();
  });

  it('checks out only for a verified buyer role and returns a persisted contract reference', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.checkoutCart.mockResolvedValue(ok({ cartId: 'c-1', contractId: 'contract-1' }));

    await expect(
      service.checkoutCart(owner, 'c-1', { deliveryTerms: 'seller_delivery' }, 'checkout-0001'),
    ).resolves.toEqual({ cartId: 'c-1', contractId: 'contract-1' });
    expect(repository.checkoutCart).toHaveBeenCalledWith(
      owner,
      'c-1',
      { deliveryTerms: 'seller_delivery' },
      'checkout-0001',
    );
  });

  it('requires verification before creating a request', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue(undefined);
    await expect(
      service.createRequest(
        owner,
        {
          actingPartnerId: '22222222-2222-4222-8222-222222222222',
          title: 'Corn',
          region: 'Samarkand',
        },
        'request-0001',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('delegates exact organization membership authorization to persistence', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.createRequest.mockResolvedValue({ status: 'forbidden', field: 'organization' });

    await expect(
      service.createRequest(
        owner,
        {
          actingPartnerId: '22222222-2222-4222-8222-222222222222',
          title: 'Corn',
          region: 'Samarkand',
        },
        'request-0001',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.createRequest).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ actingPartnerId: '22222222-2222-4222-8222-222222222222' }),
      'request-0001',
    );
  });

  it('allows offers only from verified seller or farmer roles', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    const input = { actingPartnerId: 'seller-partner', priceUzs: 5_000_000, deliveryTerms: 'pickup' as const };
    await expect(service.makeOffer(owner, 'request-public-1', input, 'offer-0001')).rejects.toThrow(ForbiddenException);
    expect(repository.makeOffer).not.toHaveBeenCalled();

    repository.roleOf.mockResolvedValue('seller');
    repository.makeOffer.mockResolvedValue(ok({ id: 'offer-1' }));
    await expect(service.makeOffer(owner, 'request-public-1', input, 'offer-0001')).resolves.toMatchObject({
      id: 'offer-1',
    });
  });

  it('returns the persisted contract reference from owner offer selection', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.chooseOffer.mockResolvedValue(
      ok({
        requestPublicId: 'request-public-1',
        offerId: 'offer-1',
        sellerUserId: 'seller-1',
        contractId: 'contract-1',
      }),
    );

    await expect(service.chooseOffer(owner, 'request-public-1', 'offer-1', 'choose-0001')).resolves.toMatchObject({
      contractId: 'contract-1',
    });
  });

  it('maps an already-decided offer selection to a canonical conflict', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    repository.chooseOffer.mockResolvedValue({ status: 'conflict', field: 'status' });

    await expect(service.chooseOffer(owner, 'request-public-1', 'offer-1', 'choose-0001')).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows only a verified seller role to quote seller delivery', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('buyer');
    await expect(
      service.updateContractDeliveryQuote(
        owner,
        'contract-1',
        { deliveryPriceUzs: 250_000, expectedRevision: 0 },
        'delivery-quote-0001',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.updateContractDeliveryQuote).not.toHaveBeenCalled();

    repository.roleOf.mockResolvedValue('seller');
    repository.updateContractDeliveryQuote.mockResolvedValue(
      ok({ id: 'contract-1', deliveryTerms: 'seller_delivery', deliveryPriceUzs: 250_000 }),
    );
    await expect(
      service.updateContractDeliveryQuote(
        owner,
        'contract-1',
        { deliveryPriceUzs: 250_000, expectedRevision: 0 },
        'delivery-quote-0001',
      ),
    ).resolves.toMatchObject({ deliveryPriceUzs: 250_000 });
  });
});
