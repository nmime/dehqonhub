// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import type { Contract, MarketplaceRepository, OperationResult } from '@app/backend-feature-agritech-shared';
import {
  InMemoryMarketplaceRepository,
  MarketplaceInMemoryAdapter,
  type MarketplaceInMemoryProductInput,
} from './marketplace.in-memory-adapter';

const tenantId = 'tenant-memory-parity';
const otherTenantId = 'tenant-memory-neighbour';
const buyer = { tenantId, userId: 'buyer-memory' };
const secondBuyer = { tenantId, userId: 'second-buyer-memory' };
const seller = { tenantId, userId: 'seller-memory' };
const bystander = { tenantId, userId: 'bystander-memory' };
const productId = 'product-corn';

const productInput = (overrides: Partial<MarketplaceInMemoryProductInput> = {}): MarketplaceInMemoryProductInput => ({
  name: 'Corn seed',
  productId,
  sellerId: 'org-seed-cooperative',
  sellerUserId: seller.userId,
  stockQuantity: 10,
  tenantId,
  unit: 't',
  unitPriceUzs: 1_000_000,
  ...overrides,
});

/** Reads the value of a command that must have succeeded, with a useful message when it did not. */
function expectOk<T>(result: OperationResult<T>): T {
  if (result.status !== 'ok') {
    throw new Error(`Expected an ok result, received "${result.status}" (${result.field ?? 'no field'})`);
  }
  return result.value;
}

function createApprovedActors(adapter: MarketplaceInMemoryAdapter | InMemoryMarketplaceRepository): void {
  adapter.registerVerifiedActor(buyer, 'buyer');
  adapter.registerApprovedOrganization(buyer, 'buyer');
  adapter.registerVerifiedActor(seller, 'seller');
  adapter.registerApprovedOrganization(seller, 'supplier');
}

/** A tenant where both parties are cleared to trade and one product is listed. */
function createMarket(product: Partial<MarketplaceInMemoryProductInput> = {}): InMemoryMarketplaceRepository {
  const repository = new InMemoryMarketplaceRepository();
  createApprovedActors(repository);
  // A second cleared buyer, so competition for the same stock can be exercised.
  repository.registerVerifiedActor(secondBuyer, 'buyer');
  repository.registerApprovedOrganization(secondBuyer, 'buyer');
  repository.registerProduct(productInput(product));
  return repository;
}

/** Fills a basket and turns it into a draft contract, the way the storefront does. */
async function checkout(
  repository: InMemoryMarketplaceRepository,
  quantity: number,
  deliveryTerms: 'by_agreement' | 'pickup' | 'seller_delivery' = 'pickup',
  owner = buyer,
): Promise<{ cartId: string; contractId: string }> {
  const cart = expectOk(await repository.addToCart(owner, { productId, quantity }));
  return expectOk(await repository.checkoutCart(owner, cart.id, { deliveryTerms }));
}

/** Both signatures, which is what moves stock. */
async function signBoth(
  repository: InMemoryMarketplaceRepository,
  contractId: string,
  owner = buyer,
): Promise<OperationResult<Contract>> {
  await repository.signContract(owner, contractId);
  return repository.signContract(seller, contractId);
}

