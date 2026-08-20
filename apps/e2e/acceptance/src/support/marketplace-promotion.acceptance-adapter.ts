// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { MarketplacePromotionDomainService } from '@app/backend-feature-agritech-main-marketplace-promotion-domain-service';
import type {
  ActivateMarketplacePromotionCommand,
  AgriTechOwner,
  MarketplaceListingPromotion,
  MarketplacePromotionBillingProvider,
  MarketplacePromotionBillingProviderResult,
  MarketplacePromotionLifecycleStatus,
  MarketplacePromotionRepository,
  MarketplacePromotionReservation,
  MarketplaceProviderOperationCompletion,
  MarketplaceProviderOperationPreparation,
  MarketplaceProviderOperationReplay,
  MarketplaceProviderOperationRepository,
  OperationResult,
  PreparedMarketplaceProviderOperation,
} from '@app/backend-feature-agritech-shared';
import * as agriTechSharedSource from '@app/backend-feature-agritech-shared';

const agriTechShared =
  (
    agriTechSharedSource as unknown as {
      default?: typeof agriTechSharedSource;
    }
  ).default ?? agriTechSharedSource;
const { marketplacePromotionActivationFingerprint, marketplacePromotionPlans } = agriTechShared;

const now = new Date('2030-01-01T00:00:00.000Z');
const seller = { tenantId: 'tenant-promotion-acceptance', userId: 'seller-promotion-acceptance' };
const promotedListingId = '11111111-1111-4111-8111-111111111111';
const plainListingId = '22222222-2222-4222-8222-222222222222';
const sellerPartnerId = '33333333-3333-4333-8333-333333333333';

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });
const ownerKey = (owner: AgriTechOwner): string => `${owner.tenantId}:${owner.userId}`;

export interface MarketplacePromotionAcceptanceResult {
  catalog: Array<{ ad: boolean; id: string }>;
  chargeCount: number;
  chargeReceipt: Record<string, unknown>;
  persistedCount: number;
  promotion: MarketplaceListingPromotion;
  refusedCapability: string;
  refusedStatus: number;
  replayId: string;
  servedWithoutCharge: number;
}

interface AcceptancePromotionRecord extends MarketplaceListingPromotion {
  billingOperationId: string | null;
  lifecycleStatus: MarketplacePromotionLifecycleStatus;
}

class AcceptancePromotionRepository implements MarketplacePromotionRepository {
  private readonly promotions = new Map<string, AcceptancePromotionRecord>();
  private readonly commandIndex = new Map<string, { fingerprint: string; promotionId: string }>();

