// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { MarketplaceInMemoryAdapter } from '@app/backend-feature-agritech-main-marketplace-in-memory-adapter';
import * as agriTechSource from '@app/backend-feature-agritech-shared';
import type { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import type { AcceptanceWorld } from '../support/world.ts';
import { MarketplaceDashboardAiAcceptanceAdapter } from '../support/marketplace-dashboard-ai.acceptance-adapter.ts';
import { MarketplacePublicAcceptanceAdapter } from '../support/marketplace-public.acceptance-adapter.ts';
import { MarketplacePromotionAcceptanceAdapter } from '../support/marketplace-promotion.acceptance-adapter.ts';
import { MarketplaceVerificationAcceptanceAdapter } from '../support/marketplace-verification.acceptance-adapter.ts';

const agriTech =
  (
    agriTechSource as unknown as {
      default?: typeof agriTechSource;
    }
  ).default ?? agriTechSource;
const { isDeliveryTransitionAllowed, isPartnerApproved, isProduceReservationAllowed } = agriTech;
const marketplaceTenantId = 'tenant-marketplace';

function createMarketplace(thisWorld: AcceptanceWorld): {
  buyer: AgriTechOwner;
  marketplace: InstanceType<typeof MarketplaceInMemoryAdapter>;
} {
  const adapter = new MarketplaceInMemoryAdapter();
  const buyer = { tenantId: marketplaceTenantId, userId: 'buyer-user' };
  adapter.registerVerifiedActor(buyer, 'buyer');
  const buyerPartnerId = adapter.registerApprovedOrganization(buyer, 'buyer', 'buyer-partner');
  thisWorld.agriTechMarketplace = adapter;
  thisWorld.agriTechMarketplaceBuyer = buyer;
  thisWorld.agriTechMarketplaceBuyerPartnerId = buyerPartnerId;
  return { buyer, marketplace: adapter };
}

function registerSellerProduct(
  adapter: InstanceType<typeof MarketplaceInMemoryAdapter>,
  sellerId: string,
  productId: string,
): AgriTechOwner {
  const seller = { tenantId: `tenant-${sellerId}`, userId: `${sellerId}-user` };
  adapter.registerVerifiedActor(seller, 'seller');
  adapter.registerApprovedOrganization(seller, 'supplier', sellerId);
  adapter.registerProduct({
    tenantId: seller.tenantId,
    productId,
    listingPublicationId: `listing-${productId}`,
    sellerId,
    sellerPartnerId: sellerId,
    sellerUserId: seller.userId,
    name: `Seed ${productId}`,
    unit: 'kg',
    unitPriceUzs: 4_000_000,
    stockQuantity: 20,
  });
  return seller;
}

function requireBuyerPartnerId(thisWorld: AcceptanceWorld): string {
  assert.ok(thisWorld.agriTechMarketplaceBuyerPartnerId, 'marketplace buyer organization was not initialized');
  return thisWorld.agriTechMarketplaceBuyerPartnerId;
}

function requireMarketplace(thisWorld: AcceptanceWorld) {
  assert.ok(thisWorld.agriTechMarketplace, 'marketplace adapter was not initialized');
  return thisWorld.agriTechMarketplace;
}

function requireBuyer(thisWorld: AcceptanceWorld): AgriTechOwner {
  assert.ok(thisWorld.agriTechMarketplaceBuyer, 'marketplace buyer was not initialized');
  return thisWorld.agriTechMarketplaceBuyer;
}

function requireSeller(thisWorld: AcceptanceWorld): AgriTechOwner {
  assert.ok(thisWorld.agriTechMarketplaceSeller, 'marketplace seller was not initialized');
  return thisWorld.agriTechMarketplaceSeller;
}

Given('a pending AgriTech buyer', function (this: AcceptanceWorld) {
  this.agriTechPartnerStatus = 'pending';
});

Given('an approved AgriTech buyer', function (this: AcceptanceWorld) {
  this.agriTechPartnerStatus = 'approved';
});

When("the buyer's marketplace permission is evaluated", function (this: AcceptanceWorld) {
  this.agriTechReservationAllowed = isPartnerApproved(this.agriTechPartnerStatus ?? 'pending');
});

Then('the buyer is blocked from marketplace trading', function (this: AcceptanceWorld) {
  assert.equal(this.agriTechReservationAllowed, false);
});

Then('the buyer is allowed to trade', function (this: AcceptanceWorld) {
  assert.equal(this.agriTechReservationAllowed, true);
});

Given(
  'an active produce listing with {int} kilograms available',
  function (this: AcceptanceWorld, availableQuantityKg: number) {
    this.agriTechAvailableQuantityKg = availableQuantityKg;
  },
);

When('the buyer requests {int} kilograms', function (this: AcceptanceWorld, requestedQuantityKg: number) {
  this.agriTechRequestedQuantityKg = requestedQuantityKg;
  this.agriTechReservationAllowed = isProduceReservationAllowed({
    status: 'active',
    availableQuantityKg: this.agriTechAvailableQuantityKg ?? 0,
    requestedQuantityKg,
    availableUntil: new Date('2030-01-02T00:00:00.000Z'),
    now: new Date('2030-01-01T00:00:00.000Z'),
  });
});

Then('the produce reservation is allowed', function (this: AcceptanceWorld) {
  assert.equal(this.agriTechReservationAllowed, true);
});

Then('the produce reservation is rejected', function (this: AcceptanceWorld) {
  assert.equal(this.agriTechReservationAllowed, false);
});

Given('an in-transit AgriTech delivery without proof', function (this: AcceptanceWorld) {
  this.agriTechDeliveryProof = undefined;
});

Given('an in-transit AgriTech delivery with proof', function (this: AcceptanceWorld) {
  this.agriTechDeliveryProof = 'proof://delivery/accepted';
});

When('the field agent attempts to complete the delivery', function (this: AcceptanceWorld) {
  this.agriTechDeliveryAllowed = isDeliveryTransitionAllowed('in_transit', 'delivered', this.agriTechDeliveryProof);
});

Then('delivery completion is rejected', function (this: AcceptanceWorld) {
  assert.equal(this.agriTechDeliveryAllowed, false);
});

Then('delivery completion is allowed', function (this: AcceptanceWorld) {
  assert.equal(this.agriTechDeliveryAllowed, true);
});

Given(
  'a verified DehqonHub buyer and products from sellers {string} and {string}',
  function (this: AcceptanceWorld, firstSellerId: string, secondSellerId: string) {
    const { marketplace: adapter } = createMarketplace(this);
    registerSellerProduct(adapter, firstSellerId, 'product-a');
    registerSellerProduct(adapter, secondSellerId, 'product-b');
    this.agriTechMarketplaceListingPublicIds = {
      'product-a': 'listing-product-a',
      'product-b': 'listing-product-b',
    };
  },
);

When(
  'the buyer adds both products using only approved publication identity and quantity',
  async function (this: AcceptanceWorld) {
    const adapter = requireMarketplace(this);
    const buyer = requireBuyer(this);
    const buyerPartnerId = requireBuyerPartnerId(this);
    await adapter.addToCart(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        listingPublicationId: this.agriTechMarketplaceListingPublicIds['product-a'] as string,
        quantity: 1,
      },
      'accept-cart-product-a',
    );
    await adapter.addToCart(
      buyer,
      {
        actingPartnerId: buyerPartnerId,
        listingPublicationId: this.agriTechMarketplaceListingPublicIds['product-b'] as string,
        quantity: 2,
      },
      'accept-cart-product-b',
    );
    this.agriTechMarketplaceCarts = await adapter.listCarts(buyer);
  },
);

