// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  throwOnOpenApiErrorData,
  useUserApiClient,
  type ContractLifecycleDto,
  type ContractViewDto,
  type FulfillmentCommandDto,
  type SettlementCommandDto,
} from '@app/frontend-api-client';
import type { Resource, ResourceStatus } from './use-marketplace-data';

/**
 * Deals in flight, as the contract API reports them.
 *
 * The vocabulary here is the server's: a deal is a contract, its stage is
 * `ContractViewDto.status`, and the party this browser speaks for is the
 * server-stamped `actorParty`. Nothing in this module invents a stage the API
 * does not report, and no action is offered that the API would refuse.
 */

/** The status vocabulary is the contract API's own. */
export type ActiveDealStatus = ContractViewDto['status'];

/** Ordering inside a lane: the earlier the stage, the earlier the card. */
const statusOrder: Record<string, number> = {
  draft: 0,
  signed: 1,
  active: 2,
  legacy_review_required: 3,
};

const stageRank = (status: ActiveDealStatus): number => statusOrder[status] ?? 9;

export const isDealInFlight = (contract: ContractViewDto): boolean =>
  contract.status === 'draft' ||
  contract.status === 'signed' ||
  contract.status === 'active' ||
  contract.status === 'legacy_review_required';

const ownSignatureAt = (contract: ContractViewDto): string | undefined =>
  contract.actorParty === 'buyer' ? contract.buyerSignedAt : contract.sellerSignedAt;

/**
 * A deal that is waiting for this actor's own consent.
 *
 * `draft` means neither party has signed and `signed` means exactly one has, so
 * the actor's own signature timestamp is the whole test — no second read is
 * needed to know that this party still has to act. This is also the badge rule:
 * see {@link dealsAwaitingConsent}.
 */
export const isConsentPending = (contract: ContractViewDto): boolean =>
  (contract.status === 'draft' || contract.status === 'signed') && ownSignatureAt(contract) === undefined;

/**
 * The header badge figure: in-flight deals whose next required step is this
 * actor's own consent, counted once per contract.
 *
 * It deliberately does not count a deal already in fulfillment or settlement.
 * Whose turn it is inside an `active` deal is only knowable from that deal's
 * lifecycle read, which this screen performs and the chrome does not; counting
 * a guess there would put a number on the header that the page could contradict.
 */
export const dealsAwaitingConsent = (contracts: readonly ContractViewDto[]): number =>
  contracts.filter((contract) => isConsentPending(contract)).length;

/**
 * A seller-delivery cart checkout carries no price until the seller quotes one,
 * and `PATCH /marketplace/contracts/{id}/delivery-quote` refuses the quote once
 * either party has signed. So the quote, not consent, is the next step of such a
 * draft — and it is the seller's step.
 */
export const isDeliveryQuotePending = (contract: ContractViewDto): boolean =>
  contract.status === 'draft' &&
  contract.deliveryTerms === 'seller_delivery' &&
  contract.sourceType === 'cart_checkout' &&
  contract.deliveryPriceUzs === undefined &&
  contract.buyerSignedAt === undefined &&
  contract.sellerSignedAt === undefined;

/**
 * One lifecycle command, shaped exactly like the action the contract route
 * submits, so the same page handler can run it.
 */
export type ActiveDealCommand =
  | { kind: 'factoring-consent' }
  | { body: FulfillmentCommandDto; kind: 'fulfillment' }
  | { body: SettlementCommandDto; kind: 'settlement' };

/**
 * The command table is the browser's copy of the server's own guards
 * (`isSettlementCommandAllowed` and the fulfillment transition rules): each row
 * names the one party the API accepts the command from in the one state it
 * accepts it in. The contract detail route implements the same table for a
 * single contract; this module answers the same question for a list.
 */
const nextFulfillmentCommand = (
  contract: ContractViewDto,
  lifecycle: ContractLifecycleDto,
): ActiveDealCommand | undefined => {
  if (lifecycle.fulfillment.status === 'ready' && contract.actorParty === 'seller') {
    return { body: { command: 'start' }, kind: 'fulfillment' };
  }
  if (lifecycle.fulfillment.status === 'in_progress' && contract.actorParty === 'seller') {
    return { body: { command: 'mark_delivered' }, kind: 'fulfillment' };
  }
  if (lifecycle.fulfillment.status === 'delivered' && contract.actorParty === 'buyer') {
    return { body: { command: 'accept_delivery' }, kind: 'fulfillment' };
  }
  return undefined;
};