  reservePromotion(
    owner: AgriTechOwner,
    input: ActivateMarketplacePromotionCommand,
  ): Promise<OperationResult<MarketplacePromotionReservation>> {
    if (
      ownerKey(owner) !== ownerKey(seller) ||
      input.actingPartnerId !== sellerPartnerId ||
      input.listingPublicId !== promotedListingId
    ) {
      return Promise.resolve({ status: 'not_found', field: 'listingPublicId' });
    }
    if (marketplacePromotionActivationFingerprint(input) !== input.requestFingerprint) {
      return Promise.resolve({ status: 'invalid_state', field: 'requestFingerprint' });
    }
    const commandKey = `${ownerKey(owner)}:${input.idempotencyKey}`;
    const existingCommand = this.commandIndex.get(commandKey);
    if (existingCommand) {
      if (existingCommand.fingerprint !== input.requestFingerprint) {
        return Promise.resolve({ status: 'conflict', field: 'idempotencyKey' });
      }
      const replay = this.promotions.get(existingCommand.promotionId);
      if (!replay) {
        return Promise.resolve({ status: 'invalid_state' });
      }
      return Promise.resolve(
        ok(
          replay.lifecycleStatus === 'pending_billing'
            ? reservationOf(replay)
            : { ...reservationOf(replay), settledPromotion: structuredClone(promotionOf(replay)) },
        ),
      );
    }
    if (
      [...this.promotions.values()].some(
        ({ listingPublicId, lifecycleStatus }) =>
          listingPublicId === input.listingPublicId && lifecycleStatus !== 'expired',
      )
    ) {
      return Promise.resolve({ status: 'conflict', field: 'listingPublicId' });
    }
    const plan = marketplacePromotionPlans[input.planCode];
    const startsAt = input.startsAt ?? now;
    const id = randomUUID();
    const promotion: AcceptancePromotionRecord = {
      activatedAt: now,
      activationReference: `promotion:${id}`,
      billingOperationId: null,
      createdAt: now,
      currency: 'UZS',
      endsAt: new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60_000),
      id,
      lifecycleStatus: 'pending_billing',
      listingPublicId: input.listingPublicId,
      planCode: input.planCode,
      priceUzs: plan.priceUzs,
      revision: 0,
      sellerPartnerId,
      startsAt,
      status: startsAt > now ? 'scheduled' : 'active',
      updatedAt: now,
    };
    this.promotions.set(id, promotion);
    this.commandIndex.set(commandKey, { fingerprint: input.requestFingerprint, promotionId: id });
    return Promise.resolve(ok(reservationOf(promotion)));
  }

  settlePromotion(
    owner: AgriTechOwner,
    promotionId: string,
    billingOperationId: string,
  ): Promise<OperationResult<MarketplaceListingPromotion>> {
    const promotion = ownerKey(owner) === ownerKey(seller) ? this.promotions.get(promotionId) : undefined;
    if (!promotion) {
      return Promise.resolve({ status: 'not_found', field: 'promotionId' });
    }
    if (promotion.lifecycleStatus !== 'pending_billing') {
      return Promise.resolve(
        promotion.billingOperationId === billingOperationId
          ? ok(structuredClone(promotionOf(promotion)))
          : { status: 'conflict', field: 'status' },
      );
    }
    promotion.lifecycleStatus = promotion.status;
    promotion.billingOperationId = billingOperationId;
    promotion.revision += 1;
    return Promise.resolve(ok(structuredClone(promotionOf(promotion))));
  }

  findPromotion(owner: AgriTechOwner, promotionId: string): Promise<MarketplaceListingPromotion | undefined> {
    const promotion = ownerKey(owner) === ownerKey(seller) ? this.promotions.get(promotionId) : undefined;
    return Promise.resolve(
      promotion && promotion.lifecycleStatus !== 'pending_billing'
        ? structuredClone(promotionOf(promotion))
        : undefined,
    );
  }

  listPromotions(owner: AgriTechOwner): Promise<MarketplaceListingPromotion[]> {
    if (ownerKey(owner) !== ownerKey(seller)) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      [...this.promotions.values()]
        .filter(({ lifecycleStatus }) => lifecycleStatus !== 'pending_billing')
        .map((promotion) => structuredClone(promotionOf(promotion))),
    );
  }

  /** Slots that serve without a recorded charge; the whole point is that it stays zero. */
  servedWithoutCharge(): number {
    return [...this.promotions.values()].filter(
      ({ billingOperationId, lifecycleStatus }) => lifecycleStatus !== 'pending_billing' && !billingOperationId,
    ).length;
  }
}

const reservationOf = (promotion: AcceptancePromotionRecord): MarketplacePromotionReservation => ({
  id: promotion.id,
  listingPublicId: promotion.listingPublicId,
  planCode: promotion.planCode,
  priceUzs: promotion.priceUzs,
  revision: promotion.revision,
  sellerPartnerId: promotion.sellerPartnerId,
});

