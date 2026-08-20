// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { describe, expect, it, vi } from 'vitest';
import { ResourceNotFoundException } from '@app/backend-common-exception';
import type { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import { MarketplaceInMemoryAdapter } from './marketplace.in-memory-adapter';

const buyer = { tenantId: 'tenant-buyer', userId: 'buyer-user' };
const seller = { tenantId: 'tenant-seller', userId: 'seller-user' };
const buyerPartnerId = 'buyer-partner';
const sellerPartnerId = 'seller-partner';

type ProbeResult = { field?: string; status: string; value?: unknown };
type StoredRecord = Record<string, unknown>;

interface RepositoryProbe {
  approvedOrganizations: Set<string>;
  carts: Map<string, StoredRecord>;
  contracts: Map<string, StoredRecord>;
  listingPublications: Map<string, StoredRecord>;
  memberships: Map<string, StoredRecord>;
  offers: Map<string, StoredRecord>;
  operationReceipts: Map<string, StoredRecord>;
  organizations: Map<string, StoredRecord>;
  products: Map<string, StoredRecord>;
  requestPublications: Map<string, StoredRecord>;
  requests: Map<string, StoredRecord>;
  verifications: Map<string, StoredRecord>;
  activePartnerFor(owner: AgriTechOwner, capability: 'buyer' | 'seller'): string | undefined;
  addToCart(owner: AgriTechOwner, input: StoredRecord, idempotencyKey: string): Promise<ProbeResult>;
  authorizedOrganization(
    owner: AgriTechOwner,
    partnerId: string,
    capability: 'buyer' | 'seller',
  ): StoredRecord | undefined;
  checkoutCart(owner: AgriTechOwner, cartId: string, input: StoredRecord, idempotencyKey: string): Promise<ProbeResult>;
  chooseOffer(owner: AgriTechOwner, requestPublicId: string, offerId: string, key: string): Promise<ProbeResult>;
  createRequest(owner: AgriTechOwner, input: StoredRecord, idempotencyKey: string): Promise<ProbeResult>;
  executeIdempotent<T>(
    owner: AgriTechOwner,
    operation: string,
    resourceKey: string,
    idempotencyKey: string,
    input: unknown,
    mutate: () => ProbeResult,
  ): ProbeResult;
  getCart(owner: AgriTechOwner, cartId: string): Promise<unknown>;
  getVerification(owner: AgriTechOwner): Promise<unknown>;
  isActiveMember(owner: AgriTechOwner, partnerId: string, capability: 'buyer' | 'seller'): boolean;
  isApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): Promise<boolean>;
  listCarts(owner: AgriTechOwner): Promise<unknown[]>;
  listContracts(owner: AgriTechOwner): Promise<unknown[]>;
  listMyRequests(owner: AgriTechOwner): Promise<unknown[]>;
  listOffers(owner: AgriTechOwner, requestPublicId: string): Promise<ProbeResult>;
  listRequests(tenantId: string, status?: string): Promise<unknown[]>;
  listTenantContracts(tenantId: string): Promise<unknown[]>;
  listVerifications(tenantId: string): Promise<unknown[]>;
  makeOffer(owner: AgriTechOwner, requestPublicId: string, input: StoredRecord, key: string): Promise<ProbeResult>;
  mutateCartItem(owner: AgriTechOwner, cartId: string, listingPublicationId: string, quantity: number): ProbeResult;
  registerPartnerMembership(owner: AgriTechOwner, partnerId: string, capability: 'buyer' | 'seller'): void;
  registerProduct(input: StoredRecord): string;
  requestPublicIdFor(requestId: string): string | undefined;
  resolveListing(listingPublicationId: string): StoredRecord | undefined;
  reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    expectedRevision: number,
    idempotencyKey: string,
    reason?: string,
  ): Promise<ProbeResult>;
  roleFor(tenantId: string, userId: string): string | undefined;
  updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: StoredRecord,
    idempotencyKey: string,
  ): Promise<ProbeResult>;
}

function probe(adapter: MarketplaceInMemoryAdapter): RepositoryProbe {
  return (adapter as unknown as { repository: RepositoryProbe }).repository;
}

function commerce() {
  const adapter = new MarketplaceInMemoryAdapter();
  adapter.registerVerifiedActor(buyer, 'buyer');
  adapter.registerApprovedOrganization(buyer, 'buyer', buyerPartnerId);
  adapter.registerVerifiedActor(seller, 'seller');
  adapter.registerApprovedOrganization(seller, 'supplier', sellerPartnerId);
  const listingPublicationId = adapter.registerProduct({
    tenantId: seller.tenantId,
    productId: 'product-1',
    sellerId: 'public-seller',
    sellerUserId: seller.userId,
    name: 'Corn seed',
    unit: 't',
    unitPriceUzs: 1_000,
    stockQuantity: 5,
  });
  return { adapter, listingPublicationId, repository: probe(adapter) };
}

async function createRequestAndOffer() {
  const value = commerce();
  const request = await value.adapter.createRequest(
    buyer,
    { actingPartnerId: buyerPartnerId, region: 'Samarkand', title: 'Corn', volume: '2 t' },
    'request-create-key',
  );
  const requestPublicId = value.adapter.findRequestPublicationId(request.id)!;
  const offer = await value.adapter.makeOffer(
    seller,
    requestPublicId,
    { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 2_000 },
    'offer-create-key',
  );
  return { ...value, offer, request, requestPublicId };
}