describe('MarketplaceInMemoryAdapter conflict parity', () => {
  it('maps a repeated verification decision to the same canonical conflict as PostgreSQL', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const verification = adapter.registerVerifiedActor(buyer, 'buyer');

    await expect(
      adapter.reviewVerification(tenantId, verification.id, 'rejected', 'admin-memory', 'criteria_not_met'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects fabricated or contradictory verification decision reasons', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const verification = adapter.registerVerifiedActor(buyer, 'buyer');

    await expect(adapter.reviewVerification(tenantId, verification.id, 'rejected', 'admin-memory')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      adapter.reviewVerification(tenantId, verification.id, 'verified', 'admin-memory', 'criteria_not_met'),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps an already-selected request unchanged and reports conflict while missing requests remain not found', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    createApprovedActors(adapter);
    const request = await adapter.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed' });
    const offer = await adapter.makeOffer(seller, request.id, 4_000_000, 'pickup');
    const selection = await adapter.chooseOffer(buyer, request.id, offer.id);

    await expect(adapter.chooseOffer(buyer, request.id, offer.id)).rejects.toThrow(ConflictException);
    await expect(adapter.chooseOffer(buyer, 'missing-request', offer.id)).rejects.toThrow(ResourceNotFoundException);

    await expect(adapter.findRequest(buyer, request.id)).resolves.toMatchObject({ status: 'selected' });
    await expect(adapter.findOffer(buyer, request.id, offer.id)).resolves.toMatchObject({ status: 'accepted' });
    await expect(adapter.listContracts(buyer)).resolves.toEqual([
      expect.objectContaining({ id: selection.contractId, sourceId: offer.id, sourceType: 'offer_selection' }),
    ]);
  });

  it('decides a pending submission and keeps the decision on the record', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const submission = adapter.registerPendingActor(buyer, 'buyer');

    const approved = await adapter.reviewVerification(tenantId, submission.id, 'verified', 'admin-memory');

    expect(approved.status).toBe('verified');
    expect(approved.reviewedBy).toBe('admin-memory');
    expect(approved.reviewedAt).toBeInstanceOf(Date);
    expect(approved.rejectionReason).toBeUndefined();
    await expect(adapter.getVerification(buyer)).resolves.toMatchObject({ status: 'verified' });
  });

  it('walks a basket to a signed contract and hands the buyer their own copy', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    createApprovedActors(adapter);
    adapter.registerProduct(productInput({ stockQuantity: 4 }));

    const cart = await adapter.addToCart(buyer, productId, 4);
    await expect(adapter.getCart(buyer, cart.id)).resolves.toMatchObject({ id: cart.id });
    await expect(adapter.listCarts(buyer)).resolves.toHaveLength(1);

    const order = await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' });
    await expect(adapter.signContract(buyer, order.contractId)).resolves.toMatchObject({ status: 'signed' });
    const active = await adapter.signContract(seller, order.contractId);

    expect(active.status).toBe('active');
    expect(active.signedAt).toBeInstanceOf(Date);
    await expect(adapter.findContract(buyer, order.contractId)).resolves.toMatchObject({ status: 'active' });
    // The basket left the open list once it became an order.
    await expect(adapter.listCarts(buyer)).resolves.toEqual([]);
  });

  it('reports a basket nobody owns as missing rather than empty', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    createApprovedActors(adapter);

    await expect(adapter.getCart(buyer, 'memory-cart-404')).rejects.toThrow(ResourceNotFoundException);
    await expect(adapter.addToCart(buyer, productId, 0)).rejects.toThrow(BadRequestException);
    await expect(adapter.findContract(buyer, 'memory-contract-404')).resolves.toBeUndefined();
    await expect(adapter.findRequest(buyer, 'memory-request-404')).resolves.toBeUndefined();
  });

  it('keeps an unapproved seller out of a checkout the buyer is cleared for', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    adapter.registerVerifiedActor(buyer, 'buyer');
    adapter.registerApprovedOrganization(buyer, 'buyer');
    adapter.registerVerifiedActor(seller, 'seller');
    adapter.registerProduct(productInput());

    const cart = await adapter.addToCart(buyer, productId, 1);

    await expect(adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' })).rejects.toThrow(ForbiddenException);
  });
});