const promotionOf = (promotion: AcceptancePromotionRecord): MarketplaceListingPromotion => ({
  activatedAt: promotion.activatedAt,
  activationReference: promotion.activationReference,
  createdAt: promotion.createdAt,
  currency: promotion.currency,
  endsAt: promotion.endsAt,
  id: promotion.id,
  listingPublicId: promotion.listingPublicId,
  planCode: promotion.planCode,
  priceUzs: promotion.priceUzs,
  revision: promotion.revision,
  sellerPartnerId: promotion.sellerPartnerId,
  startsAt: promotion.startsAt,
  status: promotion.status,
  updatedAt: promotion.updatedAt,
});

interface AcceptanceProviderOperation {
  attempt: number;
  completion?: MarketplaceProviderOperationCompletion;
  id: string;
  requestFingerprint: string;
  resourceId: string;
  status: 'started' | 'succeeded' | 'failed';
}

class AcceptanceProviderOperationRepository implements MarketplaceProviderOperationRepository {
  private readonly operations = new Map<string, AcceptanceProviderOperation>();
  private readonly commandIndex = new Map<string, string>();

  prepareProviderOperation(
    owner: AgriTechOwner,
    input: MarketplaceProviderOperationPreparation,
  ): Promise<OperationResult<PreparedMarketplaceProviderOperation>> {
    const commandKey = `${ownerKey(owner)}:${input.capability}:${input.resourceId}:${input.idempotencyKey}`;
    const existingId = this.commandIndex.get(commandKey);
    const existing = existingId ? this.operations.get(existingId) : undefined;
    if (existing) {
      if (existing.requestFingerprint !== input.requestFingerprint) {
        return Promise.resolve({ status: 'conflict', field: 'idempotencyKey' });
      }
      if (existing.status === 'succeeded') {
        return Promise.resolve(ok({ attempt: existing.attempt, execute: false, operationId: existing.id }));
      }
      existing.attempt += 1;
      existing.status = 'started';
      return Promise.resolve(ok({ attempt: existing.attempt, execute: true, operationId: existing.id }));
    }
    // One semantic charge per promotion, whatever command key asks for it.
    if (
      [...this.operations.values()].some(
        (operation) => operation.resourceId === input.resourceId && operation.status !== 'failed',
      )
    ) {
      return Promise.resolve({ status: 'conflict', field: 'operationInProgress' });
    }
    const operation: AcceptanceProviderOperation = {
      attempt: 1,
      id: randomUUID(),
      requestFingerprint: input.requestFingerprint,
      resourceId: input.resourceId,
      status: 'started',
    };
    this.operations.set(operation.id, operation);
    this.commandIndex.set(commandKey, operation.id);
    return Promise.resolve(ok({ attempt: operation.attempt, execute: true, operationId: operation.id }));
  }

  completeProviderOperation(
    _owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceProviderOperationCompletion,
  ): Promise<OperationResult<MarketplaceProviderOperationReplay>> {
    const operation = this.operations.get(operationId);
    if (!operation || operation.attempt !== operationAttempt) {
      return Promise.resolve({ status: 'conflict', field: 'operationAttempt' });
    }
    operation.status = 'succeeded';
    operation.completion = result;
    return Promise.resolve(
      ok({
        attempt: operation.attempt,
        operationId: operation.id,
        providerMode: result.providerMode,
        providerName: result.providerName,
        providerReference: result.providerReference,
        reconciliationRequired: false,
        resultDescriptor: result.resultDescriptor,
        resultFingerprint: operation.requestFingerprint,
        safeReceipt: result.safeReceipt,
      }),
    );
  }

  failProviderOperation(_owner: AgriTechOwner, operationId: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = 'failed';
    }
    return Promise.resolve();
  }

  succeededCharges(): MarketplaceProviderOperationCompletion[] {
    return [...this.operations.values()]
      .filter(({ completion, status }) => status === 'succeeded' && completion)
      .map(({ completion }) => completion as MarketplaceProviderOperationCompletion);
  }
}

