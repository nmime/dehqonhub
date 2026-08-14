// @requirements REQ-AGRITECH-STAGE2-017
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import type { MarketplaceListingPromotion, MarketplacePromotionRepository } from '@app/backend-feature-agritech-shared';
import { marketplacePromotionActivationFingerprint } from '@app/backend-feature-agritech-shared';
import { MarketplacePromotionDomainService } from './marketplace-promotion.domain-service';

const owner = { tenantId: 'tenant-1', userId: 'seller-1' };
const now = new Date('2030-01-01T00:00:00.000Z');
const listingPublicId = '11111111-1111-4111-8111-111111111111';
const actingPartnerId = '33333333-3333-4333-8333-333333333333';

const promotion: MarketplaceListingPromotion = {
  activatedAt: now,
  activationReference: 'promotion:22222222-2222-4222-8222-222222222222',
  createdAt: now,
  currency: 'UZS',
  endsAt: new Date('2030-01-08T00:00:00.000Z'),
  id: '22222222-2222-4222-8222-222222222222',
  listingPublicId,
  planCode: 'catalog_7d',
  priceUzs: 150_000,
  revision: 0,
  sellerPartnerId: actingPartnerId,
  startsAt: now,
  status: 'active',
  updatedAt: now,
};

function fixture() {
  const repository = {
    activatePromotion: vi.fn(),
    findPromotion: vi.fn(),
    listPromotions: vi.fn(),
  };
  const service = new MarketplacePromotionDomainService(
    repository as unknown as MarketplacePromotionRepository,
    () => now,
  );
  return { repository, service };
}

describe('MarketplacePromotionDomainService', () => {
  it('activates one server-owned bounded plan with a canonical command fingerprint', async () => {
    const { repository, service } = fixture();
    repository.activatePromotion.mockResolvedValue({ status: 'ok', value: promotion });

    await expect(
      service.activatePromotion(owner, 'promotion-key-0001', {
        actingPartnerId,
        listingPublicId,
        planCode: 'catalog_7d',
      }),
    ).resolves.toBe(promotion);

    expect(repository.activatePromotion).toHaveBeenCalledWith(owner, {
      actingPartnerId,
      idempotencyKey: 'promotion-key-0001',
      listingPublicId,
      planCode: 'catalog_7d',
      requestFingerprint: marketplacePromotionActivationFingerprint({
        actingPartnerId,
        listingPublicId,
        planCode: 'catalog_7d',
      }),
    });
  });

  it('rejects unsupported plans and unbounded schedule dates before persistence', async () => {
    const { repository, service } = fixture();

    await expect(
      service.activatePromotion(owner, 'promotion-key-0001', {
        actingPartnerId,
        listingPublicId,
        planCode: 'caller_defined' as 'catalog_7d',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.activatePromotion(owner, 'promotion-key-0002', {
        actingPartnerId,
        listingPublicId,
        planCode: 'catalog_7d',
        startsAt: new Date('2030-02-01T00:00:00.001Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.activatePromotion).not.toHaveBeenCalled();
  });

  it('accepts a start date inside the scheduling window and refuses every date outside it', async () => {
    const { repository, service } = fixture();
    const request = { actingPartnerId, listingPublicId, planCode: 'catalog_7d' } as const;

    await expect(
      service.activatePromotion(owner, 'promotion-key-0003', { ...request, startsAt: new Date(Number.NaN) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.activatePromotion(owner, 'promotion-key-0004', {
        ...request,
        startsAt: new Date('2029-12-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Left to itself the service reads the real clock, so a start date years in
    // the past stays refused whatever the wall clock happens to say.
    const withRealClock = new MarketplacePromotionDomainService(
      repository as unknown as MarketplacePromotionRepository,
    );
    await expect(
      withRealClock.activatePromotion(owner, 'promotion-key-0005', {
        ...request,
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.activatePromotion).not.toHaveBeenCalled();

    repository.activatePromotion.mockResolvedValue({ status: 'ok', value: promotion });
    await expect(service.activatePromotion(owner, 'promotion-key-0006', { ...request, startsAt: now })).resolves.toBe(
      promotion,
    );
  });

  it.each([
    ['conflict', ConflictException],
    ['forbidden', ForbiddenException],
    ['invalid_state', BadRequestException],
    ['not_found', ResourceNotFoundException],
  ] as const)('maps repository %s without leaking persistence details', async (status, ErrorType) => {
    const { repository, service } = fixture();
    repository.activatePromotion.mockResolvedValue({ status, field: 'privateField' });

    await expect(
      service.activatePromotion(owner, 'promotion-key-0001', {
        actingPartnerId,
        listingPublicId,
        planCode: 'catalog_7d',
      }),
    ).rejects.toBeInstanceOf(ErrorType);
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
