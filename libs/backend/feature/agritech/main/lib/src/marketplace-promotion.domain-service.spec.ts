// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import type {
  MarketplaceListingPromotion,
  MarketplacePromotionBillingProvider,
  MarketplacePromotionRepository,
  MarketplacePromotionReservation,
  MarketplaceProviderOperationRepository,
  MarketplaceProviderSafeReceipt,
} from '@app/backend-feature-agritech-shared';
import { marketplacePromotionActivationFingerprint } from '@app/backend-feature-agritech-shared';
import { MarketplacePromotionDomainService } from './marketplace-promotion.domain-service';
import { MarketplaceProviderUnavailableException } from './marketplace-verification.domain-service';

const owner = { tenantId: 'tenant-1', userId: 'seller-1' };
const now = new Date('2030-01-01T00:00:00.000Z');
const listingPublicId = '11111111-1111-4111-8111-111111111111';
const actingPartnerId = '33333333-3333-4333-8333-333333333333';
const promotionId = '22222222-2222-4222-8222-222222222222';
const operationId = '44444444-4444-4444-8444-444444444444';
const activation = { actingPartnerId, listingPublicId, planCode: 'catalog_7d' } as const;

const promotion: MarketplaceListingPromotion = {
  activatedAt: now,
  activationReference: `promotion:${promotionId}`,
  createdAt: now,
  currency: 'UZS',
  endsAt: new Date('2030-01-08T00:00:00.000Z'),
  id: promotionId,
  listingPublicId,
  planCode: 'catalog_7d',
  priceUzs: 150_000,
  revision: 1,
  sellerPartnerId: actingPartnerId,
  startsAt: now,
  status: 'active',
  updatedAt: now,
};

const reservation: MarketplacePromotionReservation = {
  id: promotionId,
  listingPublicId,
  planCode: 'catalog_7d',
  priceUzs: 150_000,
  revision: 0,
  sellerPartnerId: actingPartnerId,
};

const simulatedReceipt: MarketplaceProviderSafeReceipt = {
  amountUzs: 150_000,
  currency: 'UZS',
  moneyMoved: false,
  planCode: 'catalog_7d',
  simulated: true,
};

const billingResult = {
  chargedAmountUzs: 150_000,
  completedAt: now,
  currency: 'UZS' as const,
  providerEventId: `mock-promotion-billing-event:${promotionId}`,
  providerMode: 'mock' as const,
  providerName: 'mock-promotion-billing',
  providerReference: `mock-promotion-billing:${operationId}`,
  safeReceipt: simulatedReceipt,
};

function fixture(
  options: {
    mode?: 'disabled' | 'live' | 'mock';
    timeoutMs?: number;
  } = {},
) {
  const repository = {
    findPromotion: vi.fn(),
    listPromotions: vi.fn(),
    reservePromotion: vi.fn(),
    settlePromotion: vi.fn(),
  };
  const providerOperations = {
    completeProviderOperation: vi.fn(),
    failProviderOperation: vi.fn(),
    prepareProviderOperation: vi.fn(),
  };
  const billing = {
    billListingPromotion: vi.fn(),
    mode: options.mode ?? 'mock',
    name: options.mode === 'disabled' ? 'disabled' : 'mock-promotion-billing',
  };
  repository.reservePromotion.mockResolvedValue({ status: 'ok', value: reservation });
  repository.settlePromotion.mockResolvedValue({ status: 'ok', value: promotion });
  providerOperations.prepareProviderOperation.mockResolvedValue({
    status: 'ok',
    value: { attempt: 1, execute: true, operationId },
  });
  providerOperations.completeProviderOperation.mockResolvedValue({ status: 'ok', value: { operationId } });
  providerOperations.failProviderOperation.mockResolvedValue(undefined);
  billing.billListingPromotion.mockResolvedValue(billingResult);
  const service = new MarketplacePromotionDomainService(
    repository as unknown as MarketplacePromotionRepository,
    providerOperations as unknown as MarketplaceProviderOperationRepository,
    billing as unknown as MarketplacePromotionBillingProvider,
    options.timeoutMs ?? 10_000,
    () => now,
  );
  return { billing, providerOperations, repository, service };
}