Then('two open carts persist with one cart for each seller organization', function (this: AcceptanceWorld) {
  assert.equal(this.agriTechMarketplaceCarts.length, 2);
  const productBySeller = Object.fromEntries(
    this.agriTechMarketplaceCarts.map((cart) => [cart.sellerPartnerId, cart.items.map((item) => item.sourceId)]),
  );
  assert.deepEqual(productBySeller, {
    'seller-a': ['product-a'],
    'seller-b': ['product-b'],
  });
});

Given('a verified DehqonHub buyer has an open seller cart', async function (this: AcceptanceWorld) {
  const { buyer, marketplace: adapter } = createMarketplace(this);
  this.agriTechMarketplaceSeller = registerSellerProduct(adapter, 'seller-a', 'checkout-product');
  this.agriTechMarketplaceSellerPartnerId = 'seller-a';
  this.agriTechMarketplaceListingPublicIds['checkout-product'] = 'listing-checkout-product';
  const cart = await adapter.addToCart(
    buyer,
    {
      actingPartnerId: requireBuyerPartnerId(this),
      listingPublicationId: 'listing-checkout-product',
      quantity: 2,
    },
    'accept-checkout-cart-add',
  );
  this.agriTechMarketplaceCartId = cart.id;
});

When('the buyer confirms pickup and checks out the cart', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceCartId, 'checkout cart was not initialized');
  this.agriTechMarketplaceCheckout = await adapter.checkoutCart(
    buyer,
    this.agriTechMarketplaceCartId,
    { deliveryTerms: 'pickup' },
    'accept-checkout-cart',
  );
});