const nextDirectSettlementCommand = (
  contract: ContractViewDto,
  lifecycle: ContractLifecycleDto,
): ActiveDealCommand | undefined => {
  if (lifecycle.settlement.status === 'awaiting_buyer_confirmation' && contract.actorParty === 'buyer') {
    return { body: { command: 'confirm_buyer_payment' }, kind: 'settlement' };
  }
  if (lifecycle.settlement.status === 'buyer_confirmed' && contract.actorParty === 'seller') {
    return { body: { command: 'confirm_seller_receipt' }, kind: 'settlement' };
  }
  return undefined;
};

const nextFactoringSettlementCommand = (
  contract: ContractViewDto,
  lifecycle: ContractLifecycleDto,
): ActiveDealCommand | undefined => {
  const { settlement } = lifecycle;
  if (settlement.status === 'awaiting_consents') {
    const consented =
      contract.actorParty === 'buyer'
        ? 'buyerConsentedAt' in settlement && Boolean(settlement.buyerConsentedAt)
        : 'sellerConsentedAt' in settlement && Boolean(settlement.sellerConsentedAt);
    return consented ? undefined : { kind: 'factoring-consent' };
  }
  if (settlement.status === 'ready_to_request' && contract.actorParty === 'buyer') {
    return { body: { command: 'request_decision' }, kind: 'settlement' };
  }
  if (settlement.status === 'approved' && contract.actorParty === 'seller') {
    return { body: { command: 'record_seller_payout' }, kind: 'settlement' };
  }
  if (settlement.status === 'seller_paid' && contract.actorParty === 'buyer') {
    return { body: { command: 'record_buyer_repayment' }, kind: 'settlement' };
  }
  if (settlement.status === 'buyer_repaid' && contract.actorParty === 'buyer') {
    return { body: { command: 'close' }, kind: 'settlement' };
  }
  return undefined;
};

export const nextDealCommand = (
  contract: ContractViewDto,
  lifecycle: ContractLifecycleDto,
): ActiveDealCommand | undefined => {
  if (contract.status !== 'active' || lifecycle.dispute?.status === 'open') {
    return undefined;
  }
  const fulfillment = nextFulfillmentCommand(contract, lifecycle);
  if (fulfillment) {
    return fulfillment;
  }
  return contract.factoringEnabled
    ? nextFactoringSettlementCommand(contract, lifecycle)
    : nextDirectSettlementCommand(contract, lifecycle);
};

const commandLabelKeys: Record<string, string> = {
  accept_delivery: 'agritech.marketplace.deals.action.acceptDelivery',
  close: 'agritech.marketplace.deals.action.closeFinancing',
  confirm_buyer_payment: 'agritech.marketplace.deals.action.confirmPayment',
  confirm_seller_receipt: 'agritech.marketplace.deals.action.confirmReceipt',
  mark_delivered: 'agritech.marketplace.deals.action.markDelivered',
  record_buyer_repayment: 'agritech.marketplace.deals.action.recordRepayment',
  record_seller_payout: 'agritech.marketplace.deals.action.recordPayout',
  request_decision: 'agritech.marketplace.deals.action.requestDecision',
  start: 'agritech.marketplace.deals.action.startDelivery',
};

const commandLabelKey = (command: ActiveDealCommand): string =>
  command.kind === 'factoring-consent'
    ? 'agritech.marketplace.deals.action.factoringConsent'
    : (commandLabelKeys[command.body.command] ?? 'agritech.marketplace.deals.action.open');

/** Which side of the market this deal is waiting on. */
export type ActiveDealLane = 'counterparty' | 'stalled' | 'you';

export const activeDealLanes: readonly ActiveDealLane[] = ['you', 'counterparty', 'stalled'];

export interface ActiveDealAction {
  /** The lifecycle command the control submits, when it submits one. */
  command?: ActiveDealCommand;
  /**
   * `sign` records this party's consent, `command` advances the lifecycle, and
   * `open` only opens the contract — which is the honest action whenever the
   * next step is not this actor's to take here.
   */
  kind: 'command' | 'open' | 'sign';
  labelKey: string;
}

export interface ActiveDeal {
  /** Exactly one next action, and never one the actor cannot perform. */
  action: ActiveDealAction;
  contract: ContractViewDto;
  /** The other party's published legal name. */
  counterparty: string;
  lane: ActiveDealLane;
  /** i18n key of the sentence naming the stage the deal is actually in. */
  stageKey: string;
  status: ActiveDealStatus;
}

const openAction = (labelKey = 'agritech.marketplace.deals.action.open'): ActiveDealAction => ({
  kind: 'open',
  labelKey,
});

