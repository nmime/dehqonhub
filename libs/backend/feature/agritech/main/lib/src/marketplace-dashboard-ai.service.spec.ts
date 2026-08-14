// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@app/backend-common-exception';
import type { MarketplaceDashboardAiRepository } from '@app/backend-feature-agritech-shared';
import { MarketplaceDashboardAiDomainService } from './marketplace-dashboard-ai.service';

const owner = { tenantId: 'buyer-tenant', userId: 'buyer-user' };
const now = new Date('2026-08-10T12:00:00.000Z');

const fixture = () => {
  const repository = {
    confirmAiStarterCart: vi.fn(),
    createAiConsultation: vi.fn(),
    getRoleDashboard: vi.fn(),
    listAiConsultations: vi.fn(),
  };
  return {
    repository,
    service: new MarketplaceDashboardAiDomainService(repository as unknown as MarketplaceDashboardAiRepository),
  };
};

describe('MarketplaceDashboardAiDomainService', () => {
  it('returns only the authorized persisted dashboard projection', async () => {
    const { repository, service } = fixture();
    repository.getRoleDashboard.mockResolvedValue({
      status: 'ok',
      value: {
        buyer: {
          activeDeals: 1,
          completedDeals: 2,
          completedSpendUzs: 12_000_000,
          openCarts: 1,
          openPurchaseRequests: 1,
        },
        generatedAt: now,
        monthlyActivity: [],
        recentDeals: [],
        role: 'buyer',
      },
    });

    await expect(service.getRoleDashboard(owner)).resolves.toMatchObject({
      buyer: { completedDeals: 2, completedSpendUzs: 12_000_000 },
      role: 'buyer',
    });
    expect(repository.getRoleDashboard).toHaveBeenCalledWith(owner);
  });

  it('maps absent verified membership to the typed forbidden boundary', async () => {
    const { repository, service } = fixture();
    repository.getRoleDashboard.mockResolvedValue({ status: 'forbidden', field: 'organization' });

    await expect(service.getRoleDashboard(owner)).rejects.toThrow(ForbiddenException);
  });

  it('preserves the consultation semantic code and opaque public listing IDs', async () => {
    const { repository, service } = fixture();
    repository.createAiConsultation.mockResolvedValue({
      status: 'ok',
      value: {
        answer: 'catalog_match',
        createdAt: now,
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'recommendation',
        listingPublicationIds: ['22222222-2222-4222-8222-222222222222'],
        question: 'corn seed',
        response: {
          explanationCodes: ['grounded_at_consultation_time', 'stock_revalidated_on_confirmation'],
          recommendations: [
            {
              availability: {
                quantity: 20,
                status: 'in_stock_at_consultation',
                unit: 'kg',
                warningCode: 'stock_may_change',
              },
              listingPublicationId: '22222222-2222-4222-8222-222222222222',
              priceUzs: 4_200_000,
              reasonCodes: ['query_terms_match', 'current_public_stock'],
              sellerPublicId: '33333333-3333-4333-8333-333333333333',
              titles: {
                en: 'Certified corn seed',
                ru: 'Сертифицированные семена кукурузы',
                uz: "Sertifikatlangan makkajo'xori urug'i",
                uzCyrl: 'Сертификатланган маккажўхори уруғи',
              },
            },
          ],
          starterCartPreview: {
            sellerPartitions: [
              {
                listingPublicationIds: ['22222222-2222-4222-8222-222222222222'],
                sellerPublicId: '33333333-3333-4333-8333-333333333333',
              },
            ],
            status: 'requires_confirmation',
          },
        },
        updatedAt: now,
      },
    });

    await expect(
      service.createAiConsultation(owner, 'recommendation', 'corn seed', 'ai-create-0001'),
    ).resolves.toMatchObject({
      answer: 'catalog_match',
      listingPublicationIds: ['22222222-2222-4222-8222-222222222222'],
      response: {
        recommendations: [
          expect.objectContaining({
            listingPublicationId: '22222222-2222-4222-8222-222222222222',
            reasonCodes: ['query_terms_match', 'current_public_stock'],
          }),
        ],
      },
    });
    expect(repository.createAiConsultation).toHaveBeenCalledWith(
      owner,
      'recommendation',
      'corn seed',
      'ai-create-0001',
    );
  });

  it('does not invoke persistence when confirmation is cancelled', async () => {
    const { repository, service } = fixture();

    await expect(
      service.confirmAiStarterCart(
        owner,
        '11111111-1111-4111-8111-111111111111',
        { actingPartnerId: '22222222-2222-4222-8222-222222222222', confirmed: false },
        'starter-cart-0001',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repository.confirmAiStarterCart).not.toHaveBeenCalled();
  });

  it('returns the exact persisted replay result and maps changed-input reuse to conflict', async () => {
    const { repository, service } = fixture();
    repository.confirmAiStarterCart.mockResolvedValueOnce({
      status: 'ok',
      value: {
        carts: [
          {
            cartId: '33333333-3333-4333-8333-333333333333',
            listingPublicationIds: ['44444444-4444-4444-8444-444444444444'],
            sellerPublicId: '55555555-5555-4555-8555-555555555555',
          },
        ],
        confirmedAt: now,
        consultationId: '11111111-1111-4111-8111-111111111111',
        status: 'confirmed',
      },
    });
    const input = { actingPartnerId: '22222222-2222-4222-8222-222222222222', confirmed: true };

    await expect(
      service.confirmAiStarterCart(owner, '11111111-1111-4111-8111-111111111111', input, 'starter-cart-0001'),
    ).resolves.toMatchObject({ status: 'confirmed' });

    repository.confirmAiStarterCart.mockResolvedValueOnce({ status: 'conflict', field: 'idempotencyKey' });
    await expect(
      service.confirmAiStarterCart(owner, '11111111-1111-4111-8111-111111111111', input, 'starter-cart-0001'),
    ).rejects.toThrow(ConflictException);
  });
});
