// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import type {
  ActivateMarketplacePromotionInput,
  AgriTechOwner,
  MarketplaceListingPromotion,
  MarketplacePromotionBillingProvider,
  MarketplacePromotionBillingProviderResult,
  MarketplacePromotionRepository,
  MarketplacePromotionReservation,
  MarketplaceProviderOperationRepository,
  OperationResult,
} from '@app/backend-feature-agritech-shared';
import {
  marketplaceProviderFingerprint,
  marketplacePromotionActivationFingerprint,
  marketplacePromotionPlanCatalog,
  marketplacePromotionPlans,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceProviderUnavailableException } from './marketplace-verification.domain-service';

const maximumScheduledStartMilliseconds = 30 * 24 * 60 * 60_000;
const maximumPastClockSkewMilliseconds = 5 * 60_000;
const defaultPromotionBillingTimeoutMs = 10_000;

type Clock = () => Date;

function unwrap<T>(result: OperationResult<T>, label: string): T {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(label);
  }
  if (result.status === 'forbidden' || result.status === 'partner_unapproved') {
    throw new ForbiddenException(label);
  }
  if (result.status === 'conflict') {
    throw new ConflictException(label);
  }
  throw new BadRequestException({ meta: { field: result.field, resourceType: label } });
}

class PromotionBillingTimeoutError extends Error {
  constructor() {
    super('Marketplace promotion billing provider timed out.');
    this.name = 'PromotionBillingTimeoutError';
  }
}