class AcceptancePromotionBillingProvider implements MarketplacePromotionBillingProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-promotion-billing';

  billListingPromotion(
    input: Parameters<MarketplacePromotionBillingProvider['billListingPromotion']>[0],
  ): Promise<MarketplacePromotionBillingProviderResult> {
    return Promise.resolve({
      chargedAmountUzs: input.amountUzs,
      completedAt: now,
      currency: 'UZS',
      providerEventId: `mock-promotion-billing-event:${input.promotionId}`,
      providerMode: 'mock',
      providerName: this.name,
      providerReference: `mock-promotion-billing:${input.operationId}`,
      safeReceipt: {
        amountUzs: input.amountUzs,
        currency: 'UZS',
        moneyMoved: false,
        planCode: input.planCode,
        simulated: true,
      },
    });
  }
}

class DisabledPromotionBillingProvider implements MarketplacePromotionBillingProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';

  billListingPromotion(): Promise<MarketplacePromotionBillingProviderResult> {
    return Promise.reject(new Error('Marketplace promotion billing provider is disabled.'));
  }
}

export class MarketplacePromotionAcceptanceAdapter {
  private readonly repository = new AcceptancePromotionRepository();
  private readonly providerOperations = new AcceptanceProviderOperationRepository();
  private readonly service = new MarketplacePromotionDomainService(
    this.repository,
    this.providerOperations,
    new AcceptancePromotionBillingProvider(),
    10_000,
    () => now,
  );
  private readonly withoutBilling = new MarketplacePromotionDomainService(
    new AcceptancePromotionRepository(),
    new AcceptanceProviderOperationRepository(),
    new DisabledPromotionBillingProvider(),
    10_000,
    () => now,
  );

  seller(): AgriTechOwner {
    return structuredClone(seller);
  }

  async exerciseCatalogOnlyActivation(owner: AgriTechOwner): Promise<MarketplacePromotionAcceptanceResult> {
    const promotion = await this.service.activatePromotion(owner, 'promotion-acceptance-0001', {
      actingPartnerId: sellerPartnerId,
      listingPublicId: promotedListingId,
      planCode: 'catalog_7d',
    });
    const replay = await this.service.activatePromotion(owner, 'promotion-acceptance-0001', {
      actingPartnerId: sellerPartnerId,
      listingPublicId: promotedListingId,
      planCode: 'catalog_7d',
    });
    const refusal = await this.captureBillingRefusal(owner);
    const promoted = new Set(
      (await this.repository.listPromotions(owner))
        .filter(({ startsAt, endsAt, status }) => status !== 'expired' && startsAt <= now && endsAt > now)
        .map(({ listingPublicId }) => listingPublicId),
    );
    const catalog = [plainListingId, promotedListingId]
      .map((id) => ({ ad: promoted.has(id), id }))
      .sort((left, right) => Number(right.ad) - Number(left.ad));
    const charges = this.providerOperations.succeededCharges();
    return {
      catalog,
      chargeCount: charges.length,
      chargeReceipt: { ...charges[0]?.safeReceipt },
      persistedCount: (await this.repository.listPromotions(owner)).length,
      promotion,
      refusedCapability: refusal.capability,
      refusedStatus: refusal.status,
      replayId: replay.id,
      servedWithoutCharge: this.repository.servedWithoutCharge(),
    };
  }

  /** The paid action refuses itself while no billing capability is configured. */
  private async captureBillingRefusal(owner: AgriTechOwner): Promise<{ capability: string; status: number }> {
    try {
      await this.withoutBilling.activatePromotion(owner, 'promotion-acceptance-0002', {
        actingPartnerId: sellerPartnerId,
        listingPublicId: promotedListingId,
        planCode: 'catalog_7d',
      });
    } catch (error) {
      const problem = error as { extensions?: { capability?: string }; getStatus?: () => number };
      return { capability: problem.extensions?.capability ?? 'unknown', status: problem.getStatus?.() ?? 0 };
    }
    return { capability: 'none', status: 0 };
  }
}