Then(
  'the cart closes and the returned draft contract persists its parties, lines, amount, and delivery terms',
  async function (this: AcceptanceWorld) {
    const adapter = requireMarketplace(this);
    const buyer = requireBuyer(this);
    const seller = requireSeller(this);
    assert.ok(this.agriTechMarketplaceCheckout, 'checkout result was not returned');
    const cart = await adapter.getCart(buyer, this.agriTechMarketplaceCheckout.cartId);
    const contract = await adapter.findContract(buyer, this.agriTechMarketplaceCheckout.contractId);
    assert.equal(cart.status, 'ordered');
    assert.ok(contract, 'checkout contract was not persisted');
    assert.equal(contract.status, 'draft');
    assert.equal(contract.sourceType, 'cart_checkout');
    assert.equal(contract.sourceId, cart.id);
    assert.equal(contract.buyerPartnerId, requireBuyerPartnerId(this));
    assert.equal(contract.sellerPartnerId, this.agriTechMarketplaceSellerPartnerId);
    assert.notEqual(contract.buyerTenantId, contract.sellerTenantId);
    assert.equal(contract.buyerUserId, buyer.userId);
    assert.equal(contract.sellerUserId, seller.userId);
    assert.equal(contract.deliveryTerms, 'pickup');
    assert.equal(contract.deliveryPriceUzs, 0);
    assert.equal(contract.lines.length, 1);
    assert.deepEqual(contract.lines[0], {
      sourceId: 'checkout-product',
      sourceKind: 'product',
      sourcePublicationId: 'listing-checkout-product',
      sourceRevision: 1,
      name: 'Seed checkout-product',
      unit: 'kg',
      unitPriceUzs: 4_000_000,
      quantity: 2,
      lineTotalUzs: 8_000_000,
    });
    assert.equal(contract.amountUzs, 8_000_000);
  },
);

Given(
  'a verified buyer owns an open request with an offer from a verified seller',
  async function (this: AcceptanceWorld) {
    const { buyer, marketplace: adapter } = createMarketplace(this);
    const seller = { tenantId: 'tenant-offer-seller', userId: 'offer-seller-user' };
    adapter.registerVerifiedActor(seller, 'seller');
    const sellerPartnerId = adapter.registerApprovedOrganization(seller, 'supplier', 'offer-seller-partner');
    this.agriTechMarketplaceSeller = seller;
    this.agriTechMarketplaceSellerPartnerId = sellerPartnerId;
    this.agriTechMarketplaceRequest = await adapter.createRequest(
      buyer,
      {
        actingPartnerId: requireBuyerPartnerId(this),
        title: 'Certified corn seed',
        volume: '10 t',
        region: 'Samarkand',
      },
      'accept-request-create',
    );
    this.agriTechMarketplaceRequestPublicId = adapter.findRequestPublicationId(this.agriTechMarketplaceRequest.id);
    assert.ok(this.agriTechMarketplaceRequestPublicId, 'request publication was not initialized');
    this.agriTechMarketplaceOffer = await adapter.makeOffer(
      seller,
      this.agriTechMarketplaceRequestPublicId,
      {
        actingPartnerId: sellerPartnerId,
        deliveryDays: 4,
        deliveryNote: 'Seller delivery',
        deliveryPriceUzs: 800_000,
        deliveryTerms: 'seller_delivery',
        priceUzs: 40_800_000,
      },
      'accept-offer-create',
    );
  },
);

When('the buyer chooses that offer', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceRequest, 'purchase request was not initialized');
  assert.ok(this.agriTechMarketplaceOffer, 'offer was not initialized');
  assert.ok(this.agriTechMarketplaceRequestPublicId, 'request publication was not initialized');
  this.agriTechMarketplaceSelection = await adapter.chooseOffer(
    buyer,
    this.agriTechMarketplaceRequestPublicId,
    this.agriTechMarketplaceOffer.id,
    'accept-offer-choose',
  );
});

