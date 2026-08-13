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
    listingPublicationId: 'public-listing-1',
    name: 'Certified corn seed',
    productId: 'private-product-1',
    sellerId: 'public-seller-1',
    sellerPartnerId,
    sellerUserId: seller.userId,
    stockQuantity: 10,
    tenantId: seller.tenantId,
    unit: 'ton',
    unitPriceUzs: 4_080_000,
  });
  return { adapter, listingPublicationId };
}

describe('MarketplaceInMemoryAdapter verification review', () => {
  it('decides a pending case once, replays the decision, and refuses a second decision', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const pending = adapter.registerPendingActor(buyer, 'buyer');

    await expect(adapter.getVerification(buyer)).resolves.toMatchObject({ level: 'basic', status: 'pending' });
    await expect(adapter.listVerifications(buyer.tenantId)).resolves.toHaveLength(1);
    await expect(adapter.listVerifications('tenant-other')).resolves.toEqual([]);

    const reviewed = await adapter.reviewVerification(
      buyer.tenantId,
      pending.id,
      'verified',
      'moderator-user',
      0,
      'review-0001',
    );
    expect(reviewed).toMatchObject({ reviewedBy: 'moderator-user', status: 'verified', version: 1 });
    await expect(
      adapter.reviewVerification(buyer.tenantId, pending.id, 'verified', 'moderator-user', 0, 'review-0001'),
    ).resolves.toEqual(reviewed);

    // A different decision under the same key is a client mistake, not a replay.
    await expect(
      adapter.reviewVerification(
        buyer.tenantId,
        pending.id,
        'rejected',
        'moderator-user',
        0,
        'review-0001',
        'criteria_not_met',
      ),
    ).rejects.toThrow(ConflictException);
    // And the case itself is now settled, so a fresh key cannot re-decide it.
    await expect(
      adapter.reviewVerification(buyer.tenantId, pending.id, 'verified', 'moderator-user', 1, 'review-0002'),
    ).rejects.toThrow(ConflictException);
  });

  it('records a rejection with its reason', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const pending = adapter.registerPendingActor(seller, 'seller');

    await expect(
      adapter.reviewVerification(
        seller.tenantId,
        pending.id,
        'rejected',
        'moderator-user',
        0,
        'review-0003',
        'documents_unreadable',
      ),
    ).resolves.toMatchObject({ rejectionReason: 'documents_unreadable', status: 'rejected' });
  });

  it('refuses a decision it cannot justify or apply', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const pending = adapter.registerPendingActor(buyer, 'buyer');
    const review = (...args: Parameters<MarketplaceInMemoryAdapter['reviewVerification']>) =>
      adapter.reviewVerification(...args);

    // A rejection needs a reason and an approval must not carry one.
    await expect(review(buyer.tenantId, pending.id, 'rejected', 'moderator-user', 0, 'review-0010')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      review(buyer.tenantId, pending.id, 'verified', 'moderator-user', 0, 'review-0011', 'criteria_not_met'),
    ).rejects.toThrow(BadRequestException);
    await expect(review(buyer.tenantId, pending.id, 'verified', 'moderator-user', -1, 'review-0012')).rejects.toThrow(
      BadRequestException,
    );
    await expect(review(buyer.tenantId, pending.id, 'verified', 'moderator-user', 1.5, 'review-0013')).rejects.toThrow(
      BadRequestException,
    );
    await expect(review(buyer.tenantId, pending.id, 'verified', 'moderator-user', 0, 'short')).rejects.toThrow(
      BadRequestException,
    );
    // Stale revision, unknown case, and a case belonging to another tenant.
    await expect(review(buyer.tenantId, pending.id, 'verified', 'moderator-user', 7, 'review-0014')).rejects.toThrow(
      ConflictException,
    );
    await expect(review(buyer.tenantId, 'memory-verification-404', 'verified', 'm', 0, 'review-0015')).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(review('tenant-other', pending.id, 'verified', 'moderator-user', 0, 'review-0016')).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(adapter.getVerification(seller)).resolves.toBeNull();
  });
});

