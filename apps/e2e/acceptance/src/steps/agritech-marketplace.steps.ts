// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-FULFILLMENT-010
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import * as agriTechSource from '@app/backend-feature-agritech-shared';
import type { AcceptanceWorld } from '../support/world.ts';

const agriTech =
  (
    agriTechSource as unknown as {
      default?: typeof agriTechSource;
    }
  ).default ?? agriTechSource;
const { isDeliveryTransitionAllowed, isPartnerApproved, isProduceReservationAllowed } = agriTech;

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