Then(
  'the request and offer are selected and one matching draft contract is returned for review',
  async function (this: AcceptanceWorld) {
    const adapter = requireMarketplace(this);
    const buyer = requireBuyer(this);
    const seller = requireSeller(this);
    assert.ok(this.agriTechMarketplaceSelection, 'offer selection was not returned');
    assert.ok(this.agriTechMarketplaceRequest, 'purchase request was not initialized');
    const selectedRequest = await adapter.findRequest(buyer, this.agriTechMarketplaceRequest.id);
    const acceptedOffer = await adapter.findOffer(
      buyer,
      this.agriTechMarketplaceSelection.requestPublicId,
      this.agriTechMarketplaceSelection.offerId,
    );
    const contract = await adapter.findContract(buyer, this.agriTechMarketplaceSelection.contractId);
    assert.ok(selectedRequest, 'selected request was not persisted');
    assert.ok(acceptedOffer, 'accepted offer was not persisted');
    assert.equal(selectedRequest.status, 'selected');
    assert.equal(acceptedOffer.status, 'accepted');
    assert.ok(contract, 'selected-offer contract was not persisted');
    assert.equal(contract.status, 'draft');
    assert.equal(contract.sourceType, 'offer_selection');
    assert.equal(contract.sourceId, acceptedOffer.id);
    assert.equal(contract.buyerPartnerId, requireBuyerPartnerId(this));
    assert.equal(contract.sellerPartnerId, this.agriTechMarketplaceSellerPartnerId);
    assert.notEqual(contract.buyerTenantId, contract.sellerTenantId);
    assert.equal(contract.buyerUserId, buyer.userId);
    assert.equal(contract.sellerUserId, seller.userId);
    assert.equal(contract.amountUzs, acceptedOffer.priceUzs);
    assert.equal(contract.deliveryTerms, 'seller_delivery');
    assert.equal(contract.deliveryPriceUzs, 800_000);
    assert.equal((await adapter.listContracts(buyer)).length, 1);
  },
);

Given(
  'a verified DehqonHub buyer without an approved buyer organization can discover an active product',
  function (this: AcceptanceWorld) {
    const adapter = new MarketplaceInMemoryAdapter();
    const buyer = { tenantId: marketplaceTenantId, userId: 'unapproved-buyer-user' };
    adapter.registerVerifiedActor(buyer, 'buyer');
    this.agriTechMarketplace = adapter;
    this.agriTechMarketplaceBuyer = buyer;
    this.agriTechMarketplaceSeller = registerSellerProduct(adapter, 'approved-seller', 'approval-product');
    this.agriTechMarketplaceListingPublicIds['approval-product'] = 'listing-approval-product';
  },
);

When('the unapproved buyer attempts to add the product to a cart', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  try {
    await adapter.addToCart(
      buyer,
      {
        actingPartnerId: 'unapproved-buyer-partner',
        listingPublicationId: 'listing-approval-product',
        quantity: 1,
      },
      'accept-unapproved-cart',
    );
  } catch (error) {
    this.agriTechMarketplaceError = error;
  }
});

Then('the cart addition is denied without a cart or contract', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceError instanceof Error, 'cart denial was not returned');
  assert.equal((await adapter.listCarts(buyer)).length, 0);
  assert.equal((await adapter.listContracts(buyer)).length, 0);
});

Given('an unverified DehqonHub user can discover an active product', function (this: AcceptanceWorld) {
  const adapter = new MarketplaceInMemoryAdapter();
  const buyer = { tenantId: marketplaceTenantId, userId: 'unverified-buyer-user' };
  this.agriTechMarketplace = adapter;
  this.agriTechMarketplaceBuyer = buyer;
  this.agriTechMarketplaceSeller = registerSellerProduct(adapter, 'verified-seller', 'visible-product');
  this.agriTechMarketplaceListingPublicIds['visible-product'] = 'listing-visible-product';
});

When('the unverified user attempts to add the product to a cart', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  try {
    await adapter.addToCart(
      buyer,
      {
        actingPartnerId: 'unverified-buyer-partner',
        listingPublicationId: 'listing-visible-product',
        quantity: 1,
      },
      'accept-unverified-cart',
    );
  } catch (error) {
    this.agriTechMarketplaceError = error;
  }
});

Then('the cart mutation is denied and no seller cart is persisted', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceError instanceof Error, 'cart mutation denial was not returned');
  assert.equal((await adapter.listCarts(buyer)).length, 0);
});

Given('approved opt-in DehqonHub listing, seller, and purchase-request publications', function (this: AcceptanceWorld) {
  this.agriTechPublicAdapter = new MarketplacePublicAcceptanceAdapter('approved');
});

Given(
  'pending, rejected, paused, suspended, revoked, inactive, exhausted, or expired public records',
  function (this: AcceptanceWorld) {
    this.agriTechPublicAdapter = new MarketplacePublicAcceptanceAdapter('ineligible');
  },
);

When(
  'a guest reads the public marketplace projection without a tenant selector',
  async function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicAdapter, 'public marketplace adapter was not initialized');
    this.agriTechPublicProjection = await this.agriTechPublicAdapter.readGuestProjection();
  },
);