describe('MarketplaceInMemoryAdapter defensive branch contract', () => {
  it('covers public delegation, validation, authorization, idempotency, and corrupt-state fail-closed paths', async () => {
    const registration = new MarketplaceInMemoryAdapter();
    const registrationRepository = probe(registration);
    registration.registerVerifiedActor(buyer, 'buyer');
    const defaultBuyerPartner = registration.registerApprovedOrganization(buyer, 'buyer');
    expect(defaultBuyerPartner).toContain('buyer-');
    registration.setOrganizationStatus('missing-partner', 'suspended');
    registration.revokePartnerMembership(buyer, 'missing-partner', 'buyer');
    expect(() => {
      registration.registerPartnerMembership(buyer, 'missing-partner', 'buyer');
    }).toThrow();
    registrationRepository.organizations.set('foreign-partner', {
      kind: 'buyer',
      legalName: 'Foreign',
      ownerUserId: buyer.userId,
      partnerId: 'foreign-partner',
      region: 'R',
      status: 'approved',
      tenantId: 'foreign-tenant',
    });
    expect(() => {
      registration.registerPartnerMembership(buyer, 'foreign-partner', 'buyer');
    }).toThrow();
    expect(() => {
      registration.registerPartnerMembership(buyer, defaultBuyerPartner, 'seller');
    }).toThrow();
    registration.registerVerifiedActor(seller, 'seller');
    const defaultSellerPartner = registration.registerApprovedOrganization(seller, 'supplier');
    expect(() => {
      registration.registerPartnerMembership(seller, defaultSellerPartner, 'buyer');
    }).toThrow();
    registration.registerPartnerMembership(seller, defaultSellerPartner, 'seller');
    registration.revokePartnerMembership(seller, defaultSellerPartner, 'seller');
    registration.registerPartnerMembership(seller, defaultSellerPartner, 'seller');
    registration.setOrganizationStatus(defaultSellerPartner, 'suspended');
    expect(() =>
      registration.registerProduct({
        tenantId: seller.tenantId,
        productId: 'suspended-product',
        sellerId: 'seller',
        sellerPartnerId: defaultSellerPartner,
        sellerUserId: seller.userId,
        name: 'Seed',
        unit: 'kg',
        unitPriceUzs: 1,
        stockQuantity: 1,
      }),
    ).toThrow();
    registration.setOrganizationStatus(defaultSellerPartner, 'approved');
    expect(() =>
      registration.registerProduct({
        tenantId: seller.tenantId,
        productId: 'zero-stock',
        sellerId: 'seller',
        sellerUserId: seller.userId,
        name: 'Seed',
        unit: 'kg',
        unitPriceUzs: 1,
        stockQuantity: 0,
      }),
    ).toThrow();
    expect(() =>
      registration.registerProduct({
        tenantId: seller.tenantId,
        productId: 'zero-price',
        sellerId: 'seller',
        sellerUserId: seller.userId,
        name: 'Seed',
        unit: 'kg',
        unitPriceUzs: 0,
        stockQuantity: 1,
      }),
    ).toThrow();
    registrationRepository.organizations.delete(defaultSellerPartner);
    expect(() =>
      registration.registerProduct({
        tenantId: seller.tenantId,
        productId: 'missing-organization',
        sellerId: 'seller',
        sellerPartnerId: defaultSellerPartner,
        sellerUserId: seller.userId,
        name: 'Seed',
        unit: 'kg',
        unitPriceUzs: 1,
        stockQuantity: 1,
      }),
    ).toThrow();

    const verificationAdapter = new MarketplaceInMemoryAdapter();
    const verificationRepository = probe(verificationAdapter);
    const verification = verificationAdapter.registerVerifiedActor(buyer, 'buyer');
    const storedVerification = [...verificationRepository.verifications.values()][0]!;
    storedVerification['documents'] = [{ kind: 'identity' }];
    storedVerification['status'] = 'pending';
    storedVerification['version'] = 2;
    expect(await verificationRepository.getVerification(buyer)).toMatchObject({ status: 'pending' });
    expect(await verificationRepository.getVerification({ ...buyer, userId: 'missing' })).toBeUndefined();
    expect(await verificationRepository.isApprovedOrganization(buyer, 'buyer')).toBe(false);
    await expect(
      verificationRepository.reviewVerification(
        buyer.tenantId,
        verification.id,
        'rejected',
        'reviewer',
        2,
        'verification-review-key',
      ),
    ).resolves.toMatchObject({ status: 'invalid_state' });
    await expect(
      verificationRepository.reviewVerification(
        buyer.tenantId,
        'missing-verification',
        'verified',
        'reviewer',
        2,
        'verification-missing-key',
      ),
    ).resolves.toMatchObject({ status: 'not_found' });
    await expect(
      verificationRepository.reviewVerification(
        buyer.tenantId,
        verification.id,
        'verified',
        'reviewer',
        1,
        'verification-revision-key',
      ),
    ).resolves.toMatchObject({ field: 'expectedRevision', status: 'conflict' });
    await expect(
      verificationRepository.reviewVerification(
        buyer.tenantId,
        verification.id,
        'rejected',
        'reviewer',
        2,
        'verification-success-key',
        'criteria_not_met',
      ),
    ).resolves.toMatchObject({
      status: 'ok',
      value: { rejectionReason: 'criteria_not_met', reviewedAt: expect.any(Date) },
    });
    await expect(
      verificationRepository.reviewVerification(
        buyer.tenantId,
        verification.id,
        'rejected',
        'reviewer',
        3,
        'verification-status-key',
        'criteria_not_met',
      ),
    ).resolves.toMatchObject({ field: 'status', status: 'conflict' });
    expect(await verificationRepository.listVerifications(buyer.tenantId)).toHaveLength(1);
    expect(await verificationRepository.listVerifications('other-tenant')).toEqual([]);
    await expect(
      verificationAdapter.reviewVerification(
        buyer.tenantId,
        verification.id,
        'rejected',
        'reviewer',
        3,
        'verification-public-key',
        'criteria_not_met',
      ),
    ).rejects.toThrow();

    const cartFixture = commerce();
    const cart = await cartFixture.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: cartFixture.listingPublicationId, quantity: 1 },
      'cart-create-key',
    );
    await expect(cartFixture.adapter.listCarts(buyer)).resolves.toHaveLength(1);
    await expect(cartFixture.adapter.getCart(buyer, cart.id)).resolves.toMatchObject({ id: cart.id });
    await expect(cartFixture.adapter.getCart({ ...buyer, userId: 'foreign-user' }, cart.id)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(
      cartFixture.adapter.updateCartItem(buyer, cart.id, cartFixture.listingPublicationId, 2, 'cart-update-key'),
    ).resolves.toMatchObject({ items: [{ quantity: 2 }] });
    await expect(
      cartFixture.adapter.removeCartItem(buyer, cart.id, cartFixture.listingPublicationId, 'cart-remove-key'),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      cartFixture.repository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: 'missing-listing', quantity: 1 },
        'cart-missing-listing-key',
      ),
    ).resolves.toMatchObject({ field: 'listingPublicationId', status: 'not_found' });
    await expect(
      cartFixture.repository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: cartFixture.listingPublicationId, quantity: 1.5 },
        'cart-fractional-key',
      ),
    ).resolves.toMatchObject({ field: 'quantity', status: 'invalid_state' });
    await expect(
      cartFixture.repository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: cartFixture.listingPublicationId, quantity: 0 },
        'cart-zero-key',
      ),
    ).resolves.toMatchObject({ field: 'quantity', status: 'invalid_state' });
    await expect(
      cartFixture.repository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: cartFixture.listingPublicationId, quantity: 6 },
        'cart-stock-key',
      ),
    ).resolves.toMatchObject({ field: 'stockQuantity', status: 'conflict' });
    const sellerOrganization = cartFixture.repository.organizations.get(sellerPartnerId)!;
    cartFixture.repository.organizations.delete(sellerPartnerId);
    await expect(
      cartFixture.repository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: cartFixture.listingPublicationId, quantity: 1 },
        'cart-seller-missing-key',
      ),
    ).resolves.toMatchObject({ status: 'not_found' });
    cartFixture.repository.organizations.set(sellerPartnerId, sellerOrganization);
    await expect(
      cartFixture.repository.addToCart(
        { ...buyer, userId: 'unverified' },
        { actingPartnerId: buyerPartnerId, listingPublicationId: cartFixture.listingPublicationId, quantity: 1 },
        'cart-unverified-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });

    const selfSale = new MarketplaceInMemoryAdapter();
    const selfRepository = probe(selfSale);
    selfSale.registerVerifiedActor(buyer, 'buyer');
    selfSale.registerApprovedOrganization(buyer, 'buyer', buyerPartnerId);
    selfSale.registerVerifiedActor({ ...buyer, userId: 'seller-in-tenant' }, 'seller');
    selfSale.registerApprovedOrganization({ ...buyer, userId: 'seller-in-tenant' }, 'supplier', sellerPartnerId);
    const selfListing = selfSale.registerProduct({
      tenantId: buyer.tenantId,
      productId: 'self-product',
      sellerId: 'seller',
      sellerUserId: 'seller-in-tenant',
      name: 'Seed',
      unit: 'kg',
      unitPriceUzs: 1,
      stockQuantity: 1,
    });
    await expect(
      selfRepository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: selfListing, quantity: 1 },
        'self-sale-key',
      ),
    ).resolves.toMatchObject({ status: 'ok' });
    selfRepository.products.get(`${buyer.tenantId}:self-product`)!['sellerPartnerId'] = buyerPartnerId;
    await expect(
      selfRepository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: selfListing, quantity: 1 },
        'self-sale-partner-key',
      ),
    ).resolves.toMatchObject({ status: 'not_found' });

    const mutation = commerce();
    const mutationCart = await mutation.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: mutation.listingPublicationId, quantity: 1 },
      'mutation-cart-key',
    );
    expect(mutation.repository.mutateCartItem(buyer, 'missing-cart', mutation.listingPublicationId, 1)).toMatchObject({
      status: 'not_found',
    });
    expect(
      mutation.repository.mutateCartItem(
        { ...buyer, tenantId: 'foreign' },
        mutationCart.id,
        mutation.listingPublicationId,
        1,
      ),
    ).toMatchObject({ status: 'not_found' });
    expect(
      mutation.repository.mutateCartItem(
        { ...buyer, userId: 'foreign' },
        mutationCart.id,
        mutation.listingPublicationId,
        1,
      ),
    ).toMatchObject({ status: 'not_found' });
    expect(mutation.repository.mutateCartItem(buyer, mutationCart.id, 'missing-listing', 1)).toMatchObject({
      field: 'listingPublicationId',
      status: 'not_found',
    });
    expect(mutation.repository.mutateCartItem(buyer, mutationCart.id, mutation.listingPublicationId, -1)).toMatchObject(
      {
        field: 'quantity',
        status: 'invalid_state',
      },
    );
    expect(
      mutation.repository.mutateCartItem(buyer, mutationCart.id, mutation.listingPublicationId, 1.5),
    ).toMatchObject({
      field: 'quantity',
      status: 'invalid_state',
    });
    expect(mutation.repository.mutateCartItem(buyer, mutationCart.id, mutation.listingPublicationId, 6)).toMatchObject({
      field: 'stockQuantity',
      status: 'conflict',
    });
    mutation.adapter.revokePartnerMembership(buyer, buyerPartnerId, 'buyer');
    expect(mutation.repository.mutateCartItem(buyer, mutationCart.id, mutation.listingPublicationId, 1)).toMatchObject({
      field: 'organization',
      status: 'forbidden',
    });

    const emptyCheckout = commerce();
    const emptyCart = await emptyCheckout.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: emptyCheckout.listingPublicationId, quantity: 1 },
      'empty-cart-key',
    );
    await emptyCheckout.adapter.removeCartItem(
      buyer,
      emptyCart.id,
      emptyCheckout.listingPublicationId,
      'empty-remove-key',
    );
    await expect(
      emptyCheckout.repository.checkoutCart(buyer, emptyCart.id, { deliveryTerms: 'pickup' }, 'empty-checkout-key'),
    ).resolves.toMatchObject({ field: 'items', status: 'invalid_state' });
    await expect(
      emptyCheckout.repository.checkoutCart(buyer, 'missing-cart', { deliveryTerms: 'pickup' }, 'missing-checkout-key'),
    ).resolves.toMatchObject({ status: 'not_found' });

    const invalidCheckout = commerce();
    const invalidCart = await invalidCheckout.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: invalidCheckout.listingPublicationId, quantity: 1 },
      'invalid-cart-key',
    );
    invalidCheckout.adapter.setOrganizationStatus(sellerPartnerId, 'suspended');
    await expect(
      invalidCheckout.repository.checkoutCart(
        buyer,
        invalidCart.id,
        { deliveryTerms: 'pickup' },
        'invalid-seller-checkout-key',
      ),
    ).resolves.toMatchObject({ field: 'listingPublicationId', status: 'not_found' });

    const requestFixture = await createRequestAndOffer();
    await expect(requestFixture.adapter.findRequest(buyer, requestFixture.request.id)).resolves.toMatchObject({
      id: requestFixture.request.id,
      status: 'offering',
    });
    await expect(requestFixture.adapter.findRequest(buyer, 'missing')).resolves.toBeUndefined();
    await expect(requestFixture.repository.listRequests(buyer.tenantId)).resolves.toHaveLength(1);
    await expect(requestFixture.repository.listRequests(buyer.tenantId, 'all')).resolves.toHaveLength(1);
    await expect(requestFixture.repository.listRequests(buyer.tenantId, 'offering')).resolves.toHaveLength(1);
    await expect(requestFixture.repository.listRequests('foreign')).resolves.toEqual([]);
    await expect(requestFixture.repository.listMyRequests(buyer)).resolves.toHaveLength(1);
    await expect(requestFixture.repository.listMyRequests({ ...buyer, userId: 'foreign' })).resolves.toEqual([]);
    await expect(requestFixture.repository.listOffers(buyer, requestFixture.requestPublicId)).resolves.toMatchObject({
      status: 'ok',
    });
    await expect(requestFixture.repository.listOffers(seller, requestFixture.requestPublicId)).resolves.toMatchObject({
      status: 'not_found',
    });
    await expect(requestFixture.repository.listOffers(buyer, 'missing-publication')).resolves.toMatchObject({
      status: 'not_found',
    });
    await expect(
      requestFixture.repository.makeOffer(
        seller,
        requestFixture.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 0 },
        'offer-zero-price-key',
      ),
    ).resolves.toMatchObject({ field: 'priceUzs', status: 'invalid_state' });
    await expect(
      requestFixture.repository.makeOffer(
        seller,
        requestFixture.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'seller_delivery', priceUzs: 1 },
        'offer-missing-delivery-key',
      ),
    ).resolves.toMatchObject({ field: 'deliveryPriceUzs', status: 'invalid_state' });
    await expect(
      requestFixture.repository.makeOffer(
        seller,
        requestFixture.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryPriceUzs: 0, deliveryTerms: 'seller_delivery', priceUzs: 1 },
        'offer-zero-delivery-key',
      ),
    ).resolves.toMatchObject({ field: 'deliveryPriceUzs', status: 'invalid_state' });
    await expect(
      requestFixture.repository.makeOffer(
        seller,
        requestFixture.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryPriceUzs: 1, deliveryTerms: 'seller_delivery', priceUzs: 1 },
        'offer-valid-delivery-key',
      ),
    ).resolves.toMatchObject({ status: 'ok' });
    await expect(
      requestFixture.repository.makeOffer(
        seller,
        requestFixture.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryPriceUzs: 1, deliveryTerms: 'pickup', priceUzs: 1 },
        'offer-pickup-delivery-key',
      ),
    ).resolves.toMatchObject({ field: 'deliveryPriceUzs', status: 'invalid_state' });
    await expect(
      requestFixture.repository.makeOffer(
        seller,
        requestFixture.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryDays: 0, deliveryTerms: 'pickup', priceUzs: 1 },
        'offer-days-key',
      ),
    ).resolves.toMatchObject({ field: 'deliveryDays', status: 'invalid_state' });
    await expect(
      requestFixture.repository.makeOffer(
        { ...seller, userId: 'unverified' },
        requestFixture.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 1 },
        'offer-unverified-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });

    const secondSeller = { tenantId: 'tenant-second-seller', userId: 'second-seller' };
    const secondPartner = 'second-seller-partner';
    requestFixture.adapter.registerVerifiedActor(secondSeller, 'seller');
    requestFixture.adapter.registerApprovedOrganization(secondSeller, 'supplier', secondPartner);
    await expect(
      requestFixture.repository.makeOffer(
        secondSeller,
        requestFixture.requestPublicId,
        { actingPartnerId: secondPartner, deliveryTerms: 'pickup', priceUzs: 2_100 },
        'offer-second-key',
      ),
    ).resolves.toMatchObject({ status: 'ok' });

    const unrelatedRequest = await requestFixture.adapter.createRequest(
      buyer,
      { actingPartnerId: buyerPartnerId, region: 'Bukhara', title: 'Wheat' },
      'unrelated-request-key',
    );
    const unrelatedRequestPublicId = requestFixture.adapter.findRequestPublicationId(unrelatedRequest.id)!;
    await expect(
      requestFixture.adapter.makeOffer(
        seller,
        unrelatedRequestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 2_200 },
        'unrelated-offer-key',
      ),
    ).resolves.toMatchObject({ status: 'pending' });

    const selection = await requestFixture.adapter.chooseOffer(
      buyer,
      requestFixture.requestPublicId,
      requestFixture.offer.id,
      'offer-select-key',
    );
    await expect(requestFixture.adapter.listContracts(buyer)).resolves.toHaveLength(1);
    await expect(requestFixture.repository.listTenantContracts(buyer.tenantId)).resolves.toHaveLength(1);
    await expect(requestFixture.repository.listTenantContracts('foreign')).resolves.toEqual([]);
    await expect(requestFixture.repository.listContracts({ ...buyer, userId: 'foreign' })).resolves.toEqual([]);
    await expect(
      requestFixture.repository.chooseOffer(
        buyer,
        requestFixture.requestPublicId,
        requestFixture.offer.id,
        'choose-again-key',
      ),
    ).resolves.toMatchObject({ field: 'status', status: 'conflict' });
    // An unknown offer identifier is reported against a request that can still
    // award one. On the request just decided above, the stage refusal comes
    // first and is the honest answer: nothing on a decided request is choosable,
    // whether or not the identifier names a real offer.
    await expect(
      requestFixture.repository.chooseOffer(buyer, unrelatedRequestPublicId, 'missing-offer', 'choose-missing-key'),
    ).resolves.toMatchObject({ field: 'offerId', status: 'not_found' });
    expect(selection.contractId).toBeDefined();

    const quote = commerce();
    const quoteCart = await quote.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: quote.listingPublicationId, quantity: 1 },
      'quote-cart-key',
    );
    const quoteCheckout = await quote.adapter.checkoutCart(
      buyer,
      quoteCart.id,
      { deliveryTerms: 'seller_delivery' },
      'quote-checkout-key',
    );
    await expect(
      quote.adapter.updateContractDeliveryQuote(
        seller,
        quoteCheckout.contractId,
        { deliveryDays: 2, deliveryNote: 'door', deliveryPriceUzs: 100, expectedRevision: 0 },
        'quote-update-key',
      ),
    ).resolves.toMatchObject({ deliveryDays: 2, deliveryPriceUzs: 100, revision: 1 });
    await expect(
      quote.repository.updateContractDeliveryQuote(
        seller,
        'missing-contract',
        { deliveryPriceUzs: 1, expectedRevision: 0 },
        'quote-missing-key',
      ),
    ).resolves.toMatchObject({ status: 'not_found' });
    await expect(
      quote.repository.updateContractDeliveryQuote(
        seller,
        quoteCheckout.contractId,
        { deliveryPriceUzs: 1, expectedRevision: 0 },
        'quote-revision-key',
      ),
    ).resolves.toMatchObject({ field: 'expectedRevision', status: 'conflict' });

    const idempotency = commerce();
    expect(
      idempotency.repository.executeIdempotent(buyer, 'custom', 'resource', 'short', {}, () => ({
        status: 'ok',
        value: 1,
      })),
    ).toMatchObject({ field: 'idempotencyKey', status: 'invalid_state' });
    expect(
      idempotency.repository.executeIdempotent(buyer, 'custom', 'x'.repeat(101), 'long-resource-key', {}, () => ({
        status: 'ok',
        value: 1,
      })),
    ).toMatchObject({ field: 'idempotencyKey', status: 'invalid_state' });
    const arrayResult = idempotency.repository.executeIdempotent(
      buyer,
      'custom',
      'resource',
      'custom-array-key',
      [{ b: 2, a: [1] }],
      () => ({ status: 'ok', value: { nested: true } }),
    );
    expect(arrayResult).toMatchObject({ status: 'ok' });
    expect(
      idempotency.repository.executeIdempotent(
        buyer,
        'custom',
        'resource',
        'custom-array-key',
        [{ a: [1], b: 2 }],
        () => ({ status: 'ok', value: { changed: true } }),
      ),
    ).toEqual(arrayResult);
    expect(
      idempotency.repository.executeIdempotent(
        buyer,
        'custom',
        'resource',
        'custom-array-key',
        [{ a: [2], b: 2 }],
        () => ({ status: 'ok', value: 1 }),
      ),
    ).toMatchObject({ field: 'idempotencyKey', status: 'conflict' });
    expect(
      idempotency.repository.executeIdempotent(buyer, 'custom', 'failed-resource', 'custom-failure-key', null, () => ({
        status: 'not_found',
      })),
    ).toMatchObject({ status: 'not_found' });

    expect(idempotency.repository.activePartnerFor(buyer, 'buyer')).toBe(buyerPartnerId);
    idempotency.adapter.registerApprovedOrganization(buyer, 'buyer', 'second-buyer-partner');
    expect(idempotency.repository.activePartnerFor(buyer, 'buyer')).toBeUndefined();
    expect(idempotency.repository.activePartnerFor({ ...buyer, userId: 'missing' }, 'buyer')).toBeUndefined();

    const membership = idempotency.repository.memberships.values().next().value as StoredRecord;
    expect(idempotency.repository.isActiveMember(buyer, buyerPartnerId, 'buyer')).toBe(true);
    for (const [field, value] of [
      ['tenantId', 'wrong'],
      ['userId', 'wrong'],
      ['partnerId', 'wrong'],
      ['capability', 'seller'],
      ['status', 'revoked'],
    ] as const) {
      const original = membership[field];
      membership[field] = value;
      expect(idempotency.repository.isActiveMember(buyer, buyerPartnerId, 'buyer')).toBe(false);
      membership[field] = original;
    }
    idempotency.repository.memberships.clear();
    expect(idempotency.repository.isActiveMember(buyer, buyerPartnerId, 'buyer')).toBe(false);

    const listing = commerce();
    expect(listing.repository.resolveListing(listing.listingPublicationId)).toBeDefined();
    const publication = listing.repository.listingPublications.get(listing.listingPublicationId)!;
    for (const [field, value] of [
      ['status', 'paused'],
      ['moderationStatus', 'rejected'],
    ] as const) {
      const original = publication[field];
      publication[field] = value;
      expect(listing.repository.resolveListing(listing.listingPublicationId)).toBeUndefined();
      publication[field] = original;
    }
    expect(listing.repository.resolveListing('missing-listing')).toBeUndefined();
    const product = listing.repository.products.values().next().value as StoredRecord;
    for (const [field, value] of [
      ['listingPublicationId', 'different'],
      ['status', 'out_of_stock'],
    ] as const) {
      const original = product[field];
      product[field] = value;
      expect(listing.repository.resolveListing(listing.listingPublicationId)).toBeUndefined();
      product[field] = original;
    }
    listing.adapter.revokePartnerMembership(seller, sellerPartnerId, 'seller');
    expect(listing.repository.resolveListing(listing.listingPublicationId)).toBeUndefined();

    const verifiedDecision = new MarketplaceInMemoryAdapter();
    const verifiedDecisionRepository = probe(verifiedDecision);
    const verifiedCase = verifiedDecision.registerVerifiedActor(buyer, 'buyer');
    const verifiedStored = [...verifiedDecisionRepository.verifications.values()][0]!;
    verifiedStored['status'] = 'pending';
    await expect(
      verifiedDecisionRepository.reviewVerification(
        buyer.tenantId,
        verifiedCase.id,
        'verified',
        'reviewer',
        0,
        'verification-verified-key',
      ),
    ).resolves.toMatchObject({ status: 'ok', value: { rejectionReason: undefined } });

    const ambiguousSeller = new MarketplaceInMemoryAdapter();
    ambiguousSeller.registerVerifiedActor(seller, 'seller');
    ambiguousSeller.registerApprovedOrganization(seller, 'supplier', 'seller-one');
    ambiguousSeller.registerApprovedOrganization(seller, 'supplier', 'seller-two');
    expect(() =>
      ambiguousSeller.registerProduct({
        tenantId: seller.tenantId,
        productId: 'ambiguous-product',
        sellerId: 'seller',
        sellerUserId: seller.userId,
        name: 'Seed',
        unit: 'kg',
        unitPriceUzs: 1,
        stockQuantity: 1,
      }),
    ).toThrow();

    const existingItem = commerce();
    await existingItem.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: existingItem.listingPublicationId, quantity: 1 },
      'existing-item-first-key',
    );
    await expect(
      existingItem.adapter.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: existingItem.listingPublicationId, quantity: 1 },
        'existing-item-second-key',
      ),
    ).resolves.toMatchObject({ items: [{ quantity: 2 }] });

    const missingSellerOrganization = commerce();
    const missingSellerProduct = missingSellerOrganization.repository.products.values().next().value as StoredRecord;
    const listingResolution = vi
      .spyOn(missingSellerOrganization.repository, 'resolveListing')
      .mockReturnValue(missingSellerProduct);
    missingSellerOrganization.repository.organizations.delete(sellerPartnerId);
    await expect(
      missingSellerOrganization.repository.addToCart(
        buyer,
        {
          actingPartnerId: buyerPartnerId,
          listingPublicationId: missingSellerOrganization.listingPublicationId,
          quantity: 1,
        },
        'missing-seller-organization-key',
      ),
    ).resolves.toMatchObject({ field: 'listingPublicationId', status: 'not_found' });
    listingResolution.mockRestore();

    const blockedSelfSale = commerce();
    const blockedProduct = blockedSelfSale.repository.products.values().next().value as StoredRecord;
    blockedProduct['tenantId'] = buyer.tenantId;
    blockedProduct['sellerPartnerId'] = buyerPartnerId;
    const selfResolution = vi.spyOn(blockedSelfSale.repository, 'resolveListing').mockReturnValue(blockedProduct);
    await expect(
      blockedSelfSale.repository.addToCart(
        buyer,
        { actingPartnerId: buyerPartnerId, listingPublicationId: blockedSelfSale.listingPublicationId, quantity: 1 },
        'blocked-self-sale-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });
    selfResolution.mockRestore();

    const checkoutSellerMissing = commerce();
    const checkoutSellerCart = await checkoutSellerMissing.adapter.addToCart(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        listingPublicationId: checkoutSellerMissing.listingPublicationId,
        quantity: 1,
      },
      'checkout-seller-cart-key',
    );
    const checkoutSellerProduct = checkoutSellerMissing.repository.products.values().next().value as StoredRecord;
    const checkoutResolution = vi
      .spyOn(checkoutSellerMissing.repository, 'resolveListing')
      .mockReturnValue(checkoutSellerProduct);
    checkoutSellerMissing.repository.organizations.delete(sellerPartnerId);
    await expect(
      checkoutSellerMissing.repository.checkoutCart(
        buyer,
        checkoutSellerCart.id,
        { deliveryTerms: 'pickup' },
        'checkout-seller-missing-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });
    checkoutResolution.mockRestore();

    const checkoutImpossibleProduct = commerce();
    const impossibleCart = await checkoutImpossibleProduct.adapter.addToCart(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        listingPublicationId: checkoutImpossibleProduct.listingPublicationId,
        quantity: 1,
      },
      'checkout-impossible-cart-key',
    );
    checkoutImpossibleProduct.repository.listingPublications.get(checkoutImpossibleProduct.listingPublicationId)![
      'status'
    ] = 'paused';
    const some = vi.spyOn(Array.prototype, 'some').mockReturnValue(false);
    try {
      await expect(
        checkoutImpossibleProduct.repository.checkoutCart(
          buyer,
          impossibleCart.id,
          { deliveryTerms: 'pickup' },
          'checkout-impossible-product-key',
        ),
      ).resolves.toMatchObject({ field: 'listingPublicationId', status: 'not_found' });
    } finally {
      some.mockRestore();
    }

    const checkoutQuantity = commerce();
    const quantityCart = await checkoutQuantity.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: checkoutQuantity.listingPublicationId, quantity: 1 },
      'checkout-quantity-cart-key',
    );
    (checkoutQuantity.repository.carts.get(quantityCart.id)!['items'] as StoredRecord[])[0]!['quantity'] = 6;
    await expect(
      checkoutQuantity.repository.checkoutCart(
        buyer,
        quantityCart.id,
        { deliveryTerms: 'pickup' },
        'checkout-quantity-key',
      ),
    ).resolves.toMatchObject({ field: 'stockQuantity', status: 'conflict' });

    const checkoutAmount = commerce();
    const amountCart = await checkoutAmount.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: checkoutAmount.listingPublicationId, quantity: 1 },
      'checkout-amount-cart-key',
    );
    (checkoutAmount.repository.products.values().next().value as StoredRecord)['unitPriceUzs'] = 0;
    await expect(
      checkoutAmount.repository.checkoutCart(buyer, amountCart.id, { deliveryTerms: 'pickup' }, 'checkout-amount-key'),
    ).resolves.toMatchObject({ field: 'amountUzs', status: 'invalid_state' });

    const unauthorizedRequest = commerce();
    await expect(
      unauthorizedRequest.repository.createRequest(
        { ...buyer, userId: 'unverified' },
        { actingPartnerId: buyerPartnerId, region: 'R', title: 'Seed' },
        'unauthorized-request-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });

    const absentRequest = await createRequestAndOffer();
    const absentPublication = absentRequest.repository.requestPublications.get(absentRequest.requestPublicId)!;
    const originalRequestId = absentPublication['requestId'];
    absentPublication['requestId'] = 'missing-request';
    await expect(
      absentRequest.repository.makeOffer(
        seller,
        absentRequest.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 1 },
        'absent-request-offer-key',
      ),
    ).resolves.toMatchObject({ status: 'not_found' });
    await expect(absentRequest.repository.listOffers(buyer, absentRequest.requestPublicId)).resolves.toMatchObject({
      status: 'not_found',
    });
    absentPublication['requestId'] = originalRequestId;

    const invalidRequestStatus = await createRequestAndOffer();
    invalidRequestStatus.repository.requests.get(invalidRequestStatus.request.id)!['status'] = 'selected';
    await expect(
      invalidRequestStatus.repository.makeOffer(
        seller,
        invalidRequestStatus.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 1 },
        'invalid-request-status-key',
      ),
    ).resolves.toMatchObject({ status: 'invalid_state' });

    const selfOffer = new MarketplaceInMemoryAdapter();
    const selfOfferRepository = probe(selfOffer);
    const farmer = { tenantId: 'farmer-tenant', userId: 'farmer-user' };
    selfOffer.registerVerifiedActor(farmer, 'farmer');
    selfOffer.registerApprovedOrganization(farmer, 'buyer', 'farmer-buyer');
    selfOffer.registerApprovedOrganization(farmer, 'supplier', 'farmer-seller');
    const farmerRequest = await selfOffer.createRequest(
      farmer,
      { actingPartnerId: 'farmer-buyer', region: 'R', title: 'Seed' },
      'farmer-request-key',
    );
    const farmerPublicId = selfOffer.findRequestPublicationId(farmerRequest.id)!;
    await expect(
      selfOfferRepository.makeOffer(
        farmer,
        farmerPublicId,
        { actingPartnerId: 'farmer-seller', deliveryTerms: 'pickup', priceUzs: 1 },
        'farmer-self-offer-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });

    const sameTenantTrade = new MarketplaceInMemoryAdapter();
    const sameTenantBuyer = { tenantId: 'shared-tenant', userId: 'shared-buyer' };
    const sameTenantSeller = { tenantId: 'shared-tenant', userId: 'shared-seller' };
    sameTenantTrade.registerVerifiedActor(sameTenantBuyer, 'buyer');
    sameTenantTrade.registerApprovedOrganization(sameTenantBuyer, 'buyer', 'shared-buyer-partner');
    sameTenantTrade.registerVerifiedActor(sameTenantSeller, 'seller');
    sameTenantTrade.registerApprovedOrganization(sameTenantSeller, 'supplier', 'shared-seller-partner');
    const sameTenantRequest = await sameTenantTrade.createRequest(
      sameTenantBuyer,
      { actingPartnerId: 'shared-buyer-partner', region: 'Tashkent', title: 'Barley' },
      'same-tenant-request-key',
    );
    const sameTenantRequestPublicId = sameTenantTrade.findRequestPublicationId(sameTenantRequest.id)!;
    const sameTenantOffer = await sameTenantTrade.makeOffer(
      sameTenantSeller,
      sameTenantRequestPublicId,
      { actingPartnerId: 'shared-seller-partner', deliveryTerms: 'pickup', priceUzs: 3_000 },
      'same-tenant-offer-key',
    );
    await expect(
      sameTenantTrade.chooseOffer(
        sameTenantBuyer,
        sameTenantRequestPublicId,
        sameTenantOffer.id,
        'same-tenant-selection-key',
      ),
    ).resolves.toMatchObject({ contractId: expect.any(String) });
    const farmerPublication = selfOfferRepository.requestPublications.get(farmerPublicId)!;
    const farmerRequestRecord = selfOfferRepository.requests.get(farmerRequest.id)!;
    farmerPublication['buyerUserId'] = 'other-user';
    farmerPublication['buyerPartnerId'] = 'farmer-seller';
    farmerRequestRecord['buyerUserId'] = 'other-user';
    farmerRequestRecord['buyerPartnerId'] = 'farmer-seller';
    await expect(
      selfOfferRepository.makeOffer(
        farmer,
        farmerPublicId,
        { actingPartnerId: 'farmer-seller', deliveryTerms: 'pickup', priceUzs: 1 },
        'farmer-self-partner-offer-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });

    const transitionGuard = await createRequestAndOffer();
    const transitionRequest = transitionGuard.repository.requests.get(transitionGuard.request.id)!;
    let statusReads = 0;
    Object.defineProperty(transitionRequest, 'status', {
      configurable: true,
      get: () => (statusReads++ === 0 ? 'open' : 'closed'),
      set: () => undefined,
    });
    await expect(
      transitionGuard.repository.makeOffer(
        seller,
        transitionGuard.requestPublicId,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 1 },
        'transition-guard-offer-key',
      ),
    ).resolves.toMatchObject({ status: 'invalid_state' });

    const invalidChoosePublication = await createRequestAndOffer();
    invalidChoosePublication.repository.requestPublications.get(invalidChoosePublication.requestPublicId)!['status'] =
      'paused';
    await expect(
      invalidChoosePublication.repository.chooseOffer(
        buyer,
        invalidChoosePublication.requestPublicId,
        invalidChoosePublication.offer.id,
        'choose-invalid-publication-key',
      ),
    ).resolves.toMatchObject({ status: 'not_found' });

    const invalidChooseRequest = await createRequestAndOffer();
    invalidChooseRequest.repository.requestPublications.get(invalidChooseRequest.requestPublicId)!['requestId'] =
      'missing-request';
    await expect(
      invalidChooseRequest.repository.chooseOffer(
        buyer,
        invalidChooseRequest.requestPublicId,
        invalidChooseRequest.offer.id,
        'choose-invalid-request-key',
      ),
    ).resolves.toMatchObject({ status: 'not_found' });

    const invalidChooseTransition = await createRequestAndOffer();
    invalidChooseTransition.repository.requests.get(invalidChooseTransition.request.id)!['status'] = 'closed';
    await expect(
      invalidChooseTransition.repository.chooseOffer(
        buyer,
        invalidChooseTransition.requestPublicId,
        invalidChooseTransition.offer.id,
        'choose-transition-key',
      ),
    ).resolves.toMatchObject({ field: 'status', status: 'conflict' });

    const invalidChooseOrganization = await createRequestAndOffer();
    invalidChooseOrganization.repository.organizations.delete(sellerPartnerId);
    await expect(
      invalidChooseOrganization.repository.chooseOffer(
        buyer,
        invalidChooseOrganization.requestPublicId,
        invalidChooseOrganization.offer.id,
        'choose-organization-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });

    const noVolumeSelection = commerce();
    const requestWithoutVolume = await noVolumeSelection.adapter.createRequest(
      buyer,
      { actingPartnerId: buyerPartnerId, region: 'R', title: 'Seed' },
      'request-no-volume-key',
    );
    const noVolumePublicId = noVolumeSelection.adapter.findRequestPublicationId(requestWithoutVolume.id)!;
    const noVolumeOffer = await noVolumeSelection.adapter.makeOffer(
      seller,
      noVolumePublicId,
      { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 1 },
      'offer-no-volume-key',
    );
    await expect(
      noVolumeSelection.adapter.chooseOffer(buyer, noVolumePublicId, noVolumeOffer.id, 'choose-no-volume-key'),
    ).resolves.toMatchObject({ contractId: expect.any(String) });

    const forbiddenQuote = commerce();
    const forbiddenQuoteCart = await forbiddenQuote.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: forbiddenQuote.listingPublicationId, quantity: 1 },
      'forbidden-quote-cart-key',
    );
    const forbiddenQuoteCheckout = await forbiddenQuote.adapter.checkoutCart(
      buyer,
      forbiddenQuoteCart.id,
      { deliveryTerms: 'seller_delivery' },
      'forbidden-quote-checkout-key',
    );
    forbiddenQuote.adapter.revokePartnerMembership(buyer, buyerPartnerId, 'buyer');
    await expect(
      forbiddenQuote.repository.updateContractDeliveryQuote(
        seller,
        forbiddenQuoteCheckout.contractId,
        { deliveryPriceUzs: 1, expectedRevision: 0 },
        'forbidden-quote-key',
      ),
    ).resolves.toMatchObject({ field: 'organization', status: 'forbidden' });

    const invalidQuote = commerce();
    const pickupCart = await invalidQuote.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: invalidQuote.listingPublicationId, quantity: 1 },
      'invalid-quote-cart-key',
    );
    const pickupCheckout = await invalidQuote.adapter.checkoutCart(
      buyer,
      pickupCart.id,
      { deliveryTerms: 'pickup' },
      'invalid-quote-checkout-key',
    );
    await expect(
      invalidQuote.repository.updateContractDeliveryQuote(
        seller,
        pickupCheckout.contractId,
        { deliveryPriceUzs: 1, expectedRevision: 0 },
        'pickup-quote-key',
      ),
    ).resolves.toMatchObject({ field: 'deliveryPriceUzs', status: 'invalid_state' });

    const invalidMutationProduct = commerce();
    const invalidMutationCart = await invalidMutationProduct.adapter.addToCart(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        listingPublicationId: invalidMutationProduct.listingPublicationId,
        quantity: 1,
      },
      'invalid-mutation-cart-key',
    );
    invalidMutationProduct.repository.listingPublications.get(invalidMutationProduct.listingPublicationId)!['status'] =
      'paused';
    expect(
      invalidMutationProduct.repository.mutateCartItem(
        buyer,
        invalidMutationCart.id,
        invalidMutationProduct.listingPublicationId,
        2,
      ),
    ).toMatchObject({ field: 'listingPublicationId', status: 'not_found' });

    const missingMutationItem = commerce();
    const missingMutationCart = await missingMutationItem.adapter.addToCart(
      buyer,
      { actingPartnerId: buyerPartnerId, listingPublicationId: missingMutationItem.listingPublicationId, quantity: 1 },
      'missing-mutation-cart-key',
    );
    const missingItems = missingMutationItem.repository.carts.get(missingMutationCart.id)![
      'items'
    ] as StoredRecord[] & {
      findIndex: () => number;
    };
    missingItems.splice(0);
    missingItems.findIndex = () => 0;
    expect(
      missingMutationItem.repository.mutateCartItem(
        buyer,
        missingMutationCart.id,
        missingMutationItem.listingPublicationId,
        2,
      ),
    ).toMatchObject({ field: 'listingPublicationId', status: 'not_found' });

    const datedContracts = requestFixture.repository.contracts.get(selection.contractId)!;
    datedContracts['buyerSignedAt'] = new Date();
    datedContracts['sellerSignedAt'] = new Date();
    datedContracts['signedAt'] = new Date();
    await expect(requestFixture.repository.listContracts(buyer)).resolves.toEqual([
      expect.objectContaining({
        buyerSignedAt: expect.any(Date),
        sellerSignedAt: expect.any(Date),
        signedAt: expect.any(Date),
      }),
    ]);

    expect(registrationRepository.roleFor(buyer.tenantId, buyer.userId)).toBe('buyer');
    expect(registrationRepository.roleFor('missing', 'missing')).toBeUndefined();
    expect(registrationRepository.requestPublicIdFor('missing')).toBeUndefined();
    await expect(registrationRepository.getCart(buyer, 'missing')).resolves.toBeUndefined();
    await expect(registrationRepository.listCarts(buyer)).resolves.toEqual([]);
    await expect(registrationRepository.listContracts(buyer)).resolves.toEqual([]);
    await expect(registrationRepository.listTenantContracts(buyer.tenantId)).resolves.toEqual([]);
  });
});