describe('in-memory marketplace verification records', () => {
  it('refuses to list a product without stock to sell or a price to charge', () => {
    const repository = new InMemoryMarketplaceRepository();

    expect(() => {
      repository.registerProduct(productInput({ stockQuantity: 0 }));
    }).toThrow(/positive stock and price/u);
    expect(() => {
      repository.registerProduct(productInput({ unitPriceUzs: 0 }));
    }).toThrow(/positive stock and price/u);
  });

  it('answers for the asking account only', async () => {
    const repository = new InMemoryMarketplaceRepository();
    repository.registerVerifiedActor(buyer, 'buyer');

    await expect(repository.getVerification(buyer)).resolves.toMatchObject({ role: 'buyer', status: 'verified' });
    await expect(repository.getVerification(bystander)).resolves.toBeUndefined();
    await expect(repository.roleOf(buyer)).resolves.toBe('buyer');
    await expect(repository.roleOf(bystander)).resolves.toBeUndefined();
  });

  it('lends no role to an account whose submission is still waiting', async () => {
    const repository = new InMemoryMarketplaceRepository();
    repository.registerPendingActor(buyer, 'buyer');

    await expect(repository.roleOf(buyer)).resolves.toBeUndefined();
    await expect(repository.getVerification(buyer)).resolves.toMatchObject({ level: 'basic', status: 'pending' });
  });

  it('records a rejection with its reason and leaves an approval without one', async () => {
    const repository = new InMemoryMarketplaceRepository();
    const rejected = repository.registerPendingActor(buyer, 'buyer');
    const approved = repository.registerPendingActor(seller, 'seller');

    const decision = expectOk(
      await repository.reviewVerification(tenantId, rejected.id, 'rejected', 'admin-memory', 'documents_unreadable'),
    );
    const clearance = expectOk(await repository.reviewVerification(tenantId, approved.id, 'verified', 'admin-memory'));

    expect(decision).toMatchObject({ rejectionReason: 'documents_unreadable', status: 'rejected' });
    expect(clearance.rejectionReason).toBeUndefined();
    // A clone, so a caller cannot edit the stored decision through the result.
    decision.reviewedBy = 'tampered';
    await expect(repository.getVerification(buyer)).resolves.toMatchObject({ reviewedBy: 'admin-memory' });
  });

  it('separates a contradictory reason, an unknown record and a decided record', async () => {
    const repository = new InMemoryMarketplaceRepository();
    const verification = repository.registerPendingActor(buyer, 'buyer');

    await expect(repository.reviewVerification(tenantId, verification.id, 'rejected', 'admin')).resolves.toEqual({
      field: 'reason',
      status: 'invalid_state',
    });
    await expect(
      repository.reviewVerification(tenantId, 'memory-verification-404', 'verified', 'admin'),
    ).resolves.toEqual({ status: 'not_found' });
    // Right identifier, wrong tenant: still nothing this reviewer may act on.
    await expect(repository.reviewVerification(otherTenantId, verification.id, 'verified', 'admin')).resolves.toEqual({
      status: 'not_found',
    });
    expectOk(await repository.reviewVerification(tenantId, verification.id, 'verified', 'admin'));
    await expect(repository.reviewVerification(tenantId, verification.id, 'verified', 'admin')).resolves.toEqual({
      field: 'status',
      status: 'conflict',
    });
  });

  it('lists the submissions of one tenant and the organizations it approved', async () => {
    const repository = new InMemoryMarketplaceRepository();
    repository.registerVerifiedActor(buyer, 'buyer');
    repository.registerVerifiedActor({ tenantId: otherTenantId, userId: 'buyer-neighbour' }, 'buyer');
    repository.registerApprovedOrganization(buyer, 'buyer');

    await expect(repository.listVerifications(tenantId)).resolves.toEqual([
      expect.objectContaining({ userId: buyer.userId }),
    ]);
    await expect(repository.isApprovedOrganization(buyer, 'buyer')).resolves.toBe(true);
    await expect(repository.isApprovedOrganization(buyer, 'supplier')).resolves.toBe(false);
  });
});

describe('in-memory marketplace baskets', () => {
  it('gathers one seller into one basket and adds up repeat lines', async () => {
    const repository = createMarket();
    repository.registerProduct(productInput({ name: 'Wheat seed', productId: 'product-wheat' }));

    const first = expectOk(await repository.addToCart(buyer, { productId, quantity: 2 }));
    const again = expectOk(await repository.addToCart(buyer, { productId, quantity: 3 }));
    const second = expectOk(await repository.addToCart(buyer, { productId: 'product-wheat', quantity: 1 }));

    expect(again.id).toBe(first.id);
    expect(second.id).toBe(first.id);
    expect(second.items).toEqual([
      { productId, quantity: 5 },
      { productId: 'product-wheat', quantity: 1 },
    ]);
    await expect(repository.listCarts(buyer)).resolves.toHaveLength(1);
  });

  it('refuses a line that is not a whole quantity, or more than the seller holds', async () => {
    const repository = createMarket({ stockQuantity: 3 });

    await expect(repository.addToCart(buyer, { productId, quantity: 1.5 })).resolves.toEqual({
      field: 'quantity',
      status: 'invalid_state',
    });
    await expect(repository.addToCart(buyer, { productId, quantity: 0 })).resolves.toEqual({
      field: 'quantity',
      status: 'invalid_state',
    });
    await expect(repository.addToCart(buyer, { productId, quantity: 4 })).resolves.toEqual({
      field: 'stockQuantity',
      status: 'conflict',
    });
    await expect(repository.addToCart(buyer, { productId: 'product-404', quantity: 1 })).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });

    // Two acceptable lines that together outrun the stock are still a conflict.
    expectOk(await repository.addToCart(buyer, { productId, quantity: 2 }));
    await expect(repository.addToCart(buyer, { productId, quantity: 2 })).resolves.toEqual({
      field: 'stockQuantity',
      status: 'conflict',
    });
  });

  it('hands each account its own basket and hides the baskets of others', async () => {
    const repository = createMarket();
    const cart = expectOk(await repository.addToCart(buyer, { productId, quantity: 1 }));

    await expect(repository.getCart(buyer, cart.id)).resolves.toMatchObject({ id: cart.id });
    await expect(repository.getCart(secondBuyer, cart.id)).resolves.toBeUndefined();
    await expect(
      repository.getCart({ tenantId: otherTenantId, userId: buyer.userId }, cart.id),
    ).resolves.toBeUndefined();
    await expect(repository.getCart(buyer, 'memory-cart-404')).resolves.toBeUndefined();
    await expect(repository.listCarts(secondBuyer)).resolves.toEqual([]);
  });

  it('changes a line, drops it at zero and keeps the basket usable', async () => {
    const repository = createMarket({ stockQuantity: 6 });
    const cart = expectOk(await repository.addToCart(buyer, { productId, quantity: 2 }));

    const raised = expectOk(await repository.updateCartItem(buyer, cart.id, productId, 5));
    expect(raised.items).toEqual([{ productId, quantity: 5 }]);

    await expect(repository.updateCartItem(buyer, cart.id, productId, 7)).resolves.toEqual({
      field: 'stockQuantity',
      status: 'conflict',
    });
    await expect(repository.updateCartItem(buyer, cart.id, 'product-404', 1)).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });
    await expect(repository.updateCartItem(secondBuyer, cart.id, productId, 1)).resolves.toEqual({
      status: 'not_found',
    });
    await expect(
      repository.updateCartItem({ tenantId: otherTenantId, userId: buyer.userId }, cart.id, productId, 1),
    ).resolves.toEqual({ status: 'not_found' });
    await expect(repository.updateCartItem(buyer, 'memory-cart-404', productId, 1)).resolves.toEqual({
      status: 'not_found',
    });

    const emptied = expectOk(await repository.removeCartItem(buyer, cart.id, productId));
    expect(emptied.items).toEqual([]);
  });

  it('closes a basket that became an order to further edits', async () => {
    const repository = createMarket();
    const order = await checkout(repository, 1);

    await expect(repository.updateCartItem(buyer, order.cartId, productId, 2)).resolves.toEqual({
      status: 'not_found',
    });
    await expect(repository.checkoutCart(buyer, order.cartId, { deliveryTerms: 'pickup' })).resolves.toEqual({
      status: 'not_found',
    });
  });
});