Then(
  'the approved Product, Produce, seller, and request records are anonymously discoverable',
  function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicProjection, 'public projection was not returned');
    assert.deepEqual(
      this.agriTechPublicProjection.catalog.items.map((listing) => listing.kind),
      ['product', 'produce'],
    );
    assert.ok(this.agriTechPublicProjection.seller, 'approved seller was not returned');
    assert.equal(this.agriTechPublicProjection.requests.items.length, 1);
    assert.equal(this.agriTechPublicProjection.suggestions.length, 2);
  },
);

Then('no public listing, seller, suggestion, or request record is returned', function (this: AcceptanceWorld) {
  assert.ok(this.agriTechPublicProjection, 'public projection was not returned');
  assert.deepEqual(this.agriTechPublicProjection.catalog.items, []);
  assert.equal(this.agriTechPublicProjection.seller, undefined);
  assert.deepEqual(this.agriTechPublicProjection.suggestions, []);
  assert.deepEqual(this.agriTechPublicProjection.requests.items, []);
});

Then(
  'Product and Produce remain explicitly discriminated with four authored titles and no private fields',
  function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicProjection, 'public projection was not returned');
    const listings = this.agriTechPublicProjection.catalog.items;
    assert.equal(listings.length, 2);
    const product = listings[0];
    const produce = listings[1];
    assert.ok(product, 'public Product projection was not returned');
    assert.ok(produce, 'public Produce projection was not returned');
    assert.equal(product.kind, 'product');
    assert.equal(product.section, 'seeds');
    assert.equal(produce.kind, 'produce');
    assert.equal(produce.section, 'produce');
    for (const listing of listings) {
      assert.ok(listing.title);
      assert.ok(listing.titleRu);
      assert.ok(listing.titleUz);
      assert.ok(listing.titleUzCyrl);
      assert.match(listing.id, /^[0-9a-f-]{36}$/u);
      assert.match(listing.seller.id, /^[0-9a-f-]{36}$/u);
    }
    const serialized = JSON.stringify(this.agriTechPublicProjection);
    for (const forbidden of [
      'tenantId',
      'ownerUserId',
      'partnerId',
      'farmerId',
      'sourceId',
      'legalName',
      'taxId',
      'providerMode',
      'moderationStatus',
      'idempotencyKey',
      'requestFingerprint',
    ]) {
      assert.ok(!serialized.includes(forbidden), `public projection leaked ${forbidden}`);
    }
  },
);

Given('a verified approved seller owns an eligible private source', function (this: AcceptanceWorld) {
  this.agriTechPublicAdapter = new MarketplacePublicAcceptanceAdapter('approved');
});

When(
  'the seller publishes it, replays the command, changes the replayed input, and a foreign tenant tries the source',
  async function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicAdapter, 'public marketplace adapter was not initialized');
    const input = {
      section: 'seeds' as const,
      sellerPartnerId: '77777777-7777-4777-8777-777777777777',
      sourceId: '55555555-5555-4555-8555-555555555555',
      sourceKind: 'product' as const,
    };
    const owner = { tenantId: 'tenant-seller', userId: 'seller-user' };
    this.agriTechPublicPublication = await this.agriTechPublicAdapter.publish(owner, 'publish-public-01', input);
    this.agriTechPublicReplay = await this.agriTechPublicAdapter.publish(owner, 'publish-public-01', input);
    try {
      await this.agriTechPublicAdapter.publish(owner, 'publish-public-01', {
        ...input,
        section: 'equipment',
      });
    } catch (error) {
      this.agriTechPublicConflict = error;
    }
    try {
      await this.agriTechPublicAdapter.publish(
        { tenantId: 'foreign-tenant', userId: 'foreign-user' },
        'publish-public-02',
        input,
      );
    } catch (error) {
      this.agriTechPublicWrongTenant = error;
    }
  },
);

Then(
  'one pending-moderation publication exists, the exact replay matches, and both invalid attempts fail closed',
  function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicAdapter, 'public marketplace adapter was not initialized');
    assert.ok(this.agriTechPublicPublication, 'publication was not returned');
    assert.equal(this.agriTechPublicPublication.moderationStatus, 'pending');
    assert.deepEqual(this.agriTechPublicReplay, this.agriTechPublicPublication);
    assert.ok(this.agriTechPublicConflict instanceof Error, 'changed-input replay did not conflict');
    assert.ok(this.agriTechPublicWrongTenant instanceof Error, 'foreign tenant publication was not denied');
    assert.equal(this.agriTechPublicAdapter.writeCount(), 1);
  },
);

