// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ConflictException, ForbiddenException } from '@app/backend-common-exception';
import type { MarketplaceRepository } from '@app/backend-feature-agritech-shared';
import { MarketplaceService } from './marketplace.service';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const now = new Date('2026-08-09T00:00:00Z');
const ok = <T>(value: T) => ({ status: 'ok' as const, value });
const fail = (status: string) => ({ status });

function fixture() {
  const repository = {
    getVerification: vi.fn(),
    submitVerification: vi.fn(),
    reviewVerification: vi.fn(),
    listVerifications: vi.fn(),
    isVerified: vi.fn(),
    getCart: vi.fn(),
    listCarts: vi.fn(),
    addToCart: vi.fn(),
    updateCartItem: vi.fn(),
    removeCartItem: vi.fn(),
    checkoutCart: vi.fn(),
    requestSample: vi.fn(),
    listSamples: vi.fn(),
    sampleUsageThisMonth: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    listFavorites: vi.fn(),
    addReview: vi.fn(),
    listProductReviews: vi.fn(),
    createRequest: vi.fn(),
    listRequests: vi.fn(),
    listMyRequests: vi.fn(),
    makeOffer: vi.fn(),
    listOffers: vi.fn(),
    chooseOffer: vi.fn(),
    createContract: vi.fn(),
    signContract: vi.fn(),
    listContracts: vi.fn(),
    listTenantContracts: vi.fn(),
    askAi: vi.fn(),
    listAiConsultations: vi.fn(),
    roleOf: vi.fn(),
  };
  const service = new MarketplaceService(repository as unknown as MarketplaceRepository);
  return { repository, service };
}

const verification = {
  id: 'v-1',
  tenantId: owner.tenantId,
  userId: owner.userId,
  role: 'farmer' as const,
  level: 'verified' as const,
  status: 'verified' as const,
  oneIdLinked: true,
  documents: [{ kind: 'id' as const, fileName: 'passport.jpg', storageKey: 'k1', optional: false }],
  createdAt: now,
  updatedAt: now,
};

describe('MarketplaceService', () => {
  it('submits a verification for a fresh profile', async () => {
    const { repository, service } = fixture();
    repository.getVerification.mockResolvedValue(undefined);
    repository.submitVerification.mockResolvedValue(ok(verification));
    const result = await service.submitVerification(owner, {
      role: 'farmer',
      level: 'verified',
      oneIdLinked: true,
      documents: [{ kind: 'id', fileName: 'passport.jpg', storageKey: 'k1' }],
    });
    expect(result.status).toBe('verified');
    expect(repository.submitVerification).toHaveBeenCalled();
  });

  it('rejects a verification submit with no documents', async () => {
    const { repository, service } = fixture();
    repository.getVerification.mockResolvedValue(undefined);
    await expect(
      service.submitVerification(owner, {
        role: 'farmer',
        level: 'basic',
        oneIdLinked: false,
        documents: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a re-submit when already verified', async () => {
    const { repository, service } = fixture();
    repository.getVerification.mockResolvedValue(verification);
    await expect(
      service.submitVerification(owner, {
        role: 'farmer',
        level: 'verified',
        oneIdLinked: true,
        documents: [{ kind: 'id', fileName: 'p.jpg', storageKey: 'k' }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('blocks sample requests when the user is not verified', async () => {
    const { repository, service } = fixture();
    repository.isVerified.mockResolvedValue(false);
    repository.sampleUsageThisMonth.mockResolvedValue(0);
    await expect(service.requestSample(owner, 'p-1', 's-1')).rejects.toThrow(BadRequestException);
  });

  it('blocks sample requests over the monthly limit', async () => {
    const { repository, service } = fixture();
    repository.isVerified.mockResolvedValue(true);
    repository.sampleUsageThisMonth.mockResolvedValue(5);
    await expect(service.requestSample(owner, 'p-1', 's-1')).rejects.toThrow(BadRequestException);
  });

  it('allows a sample request within the limit for a verified user', async () => {
    const { repository, service } = fixture();
    repository.isVerified.mockResolvedValue(true);
    repository.sampleUsageThisMonth.mockResolvedValue(1);
    repository.requestSample.mockResolvedValue(ok({ id: 's-1', tenantId: owner.tenantId, userId: owner.userId, productId: 'p-1', sellerId: 's-1', status: 'pending', createdAt: now }));
    const result = await service.requestSample(owner, 'p-1', 's-1');
    expect(result.id).toBe('s-1');
  });

  it('returns sample usage summary', async () => {
    const { repository, service } = fixture();
    repository.sampleUsageThisMonth.mockResolvedValue(2);
    const usage = await service.sampleUsage(owner);
    expect(usage).toEqual({ used: 2, limit: 5, remaining: 3 });
  });

  it('requires verification before checkout', async () => {
    const { repository, service } = fixture();
    repository.isVerified.mockResolvedValue(false);
    await expect(service.checkoutCart(owner, 'c-1')).rejects.toThrow(ForbiddenException);
  });

  it('requires verification before creating a request', async () => {
    const { repository, service } = fixture();
    repository.isVerified.mockResolvedValue(false);
    await expect(
      service.createRequest(owner, { title: 'Corn', region: 'Samarkand' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires verification before creating a contract', async () => {
    const { repository, service } = fixture();
    repository.isVerified.mockResolvedValue(false);
    await expect(
      service.createContract(owner, {
        buyerUserId: 'b-1',
        sellerUserId: 's-1',
        subject: 'Corn 10t',
        amountUzs: 5000000,
        deliveryTerms: 'pickup',
        factoringEnabled: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('signs a contract via the repository', async () => {
    const { repository, service } = fixture();
    repository.signContract.mockResolvedValue(ok({ id: 'c-1', status: 'signed' }));
    const result = await service.signContract(owner, 'c-1');
    expect(result.status).toBe('signed');
  });

  it('returns the user role from the repository', async () => {
    const { repository, service } = fixture();
    repository.roleOf.mockResolvedValue('farmer');
    expect(await service.roleOf(owner)).toBe('farmer');
  });
});
