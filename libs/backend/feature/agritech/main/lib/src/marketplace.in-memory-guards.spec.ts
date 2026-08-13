// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import { MarketplaceInMemoryAdapter } from './marketplace.in-memory-adapter';

const buyer = { tenantId: 'tenant-buyer', userId: 'buyer-user' };
const seller = { tenantId: 'tenant-seller', userId: 'seller-user' };
const buyerPartnerId = 'buyer-partner';
const sellerPartnerId = 'seller-partner';

function createCommerceFixture(): { adapter: MarketplaceInMemoryAdapter; listingPublicationId: string } {
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

/** The second listing of the same seller, so one cart can hold two lines. */
function registerSecondListing(adapter: MarketplaceInMemoryAdapter, stockQuantity = 4): string {
  return adapter.registerProduct({
    tenantId: seller.tenantId,
    productId: 'private-product-2',
    listingPublicationId: 'public-listing-2',
    sellerId: 'public-seller-1',
    sellerPartnerId,
    sellerUserId: seller.userId,
    name: 'Drip irrigation kit',
    unit: 'set',
    unitPriceUzs: 1_200_000,
    stockQuantity,
  });
}

async function publishRequest(
  adapter: MarketplaceInMemoryAdapter,
  overrides: { key?: string; title?: string; volume?: string } = {},
): Promise<string> {
  const request = await adapter.createRequest(
    buyer,
    {
      actingPartnerId: buyerPartnerId,
      region: 'Samarkand',
      title: overrides.title ?? 'Corn seed, 10 tons',
      ...(overrides.volume === undefined ? {} : { volume: overrides.volume }),
    },
    overrides.key ?? 'request-default-01',
  );
  const requestPublicId = adapter.findRequestPublicationId(request.id);
  if (!requestPublicId) {
    throw new Error('fixture failed to publish the buyer request');
  }
  return requestPublicId;
}

describe('MarketplaceInMemoryAdapter fixture guards', () => {
  it('refuses a membership that does not match its tenant-scoped organization', () => {
    const { adapter } = createCommerceFixture();

    const mismatched: readonly [typeof buyer, string, 'buyer' | 'seller'][] = [
      [buyer, 'unknown-partner', 'buyer'],
      [buyer, sellerPartnerId, 'seller'],
      [seller, sellerPartnerId, 'buyer'],
      [buyer, buyerPartnerId, 'seller'],
    ];

    for (const [actor, partnerId, role] of mismatched) {
      expect(() => {
        adapter.registerPartnerMembership(actor, partnerId, role);
      }).toThrow('membership must match its tenant-scoped organization');
    }
  });

  it('ignores revocation and suspension of organizations that were never registered', () => {
    const { adapter } = createCommerceFixture();

    expect(() => {
      adapter.revokePartnerMembership(buyer, 'unknown-partner', 'buyer');
    }).not.toThrow();
    expect(() => {
      adapter.setOrganizationStatus('unknown-partner', 'suspended');
    }).not.toThrow();
  });

  it('refuses a product without positive stock, positive price, or an approved seller organization', () => {
    const { adapter } = createCommerceFixture();
    const product = {
      tenantId: seller.tenantId,
      productId: 'private-product-3',
      sellerId: 'public-seller-1',
      sellerPartnerId,
      sellerUserId: seller.userId,
      name: 'Wheat seed',
      unit: 'ton',
      unitPriceUzs: 2_000_000,
      stockQuantity: 5,
    };

    expect(() => adapter.registerProduct({ ...product, stockQuantity: 0 })).toThrow('positive stock and price');
    expect(() => adapter.registerProduct({ ...product, unitPriceUzs: 0 })).toThrow('positive stock and price');
    expect(() => adapter.registerProduct({ ...product, sellerPartnerId: buyerPartnerId })).toThrow(
      'approved seller organization membership',
    );

    adapter.setOrganizationStatus(sellerPartnerId, 'suspended');
    expect(() => adapter.registerProduct(product)).toThrow('approved seller organization membership');
  });

  it('derives the seller organization when exactly one active seller membership exists', () => {
    const adapter = new MarketplaceInMemoryAdapter();
    adapter.registerVerifiedActor(seller, 'seller');
    adapter.registerApprovedOrganization(seller, 'supplier', sellerPartnerId, { legalName: 'Fergana Seeds LLC' });
    const product = {
      tenantId: seller.tenantId,
      productId: 'private-product-1',
      sellerId: 'public-seller-1',
      sellerUserId: seller.userId,
      name: 'Certified corn seed',
      unit: 'ton',
      unitPriceUzs: 4_080_000,
      stockQuantity: 10,
    };

    expect(adapter.registerProduct(product)).toBe('listing-private-product-1');

    adapter.registerApprovedOrganization(seller, 'supplier', 'seller-partner-2', { legalName: 'Andijan Seeds LLC' });
    expect(() => adapter.registerProduct({ ...product, productId: 'private-product-4' })).toThrow(
      'approved seller organization membership',
    );
  });
});

describe('MarketplaceInMemoryAdapter cart accumulation', () => {
  it('keeps one open cart per seller, accumulating a repeated listing against live stock', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const secondListing = registerSecondListing(adapter);

    const first = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 },
      'cart-add-first-01',
    );
    const withSecondLine = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: secondListing, quantity: 1 },
      'cart-add-second-1',
    );
    const accumulated = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 3 },
      'cart-add-again-01',
    );

    expect(withSecondLine.id).toBe(first.id);
    expect(accumulated.id).toBe(first.id);
    expect(accumulated.items).toEqual([
      { listingPublicationId, quantity: 5, sourceId: 'private-product-1', sourceKind: 'product' },
      { listingPublicationId: secondListing, quantity: 1, sourceId: 'private-product-2', sourceKind: 'product' },
    ]);
    await expect(
      adapter.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 6 },
        'cart-add-over-001',
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      adapter.updateCartItem(buyer, first.id, listingPublicationId, 11, 'cart-update-over-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses a checkout of an unknown cart and of a cart that already produced a contract', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const cart = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 1 },
      'cart-add-check-01',
    );

    await expect(
      adapter.checkoutCart(buyer, 'cart-does-not-exist', { deliveryTerms: 'pickup' }, 'checkout-unknown1'),
    ).rejects.toThrow(ResourceNotFoundException);

    await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-once-001');
    await expect(
      adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-twice-01'),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('refuses a checkout whose listing left the catalogue or outran its stock', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const withdrawn = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 },
      'cart-add-gone-001',
    );
    adapter.setOrganizationStatus(sellerPartnerId, 'suspended');

    await expect(
      adapter.checkoutCart(buyer, withdrawn.id, { deliveryTerms: 'pickup' }, 'checkout-gone-001'),
    ).rejects.toThrow(ResourceNotFoundException);

    adapter.setOrganizationStatus(sellerPartnerId, 'approved');
    adapter.registerProduct({
      tenantId: seller.tenantId,
      productId: 'private-product-1',
      listingPublicationId: 'public-listing-1',
      sellerId: 'public-seller-1',
      sellerPartnerId,
      sellerUserId: seller.userId,
      name: 'Certified corn seed',
      unit: 'ton',
      unitPriceUzs: 4_080_000,
      stockQuantity: 1,
    });
    await expect(
      adapter.checkoutCart(buyer, withdrawn.id, { deliveryTerms: 'pickup' }, 'checkout-short-01'),
    ).rejects.toThrow(ConflictException);

    await adapter.removeCartItem(buyer, withdrawn.id, listingPublicationId, 'cart-remove-all-1');
    await expect(
      adapter.checkoutCart(buyer, withdrawn.id, { deliveryTerms: 'pickup' }, 'checkout-empty-01'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('MarketplaceInMemoryAdapter reverse auction', () => {
  it.each([
    ['a non-positive price', { deliveryTerms: 'pickup' as const, priceUzs: 0 }],
    ['seller delivery without a delivery price', { deliveryTerms: 'seller_delivery' as const, priceUzs: 40_800_000 }],
    [
      'seller delivery quoted at zero',
      { deliveryPriceUzs: 0, deliveryTerms: 'seller_delivery' as const, priceUzs: 40_800_000 },
    ],
    [
      'a pickup offer carrying a delivery price',
      { deliveryPriceUzs: 120_000, deliveryTerms: 'pickup' as const, priceUzs: 40_800_000 },
    ],
    ['a non-positive delivery window', { deliveryDays: 0, deliveryTerms: 'pickup' as const, priceUzs: 40_800_000 }],
  ])('refuses an offer with %s', async (_label, input) => {
    const { adapter } = createCommerceFixture();
    const requestPublicId = await publishRequest(adapter);

    await expect(
      adapter.makeOffer(seller, requestPublicId, { actingPartnerId: sellerPartnerId, ...input }, 'offer-invalid-01'),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a quoted seller delivery and closes the request to further offers once selected', async () => {
    const { adapter } = createCommerceFixture();
    const requestPublicId = await publishRequest(adapter);

    const offer = await adapter.makeOffer(
      seller,
      requestPublicId,
      {
        actingPartnerId: sellerPartnerId,
        deliveryDays: 5,
        deliveryNote: 'Yetkazib berish Samarqandga',
        deliveryPriceUzs: 320_000,
        deliveryTerms: 'seller_delivery',
        priceUzs: 40_800_000,
      },
      'offer-delivery-001',
    );

    expect(offer).toMatchObject({ deliveryDays: 5, deliveryPriceUzs: 320_000, deliveryTerms: 'seller_delivery' });

    await adapter.chooseOffer(buyer, requestPublicId, offer.id, 'choose-delivery-01');
    await expect(
      adapter.makeOffer(
        seller,
        requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 39_000_000 },
        'offer-too-late-01',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an offer from the buyer who published the request', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const farmer = { tenantId: 'tenant-farmer', userId: 'farmer-user' };
    adapter.registerVerifiedActor(farmer, 'farmer');
    adapter.registerApprovedOrganization(farmer, 'buyer', 'farmer-buyer-partner');
    adapter.registerApprovedOrganization(farmer, 'supplier', 'farmer-seller-partner');
    const request = await adapter.createRequest(
      farmer,
      { actingPartnerId: 'farmer-buyer-partner', region: 'Andijan', title: 'Seed potatoes, 4 tons' },
      'request-farmer-001',
    );
    const requestPublicId = adapter.findRequestPublicationId(request.id) as string;

    await expect(
      adapter.makeOffer(
        farmer,
        requestPublicId,
        { actingPartnerId: 'farmer-seller-partner', deliveryTerms: 'pickup', priceUzs: 16_000_000 },
        'offer-self-deal-1',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accepts the chosen offer, declines the competing one, and refuses a second selection', async () => {
    const { adapter } = createCommerceFixture();
    const requestPublicId = await publishRequest(adapter, {
      key: 'request-no-volume-1',
      title: 'Corn seed without a stated volume',
    });
    const rival = { tenantId: 'tenant-rival', userId: 'rival-user' };
    adapter.registerVerifiedActor(rival, 'seller');
    adapter.registerApprovedOrganization(rival, 'supplier', 'rival-partner', { legalName: 'Bukhara Agro LLC' });

    const chosen = await adapter.makeOffer(
      seller,
      requestPublicId,
      { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 40_800_000 },
      'offer-chosen-001',
    );
    const rejected = await adapter.makeOffer(
      rival,
      requestPublicId,
      { actingPartnerId: 'rival-partner', deliveryTerms: 'pickup', priceUzs: 41_500_000 },
      'offer-rejected-01',
    );

    await expect(
      adapter.chooseOffer(buyer, requestPublicId, 'offer-that-never-existed', 'choose-ghost-1'),
    ).rejects.toThrow(ResourceNotFoundException);

    const selection = await adapter.chooseOffer(buyer, requestPublicId, chosen.id, 'choose-winner-01');
    const offers = await adapter.listOffers(buyer, requestPublicId);

    expect(offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: chosen.id, status: 'accepted' }),
        expect.objectContaining({ id: rejected.id, status: 'declined' }),
      ]),
    );
    await expect(adapter.findContract(buyer, selection.contractId)).resolves.toMatchObject({
      lines: [expect.objectContaining({ unit: 'request' })],
      subject: 'Corn seed without a stated volume',
    });
    await expect(adapter.chooseOffer(buyer, requestPublicId, rejected.id, 'choose-again-001')).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses a request, an offer, and a selection made through an organization the actor does not hold', async () => {
    const { adapter } = createCommerceFixture();

    await expect(
      adapter.createRequest(
        buyer,
        { actingPartnerId: 'not-my-partner', region: 'Samarkand', title: 'Corn seed, 10 tons' },
        'request-foreign-01',
      ),
    ).rejects.toThrow(ForbiddenException);

    const requestPublicId = await publishRequest(adapter, { key: 'request-foreign-02' });

    await expect(
      adapter.makeOffer(
        seller,
        requestPublicId,
        { actingPartnerId: 'not-my-partner', deliveryTerms: 'pickup', priceUzs: 40_800_000 },
        'offer-foreign-001',
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      adapter.chooseOffer(buyer, 'publication-that-never-existed', 'offer-1', 'choose-foreign-1'),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('refuses a selection on a request nobody has offered on yet', async () => {
    const { adapter } = createCommerceFixture();
    const requestPublicId = await publishRequest(adapter, { key: 'request-no-offers1' });

    await expect(adapter.chooseOffer(buyer, requestPublicId, 'offer-1', 'choose-too-early')).rejects.toThrow(
      ConflictException,
    );
  });

  it('leaves the offers of a different request untouched when one request is settled', async () => {
    const { adapter } = createCommerceFixture();
    const settled = await publishRequest(adapter, { key: 'request-settled-01', title: 'Corn seed, 10 tons' });
    const untouched = await publishRequest(adapter, { key: 'request-parallel-1', title: 'Wheat seed, 6 tons' });
    const settledOffer = await adapter.makeOffer(
      seller,
      settled,
      { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 40_800_000 },
      'offer-settled-001',
    );
    const parallelOffer = await adapter.makeOffer(
      seller,
      untouched,
      { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 24_000_000 },
      'offer-parallel-01',
    );

    await adapter.chooseOffer(buyer, settled, settledOffer.id, 'choose-settled-01');

    await expect(adapter.findOffer(buyer, settled, settledOffer.id)).resolves.toMatchObject({ status: 'accepted' });
    await expect(adapter.findOffer(buyer, untouched, parallelOffer.id)).resolves.toMatchObject({ status: 'pending' });
  });

  it('refuses a selection once the offering seller lost its organization membership', async () => {
    const { adapter } = createCommerceFixture();
    const requestPublicId = await publishRequest(adapter, {
      key: 'request-revoked-01',
      title: 'Corn seed for a revoked seller',
    });
    const offer = await adapter.makeOffer(
      seller,
      requestPublicId,
      { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 40_800_000 },
      'offer-revoked-001',
    );
    adapter.revokePartnerMembership(seller, sellerPartnerId, 'seller');

    await expect(adapter.chooseOffer(buyer, requestPublicId, offer.id, 'choose-revoked-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