Given(
  'approved listing and seller snapshots have unreviewed descriptive edits and one source reaches zero stock',
  function (this: AcceptanceWorld) {
    this.agriTechPublicAdapter = new MarketplacePublicAcceptanceAdapter('approved-with-pending-edit');
  },
);

Then(
  'only the prior reviewed listing and seller descriptions are visible, the current price is used, and the exhausted source is hidden',
  function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicProjection, 'public projection was not returned');
    assert.equal(this.agriTechPublicProjection.catalog.items.length, 1);
    const listing = this.agriTechPublicProjection.catalog.items[0];
    assert.ok(listing, 'approved listing was not returned');
    assert.equal(listing.description, 'Certified seed');
    assert.equal(listing.seller.displayName, 'Zarafshon Agro');
    assert.equal(this.agriTechPublicProjection.seller?.description, 'Verified supplier');
    assert.equal(listing.priceUzs, 4_100_000);
    assert.ok(!JSON.stringify(this.agriTechPublicProjection).includes('Unreviewed'));
  },
);

Given(
  'independently pending listing and seller-profile revisions with exact queue fingerprints',
  function (this: AcceptanceWorld) {
    this.agriTechPublicAdapter = new MarketplacePublicAcceptanceAdapter('approved');
  },
);

When(
  'two authorized reviewers decide the listing concurrently, replay the winner, and challenge the seller-profile fingerprint',
  async function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicAdapter, 'public marketplace adapter was not initialized');
    this.agriTechPublicModerationRace = await this.agriTechPublicAdapter.exerciseModerationRace();
  },
);

Then(
  'one listing decision persists without deciding the seller, both exact replays match, and stale decisions and fingerprints conflict',
  function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicModerationRace, 'moderation result was not returned');
    assert.equal(this.agriTechPublicModerationRace.decisionWrites, 1);
    assert.equal(this.agriTechPublicModerationRace.exactReplay, this.agriTechPublicModerationRace.completedDecision);
    assert.equal(this.agriTechPublicModerationRace.sellerDecisionBeforeIndependentReview, undefined);
    assert.equal(this.agriTechPublicModerationRace.sellerDecisionWrites, 1);
    assert.equal(this.agriTechPublicModerationRace.sellerCompletedDecision, 'approved');
    assert.match(this.agriTechPublicModerationRace.sellerContentFingerprint, /^[a-f0-9]{64}$/u);
    assert.equal(
      this.agriTechPublicModerationRace.sellerExactReplay,
      this.agriTechPublicModerationRace.sellerCompletedDecision,
    );
    assert.equal(
      this.agriTechPublicModerationRace.listingDecisionAfterSellerReview,
      this.agriTechPublicModerationRace.completedDecision,
    );
    assert.ok(
      this.agriTechPublicModerationRace.staleOppositeDecision instanceof Error,
      'opposite moderation decision did not conflict',
    );
    assert.ok(
      this.agriTechPublicModerationRace.staleSellerFingerprintDecision instanceof Error,
      'stale seller fingerprint did not conflict',
    );
  },
);

Given('approved public listings that span more than one bounded page', function (this: AcceptanceWorld) {
  this.agriTechPublicAdapter = new MarketplacePublicAcceptanceAdapter('approved-keyset');
});

When(
  'a guest follows the opaque cursor and submits malformed, extra-field, oversized, and wrong-sort cursors',
  async function (this: AcceptanceWorld) {
    assert.ok(this.agriTechPublicAdapter, 'public marketplace adapter was not initialized');
    this.agriTechPublicKeysetExercise = await this.agriTechPublicAdapter.exerciseBoundedKeysetDiscovery();
  },
);

Then(
  'valid pages respect the limit and invalid cursors fail before a persistence query without using an offset',
  function (this: AcceptanceWorld) {
    const result = this.agriTechPublicKeysetExercise;
    assert.ok(result, 'keyset exercise was not returned');
    assert.equal(result.firstPage.items.length, 1);
    assert.equal(result.secondPage.items.length, 1);
    assert.notEqual(result.firstPage.items[0]?.id, result.secondPage.items[0]?.id);
    assert.ok(result.firstPage.nextCursor, 'first page did not expose an opaque cursor');
    assert.ok(result.malformedCursorError instanceof Error, 'noncanonical cursor did not fail');
    assert.ok(result.extraFieldCursorError instanceof Error, 'extra-field cursor did not fail');
    assert.ok(result.oversizedCursorError instanceof Error, 'oversized cursor did not fail');
    assert.ok(result.sortMismatchError instanceof Error, 'sort-mismatched cursor did not fail');
    assert.equal(result.callsAfterInvalidCursors, result.callsBeforeInvalidCursors);
    assert.equal(result.observedQueries.length, 2);
    assert.deepEqual(result.observedQueries[0], {
      limit: 1,
      maxPriceUzs: 5_000_000,
      minAvailableQuantity: 1,
      minPriceUzs: 1,
      query: 'a',
      region: 'Samarkand',
      sort: 'newest',
    });
    assert.deepEqual(result.observedQueries[1]?.cursor, {
      id: result.firstPage.items[0]?.id,
      kind: 'catalog',
      promoted: false,
      publishedAt: '2030-01-01T00:00:00.000Z',
      sort: 'newest',
    });
    assert.ok(result.observedQueries.every((query) => !Object.hasOwn(query, 'offset')));
  },
);