describe('in-memory marketplace checkout', () => {
  it('turns a basket into a draft contract that quotes every line', async () => {
    const repository = createMarket({ stockQuantity: 5, unitPriceUzs: 1_500_000 });
    const order = await checkout(repository, 2, 'seller_delivery');
    const contract = (await repository.listContracts(buyer))[0];

    expect(contract).toMatchObject({
      amountUzs: 3_000_000,
      deliveryTerms: 'seller_delivery',
      id: order.contractId,
      sourceId: order.cartId,
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: 'Corn seed',
    });
    // Seller delivery leaves the price open until the seller quotes it.
    expect(contract?.deliveryPriceUzs).toBeUndefined();
    expect(contract?.lines).toEqual([
      { lineTotalUzs: 3_000_000, name: 'Corn seed', productId, quantity: 2, unit: 't', unitPriceUzs: 1_500_000 },
    ]);
  });

  it('prices collection at nothing and needs no quote', async () => {
    const repository = createMarket();
    const order = await checkout(repository, 1);
    const contract = (await repository.listContracts(buyer))[0];

    expect(contract).toMatchObject({ deliveryPriceUzs: 0, deliveryTerms: 'pickup', id: order.contractId });
  });

  it('refuses to order an empty basket or a basket nobody owns', async () => {
    const repository = createMarket({ stockQuantity: 2 });
    const cart = expectOk(await repository.addToCart(buyer, { productId, quantity: 1 }));
    expectOk(await repository.removeCartItem(buyer, cart.id, productId));

    await expect(repository.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' })).resolves.toEqual({
      field: 'items',
      status: 'invalid_state',
    });
    await expect(repository.checkoutCart(buyer, 'memory-cart-404', { deliveryTerms: 'pickup' })).resolves.toEqual({
      status: 'not_found',
    });
  });

  it('will not bill two accounts through one basket', async () => {
    const repository = createMarket();
    // One organization, two people behind it: nobody can be named as the seller.
    repository.registerProduct(
      productInput({ name: 'Barley seed', productId: 'product-barley', sellerUserId: 'other-seller-memory' }),
    );
    const cart = expectOk(await repository.addToCart(buyer, { productId, quantity: 1 }));
    expectOk(await repository.addToCart(buyer, { productId: 'product-barley', quantity: 1 }));

    await expect(repository.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' })).resolves.toEqual({
      field: 'sellerId',
      status: 'forbidden',
    });
  });

  it('will not bill through an account that cannot sell', async () => {
    const repository = new InMemoryMarketplaceRepository();
    repository.registerVerifiedActor(buyer, 'buyer');
    repository.registerApprovedOrganization(buyer, 'buyer');
    // Verified, but as a buyer, so this account may not take orders.
    repository.registerVerifiedActor(seller, 'buyer');
    repository.registerApprovedOrganization(seller, 'supplier');
    repository.registerProduct(productInput());
    const cart = expectOk(await repository.addToCart(buyer, { productId, quantity: 1 }));

    await expect(repository.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' })).resolves.toEqual({
      field: 'sellerId',
      status: 'forbidden',
    });
  });

  it('stops a checkout whose stock went to another buyer first', async () => {
    const repository = createMarket({ stockQuantity: 6 });
    const mine = expectOk(await repository.addToCart(buyer, { productId, quantity: 5 }));
    const theirs = await checkout(repository, 5, 'pickup', secondBuyer);
    await signBoth(repository, theirs.contractId, secondBuyer);

    await expect(repository.checkoutCart(buyer, mine.id, { deliveryTerms: 'pickup' })).resolves.toEqual({
      field: 'stockQuantity',
      status: 'conflict',
    });
  });

  it('treats a basket of sold-out stock as a basket of missing products', async () => {
    const repository = createMarket({ stockQuantity: 4 });
    const mine = expectOk(await repository.addToCart(buyer, { productId, quantity: 1 }));
    const theirs = await checkout(repository, 4, 'pickup', secondBuyer);
    await signBoth(repository, theirs.contractId, secondBuyer);

    await expect(repository.checkoutCart(buyer, mine.id, { deliveryTerms: 'pickup' })).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });
    await expect(repository.updateCartItem(buyer, mine.id, productId, 1)).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });
    await expect(repository.addToCart(buyer, { productId, quantity: 1 })).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });
  });
});

