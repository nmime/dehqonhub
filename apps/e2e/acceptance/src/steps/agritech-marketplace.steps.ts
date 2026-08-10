// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-MARKETPLACE-016
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { MarketplaceInMemoryAdapter } from '@app/backend-feature-agritech-main-marketplace-in-memory-adapter';
import * as agriTechSource from '@app/backend-feature-agritech-shared';
import type { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import type { AcceptanceWorld } from '../support/world.ts';

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
  adapter.registerApprovedOrganization(buyer, 'buyer');
  thisWorld.agriTechMarketplace = adapter;
  thisWorld.agriTechMarketplaceBuyer = buyer;
  return { buyer, marketplace: adapter };
}

function registerSellerProduct(
  adapter: InstanceType<typeof MarketplaceInMemoryAdapter>,
  sellerId: string,
  productId: string,
): AgriTechOwner {
  const seller = { tenantId: marketplaceTenantId, userId: `${sellerId}-user` };
  adapter.registerVerifiedActor(seller, 'seller');
  adapter.registerApprovedOrganization(seller, 'supplier');
  adapter.registerProduct({
    tenantId: marketplaceTenantId,
    productId,
    sellerId,
    sellerUserId: seller.userId,
    name: `Seed ${productId}`,
    unit: 'kg',
    unitPriceUzs: 4_000_000,
    stockQuantity: 20,
  });
  return seller;
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
  },
);

When('the buyer adds both products using only product identity and quantity', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  await adapter.addToCart(buyer, 'product-a', 1);
  await adapter.addToCart(buyer, 'product-b', 2);
  this.agriTechMarketplaceCarts = await adapter.listCarts(buyer);
});

Then('two open carts persist with one cart for each product seller', function (this: AcceptanceWorld) {
  assert.equal(this.agriTechMarketplaceCarts.length, 2);
  const productBySeller = Object.fromEntries(
    this.agriTechMarketplaceCarts.map((cart) => [cart.sellerId, cart.items.map((item) => item.productId)]),
  );
  assert.deepEqual(productBySeller, {
    'seller-a': ['product-a'],
    'seller-b': ['product-b'],
  });
});

Given('a verified DehqonHub buyer has an open seller cart', async function (this: AcceptanceWorld) {
  const { buyer, marketplace: adapter } = createMarketplace(this);
  this.agriTechMarketplaceSeller = registerSellerProduct(adapter, 'seller-a', 'checkout-product');
  const cart = await adapter.addToCart(buyer, 'checkout-product', 2);
  this.agriTechMarketplaceCartId = cart.id;
});

When('the buyer confirms pickup and checks out the cart', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceCartId, 'checkout cart was not initialized');
  this.agriTechMarketplaceCheckout = await adapter.checkoutCart(buyer, this.agriTechMarketplaceCartId, {
    deliveryTerms: 'pickup',
  });
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
    assert.equal(contract.buyerUserId, buyer.userId);
    assert.equal(contract.sellerUserId, seller.userId);
    assert.equal(contract.deliveryTerms, 'pickup');
    assert.equal(contract.deliveryPriceUzs, 0);
    assert.equal(contract.lines.length, 1);
    assert.deepEqual(contract.lines[0], {
      productId: 'checkout-product',
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
    const seller = { tenantId: marketplaceTenantId, userId: 'offer-seller-user' };
    adapter.registerVerifiedActor(seller, 'seller');
    adapter.registerApprovedOrganization(seller, 'supplier');
    this.agriTechMarketplaceSeller = seller;
    this.agriTechMarketplaceRequest = await adapter.createRequest(buyer, {
      title: 'Certified corn seed',
      volume: '10 t',
      region: 'Samarkand',
    });
    this.agriTechMarketplaceOffer = await adapter.makeOffer(
      seller,
      this.agriTechMarketplaceRequest.id,
      40_800_000,
      'seller_delivery',
      800_000,
      'Seller delivery',
      4,
    );
  },
);

When('the buyer chooses that offer', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceRequest, 'purchase request was not initialized');
  assert.ok(this.agriTechMarketplaceOffer, 'offer was not initialized');
  this.agriTechMarketplaceSelection = await adapter.chooseOffer(
    buyer,
    this.agriTechMarketplaceRequest.id,
    this.agriTechMarketplaceOffer.id,
  );
});