Given(
  'pending listings pin a newer seller-profile revision and queue fingerprint beside prior approved public records',
  function (this: AcceptanceWorld) {
    this.agriTechPublicAdapter = new MarketplacePublicAcceptanceAdapter('approved');
  },
);

When('an authorized administrator rejects the newer seller-profile revision', async function (this: AcceptanceWorld) {
  assert.ok(this.agriTechPublicAdapter, 'public marketplace adapter was not initialized');
  this.agriTechPublicSellerRejectionFanout = await this.agriTechPublicAdapter.exerciseSellerRejectionFanout();
});

Then(
  'only pending listings pinned to that rejected revision terminate, its fingerprint is canonical, and prior public records remain visible',
  function (this: AcceptanceWorld) {
    const result = this.agriTechPublicSellerRejectionFanout;
    assert.ok(result, 'seller-profile rejection fan-out was not exercised');
    assert.deepEqual(result.rejectedPinnedListingIds, ['pending-listing-a', 'pending-listing-b']);
    assert.deepEqual(result.remainingPinnedListingIds, []);
    assert.deepEqual(result.pendingOtherRevisionIds, ['pending-listing-other-revision']);
    assert.match(result.reviewedContentFingerprint, /^[a-f0-9]{64}$/u);
    assert.deepEqual(result.sellerAfter, result.sellerBefore);
    assert.deepEqual(result.visibleListingIdsAfter, result.visibleListingIdsBefore);
  },
);

Given(
  'an authenticated DehqonHub applicant uses non-production mock verification providers',
  function (this: AcceptanceWorld) {
    this.agriTechVerificationAdapter = new MarketplaceVerificationAcceptanceAdapter();
    this.agriTechVerificationApplicant = {
      tenantId: 'tenant-verification-acceptance',
      userId: 'verification-applicant',
    };
  },
);

When(
  'the applicant creates a buyer case and repeats the same OneID and document commands',
  async function (this: AcceptanceWorld) {
    assert.ok(this.agriTechVerificationAdapter, 'verification adapter was not initialized');
    assert.ok(this.agriTechVerificationApplicant, 'verification applicant was not initialized');
    const adapter = this.agriTechVerificationAdapter;
    const applicant = this.agriTechVerificationApplicant;
    await adapter.create(applicant, 'buyer');
    const firstIdentity = await adapter.linkOneId(applicant, 'acceptance-oneid-key');
    const replayedIdentity = await adapter.linkOneId(applicant, 'acceptance-oneid-key');
    assert.deepEqual(replayedIdentity, firstIdentity);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
    const document = {
      content: png,
      fileName: 'business-registration.png',
      kind: 'business' as const,
      mimeType: 'image/png' as const,
    };
    const firstDocument = await adapter.storeDocument(applicant, document, 'acceptance-document-key');
    const replayedDocument = await adapter.storeDocument(applicant, document, 'acceptance-document-key');
    assert.deepEqual(replayedDocument, firstDocument);
    this.agriTechVerificationReplayCounts = adapter.executionCounts();
  },
);

When('the applicant submits the completed verification evidence', async function (this: AcceptanceWorld) {
  assert.ok(this.agriTechVerificationAdapter, 'verification adapter was not initialized');
  assert.ok(this.agriTechVerificationApplicant, 'verification applicant was not initialized');
  this.agriTechVerificationResult = await this.agriTechVerificationAdapter.submit(this.agriTechVerificationApplicant);
});

Then('each external command executes once and replays its persisted result', function (this: AcceptanceWorld) {
  assert.deepEqual(this.agriTechVerificationReplayCounts, { documents: 1, identity: 1 });
});

