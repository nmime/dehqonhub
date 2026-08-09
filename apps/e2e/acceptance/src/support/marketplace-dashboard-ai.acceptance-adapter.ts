// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { MarketplaceDashboardAiDomainService } from '@app/backend-feature-agritech-main-marketplace-dashboard-ai-domain-service';
import type {
  AgriTechOwner,
  MarketplaceAiConsultation,
  MarketplaceAiStarterCartInput,
  MarketplaceAiStarterCartResult,
  MarketplaceDashboardAiRepository,
  MarketplaceRoleDashboard,
  OperationResult,
} from '@app/backend-feature-agritech-shared';

const now = new Date('2030-01-01T00:00:00.000Z');
const buyer = { tenantId: 'tenant-ai-acceptance', userId: 'buyer-ai-acceptance' };
const buyerPartnerId = '11111111-1111-4111-8111-111111111111';
const listingA = '22222222-2222-4222-8222-222222222222';
const listingB = '33333333-3333-4333-8333-333333333333';
const sellerA = '44444444-4444-4444-8444-444444444444';
const sellerB = '55555555-5555-4555-8555-555555555555';

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });
const ownerKey = (owner: AgriTechOwner): string => `${owner.tenantId}:${owner.userId}`;
const fingerprint = (consultationId: string, input: MarketplaceAiStarterCartInput): string =>
  `${consultationId}:${input.actingPartnerId}:${String(input.confirmed)}`;

export interface MarketplaceDashboardAiAcceptanceResult {
  cancelledMutationCount: number;
  carts: MarketplaceAiStarterCartResult['carts'];
  changedCreateReplayConflict: boolean;
  changedReplayConflict: boolean;
  consultation: MarketplaceAiConsultation;
  exactCreateReplay: boolean;
  exactReplay: boolean;
  persistedOperationCount: number;
  serializedResult: string;
  stalePublicationConflict: boolean;
}

class AcceptanceDashboardAiRepository implements MarketplaceDashboardAiRepository {
  private readonly consultations = new Map<string, MarketplaceAiConsultation>();
  private readonly consultationOperations = new Map<
    string,
    { fingerprint: string; result: MarketplaceAiConsultation }
  >();
  private readonly operations = new Map<string, { fingerprint: string; result: MarketplaceAiStarterCartResult }>();
  private mutationCount = 0;
  private publicationsAvailable = true;

  getRoleDashboard(owner: AgriTechOwner): Promise<OperationResult<MarketplaceRoleDashboard>> {
    if (ownerKey(owner) !== ownerKey(buyer)) {
      return Promise.resolve({ status: 'forbidden', field: 'organization' });
    }
    return Promise.resolve(
      ok({
        buyer: {
          activeDeals: 0,
          completedDeals: 0,
          completedSpendUzs: 0,
          openCarts: 0,
          openPurchaseRequests: 0,
        },
        generatedAt: now,
        monthlyActivity: [],
        recentDeals: [],
        role: 'buyer',
      }),
    );
  }