describe('in-memory marketplace requests and offers', () => {
  it('shows a tenant its own requests, its members theirs, and filters by status', async () => {
    const repository = createMarket();
    const mine = expectOk(
      await repository.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed', volume: '20 t' }),
    );
    expectOk(
      await repository.createRequest(
        { tenantId: otherTenantId, userId: 'buyer-neighbour' },
        { region: 'Bukhara', title: 'Barley' },
      ),
    );

    await expect(repository.listRequests(tenantId)).resolves.toEqual([expect.objectContaining({ id: mine.id })]);
    await expect(repository.listRequests(tenantId, 'all')).resolves.toHaveLength(1);
    await expect(repository.listRequests(tenantId, 'open')).resolves.toHaveLength(1);
    await expect(repository.listRequests(tenantId, 'closed')).resolves.toEqual([]);
    await expect(repository.listMyRequests(buyer)).resolves.toHaveLength(1);
    await expect(repository.listMyRequests(secondBuyer)).resolves.toEqual([]);
  });

  it('collects offers on an open request and shows them to its author alone', async () => {
    const repository = createMarket();
    const request = expectOk(await repository.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed' }));

    const first = expectOk(await repository.makeOffer(seller, request.id, 4_000_000, 'pickup'));
    const second = expectOk(
      await repository.makeOffer(bystander, request.id, 3_500_000, 'seller_delivery', 200_000, 'Own lorry', 3),
    );

    expect(first.status).toBe('pending');
    expect(second).toMatchObject({ deliveryDays: 3, deliveryNote: 'Own lorry', deliveryPriceUzs: 200_000 });
    await expect(repository.listMyRequests(buyer)).resolves.toEqual([expect.objectContaining({ status: 'offering' })]);
    expect(expectOk(await repository.listOffers(buyer, request.id))).toHaveLength(2);
    await expect(repository.listOffers(seller, request.id)).resolves.toEqual({ status: 'not_found' });
    await expect(repository.listOffers(buyer, 'memory-request-404')).resolves.toEqual({ status: 'not_found' });
  });

  it('checks the money and the delivery terms of an offer before recording it', async () => {
    const repository = createMarket();
    const request = expectOk(await repository.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed' }));

    await expect(repository.makeOffer(seller, request.id, 0, 'pickup')).resolves.toEqual({
      field: 'priceUzs',
      status: 'invalid_state',
    });
    await expect(repository.makeOffer(seller, request.id, 1, 'seller_delivery')).resolves.toEqual({
      field: 'deliveryPriceUzs',
      status: 'invalid_state',
    });
    await expect(repository.makeOffer(seller, request.id, 1, 'seller_delivery', 0)).resolves.toEqual({
      field: 'deliveryPriceUzs',
      status: 'invalid_state',
    });
    // Collection and by-agreement terms carry no delivery price to charge.
    await expect(repository.makeOffer(seller, request.id, 1, 'by_agreement', 100)).resolves.toEqual({
      field: 'deliveryPriceUzs',
      status: 'invalid_state',
    });
    await expect(repository.makeOffer(seller, request.id, 1, 'pickup', undefined, undefined, 0)).resolves.toEqual({
      field: 'deliveryDays',
      status: 'invalid_state',
    });
  });

  it('keeps offers off unknown, foreign, closed and own requests', async () => {
    const repository = createMarket();
    const request = expectOk(await repository.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed' }));

    await expect(repository.makeOffer(seller, 'memory-request-404', 1, 'pickup')).resolves.toEqual({
      status: 'not_found',
    });
    await expect(
      repository.makeOffer({ tenantId: otherTenantId, userId: seller.userId }, request.id, 1, 'pickup'),
    ).resolves.toEqual({ status: 'not_found' });
    await expect(repository.makeOffer(buyer, request.id, 1, 'pickup')).resolves.toEqual({
      field: 'buyerUserId',
      status: 'forbidden',
    });

    const offer = expectOk(await repository.makeOffer(seller, request.id, 4_000_000, 'pickup'));
    expectOk(await repository.chooseOffer(buyer, request.id, offer.id));
    await expect(repository.makeOffer(bystander, request.id, 1, 'pickup')).resolves.toEqual({
      status: 'invalid_state',
    });
  });

  it('accepts one offer, declines the rest and drafts the contract', async () => {
    const repository = createMarket();
    repository.registerVerifiedActor(bystander, 'farmer');
    repository.registerApprovedOrganization(bystander, 'supplier');
    const request = expectOk(
      await repository.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed', volume: '20 t' }),
    );
    const chosen = expectOk(await repository.makeOffer(seller, request.id, 4_000_000, 'pickup'));
    const passed = expectOk(await repository.makeOffer(bystander, request.id, 4_500_000, 'pickup'));
    // A pending offer on somebody else's request, which this decision must not touch.
    const elsewhere = expectOk(await repository.createRequest(secondBuyer, { region: 'Xorazm', title: 'Onion' }));
    const untouched = expectOk(await repository.makeOffer(seller, elsewhere.id, 2_000_000, 'pickup'));

    const selection = expectOk(await repository.chooseOffer(buyer, request.id, chosen.id));

    expect(selection).toMatchObject({ offerId: chosen.id, requestId: request.id, sellerUserId: seller.userId });
    const offers = expectOk(await repository.listOffers(buyer, request.id));
    expect(offers.find((offer) => offer.id === chosen.id)?.status).toBe('accepted');
    expect(offers.find((offer) => offer.id === passed.id)?.status).toBe('declined');
    const elsewhereOffers = expectOk(await repository.listOffers(secondBuyer, elsewhere.id));
    expect(elsewhereOffers.find((offer) => offer.id === untouched.id)?.status).toBe('pending');
    await expect(repository.listContracts(buyer)).resolves.toEqual([
      expect.objectContaining({
        amountUzs: 4_000_000,
        id: selection.contractId,
        lines: [],
        subject: 'Corn seed — 20 t',
      }),
    ]);
  });

  it('refuses a selection nobody may make', async () => {
    const repository = createMarket();
    const request = expectOk(await repository.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed' }));

    // No offers yet, so there is nothing to select and the request stays open.
    await expect(repository.chooseOffer(buyer, request.id, 'memory-offer-404')).resolves.toEqual({
      field: 'status',
      status: 'conflict',
    });
    const offer = expectOk(await repository.makeOffer(seller, request.id, 4_000_000, 'pickup'));
    await expect(repository.chooseOffer(seller, request.id, offer.id)).resolves.toEqual({ status: 'not_found' });
    await expect(
      repository.chooseOffer({ tenantId: otherTenantId, userId: buyer.userId }, request.id, offer.id),
    ).resolves.toEqual({ status: 'not_found' });
    await expect(repository.chooseOffer(buyer, request.id, 'memory-offer-404')).resolves.toEqual({
      field: 'offerId',
      status: 'not_found',
    });

    const other = expectOk(await repository.createRequest(buyer, { region: 'Bukhara', title: 'Barley' }));
    const otherOffer = expectOk(await repository.makeOffer(seller, other.id, 1_000_000, 'pickup'));
    await expect(repository.chooseOffer(buyer, request.id, otherOffer.id)).resolves.toEqual({
      field: 'offerId',
      status: 'not_found',
    });
  });

  it('will not select an offer from an account that lost its clearance to sell', async () => {
    const repository = new InMemoryMarketplaceRepository();
    repository.registerVerifiedActor(buyer, 'buyer');
    repository.registerApprovedOrganization(buyer, 'buyer');
    repository.registerVerifiedActor(seller, 'seller');
    const request = expectOk(await repository.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed' }));
    const offer = expectOk(await repository.makeOffer(seller, request.id, 4_000_000, 'pickup'));

    // The offer stands, but the organization behind it is not approved to supply.
    await expect(repository.chooseOffer(buyer, request.id, offer.id)).resolves.toEqual({
      field: 'sellerUserId',
      status: 'forbidden',
    });
  });
});

describe('in-memory marketplace contracts', () => {
  it('lets the seller quote delivery once, before anybody signs', async () => {
    const repository = createMarket();
    const order = await checkout(repository, 1, 'seller_delivery');

    const quoted = expectOk(
      await repository.updateContractDeliveryQuote(seller, order.contractId, {
        deliveryDays: 2,
        deliveryNote: 'Morning run',
        deliveryPriceUzs: 250_000,
      }),
    );

    expect(quoted).toMatchObject({ deliveryDays: 2, deliveryNote: 'Morning run', deliveryPriceUzs: 250_000 });
    // A second quote would move the price after the buyer read it.
    await expect(
      repository.updateContractDeliveryQuote(seller, order.contractId, { deliveryPriceUzs: 400_000 }),
    ).resolves.toEqual({ field: 'deliveryPriceUzs', status: 'invalid_state' });
  });

  it('refuses a quote that nobody asked for or that quotes nothing', async () => {
    const repository = createMarket();
    const collected = await checkout(repository, 1);
    const delivered = await checkout(repository, 1, 'seller_delivery', secondBuyer);

    await expect(
      repository.updateContractDeliveryQuote(seller, collected.contractId, { deliveryPriceUzs: 250_000 }),
    ).resolves.toEqual({ field: 'deliveryPriceUzs', status: 'invalid_state' });
    await expect(
      repository.updateContractDeliveryQuote(seller, delivered.contractId, { deliveryPriceUzs: 0 }),
    ).resolves.toEqual({ field: 'deliveryPriceUzs', status: 'invalid_state' });
    await expect(
      repository.updateContractDeliveryQuote(seller, delivered.contractId, { deliveryDays: 0, deliveryPriceUzs: 1 }),
    ).resolves.toEqual({ field: 'deliveryPriceUzs', status: 'invalid_state' });
    await expect(
      repository.updateContractDeliveryQuote(buyer, delivered.contractId, { deliveryPriceUzs: 250_000 }),
    ).resolves.toEqual({ field: 'sellerUserId', status: 'forbidden' });
    await expect(
      repository.updateContractDeliveryQuote(seller, 'memory-contract-404', { deliveryPriceUzs: 250_000 }),
    ).resolves.toEqual({ status: 'not_found' });
    await expect(
      repository.updateContractDeliveryQuote({ tenantId: otherTenantId, userId: seller.userId }, delivered.contractId, {
        deliveryPriceUzs: 250_000,
      }),
    ).resolves.toEqual({ status: 'not_found' });
  });

  it('will not quote delivery on a contract that came from a chosen offer', async () => {
    const repository = createMarket();
    const request = expectOk(await repository.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed' }));
    const offer = expectOk(await repository.makeOffer(seller, request.id, 4_000_000, 'seller_delivery', 100_000));
    const selection = expectOk(await repository.chooseOffer(buyer, request.id, offer.id));

    // The offer already priced its own delivery; re-quoting would rewrite the deal.
    await expect(
      repository.updateContractDeliveryQuote(seller, selection.contractId, { deliveryPriceUzs: 250_000 }),
    ).resolves.toEqual({ field: 'deliveryPriceUzs', status: 'invalid_state' });
  });

  it('needs a delivery price before either party can sign', async () => {
    const repository = createMarket();
    const order = await checkout(repository, 1, 'seller_delivery');

    await expect(repository.signContract(buyer, order.contractId)).resolves.toEqual({
      field: 'deliveryPriceUzs',
      status: 'invalid_state',
    });

    expectOk(await repository.updateContractDeliveryQuote(seller, order.contractId, { deliveryPriceUzs: 250_000 }));
    expect(expectOk(await repository.signContract(buyer, order.contractId)).status).toBe('signed');
  });

  it('activates a contract on the second signature and moves the stock', async () => {
    const repository = createMarket({ stockQuantity: 4 });
    const order = await checkout(repository, 3);

    const signed = expectOk(await repository.signContract(seller, order.contractId));
    expect(signed).toMatchObject({ sellerSignedAt: expect.any(Date), status: 'signed' });
    expect(signed.signedAt).toBeUndefined();
    // The same party signing again changes nothing.
    expect(expectOk(await repository.signContract(seller, order.contractId)).status).toBe('signed');

    const active = expectOk(await repository.signContract(buyer, order.contractId));
    expect(active).toMatchObject({ buyerSignedAt: expect.any(Date), signedAt: expect.any(Date), status: 'active' });
    // Signing an active contract is a no-op that still answers with the contract.
    expect(expectOk(await repository.signContract(buyer, order.contractId)).status).toBe('active');

    const remaining = expectOk(await repository.addToCart(secondBuyer, { productId, quantity: 1 }));
    expect(remaining.items).toEqual([{ productId, quantity: 1 }]);
    await expect(repository.addToCart(secondBuyer, { productId, quantity: 1 })).resolves.toEqual({
      field: 'stockQuantity',
      status: 'conflict',
    });
  });

  it('refuses a signature from an account that is not a party or not approved', async () => {
    const repository = createMarket();
    const order = await checkout(repository, 1);

    await expect(repository.signContract(bystander, order.contractId)).resolves.toEqual({ status: 'forbidden' });
    await expect(repository.signContract(buyer, 'memory-contract-404')).resolves.toEqual({ status: 'not_found' });
    await expect(
      repository.signContract({ tenantId: otherTenantId, userId: buyer.userId }, order.contractId),
    ).resolves.toEqual({ status: 'not_found' });
  });

  it('refuses a signature from a party whose own organization is not approved', async () => {
    const repository = new InMemoryMarketplaceRepository();
    // Both accounts are verified, but only the supplier organization is approved,
    // which the buyer only finds out at the signature.
    repository.registerVerifiedActor(buyer, 'buyer');
    repository.registerVerifiedActor(seller, 'seller');
    repository.registerApprovedOrganization(seller, 'supplier');
    repository.registerProduct(productInput());
    const order = await checkout(repository, 1);

    await expect(repository.signContract(buyer, order.contractId)).resolves.toEqual({
      field: 'organization',
      status: 'forbidden',
    });
    expect(expectOk(await repository.signContract(seller, order.contractId)).status).toBe('signed');
  });

  it('refuses a contract where one account is both parties', async () => {
    const repository = new InMemoryMarketplaceRepository();
    // A farmer may buy and sell, which is the only way both sides can be one account.
    repository.registerVerifiedActor(buyer, 'farmer');
    repository.registerApprovedOrganization(buyer, 'buyer');
    repository.registerApprovedOrganization(buyer, 'supplier');
    repository.registerProduct(productInput({ sellerUserId: buyer.userId }));
    const order = await checkout(repository, 1);

    await expect(repository.signContract(buyer, order.contractId)).resolves.toEqual({
      field: 'parties',
      status: 'invalid_state',
    });
  });

  it('stops the second signature when the stock is already gone', async () => {
    const repository = createMarket({ stockQuantity: 5 });
    const mine = await checkout(repository, 4);
    const theirs = await checkout(repository, 4, 'pickup', secondBuyer);

    await signBoth(repository, theirs.contractId, secondBuyer);
    expectOk(await repository.signContract(buyer, mine.contractId));

    await expect(repository.signContract(seller, mine.contractId)).resolves.toEqual({
      field: 'stockQuantity',
      status: 'conflict',
    });
    // The contract stays open for a renegotiation instead of half-completing.
    await expect(repository.listContracts(seller)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: mine.contractId, status: 'signed' })]),
    );
  });

  it('shows a contract to both parties, to their tenant, and to nobody else', async () => {
    const repository = createMarket();
    const order = await checkout(repository, 1);

    await expect(repository.listContracts(buyer)).resolves.toHaveLength(1);
    await expect(repository.listContracts(seller)).resolves.toHaveLength(1);
    await expect(repository.listContracts(bystander)).resolves.toEqual([]);
    await expect(repository.listTenantContracts(tenantId)).resolves.toEqual([
      expect.objectContaining({ id: order.contractId }),
    ]);
    await expect(repository.listTenantContracts(otherTenantId)).resolves.toEqual([]);
  });
});

describe('in-memory marketplace surfaces without a durable provider', () => {
  it('reports samples, favourites, reviews and advice as unavailable instead of pretending', async () => {
    // Read through the repository contract, so the stubs answer in the shapes a
    // durable provider would return rather than in shapes only this class knows.
    const repository: MarketplaceRepository = createMarket();

    await expect(repository.requestSample(buyer, productId)).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });
    await expect(repository.listSamples(buyer)).resolves.toEqual([]);
    await expect(repository.sampleUsageThisMonth(buyer)).resolves.toBe(0);
    await expect(repository.addFavorite(buyer, productId)).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });
    await expect(repository.removeFavorite(buyer, productId)).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });
    await expect(repository.listFavorites(buyer)).resolves.toEqual([]);
    await expect(repository.addReview(buyer, productId, 5, 'Good')).resolves.toEqual({
      field: 'productId',
      status: 'not_found',
    });
    await expect(repository.listProductReviews(tenantId, productId)).resolves.toEqual([]);
    await expect(repository.askAi(buyer, 'generic', 'What should I sow?')).resolves.toEqual({
      status: 'invalid_state',
    });
    await expect(repository.listAiConsultations(buyer)).resolves.toEqual([]);
  });
});