Then(
  'the request and offer are selected and one matching draft contract is returned for review',
  async function (this: AcceptanceWorld) {
    const adapter = requireMarketplace(this);
    const buyer = requireBuyer(this);
    const seller = requireSeller(this);
    assert.ok(this.agriTechMarketplaceSelection, 'offer selection was not returned');
    const selectedRequest = await adapter.findRequest(buyer, this.agriTechMarketplaceSelection.requestId);
    const acceptedOffer = await adapter.findOffer(
      buyer,
      this.agriTechMarketplaceSelection.requestId,
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
    assert.equal(contract.buyerUserId, buyer.userId);
    assert.equal(contract.sellerUserId, seller.userId);
    assert.equal(contract.amountUzs, acceptedOffer.priceUzs);
    assert.equal(contract.deliveryTerms, 'seller_delivery');
    assert.equal(contract.deliveryPriceUzs, 800_000);
    assert.equal((await adapter.listContracts(buyer)).length, 1);
  },
);

Given('a verified buyer and seller have a draft DehqonHub contract', async function (this: AcceptanceWorld) {
  const { buyer, marketplace: adapter } = createMarketplace(this);
  this.agriTechMarketplaceSeller = registerSellerProduct(adapter, 'seller-a', 'contract-product');
  const cart = await adapter.addToCart(buyer, 'contract-product', 1);
  const checkout = await adapter.checkoutCart(buyer, cart.id, { deliveryTerms: 'pickup' });
  const contract = await adapter.findContract(buyer, checkout.contractId);
  assert.ok(contract, 'draft contract was not persisted');
  this.agriTechMarketplaceContract = contract;
});

When('the buyer records their contract consent', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceContract, 'contract was not initialized');
  this.agriTechMarketplaceContract = await adapter.signContract(buyer, this.agriTechMarketplaceContract.id);
});

Then('only buyer consent is persisted and the contract awaits the seller', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceContract, 'buyer consent result was not returned');
  const persisted = await adapter.findContract(buyer, this.agriTechMarketplaceContract.id);
  assert.ok(persisted, 'buyer consent was not persisted');
  assert.equal(persisted.status, 'signed');
  assert.ok(persisted.buyerSignedAt, 'buyer consent was not persisted');
  assert.equal(persisted.sellerSignedAt, undefined);
});

When('the seller records their contract consent', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const seller = requireSeller(this);
  assert.ok(this.agriTechMarketplaceContract, 'contract was not initialized');
  this.agriTechMarketplaceContract = await adapter.signContract(seller, this.agriTechMarketplaceContract.id);
});

Then('both party consents persist and the contract becomes active', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  assert.ok(this.agriTechMarketplaceContract, 'seller consent result was not returned');
  const persisted = await adapter.findContract(buyer, this.agriTechMarketplaceContract.id);
  assert.ok(persisted, 'active contract was not persisted');
  assert.equal(persisted.status, 'active');
  assert.ok(persisted.buyerSignedAt, 'buyer consent disappeared');
  assert.ok(persisted.sellerSignedAt, 'seller consent was not persisted');
  assert.ok(persisted.signedAt, 'activation timestamp was not persisted');
});

Given(
  'a verified DehqonHub buyer without an approved buyer organization can discover an active product',
  function (this: AcceptanceWorld) {
    const adapter = new MarketplaceInMemoryAdapter();
    const buyer = { tenantId: marketplaceTenantId, userId: 'unapproved-buyer-user' };
    adapter.registerVerifiedActor(buyer, 'buyer');
    this.agriTechMarketplace = adapter;
    this.agriTechMarketplaceBuyer = buyer;
    this.agriTechMarketplaceSeller = registerSellerProduct(adapter, 'approved-seller', 'approval-product');
  },
);

When('the unapproved buyer attempts to add the product to a cart', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  try {
    await adapter.addToCart(buyer, 'approval-product', 1);
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
});

When('the unverified user attempts to add the product to a cart', async function (this: AcceptanceWorld) {
  const adapter = requireMarketplace(this);
  const buyer = requireBuyer(this);
  try {
    await adapter.addToCart(buyer, 'visible-product', 1);
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
