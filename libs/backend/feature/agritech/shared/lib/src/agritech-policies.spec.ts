// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-ORDER-003 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-FULFILLMENT-010
import { describe, expect, it } from 'vitest';
import {
  isDeliveryTransitionAllowed,
  isPartnerApproved,
  isPilotTransitionAllowed,
  isProduceReservationAllowed,
} from './agritech-policies';

describe('AgriTech operating policies', () => {
  it('gates marketplace actions on reviewed partner status', () => {
    expect(isPartnerApproved('pending')).toBe(false);
    expect(isPartnerApproved('approved')).toBe(true);
    expect(isPartnerApproved('suspended')).toBe(false);
  });

  it('rejects expired, empty, non-positive, or oversized produce reservations', () => {
    const future = new Date('2030-01-02T00:00:00.000Z');
    const now = new Date('2030-01-01T00:00:00.000Z');
    const allowed = (requestedQuantityKg: number, availableQuantityKg = 100, availableUntil = future) =>
      isProduceReservationAllowed({
        status: 'active',
        requestedQuantityKg,
        availableQuantityKg,
        availableUntil,
        now,
      });

    expect(allowed(25)).toBe(true);
    expect(allowed(0)).toBe(false);
    expect(allowed(101)).toBe(false);
    expect(allowed(25, 100, now)).toBe(false);
    expect(
      isProduceReservationAllowed({
        status: 'active',
        requestedQuantityKg: 1,
        availableQuantityKg: 1,
        availableUntil: new Date(Date.now() + 60_000),
      }),
    ).toBe(true);
  });

  it('requires ordered fulfillment transitions and delivery proof', () => {
    expect(isDeliveryTransitionAllowed('assigned', 'picked_up')).toBe(true);
    expect(isDeliveryTransitionAllowed('in_transit', 'delivered')).toBe(false);
    expect(isDeliveryTransitionAllowed('in_transit', 'delivered', 'proof://delivery/42')).toBe(true);
    expect(isDeliveryTransitionAllowed('delivered', 'cancelled')).toBe(false);
  });

  it('keeps pilot lifecycle monotonic', () => {
    expect(isPilotTransitionAllowed('planned', 'active')).toBe(true);
    expect(isPilotTransitionAllowed('active', 'completed')).toBe(true);
    expect(isPilotTransitionAllowed('completed', 'active')).toBe(false);
  });
});
