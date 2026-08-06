import type { DeliveryStatus, PartnerStatus, PilotStatus, ProduceStatus } from './agritech.types';

const deliveryTransitions: Readonly<Record<DeliveryStatus, readonly DeliveryStatus[]>> = {
  scheduled: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const pilotTransitions: Readonly<Record<PilotStatus, readonly PilotStatus[]>> = {
  planned: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const isPartnerApproved = (status: PartnerStatus): boolean => status === 'approved';

export function isProduceReservationAllowed(input: {
  status: ProduceStatus;
  availableQuantityKg: number;
  requestedQuantityKg: number;
  availableUntil: Date;
  now?: Date;
}): boolean {
  return (
    input.status === 'active' &&
    input.requestedQuantityKg > 0 &&
    input.availableQuantityKg >= input.requestedQuantityKg &&
    input.availableUntil.getTime() > (input.now ?? new Date()).getTime()
  );
}

export function isDeliveryTransitionAllowed(
  current: DeliveryStatus,
  next: DeliveryStatus,
  proofReference?: string,
): boolean {
  return deliveryTransitions[current].includes(next) && (next !== 'delivered' || Boolean(proofReference?.trim()));
}

export const isPilotTransitionAllowed = (current: PilotStatus, next: PilotStatus): boolean =>
  current === next || pilotTransitions[current].includes(next);