describe('MarketplaceInMemoryAdapter cart management', () => {
  it('reads back only the caller’s own open carts', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const cart = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 },
      'cart-add-0001',
    );

    await expect(adapter.getCart(buyer, cart.id)).resolves.toMatchObject({ id: cart.id });
    await expect(adapter.listCarts(buyer)).resolves.toHaveLength(1);
    await expect(adapter.getCart(seller, cart.id)).rejects.toThrow(ResourceNotFoundException);
    await expect(adapter.listCarts(seller)).resolves.toEqual([]);

    // Checkout closes the cart, so the open-cart list empties.
    await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-0001');
    await expect(adapter.listCarts(buyer)).resolves.toEqual([]);
    await expect(adapter.getCart(buyer, cart.id)).resolves.toMatchObject({ status: 'ordered' });
  });

  it('changes a line quantity, removes a line, and replays both idempotently', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const cart = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 },
      'cart-add-0002',
    );

    const raised = await adapter.updateCartItem(buyer, cart.id, listingPublicationId, 5, 'cart-update-0001');
    expect(raised.items).toEqual([expect.objectContaining({ quantity: 5 })]);
    await expect(adapter.updateCartItem(buyer, cart.id, listingPublicationId, 5, 'cart-update-0001')).resolves.toEqual(
      raised,
    );
    await expect(adapter.updateCartItem(buyer, cart.id, listingPublicationId, 6, 'cart-update-0001')).rejects.toThrow(
      ConflictException,
    );

    const emptied = await adapter.removeCartItem(buyer, cart.id, listingPublicationId, 'cart-remove-0001');
    expect(emptied.items).toEqual([]);
    await expect(adapter.removeCartItem(buyer, cart.id, listingPublicationId, 'cart-remove-0001')).resolves.toEqual(
      emptied,
    );
    // An empty cart has nothing to buy.
    await expect(adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-0002')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses a quantity, a line, a cart or a membership it cannot honour', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const cart = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 1 },
      'cart-add-0003',
    );

    await expect(adapter.updateCartItem(buyer, cart.id, listingPublicationId, 11, 'cart-update-0010')).rejects.toThrow(
      ConflictException,
    );
    await expect(adapter.updateCartItem(buyer, cart.id, listingPublicationId, 1.5, 'cart-update-0011')).rejects.toThrow(
      BadRequestException,
    );
    await expect(adapter.updateCartItem(buyer, cart.id, listingPublicationId, -1, 'cart-update-0012')).rejects.toThrow(
      BadRequestException,
    );
    await expect(adapter.updateCartItem(buyer, cart.id, 'public-listing-404', 2, 'cart-update-0013')).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(
      adapter.updateCartItem(buyer, 'memory-cart-404', listingPublicationId, 2, 'cart-u-0014'),
    ).rejects.toThrow(ResourceNotFoundException);
    await expect(adapter.updateCartItem(seller, cart.id, listingPublicationId, 2, 'cart-update-0015')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(adapter.removeCartItem(buyer, cart.id, 'public-listing-404', 'cart-remove-0016')).rejects.toThrow(
      ResourceNotFoundException,
    );

    adapter.revokePartnerMembership(buyer, buyerPartnerId, 'buyer');
    await expect(adapter.updateCartItem(buyer, cart.id, listingPublicationId, 2, 'cart-update-0017')).rejects.toThrow(
      ForbiddenException,
    );
    adapter.registerPartnerMembership(buyer, buyerPartnerId, 'buyer');

    // A suspended seller organization takes its listing out of reach.
    adapter.setOrganizationStatus(sellerPartnerId, 'suspended');
    await expect(adapter.updateCartItem(buyer, cart.id, listingPublicationId, 2, 'cart-update-0018')).rejects.toThrow(
      ResourceNotFoundException,
    );
    await expect(
      adapter.addToCart(buyer, { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 1 }, 'cart-a-0019'),
    ).rejects.toThrow(ResourceNotFoundException);
    adapter.setOrganizationStatus(sellerPartnerId, 'approved');
    await expect(
      adapter.updateCartItem(buyer, cart.id, listingPublicationId, 2, 'cart-update-0020'),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ quantity: 2 })] });

    // A cart that has already become an order is closed to further edits.
    await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-0021');
    await expect(adapter.updateCartItem(buyer, cart.id, listingPublicationId, 3, 'cart-update-0022')).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('rejects a fractional add, an over-stock add, and a self-dealing add', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const add = (quantity: number, key: string, actingPartnerId = buyerPartnerId) =>
      adapter.addToCart(buyer, { actingPartnerId, listingPublicationId, quantity }, key);

    await expect(add(0, 'cart-add-0030')).rejects.toThrow(BadRequestException);
    await expect(add(1.5, 'cart-add-0031')).rejects.toThrow(BadRequestException);
    await expect(add(11, 'cart-add-0032')).rejects.toThrow(ConflictException);
    await expect(
      adapter.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: 'nope', quantity: 1 },
        'cart-add-0033',
      ),
    ).rejects.toThrow(ResourceNotFoundException);

    // The seller cannot buy from itself through its own supplier organization.
    adapter.registerApprovedOrganization(seller, 'buyer', 'seller-as-buyer-partner');
    await expect(
      adapter.addToCart(
        seller,
        { actingPartnerId: 'seller-as-buyer-partner', listingPublicationId, quantity: 1 },
        'cart-add-0034',
      ),
    ).rejects.toThrow(ForbiddenException);

    // An unverified visitor never reaches the store at all.
    const stranger = { tenantId: 'tenant-stranger', userId: 'stranger-user' };
    await expect(
      adapter.addToCart(stranger, { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 1 }, 'cart-0035'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('MarketplaceInMemoryAdapter request feed', () => {
  it('lists tenant requests by status and the caller’s own requests separately', async () => {
    const { adapter } = createCommerceFixture();
    const colleague = { tenantId: buyer.tenantId, userId: 'colleague-user' };
    adapter.registerVerifiedActor(colleague, 'buyer');
    adapter.registerApprovedOrganization(colleague, 'buyer', 'colleague-partner');

    const own = await adapter.createRequest(
      buyer,
      { actingPartnerId: buyerPartnerId, region: 'Samarkand', title: 'Corn seed, 10 tons', volume: '10 tons' },
      'request-0001',
    );
    await adapter.createRequest(
      colleague,
      { actingPartnerId: 'colleague-partner', region: 'Fergana', title: 'Wheat, 4 tons', volume: '4 tons' },
      'request-0002',
    );

    await expect(adapter.listRequests(buyer.tenantId)).resolves.toHaveLength(2);
    await expect(adapter.listRequests(buyer.tenantId, 'all')).resolves.toHaveLength(2);
    await expect(adapter.listRequests(buyer.tenantId, 'open')).resolves.toHaveLength(2);
    await expect(adapter.listRequests(buyer.tenantId, 'selected')).resolves.toEqual([]);
    await expect(adapter.listMyRequests(buyer)).resolves.toEqual([expect.objectContaining({ id: own.id })]);
    await expect(adapter.findRequest(buyer, own.id)).resolves.toMatchObject({ status: 'open' });
    await expect(adapter.findRequest(colleague, own.id)).resolves.toBeUndefined();
  });

  it('falls back to the demo feed only while a tenant has posted nothing', async () => {
    const { adapter } = createCommerceFixture();

    // A brand-new tenant would otherwise show an empty reverse-auction page.
    const demo = await adapter.listRequests('tenant-empty');
    expect(demo.length).toBeGreaterThan(0);
    expect(await adapter.listRequests('tenant-empty', 'open')).not.toEqual([]);

    await adapter.createRequest(
      buyer,
      { actingPartnerId: buyerPartnerId, region: 'Samarkand', title: 'Corn seed, 10 tons', volume: '10 tons' },
      'request-0010',
    );
    await expect(adapter.listRequests(buyer.tenantId)).resolves.toHaveLength(1);
    // Once the tenant has its own row, a filter that matches nothing stays empty.
    await expect(adapter.listRequests(buyer.tenantId, 'selected')).resolves.toEqual([]);
  });

  it('shows a buyer the offers on its own request and nobody else’s', async () => {
    const { adapter } = createCommerceFixture();
    const request = await adapter.createRequest(
      buyer,
      { actingPartnerId: buyerPartnerId, region: 'Samarkand', title: 'Corn seed, 10 tons', volume: '10 tons' },
      'request-0020',
    );
    const requestPublicId = adapter.findRequestPublicationId(request.id) as string;

    await expect(adapter.listOffers(buyer, requestPublicId)).resolves.toEqual([]);
    const offer = await adapter.makeOffer(
      seller,
      requestPublicId,
      { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 40_800_000 },
      'offer-0020',
    );
    await expect(adapter.listOffers(buyer, requestPublicId)).resolves.toEqual([
      expect.objectContaining({ id: offer.id, status: 'pending' }),
    ]);
    await expect(adapter.listOffers(seller, requestPublicId)).rejects.toThrow(ResourceNotFoundException);
    await expect(adapter.listOffers(buyer, 'memory-request-publication-404')).rejects.toThrow(
      ResourceNotFoundException,
    );

    await adapter.chooseOffer(buyer, requestPublicId, offer.id, 'choose-0020');
    await expect(adapter.listRequests(buyer.tenantId, 'selected')).resolves.toHaveLength(1);
    // The request is settled, so a late offer and a second selection are refused.
    await expect(
      adapter.makeOffer(
        seller,
        requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 39_000_000 },
        'offer-0021',
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(adapter.chooseOffer(buyer, requestPublicId, offer.id, 'choose-0021')).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('MarketplaceInMemoryAdapter seller delivery quote', () => {
  async function createDeliveryContract() {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const cart = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 2 },
      'cart-add-0100',
    );
    const checkout = await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'seller_delivery' }, 'checkout-0100');
    return { adapter, contractId: checkout.contractId, listingPublicationId };
  }

  it('prices the delivery once, bumps the revision, and replays the same quote', async () => {
    const { adapter, contractId } = await createDeliveryContract();

    const quoted = await adapter.updateContractDeliveryQuote(
      seller,
      contractId,
      { deliveryDays: 8, deliveryNote: 'Samarqand warehouse', deliveryPriceUzs: 800_000, expectedRevision: 0 },
      'quote-0100',
    );
    expect(quoted).toMatchObject({
      deliveryDays: 8,
      deliveryNote: 'Samarqand warehouse',
      deliveryPriceUzs: 800_000,
      revision: 1,
    });
    await expect(
      adapter.updateContractDeliveryQuote(
        seller,
        contractId,
        { deliveryDays: 8, deliveryNote: 'Samarqand warehouse', deliveryPriceUzs: 800_000, expectedRevision: 0 },
        'quote-0100',
      ),
    ).resolves.toEqual(quoted);
    // The price is now frozen; a second quote under a fresh key is refused.
    await expect(
      adapter.updateContractDeliveryQuote(
        seller,
        contractId,
        { deliveryPriceUzs: 900_000, expectedRevision: 1 },
        'quote-0101',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a quote from the wrong party, at the wrong revision, or with impossible terms', async () => {
    const { adapter, contractId } = await createDeliveryContract();
    const quote = (input: Parameters<MarketplaceInMemoryAdapter['updateContractDeliveryQuote']>[2], key: string) =>
      adapter.updateContractDeliveryQuote(seller, contractId, input, key);

    await expect(quote({ deliveryPriceUzs: 800_000, expectedRevision: 3 }, 'quote-0110')).rejects.toThrow(
      ConflictException,
    );
    await expect(quote({ deliveryPriceUzs: 800_000, expectedRevision: -1 }, 'quote-0111')).rejects.toThrow(
      BadRequestException,
    );
    await expect(quote({ deliveryPriceUzs: 800_000, expectedRevision: 1.5 }, 'quote-0112')).rejects.toThrow(
      BadRequestException,
    );
    await expect(quote({ deliveryPriceUzs: 0, expectedRevision: 0 }, 'quote-0113')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      quote({ deliveryDays: 0, deliveryPriceUzs: 800_000, expectedRevision: 0 }, 'quote-0114'),
    ).rejects.toThrow(BadRequestException);
    // The buyer is not the party that ships.
    await expect(
      adapter.updateContractDeliveryQuote(
        buyer,
        contractId,
        { deliveryPriceUzs: 800_000, expectedRevision: 0 },
        'quote-0115',
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      adapter.updateContractDeliveryQuote(
        seller,
        'memory-contract-404',
        { deliveryPriceUzs: 800_000, expectedRevision: 0 },
        'quote-0116',
      ),
    ).rejects.toThrow(ResourceNotFoundException);

    adapter.revokePartnerMembership(seller, sellerPartnerId, 'seller');
    await expect(quote({ deliveryPriceUzs: 800_000, expectedRevision: 0 }, 'quote-0117')).rejects.toThrow(
      ForbiddenException,
    );
    adapter.registerPartnerMembership(seller, sellerPartnerId, 'seller');

    adapter.revokePartnerMembership(buyer, buyerPartnerId, 'buyer');
    await expect(quote({ deliveryPriceUzs: 800_000, expectedRevision: 0 }, 'quote-0118')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('has nothing to quote on a pickup contract', async () => {
    const { adapter, listingPublicationId } = createCommerceFixture();
    const cart = await adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId, quantity: 1 },
      'cart-add-0120',
    );
    const checkout = await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' }, 'checkout-0120');

    await expect(
      adapter.updateContractDeliveryQuote(
        seller,
        checkout.contractId,
        { deliveryPriceUzs: 800_000, expectedRevision: 0 },
        'quote-0120',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists a contract to both parties and to the tenant view', async () => {
    const { adapter, contractId } = await createDeliveryContract();

    await expect(adapter.listContracts(buyer)).resolves.toEqual([expect.objectContaining({ id: contractId })]);
    await expect(adapter.listContracts(seller)).resolves.toEqual([expect.objectContaining({ id: contractId })]);
    await expect(adapter.listTenantContracts(seller.tenantId)).resolves.toHaveLength(1);
    await expect(adapter.listTenantContracts('tenant-other')).resolves.toEqual([]);
    await expect(
      adapter.findContract({ tenantId: 'tenant-other', userId: 'other-user' }, contractId),
    ).resolves.toBeUndefined();
  });
});