  createAiConsultation(
    owner: AgriTechOwner,
    kind: MarketplaceAiConsultation['kind'],
    question: string,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceAiConsultation>> {
    if (ownerKey(owner) !== ownerKey(buyer) || !question.toLocaleLowerCase('en').includes('corn')) {
      return Promise.resolve({ status: 'forbidden', field: 'organization' });
    }
    const operationKey = `${ownerKey(owner)}:${idempotencyKey}`;
    const requestFingerprint = `${kind}:${question}`;
    const prior = this.consultationOperations.get(operationKey);
    if (prior) {
      return Promise.resolve(
        prior.fingerprint === requestFingerprint
          ? ok(structuredClone(prior.result))
          : { status: 'conflict', field: 'idempotencyKey' },
      );
    }
    const consultation: MarketplaceAiConsultation = {
      answer: 'catalog_match',
      createdAt: now,
      id: randomUUID(),
      kind,
      listingPublicationIds: [listingA, listingB],
      question,
      response: {
        explanationCodes: [
          'grounded_at_consultation_time',
          ...(kind === 'find_cheaper' ? (['lowest_current_price_first'] as const) : []),
          ...(kind === 'season_advice' ? (['seasonal_calendar_unavailable'] as const) : []),
          'stock_revalidated_on_confirmation',
        ],
        recommendations: [
          {
            availability: {
              quantity: 20,
              status: 'in_stock_at_consultation',
              unit: 'kg',
              warningCode: 'stock_may_change',
            },
            listingPublicationId: listingA,
            priceUzs: 4_000_000,
            reasonCodes: [
              'query_terms_match',
              'current_public_stock',
              ...(kind === 'find_cheaper' ? (['lowest_current_price'] as const) : []),
            ],
            sellerPublicId: sellerA,
            titles: {
              en: 'EN certified corn A',
              ru: 'RU certified corn A',
              uz: 'UZ certified corn A',
              uzCyrl: 'UZ-CYRL certified corn A',
            },
          },
          {
            availability: {
              quantity: 15,
              status: 'in_stock_at_consultation',
              unit: 'kg',
              warningCode: 'stock_may_change',
            },
            listingPublicationId: listingB,
            priceUzs: 4_200_000,
            reasonCodes: ['query_terms_match', 'current_public_stock'],
            sellerPublicId: sellerB,
            titles: {
              en: 'EN certified corn B',
              ru: 'RU certified corn B',
              uz: 'UZ certified corn B',
              uzCyrl: 'UZ-CYRL certified corn B',
            },
          },
        ],
        starterCartPreview: {
          sellerPartitions: [
            { listingPublicationIds: [listingA], sellerPublicId: sellerA },
            { listingPublicationIds: [listingB], sellerPublicId: sellerB },
          ],
          status: 'requires_confirmation',
        },
      },
      updatedAt: now,
    };
    this.consultations.set(consultation.id, consultation);
    this.consultationOperations.set(operationKey, { fingerprint: requestFingerprint, result: consultation });
    return Promise.resolve(ok(structuredClone(consultation)));
  }

  listAiConsultations(owner: AgriTechOwner): Promise<MarketplaceAiConsultation[]> {
    return Promise.resolve(
      ownerKey(owner) === ownerKey(buyer) ? structuredClone([...this.consultations.values()]) : [],
    );
  }

  confirmAiStarterCart(
    owner: AgriTechOwner,
    consultationId: string,
    input: MarketplaceAiStarterCartInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceAiStarterCartResult>> {
    if (ownerKey(owner) !== ownerKey(buyer) || input.actingPartnerId !== buyerPartnerId) {
      return Promise.resolve({ status: 'forbidden', field: 'organization' });
    }
    const commandFingerprint = fingerprint(consultationId, input);
    const operationKey = `${ownerKey(owner)}:${idempotencyKey}`;
    const prior = this.operations.get(operationKey);
    if (prior) {
      return Promise.resolve(
        prior.fingerprint === commandFingerprint
          ? ok(structuredClone(prior.result))
          : { status: 'conflict', field: 'idempotencyKey' },
      );
    }
    const consultation = this.consultations.get(consultationId);
    if (!consultation) {
      return Promise.resolve({ status: 'not_found', field: 'consultationId' });
    }
    if (consultation.confirmedAt) {
      return Promise.resolve({ status: 'conflict', field: 'consultation' });
    }
    if (!this.publicationsAvailable) {
      return Promise.resolve({ status: 'conflict', field: 'listingPublicationId' });
    }
    const result: MarketplaceAiStarterCartResult = {
      carts: [
        { cartId: randomUUID(), listingPublicationIds: [listingA], sellerPublicId: sellerA },
        { cartId: randomUUID(), listingPublicationIds: [listingB], sellerPublicId: sellerB },
      ],
      confirmedAt: now,
      consultationId,
      status: 'confirmed',
    };
    consultation.confirmedAt = now;
    consultation.updatedAt = now;
    this.operations.set(operationKey, { fingerprint: commandFingerprint, result });
    this.mutationCount += 1;
    return Promise.resolve(ok(structuredClone(result)));
  }

  mutations(): number {
    return this.mutationCount;
  }

  operationCount(): number {
    return this.operations.size;
  }

  setPublicationsAvailable(value: boolean): void {
    this.publicationsAvailable = value;
  }
}

export class MarketplaceDashboardAiAcceptanceAdapter {
  private readonly repository = new AcceptanceDashboardAiRepository();
  private readonly service = new MarketplaceDashboardAiDomainService(this.repository);

  buyer(): AgriTechOwner {
    return structuredClone(buyer);
  }

  async exerciseConfirmedStarterCart(owner: AgriTechOwner): Promise<MarketplaceDashboardAiAcceptanceResult> {
    const consultation = await this.service.createAiConsultation(
      owner,
      'find_cheaper',
      'Certified corn seed',
      'ai-create-acceptance-0001',
    );
    const createReplay = await this.service.createAiConsultation(
      owner,
      'find_cheaper',
      'Certified corn seed',
      'ai-create-acceptance-0001',
    );
    let changedCreateReplayConflict = false;
    try {
      await this.service.createAiConsultation(
        owner,
        'find_cheaper',
        'Certified corn seed changed',
        'ai-create-acceptance-0001',
      );
    } catch {
      changedCreateReplayConflict = true;
    }
    const staleConsultation = await this.service.createAiConsultation(
      owner,
      'recommendation',
      'Certified corn seed stale',
      'ai-create-stale-acceptance-0001',
    );
    this.repository.setPublicationsAvailable(false);
    let stalePublicationConflict = false;
    try {
      await this.service.confirmAiStarterCart(
        owner,
        staleConsultation.id,
        { actingPartnerId: buyerPartnerId, confirmed: true },
        'ai-confirm-stale-acceptance-0001',
      );
    } catch {
      stalePublicationConflict = true;
    }
    this.repository.setPublicationsAvailable(true);
    try {
      await this.service.confirmAiStarterCart(
        owner,
        consultation.id,
        { actingPartnerId: buyerPartnerId, confirmed: false },
        'ai-cancelled-preview',
      );
    } catch {
      // Closing a preview is deliberately represented by no mutation command.
    }
    const cancelledMutationCount = this.repository.mutations();
    const first = await this.service.confirmAiStarterCart(
      owner,
      consultation.id,
      { actingPartnerId: buyerPartnerId, confirmed: true },
      'ai-confirm-acceptance-0001',
    );
    const replay = await this.service.confirmAiStarterCart(
      owner,
      consultation.id,
      { actingPartnerId: buyerPartnerId, confirmed: true },
      'ai-confirm-acceptance-0001',
    );
    let changedReplayConflict = false;
    try {
      await this.service.confirmAiStarterCart(
        owner,
        consultation.id,
        { actingPartnerId: randomUUID(), confirmed: true },
        'ai-confirm-acceptance-0001',
      );
    } catch {
      changedReplayConflict = true;
    }
    return {
      cancelledMutationCount,
      carts: first.carts,
      changedCreateReplayConflict,
      changedReplayConflict,
      consultation,
      exactCreateReplay: JSON.stringify(createReplay) === JSON.stringify(consultation),
      exactReplay: JSON.stringify(replay) === JSON.stringify(first),
      persistedOperationCount: this.repository.operationCount(),
      serializedResult: JSON.stringify({ consultation, result: first }),
      stalePublicationConflict,
    };
  }
}