describe('MarketplacePromotionDomainService', () => {
  it('refuses the paid action outright when no billing capability is configured', async () => {
    const { billing, repository, service } = fixture({ mode: 'disabled' });

    const refusal = await service.activatePromotion(owner, 'promotion-key-0001', activation).catch((error) => error);

    expect(refusal).toBeInstanceOf(MarketplaceProviderUnavailableException);
    expect(refusal.getStatus()).toBe(503);
    expect(refusal.extensions).toEqual({
      capability: 'promotion_billing',
      providerMode: 'disabled',
      retryable: false,
    });
    expect(repository.reservePromotion).not.toHaveBeenCalled();
    expect(billing.billListingPromotion).not.toHaveBeenCalled();
  });

  it('reserves, charges once, and only then settles the paid slot', async () => {
    const { billing, providerOperations, repository, service } = fixture();

    await expect(service.activatePromotion(owner, 'promotion-key-0001', activation)).resolves.toBe(promotion);

    expect(repository.reservePromotion).toHaveBeenCalledWith(owner, {
      ...activation,
      idempotencyKey: 'promotion-key-0001',
      requestFingerprint: marketplacePromotionActivationFingerprint(activation),
    });
    const preparation = providerOperations.prepareProviderOperation.mock.calls[0]?.[1];
    expect(preparation).toMatchObject({
      actorType: 'promotion_owner',
      capability: 'promotion_billing',
      idempotencyKey: 'promotion-key-0001',
      providerMode: 'mock',
      providerName: 'mock-promotion-billing',
      requestDescriptor: { action: 'bill-listing-promotion', resourceId: promotionId, resourceRevision: 0 },
      resourceId: promotionId,
      resourceRevision: 0,
      resourceType: 'promotion',
    });
    expect(preparation?.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(billing.billListingPromotion).toHaveBeenCalledWith({
      amountUzs: 150_000,
      currency: 'UZS',
      listingPublicId,
      operationAttempt: 1,
      operationId,
      planCode: 'catalog_7d',
      promotionId,
      sellerPartnerId: actingPartnerId,
      signal: expect.any(AbortSignal),
    });
    expect(providerOperations.completeProviderOperation).toHaveBeenCalledWith(owner, operationId, 1, {
      providerEventId: `mock-promotion-billing-event:${promotionId}`,
      providerMode: 'mock',
      providerName: 'mock-promotion-billing',
      providerReference: `mock-promotion-billing:${operationId}`,
      resultDescriptor: {
        completedAt: now.toISOString(),
        outcome: 'promotion_charged',
        resourceId: promotionId,
        resourceRevision: 0,
        resourceType: 'promotion',
      },
      safeReceipt: simulatedReceipt,
    });
    expect(repository.settlePromotion).toHaveBeenCalledWith(owner, promotionId, operationId);
    expect(
      providerOperations.completeProviderOperation.mock.calls[0]?.[3]?.safeReceipt as MarketplaceProviderSafeReceipt,
    ).toMatchObject({ moneyMoved: false, simulated: true });
  });

  it('returns the original record for an exact replay without charging again', async () => {
    const { billing, providerOperations, repository, service } = fixture();
    repository.reservePromotion.mockResolvedValue({
      status: 'ok',
      value: { ...reservation, settledPromotion: promotion },
    });

    await expect(service.activatePromotion(owner, 'promotion-key-0001', activation)).resolves.toBe(promotion);

    expect(providerOperations.prepareProviderOperation).not.toHaveBeenCalled();
    expect(billing.billListingPromotion).not.toHaveBeenCalled();
    expect(repository.settlePromotion).not.toHaveBeenCalled();
  });

  it('replays a recorded charge without calling the provider a second time', async () => {
    const { billing, providerOperations, repository, service } = fixture();
    providerOperations.prepareProviderOperation.mockResolvedValue({
      status: 'ok',
      value: { attempt: 2, execute: false, operationId },
    });

    await expect(service.activatePromotion(owner, 'promotion-key-0001', activation)).resolves.toBe(promotion);

    expect(billing.billListingPromotion).not.toHaveBeenCalled();
    expect(providerOperations.completeProviderOperation).not.toHaveBeenCalled();
    expect(repository.settlePromotion).toHaveBeenCalledWith(owner, promotionId, operationId);
  });

  it('omits an absent provider event from the recorded charge', async () => {
    const { billing, providerOperations, service } = fixture();
    billing.billListingPromotion.mockResolvedValue({ ...billingResult, providerEventId: undefined });

    await service.activatePromotion(owner, 'promotion-key-0001', activation);

    expect(providerOperations.completeProviderOperation.mock.calls[0]?.[3]).not.toHaveProperty('providerEventId');
  });

  it('conflicts instead of double charging when another command already claimed the promotion', async () => {
    const { billing, providerOperations, service } = fixture();
    providerOperations.prepareProviderOperation.mockResolvedValue({
      status: 'conflict',
      field: 'operationInProgress',
    });

    await expect(service.activatePromotion(owner, 'promotion-key-0002', activation)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(billing.billListingPromotion).not.toHaveBeenCalled();
  });

  it.each([
    ['a rejected charge', new Error('provider exploded')],
    ['a wrong amount', { ...billingResult, chargedAmountUzs: 1 }],
    [
      'a mock charge claiming money moved',
      { ...billingResult, safeReceipt: { ...simulatedReceipt, moneyMoved: true } },
    ],
    ['a mock charge hiding its simulation', { ...billingResult, safeReceipt: { amountUzs: 150_000 } }],
    ['a provider identity mismatch', { ...billingResult, providerName: 'other-provider' }],
    ['a provider mode mismatch', { ...billingResult, providerMode: 'live' }],
  ])('records %s as a failed charge and leaves the slot unpromoted', async (_case, outcome) => {
    const { billing, providerOperations, repository, service } = fixture();
    if (outcome instanceof Error) {
      billing.billListingPromotion.mockRejectedValue(outcome);
    } else {
      billing.billListingPromotion.mockResolvedValue(outcome);
    }

    const refusal = await service.activatePromotion(owner, 'promotion-key-0001', activation).catch((error) => error);

    expect(refusal).toBeInstanceOf(MarketplaceProviderUnavailableException);
    expect(refusal.getStatus()).toBe(503);
    expect(refusal.extensions).toMatchObject({ capability: 'promotion_billing', retryable: true });
    expect(providerOperations.failProviderOperation).toHaveBeenCalledWith(
      owner,
      operationId,
      1,
      'promotion_billing_failed',
      undefined,
    );
    expect(providerOperations.completeProviderOperation).not.toHaveBeenCalled();
    expect(repository.settlePromotion).not.toHaveBeenCalled();
  });

  it('marks a timed-out charge for reconciliation instead of assuming it failed', async () => {
    const { billing, providerOperations, repository, service } = fixture({ timeoutMs: 5 });
    billing.billListingPromotion.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(billingResult);
          }, 200);
        }),
    );
    providerOperations.failProviderOperation.mockRejectedValue(new Error('ledger unavailable'));

    await expect(service.activatePromotion(owner, 'promotion-key-0001', activation)).rejects.toBeInstanceOf(
      MarketplaceProviderUnavailableException,
    );

    expect(providerOperations.failProviderOperation).toHaveBeenCalledWith(
      owner,
      operationId,
      1,
      'promotion_billing_timeout',
      'provider_outcome_unknown',
    );
    expect(repository.settlePromotion).not.toHaveBeenCalled();
  });

  it('refuses with reconciliation when the charge cannot be persisted', async () => {
    const { providerOperations, repository, service } = fixture();
    providerOperations.completeProviderOperation.mockResolvedValue({ status: 'conflict', field: 'operationAttempt' });

    const refusal = await service.activatePromotion(owner, 'promotion-key-0001', activation).catch((error) => error);

    expect(refusal).toBeInstanceOf(MarketplaceProviderUnavailableException);
    expect(refusal.extensions).toEqual({
      capability: 'promotion_billing',
      providerMode: 'mock',
      retryable: false,
    });
    expect(providerOperations.failProviderOperation).toHaveBeenCalledWith(
      owner,
      operationId,
      1,
      'promotion_billing_completion_persist_failed',
      'provider_outcome_unknown',
    );
    expect(repository.settlePromotion).not.toHaveBeenCalled();
  });

  it('still refuses when neither the charge nor its failure record can be persisted', async () => {
    const { providerOperations, repository, service } = fixture();
    providerOperations.completeProviderOperation.mockRejectedValue('ledger offline');
    providerOperations.failProviderOperation.mockRejectedValue('ledger offline');

    const refusal = await service.activatePromotion(owner, 'promotion-key-0001', activation).catch((error) => error);

    expect(refusal).toBeInstanceOf(MarketplaceProviderUnavailableException);
    expect(refusal.cause).toBeInstanceOf(Error);
    expect(refusal.extensions).toMatchObject({ capability: 'promotion_billing', retryable: false });
    expect(repository.settlePromotion).not.toHaveBeenCalled();
  });

  it('wraps a non-error provider rejection without losing the refusal', async () => {
    const { billing, repository, service } = fixture();
    billing.billListingPromotion.mockRejectedValue('provider offline');

    const refusal = await service.activatePromotion(owner, 'promotion-key-0001', activation).catch((error) => error);

    expect(refusal).toBeInstanceOf(MarketplaceProviderUnavailableException);
    expect(refusal.cause).toBeInstanceOf(Error);
    expect(repository.settlePromotion).not.toHaveBeenCalled();
  });

  it('rejects unsupported plans and unbounded schedule dates before reserving anything', async () => {
    const { repository, service } = fixture();

    await expect(
      service.activatePromotion(owner, 'promotion-key-0001', { ...activation, planCode: 'caller_defined' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.activatePromotion(owner, 'promotion-key-0002', {
        ...activation,
        startsAt: new Date('2030-02-01T00:00:00.001Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.activatePromotion(owner, 'promotion-key-0003', { ...activation, startsAt: new Date(Number.NaN) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.activatePromotion(owner, 'promotion-key-0004', {
        ...activation,
        startsAt: new Date('2029-12-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.reservePromotion).not.toHaveBeenCalled();

    await expect(
      service.activatePromotion(owner, 'promotion-key-0005', { ...activation, startsAt: now }),
    ).resolves.toBe(promotion);
  });

  it('reads the real clock and default timeout when none are injected', async () => {
    const { billing, providerOperations, repository } = fixture();
    const service = new MarketplacePromotionDomainService(
      repository as unknown as MarketplacePromotionRepository,
      providerOperations as unknown as MarketplaceProviderOperationRepository,
      billing as unknown as MarketplacePromotionBillingProvider,
    );

    await expect(
      service.activatePromotion(owner, 'promotion-key-0001', {
        ...activation,
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.reservePromotion).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', ConflictException],
    ['forbidden', ForbiddenException],
    ['partner_unapproved', ForbiddenException],
    ['invalid_state', BadRequestException],
    ['not_found', ResourceNotFoundException],
  ] as const)('maps reservation %s without leaking persistence details', async (status, ErrorType) => {
    const { billing, repository, service } = fixture();
    repository.reservePromotion.mockResolvedValue({ status, field: 'privateField' });

    await expect(service.activatePromotion(owner, 'promotion-key-0001', activation)).rejects.toBeInstanceOf(ErrorType);
    expect(billing.billListingPromotion).not.toHaveBeenCalled();
  });

  it('maps a refused settle without inventing a promoted placement', async () => {
    const { repository, service } = fixture();
    repository.settlePromotion.mockResolvedValue({ status: 'conflict', field: 'billingOperation' });

    await expect(service.activatePromotion(owner, 'promotion-key-0001', activation)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('delegates reads with the authenticated tenant and owner boundary', async () => {
    const { repository, service } = fixture();
    repository.findPromotion.mockResolvedValue(promotion);
    repository.listPromotions.mockResolvedValue([promotion]);

    await expect(service.findPromotion(owner, promotion.id)).resolves.toBe(promotion);
    await expect(service.listPromotions(owner)).resolves.toEqual([promotion]);
    expect(repository.findPromotion).toHaveBeenCalledWith(owner, promotion.id);
    expect(repository.listPromotions).toHaveBeenCalledWith(owner);
  });

  it('exposes the same fixed server-owned plan catalog used by activation', () => {
    const { service } = fixture();

    expect(service.listPlans()).toEqual([
      { code: 'catalog_7d', currency: 'UZS', durationDays: 7, priceUzs: 150_000 },
      { code: 'catalog_14d', currency: 'UZS', durationDays: 14, priceUzs: 270_000 },
      { code: 'catalog_30d', currency: 'UZS', durationDays: 30, priceUzs: 500_000 },
    ]);
  });
});