const counterpartyOf = (contract: ContractViewDto): string =>
  contract.actorParty === 'buyer' ? contract.sellerPartySnapshot.legalName : contract.buyerPartySnapshot.legalName;

const consentDeal = (contract: ContractViewDto, canAct: boolean): Pick<ActiveDeal, 'action' | 'lane' | 'stageKey'> => {
  if (isDeliveryQuotePending(contract)) {
    // The quote form lives on the contract route, so the honest action is to open it.
    return contract.actorParty === 'seller'
      ? { action: openAction('agritech.marketplace.deals.action.quote'), lane: 'you', stageKey: 'awaitingQuote' }
      : { action: openAction(), lane: 'counterparty', stageKey: 'awaitingQuote' };
  }
  if (isConsentPending(contract)) {
    return {
      action: canAct
        ? { kind: 'sign', labelKey: 'agritech.marketplace.contract.signOwnParty' }
        : openAction('agritech.marketplace.deals.action.verify'),
      lane: 'you',
      stageKey: 'awaitingConsent',
    };
  }
  return { action: openAction(), lane: 'counterparty', stageKey: 'awaitingConsent' };
};

const activeDeal = (
  contract: ContractViewDto,
  lifecycle: Resource<ContractLifecycleDto | null>,
  canAct: boolean,
): Pick<ActiveDeal, 'action' | 'lane' | 'stageKey'> => {
  const current = lifecycle.data;
  if (!current) {
    // The lifecycle read failed or the contract has no settlement and fulfillment
    // rows at all. Either way the next step cannot be named here, and pretending
    // otherwise would offer a command the API would refuse.
    return { action: openAction(), lane: 'stalled', stageKey: 'lifecycleUnavailable' };
  }
  if (current.dispute?.status === 'open') {
    return { action: openAction(), lane: 'stalled', stageKey: 'dispute' };
  }
  const command = nextDealCommand(contract, current);
  const stageKey = current.fulfillment.status === 'awaiting_settlement' ? 'settlement' : 'fulfillment';
  if (!command) {
    return { action: openAction(), lane: 'counterparty', stageKey };
  }
  return {
    action: canAct
      ? { command, kind: 'command', labelKey: commandLabelKey(command) }
      : openAction('agritech.marketplace.deals.action.verify'),
    lane: 'you',
    stageKey,
  };
};

type DealStage = Pick<ActiveDeal, 'action' | 'lane' | 'stageKey'>;

const dealStage = (
  contract: ContractViewDto,
  lifecycle: Resource<ContractLifecycleDto | null>,
  canAct: boolean,
): DealStage => {
  if (contract.status === 'legacy_review_required') {
    // The pre-upgrade contract is quarantined by the API: consent is disabled.
    return { action: openAction(), lane: 'stalled', stageKey: 'legacy' };
  }
  if (contract.status === 'active') {
    return activeDeal(contract, lifecycle, canAct);
  }
  return consentDeal(contract, canAct);
};

/**
 * One in-flight contract as a working row: the stage the API reports, the side
 * the deal waits on, and the single action this actor can take next.
 */
export const toActiveDeal = (
  contract: ContractViewDto,
  lifecycle: Resource<ContractLifecycleDto | null>,
  canAct: boolean,
): ActiveDeal => {
  const base = dealStage(contract, lifecycle, canAct);
  return {
    ...base,
    contract,
    counterparty: counterpartyOf(contract),
    stageKey: `agritech.marketplace.deals.stage.${base.stageKey}`,
    status: contract.status,
  };
};

/** Oldest work first inside a lane, after the stage the deal is in. */
const byStageThenAge = (left: ActiveDeal, right: ActiveDeal): number =>
  stageRank(left.status) - stageRank(right.status) || left.contract.updatedAt.localeCompare(right.contract.updatedAt);

export const groupActiveDeals = (deals: readonly ActiveDeal[]): Record<ActiveDealLane, ActiveDeal[]> => ({
  counterparty: deals.filter((deal) => deal.lane === 'counterparty').sort(byStageThenAge),
  stalled: deals.filter((deal) => deal.lane === 'stalled').sort(byStageThenAge),
  you: deals.filter((deal) => deal.lane === 'you').sort(byStageThenAge),
});