async function callProvider<T>(timeoutMs: number, invoke: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      invoke(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new PromotionBillingTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Framework-independent internal promotion activation orchestration.
 *
 * A paid catalog slot is reserved, charged through the `promotion_billing`
 * capability, and only then allowed to serve. The provider call runs outside the
 * database transaction, so the succeeded operation ledger — not this process —
 * is what proves the charge; a crash between the charge and the settle heals on
 * the next exact replay of the same command key.
 */
export class MarketplacePromotionDomainService {
  constructor(
    protected readonly repository: MarketplacePromotionRepository,
    protected readonly providerOperations: MarketplaceProviderOperationRepository,
    protected readonly billing: MarketplacePromotionBillingProvider,
    protected readonly billingTimeoutMs: number = defaultPromotionBillingTimeoutMs,
    protected readonly clock: Clock = () => new Date(),
  ) {}

  async activatePromotion(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: ActivateMarketplacePromotionInput,
  ): Promise<MarketplaceListingPromotion> {
    this.validateInput(input);
    this.requireBillingProvider();
    const reservation = unwrap(
      await this.repository.reservePromotion(owner, {
        ...input,
        idempotencyKey,
        requestFingerprint: marketplacePromotionActivationFingerprint(input),
      }),
      'promotion',
    );
    if (reservation.settledPromotion) {
      return reservation.settledPromotion;
    }
    const operationId = await this.chargeReservation(owner, idempotencyKey, reservation);
    return unwrap(await this.repository.settlePromotion(owner, reservation.id, operationId), 'promotion');
  }

  findPromotion(owner: AgriTechOwner, promotionId: string): Promise<MarketplaceListingPromotion | undefined> {
    return this.repository.findPromotion(owner, promotionId);
  }

  listPromotions(owner: AgriTechOwner): Promise<MarketplaceListingPromotion[]> {
    return this.repository.listPromotions(owner);
  }

  listPlans() {
    return marketplacePromotionPlanCatalog;
  }

  private async chargeReservation(
    owner: AgriTechOwner,
    idempotencyKey: string,
    reservation: MarketplacePromotionReservation,
  ): Promise<string> {
    const descriptor = {
      action: 'bill-listing-promotion' as const,
      parametersFingerprint: marketplaceProviderFingerprint({
        amountUzs: reservation.priceUzs,
        currency: 'UZS',
        listingPublicId: reservation.listingPublicId,
        planCode: reservation.planCode,
        sellerPartnerId: reservation.sellerPartnerId,
      }),
      resourceId: reservation.id,
      resourceRevision: reservation.revision,
      resourceType: 'promotion' as const,
    };
    const prepared = unwrap(
      await this.providerOperations.prepareProviderOperation(owner, {
        actorType: 'promotion_owner',
        capability: 'promotion_billing',
        idempotencyKey,
        providerMode: this.billing.mode as 'mock' | 'live',
        providerName: this.billing.name,
        requestDescriptor: descriptor,
        requestFingerprint: marketplaceProviderFingerprint(descriptor),
        resourceId: reservation.id,
        resourceRevision: reservation.revision,
        resourceType: 'promotion',
      }),
      'promotion-billing-operation',
    );
    if (!prepared.execute) {
      return prepared.operationId;
    }
    const result = await this.invokeBilling(owner, prepared.operationId, prepared.attempt, reservation);
    await this.persistBillingCompletion(owner, prepared.operationId, prepared.attempt, reservation, result);
    return prepared.operationId;
  }

  private async invokeBilling(
    owner: AgriTechOwner,
    operationId: string,
    attempt: number,
    reservation: MarketplacePromotionReservation,
  ): Promise<MarketplacePromotionBillingProviderResult> {
    try {
      const result = await callProvider(this.billingTimeoutMs, (signal) =>
        this.billing.billListingPromotion({
          amountUzs: reservation.priceUzs,
          currency: 'UZS',
          listingPublicId: reservation.listingPublicId,
          operationAttempt: attempt,
          operationId,
          planCode: reservation.planCode,
          promotionId: reservation.id,
          sellerPartnerId: reservation.sellerPartnerId,
          signal,
        }),
      );
      this.requireHonestCharge(reservation, result);
      return result;
    } catch (error) {
      return this.recordBillingFailure(owner, operationId, attempt, error);
    }
  }

  /**
   * A charge is accepted only for the exact server-owned plan price in UZS, and
   * a simulated charge must disclose itself. A mock receipt that claimed money
   * moved would be refused rather than persisted as a payment.
   */
  private requireHonestCharge(
    reservation: MarketplacePromotionReservation,
    result: MarketplacePromotionBillingProviderResult,
  ): void {
    const disclosesSimulation =
      result.providerMode !== 'mock' ||
      (result.safeReceipt.simulated === true && result.safeReceipt.moneyMoved === false);
    if (
      result.providerMode !== this.billing.mode ||
      result.providerName !== this.billing.name ||
      result.chargedAmountUzs !== reservation.priceUzs ||
      !disclosesSimulation
    ) {
      throw new Error('Marketplace promotion billing provider returned an unusable charge result.');
    }
  }

  private async persistBillingCompletion(
    owner: AgriTechOwner,
    operationId: string,
    attempt: number,
    reservation: MarketplacePromotionReservation,
    result: MarketplacePromotionBillingProviderResult,
  ): Promise<void> {
    try {
      unwrap(
        await this.providerOperations.completeProviderOperation(owner, operationId, attempt, {
          ...(result.providerEventId ? { providerEventId: result.providerEventId } : {}),
          providerMode: result.providerMode,
          providerName: result.providerName,
          providerReference: result.providerReference,
          resultDescriptor: {
            completedAt: result.completedAt.toISOString(),
            outcome: 'promotion_charged',
            resourceId: reservation.id,
            resourceRevision: reservation.revision,
            resourceType: 'promotion',
          },
          safeReceipt: result.safeReceipt,
        }),
        'promotion-billing-operation',
      );
    } catch (error) {
      await this.providerOperations
        .failProviderOperation(
          owner,
          operationId,
          attempt,
          'promotion_billing_completion_persist_failed',
          'provider_outcome_unknown',
        )
        .catch(() => undefined);
      throw new MarketplaceProviderUnavailableException({
        cause: error instanceof Error ? error : new Error('Marketplace promotion billing persistence failed.'),
        extensions: { capability: 'promotion_billing', providerMode: this.billing.mode, retryable: false },
        meta: { reconciliationRequired: true },
      });
    }
  }

  private async recordBillingFailure(
    owner: AgriTechOwner,
    operationId: string,
    attempt: number,
    error: unknown,
  ): Promise<never> {
    const timedOut = error instanceof PromotionBillingTimeoutError;
    await this.providerOperations
      .failProviderOperation(
        owner,
        operationId,
        attempt,
        timedOut ? 'promotion_billing_timeout' : 'promotion_billing_failed',
        timedOut ? 'provider_outcome_unknown' : undefined,
      )
      .catch(() => undefined);
    throw new MarketplaceProviderUnavailableException({
      cause: error instanceof Error ? error : new Error('Marketplace promotion billing provider failed.'),
      extensions: {
        capability: 'promotion_billing',
        providerMode: this.billing.mode,
        retryAfterSeconds: 30,
        retryable: true,
      },
    });
  }

  /**
   * The paid placement is refused outright while no billing capability is
   * configured, which is the same fail-closed posture every other external
   * marketplace capability takes. Nothing is reserved and nothing is promoted.
   */
  private requireBillingProvider(): void {
    if (this.billing.mode === 'disabled') {
      throw new MarketplaceProviderUnavailableException({
        extensions: { capability: 'promotion_billing', providerMode: 'disabled', retryable: false },
        meta: { provider: this.billing.name },
      });
    }
  }

  private validateInput(input: ActivateMarketplacePromotionInput): void {
    if (!Object.hasOwn(marketplacePromotionPlans, input.planCode)) {
      throw new BadRequestException({ meta: { field: 'planCode', resourceType: 'promotion' } });
    }
    if (!input.startsAt) {
      return;
    }
    const startsAt = input.startsAt.getTime();
    const now = this.clock().getTime();
    if (
      !Number.isFinite(startsAt) ||
      startsAt < now - maximumPastClockSkewMilliseconds ||
      startsAt > now + maximumScheduledStartMilliseconds
    ) {
      throw new BadRequestException({ meta: { field: 'startsAt', resourceType: 'promotion' } });
    }
  }
}