Then('the verification case remains pending with explicit mock provenance', function (this: AcceptanceWorld) {
  assert.ok(this.agriTechVerificationResult, 'verification result was not returned');
  assert.equal(this.agriTechVerificationResult.status, 'pending');
  assert.equal(this.agriTechVerificationResult.level, 'basic');
  assert.equal(this.agriTechVerificationResult.providerMode, 'mock');
  assert.equal(this.agriTechVerificationResult.identityAssurance, 'mock');
});

Given('an approved seller owns two moderated catalog listings', function (this: AcceptanceWorld) {
  this.agriTechPromotionAdapter = new MarketplacePromotionAcceptanceAdapter();
});

When('the seller activates a bounded promotion and retries the same command', async function (this: AcceptanceWorld) {
  assert.ok(this.agriTechPromotionAdapter, 'promotion adapter was not initialized');
  this.agriTechPromotionResult = await this.agriTechPromotionAdapter.exerciseCatalogOnlyActivation(
    this.agriTechPromotionAdapter.seller(),
  );
});

Then(
  'one promotion persists with the selected server plan and the promoted listing ranks first with an Ad disclosure',
  function (this: AcceptanceWorld) {
    const result = this.agriTechPromotionResult;
    assert.ok(result, 'promotion activation was not exercised');
    assert.equal(result.persistedCount, 1);
    assert.equal(result.replayId, result.promotion.id);
    assert.equal(result.promotion.planCode, 'catalog_7d');
    assert.equal(result.promotion.priceUzs, 150_000);
    assert.equal(result.promotion.currency, 'UZS');
    assert.deepEqual(result.catalog[0], { ad: true, id: result.promotion.listingPublicId });
  },
);

Given('a verified buyer receives a grounded AI preview across two approved sellers', function (this: AcceptanceWorld) {
  this.agriTechDashboardAiAdapter = new MarketplaceDashboardAiAcceptanceAdapter();
});

When(
  'the buyer cancels the preview, confirms it, retries the same command, and changes the replayed input',
  async function (this: AcceptanceWorld) {
    assert.ok(this.agriTechDashboardAiAdapter, 'dashboard AI adapter was not initialized');
    this.agriTechDashboardAiResult = await this.agriTechDashboardAiAdapter.exerciseConfirmedStarterCart(
      this.agriTechDashboardAiAdapter.buyer(),
    );
  },
);

Then(
  'cancellation creates nothing, the exact replay returns two seller carts, and the changed command conflicts',
  function (this: AcceptanceWorld) {
    const result = this.agriTechDashboardAiResult;
    assert.ok(result, 'grounded starter-cart flow was not exercised');
    assert.equal(result.cancelledMutationCount, 0);
    assert.equal(result.persistedOperationCount, 1);
    assert.equal(result.exactReplay, true);
    assert.equal(result.changedReplayConflict, true);
    assert.equal(result.carts.length, 2);
    assert.equal(new Set(result.carts.map(({ sellerPublicId }) => sellerPublicId)).size, 2);
    assert.ok(result.carts.every(({ listingPublicationIds }) => listingPublicationIds.length === 1));
  },
);

Then(
  'the grounded AI payload contains only opaque publication identities and semantic result codes',
  function (this: AcceptanceWorld) {
    const result = this.agriTechDashboardAiResult;
    assert.ok(result, 'grounded starter-cart flow was not exercised');
    assert.equal(result.consultation.answer, 'catalog_match');
    assert.equal(result.consultation.listingPublicationIds.length, 2);
    assert.ok(result.consultation.listingPublicationIds.every((id) => /^[0-9a-f-]{36}$/u.test(id)));
    for (const forbidden of ['tenantId', 'userId', 'sourceId', 'productId', 'partnerId', 'promoted', 'promotion']) {
      assert.ok(!result.serializedResult.includes(forbidden), `grounded AI payload leaked ${forbidden}`);
    }
  },
);

Then(
  'consultation creation replays exactly, translated titles remain stable, and an unpublished listing requires refresh',
  function (this: AcceptanceWorld) {
    const result = this.agriTechDashboardAiResult;
    assert.ok(result, 'grounded starter-cart flow was not exercised');
    assert.equal(result.exactCreateReplay, true);
    assert.equal(result.changedCreateReplayConflict, true);
    assert.equal(result.stalePublicationConflict, true);
    assert.deepEqual(result.consultation.response.recommendations[0]?.titles, {
      en: 'EN certified corn A',
      ru: 'RU certified corn A',
      uz: 'UZ certified corn A',
      uzCyrl: 'UZ-CYRL certified corn A',
    });
    assert.deepEqual(result.consultation.response.explanationCodes, [
      'grounded_at_consultation_time',
      'lowest_current_price_first',
      'stock_revalidated_on_confirmation',
    ]);
  },
);
