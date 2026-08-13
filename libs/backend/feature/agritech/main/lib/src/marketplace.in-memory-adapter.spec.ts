// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException, ResourceNotFoundException } from '@app/backend-common-exception';
import { MarketplaceInMemoryAdapter } from './marketplace.in-memory-adapter';

const buyer = { tenantId: 'tenant-buyer', userId: 'buyer-user' };
const seller = { tenantId: 'tenant-seller', userId: 'seller-user' };
const buyerPartnerId = 'buyer-partner';
const sellerPartnerId = 'seller-partner';

function createCommerceFixture(): {
  adapter: MarketplaceInMemoryAdapter;
  listingPublicationId: string;
} {
  const adapter = new MarketplaceInMemoryAdapter();
  adapter.registerVerifiedActor(buyer, 'buyer');
  adapter.registerApprovedOrganization(buyer, 'buyer', buyerPartnerId, {
    legalName: 'Samarkand Buyer LLC',
    region: 'Samarkand',
  });
  adapter.registerVerifiedActor(seller, 'seller');
  adapter.registerApprovedOrganization(seller, 'supplier', sellerPartnerId, {
    legalName: 'Fergana Seeds LLC',
    region: 'Fergana',
  });
  const listingPublicationId = adapter.registerProduct({
    tenantId: seller.tenantId,
    productId: 'private-product-1',
    listingPublicationId: 'public-listing-1',
    sellerId: 'public-seller-1',
    sellerPartnerId,
    sellerUserId: seller.userId,
    name: 'Certified corn seed',
    unit: 'ton',
    unitPriceUzs: 4_080_000,
    stockQuantity: 10,
  });
  return { adapter, listingPublicationId };
}

describe('MarketplaceInMemoryAdapter cross-organization commerce', () => {
  it('binds a cart to exact buyer and seller parties, freezes server-authoritative terms, and replays idempotently', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();

    const cart = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 },
      'cart-add-0001',
    );
    const replay = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 },
      'cart-add-0001',
    );

    expect(replay).toEqual(cart);
    expect(cart).toMatchObject({
      buyerPartnerId,
      buyerTenantId: buyer.tenantId,
      buyerUserId: buyer.userId,
      sellerPartnerId,
      sellerTenantId: seller.tenantId,
      sellerUserId: seller.userId,
      items: [{ listingPublicationId, sourceId: 'private-product-1', quantity: 2 }],
    });
    await expect(
      adapter.addToCart(buyer, { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 3 }, 'cart-add-0001'),
    ).rejects.toThrow(ConflictException);

    const checkout = await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-0001');
    await expect(adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-0001')).resolves.toEqual(
      checkout,
    );

    await expect(adapter.findContract(buyer, checkout.contractId)).resolves.toMatchObject({
      amountUzs: 8_160_000,
      buyerPartySnapshot: {
        legalName: 'Samarkand Buyer LLC',
        partnerId: buyerPartnerId,
        tenantId: buyer.tenantId,
      },
      sellerPartySnapshot: {
        legalName: 'Fergana Seeds LLC',
        partnerId: sellerPartnerId,
        tenantId: seller.tenantId,
      },
      lines: [
        {
          lineTotalUzs: 8_160_000,
          sourceId: 'private-product-1',
          sourcePublicationId: listingPublicationId,
          sourceRevision: 1,
          unitPriceUzs: 4_080_000,
        },
      ],
    });
  });

  it('fails closed for a foreign organization selector and revoked membership', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const otherBuyer = { tenantId: buyer.tenantId, userId: 'other-buyer-user' };
    adapter.registerVerifiedActor(otherBuyer, 'buyer');
    adapter.registerApprovedOrganization(otherBuyer, 'buyer', 'other-buyer-partner');

    await expect(
      adapter.addToCart(
        buyer,
        { actingPartnerId: 'other-buyer-partner', listingPublicationId, quantity: 1 },
        'foreign-org-0001',
      ),
    ).rejects.toThrow(ForbiddenException);

    const cart = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 1 },
      'cart-add-0002',
    );
    adapter.revokePartnerMembership(buyer, buyerPartnerId, 'buyer');
    await expect(adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-0002')).rejects.toThrow(
      ForbiddenException,
    );

    adapter.registerPartnerMembership(buyer, buyerPartnerId, 'buyer');
    await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-0003');
  });

  it('uses only approved opaque request publication IDs for offers and freezes both parties on selection', async () => {
    const { adapter } = createCommerceFixture();
    const request = await adapter.createRequest(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        region: 'Samarkand',
        title: 'Corn seed, 10 tons',
        volume: '10 tons',
      },
      'request-0001',
    );
    const requestPublicId = adapter.findRequestPublicationId(request.id);
    expect(requestPublicId).toBeDefined();

    await expect(
      adapter.makeOffer(
        seller,
        request.id,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 40_800_000 },
        'offer-0001',
      ),
    ).rejects.toThrow(ResourceNotFoundException);

    const offer = await adapter.makeOffer(
      seller,
      requestPublicId as string,
      { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 40_800_000 },
      'offer-0002',
    );
    expect(offer).not.toHaveProperty('requestId');
    expect(offer).toMatchObject({
      buyerPartnerId,
      requestPublicId,
      sellerPartnerId,
      sellerTenantId: seller.tenantId,
    });

    const selection = await adapter.chooseOffer(buyer, requestPublicId as string, offer.id, 'choose-0001');
    await expect(adapter.chooseOffer(buyer, requestPublicId as string, offer.id, 'choose-0001')).resolves.toEqual(
      selection,
    );
    await expect(adapter.findOffer(buyer, requestPublicId as string, offer.id)).resolves.toMatchObject({
      status: 'accepted',
    });
    await expect(adapter.findContract(seller, selection.contractId)).resolves.toMatchObject({
      buyerPartnerId,
      sellerPartnerId,
      sourceId: offer.id,
      sourceType: 'offer_selection',
    });
  });
});