export interface ActiveDealsModel {
  /** Applies a lifecycle a mutation just returned, so the card re-reads itself. */
  apply: (contractId: string, lifecycle: ContractLifecycleDto) => void;
  deals: ActiveDeal[];
  lanes: Record<ActiveDealLane, ActiveDeal[]>;
  reload: () => void;
  /**
   * `empty` means no deal is in flight at all — which is a different sentence
   * from an empty "waiting on you" lane, and the page says both.
   */
  status: ResourceStatus;
  /**
   * The header badge figure: in-flight deals whose next step is this actor's own
   * consent. The "waiting on you" lane can hold more than this, because a deal
   * already in fulfillment or settlement is only assigned a next actor once its
   * lifecycle has been read on this screen.
   */
  awaitingConsent: number;
}

const idleResource: Resource<ContractLifecycleDto | null> = { data: null, status: 'idle' };

interface ActiveDealsInput {
  /** Whether this actor may mutate contracts at all: verified, and in a role that fits the party. */
  canAct: (contract: ContractViewDto) => boolean;
  contracts: Resource<ContractViewDto[]>;
  /** The lifecycle reads happen only where they are read, which is this screen. */
  enabled: boolean;
  signedIn: boolean;
}

/**
 * Deals in flight for both sides of the market.
 *
 * The contract list already travels with the page. Only an `active` deal needs a
 * second read — its fulfillment and settlement stage is not in the list
 * projection — so exactly those are fetched, once per contract, and re-fetched
 * when that contract's revision or status changes.
 */
export function useActiveDeals({ canAct, contracts, enabled, signedIn }: ActiveDealsInput): ActiveDealsModel {
  const { api, requestOptions } = useUserApiClient();
  const [lifecycles, setLifecycles] = useState<Record<string, Resource<ContractLifecycleDto | null>>>({});
  const [reloadToken, setReloadToken] = useState(0);
  const epochRef = useRef(0);

  const inFlight = useMemo(() => contracts.data.filter((contract) => isDealInFlight(contract)), [contracts.data]);
  const settling = useMemo(() => inFlight.filter((contract) => contract.status === 'active'), [inFlight]);
  /**
   * The effect reads its work from these two strings rather than from a fresh
   * array, so a re-render that changed nothing does not re-fetch, while a
   * contract whose revision moved does.
   */
  const lifecycleIdKey = useMemo(() => settling.map((contract) => contract.id).join('|'), [settling]);
  const lifecycleSignature = useMemo(
    () => settling.map((contract) => `${contract.id}@${contract.revision}@${contract.updatedAt}`).join('|'),
    [settling],
  );

  useEffect(() => {
    if (!enabled || !signedIn || lifecycleIdKey === '') {
      return undefined;
    }
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    const ids = lifecycleIdKey.split('|');
    setLifecycles((current) =>
      Object.fromEntries(ids.map((id) => [id, { data: current[id]?.data ?? null, status: 'loading' as const }])),
    );
    void Promise.all(
      ids.map(async (id): Promise<readonly [string, Resource<ContractLifecycleDto | null>]> => {
        try {
          const data = await throwOnOpenApiErrorData(api.marketplaceControllerGetContractLifecycle(id, requestOptions));
          return [id, { data, status: 'ready' }] as const;
        } catch {
          // A contract with no prepared settlement and fulfillment answers this
          // read with a client error. The card says so instead of guessing.
          return [id, { data: null, status: 'error' }] as const;
        }
      }),
    ).then((entries) => {
      if (epochRef.current === epoch) {
        setLifecycles(Object.fromEntries(entries));
      }
    });
    return () => {
      epochRef.current += 1;
    };
  }, [api, enabled, lifecycleIdKey, lifecycleSignature, reloadToken, requestOptions, signedIn]);

  const deals = useMemo(
    () => inFlight.map((contract) => toActiveDeal(contract, lifecycles[contract.id] ?? idleResource, canAct(contract))),
    [canAct, inFlight, lifecycles],
  );

  const pendingLifecycle = settling.some((contract) => {
    const status = lifecycles[contract.id]?.status;
    return status === undefined || status === 'idle' || status === 'loading';
  });

  const status = ((): ResourceStatus => {
    if (!enabled || !signedIn) {
      return 'idle';
    }
    if (contracts.status === 'error') {
      return 'error';
    }
    if (contracts.status === 'idle' || contracts.status === 'loading' || pendingLifecycle) {
      return 'loading';
    }
    return inFlight.length === 0 ? 'empty' : 'ready';
  })();

  const apply = useCallback((contractId: string, lifecycle: ContractLifecycleDto) => {
    setLifecycles((current) => ({ ...current, [contractId]: { data: lifecycle, status: 'ready' } }));
  }, []);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return {
    apply,
    awaitingConsent: dealsAwaitingConsent(inFlight),
    deals,
    lanes: groupActiveDeals(deals),
    reload,
    status,
  };
}
