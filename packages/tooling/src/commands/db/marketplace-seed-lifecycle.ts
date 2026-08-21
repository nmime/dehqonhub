import { createHash } from "node:crypto";

import { demoMarketplaceContracts, type DemoContractFixture } from "./marketplace-seed-contracts.ts";
import { marketplaceFixtureUuid } from "./marketplace-seed-roster.ts";

/**
 * What a settled deal leaves behind: the payment record, the delivery record, the
 * timeline, and one notification per party per step.
 *
 * The fixture used to write contracts and nothing else, which left four surfaces
 * empty on a fresh install even though the deals they report on were right
 * there. A completed contract had no delivery record, so the fulfilment screen
 * said nothing had happened; it had no timeline, so the deal history was blank;
 * and it had no notification intents, so `/marketplace/notifications` answered
 * an empty list to every login while a hundred deals sat in the database. Worse,
 * the fixture already wrote the review eligibilities that only accepting a
 * delivery can create — so it was asserting that delivery had been accepted
 * while the row that records the acceptance was missing.
 *
 * This module writes those rows for every deal that got far enough to have them.
 * The rule is uniform rather than hand-picked, because the invariant is uniform:
 * a completed contract has been paid, delivered and closed; an active one has
 * been paid and is being delivered; a draft, a half-signed or a cancelled one has
 * none of it.
 *
 * ## What it deliberately does not write
 *
 * Three provider-produced documents stay out: the contract artifact (a
 * watermarked PDF), the two qualified signatures, and the direct-payment
 * receipts — together with the `marketplace_provider_operations` ledger rows all
 * three hang off by foreign key.
 *
 * Each of those is a receipt from an external adapter. The artifact is generated
 * by `marketplace-contract-pdf`, which needs `pdfkit` and four bundled font
 * files; the signature and payment rows are only coherent against a
 * `succeeded` provider operation carrying that provider's own reference and
 * receipt, and `assert_marketplace_contract_signature_coherence` checks the
 * receipt byte for byte. A seeder that minted those would be forging a receipt
 * no provider issued — the same reason `marketplace-seed-data` keeps
 * verification documents empty. So the fixture records that both parties signed
 * (the contract's own `buyer_signed_at` / `seller_signed_at`) and that the money
 * settled, and leaves the paperwork to be produced by clicking through a deal on
 * a running stand. The draft contracts the fixture now carries are what makes
 * that walk possible from a fresh install.
 *
 * For the same reason every row here records `provider_mode` as `none`: no
 * provider was called while seeding, and saying `mock` would claim a receipt
 * that does not exist.
 */

const fixtureNamespace = "dehqonhub-demo-marketplace";

const fingerprint = (key: string): string =>
  createHash("sha256").update(`${fixtureNamespace}:lifecycle:${key}`).digest("hex");

const dayInMs = 24 * 60 * 60 * 1000;

/**
 * The one live deal a buyer has disputed, named by fixture key.
 *
 * Nominated rather than derived: nothing about a contract says its delivery went
 * wrong, and a marketplace where every second deal is in dispute would misdescribe
 * the product. One is enough for the dispute surface to have a subject.
 */
const disputedContractIds = new Set([marketplaceFixtureUuid("contract:cart:greenhouse-film")]);

export type DemoFulfillmentStatus =
  | "awaiting_settlement"
  | "ready"
  | "in_progress"
  | "delivered"
  | "disputed"
  | "completed";

export interface DemoSettlementFixture {
  id: string;
  contractId: string;
  /** The buying login that chose direct payment; a settlement records who did. */
  selectedByEmail: string;
  /**
   * Goods plus haulage, which is what the buyer actually transfers.
   * `ck__contract_settlements__amount` requires a whole number of som.
   */
  amountUzs: number;
  status: "awaiting_buyer_confirmation" | "buyer_confirmed" | "seller_received";
  selectionIdempotencyKey: string;
  selectionRequestFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoFulfillmentFixture {
  id: string;
  contractId: string;
  status: DemoFulfillmentStatus;
  startedAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoLifecycleEventFixture {
  id: string;
  contractId: string;
  sequence: number;
  category: "fulfillment" | "dispute" | "completion";
  eventType: string;
  actorParty: "buyer" | "seller";
  /** The login that acted; the coherence trigger checks it against the contract. */
  actorEmail: string;
  createdAt: Date;
}

export interface DemoNotificationIntentFixture {
  id: string;
  contractId: string;
  timelineEventId: string;
  recipientParty: "buyer" | "seller";
  templateKey: string;
  createdAt: Date;
}

export interface DemoDisputeFixture {
  id: string;
  contractId: string;
  openedByParty: "buyer";
  openedByEmail: string;
  reason: "quality_issue";
  previousFulfillmentStatus: "in_progress";
  createdAt: Date;
}

export interface DemoCommissionFixture {
  id: string;
  contractId: string;
  rateVersion: string;
  rateSnapshot: Readonly<Record<string, number>>;
  baseAmountUzs: number;
  amountUzs: number;
  createdAt: Date;
}

export interface DemoContractLifecycle {
  settlements: readonly DemoSettlementFixture[];
  fulfillments: readonly DemoFulfillmentFixture[];
  events: readonly DemoLifecycleEventFixture[];
  intents: readonly DemoNotificationIntentFixture[];
  disputes: readonly DemoDisputeFixture[];
  commissions: readonly DemoCommissionFixture[];
}

/**
 * The commission policy the migrations activate, which every completed deal is
 * charged against. Mirrored here rather than read from the database because a
 * commission row stores the snapshot it was charged under, not a reference to it.
 */
const commissionRateVersion = "dehqonhub-default-v1";
const commissionRateSnapshot = { produce: 10, product: 10, request: 10 } as const;
const basisPoints = 10_000;

/** The step the API names in the timeline, and the template key derived from it. */
const templateKeyFor = (eventType: string): string => `marketplace.contract.${eventType.replaceAll("_", ".")}`;

/**
 * How far a contract's delivery got, read off its own status.
 *
 * `guard_marketplace_contract_fulfillment` only ever admits one forward step at a
 * time, so the seed inserts the initial row and walks it; declaring the target
 * here keeps the walk in one place and keeps a contract from claiming a delivery
 * stage its status contradicts.
 */
const fulfillmentTargetFor = (contract: DemoContractFixture): DemoFulfillmentStatus | undefined => {
  if (contract.status === "completed") {
    return "completed";
  }
  if (contract.status === "active") {
    return disputedContractIds.has(contract.id) ? "disputed" : "in_progress";
  }
  return undefined;
};

/**
 * The timeline a delivery stage leaves behind.
 *
 * Only steps that involve no external provider appear: the seller marking a
 * delivery ready, started and handed over, the buyer closing the deal, and the
 * buyer opening a dispute. Everything a provider would have signed or charged for
 * is absent for the reason given at the top of this file, which is also why every
 * one of these carries `provider_mode = none` — the same value the running
 * application writes for exactly these five steps.
 */
const eventsForTarget = (
  target: DemoFulfillmentStatus,
): readonly { category: DemoLifecycleEventFixture["category"]; eventType: string; actorParty: "buyer" | "seller" }[] => {
  const ready = { actorParty: "seller" as const, category: "fulfillment" as const, eventType: "fulfillment_ready" };
  const started = { actorParty: "seller" as const, category: "fulfillment" as const, eventType: "fulfillment_started" };
  if (target === "completed") {
    return [
      ready,
      started,
      { actorParty: "seller", category: "fulfillment", eventType: "fulfillment_delivered" },
      { actorParty: "buyer", category: "completion", eventType: "contract_completed" },
    ];
  }
  if (target === "disputed") {
    return [ready, started, { actorParty: "buyer", category: "dispute", eventType: "dispute_opened" }];
  }
  return [ready, started];
};

/**
 * Every durable row the deals in `marketplace-seed-contracts` would have left
 * behind, derived from those deals rather than listed beside them.
 *
 * Derivation is the point: a hand-written list would drift the moment a contract
 * changed status, and the drift would show up as a completed deal with no
 * delivery record — the exact hole this module exists to close.
 */
export function demoMarketplaceContractLifecycle(now: Date): DemoContractLifecycle {
  const settlements: DemoSettlementFixture[] = [];
  const fulfillments: DemoFulfillmentFixture[] = [];
  const events: DemoLifecycleEventFixture[] = [];
  const intents: DemoNotificationIntentFixture[] = [];
  const disputes: DemoDisputeFixture[] = [];
  const commissions: DemoCommissionFixture[] = [];

  for (const contract of demoMarketplaceContracts(now)) {
    const key = contract.id;
    const target = fulfillmentTargetFor(contract);
    if (!target) {
      continue;
    }
    const settledAt = contract.updatedAt;
    const paidAt = new Date(Math.min(settledAt.getTime() - 2 * dayInMs, now.getTime()));
    settlements.push({
      amountUzs: contract.amountUzs + (contract.deliveryPriceUzs ?? 0),
      contractId: key,
      createdAt: paidAt,
      id: marketplaceFixtureUuid(`settlement:${key}`),
      selectedByEmail: contract.buyer.ownerEmail,
      selectionIdempotencyKey: `seed:settlement:${key}`,
      selectionRequestFingerprint: fingerprint(`settlement:${key}`),
      status: "seller_received",
      updatedAt: paidAt,
    });

    const readyAt = new Date(Math.min(paidAt.getTime() + dayInMs, now.getTime()));
    const startedAt = new Date(Math.min(readyAt.getTime() + dayInMs, now.getTime()));
    const deliveredAt = new Date(Math.min(startedAt.getTime() + dayInMs, now.getTime()));
    const completedAt = deliveredAt;
    fulfillments.push({
      completedAt: target === "completed" ? completedAt : null,
      contractId: key,
      createdAt: paidAt,
      deliveredAt: target === "completed" ? deliveredAt : null,
      id: marketplaceFixtureUuid(`fulfillment:${key}`),
      startedAt,
      status: target,
      updatedAt: target === "completed" ? completedAt : startedAt,
    });

    const stamps = [readyAt, startedAt, deliveredAt, completedAt];
    eventsForTarget(target).forEach((step, index) => {
      const eventId = marketplaceFixtureUuid(`lifecycle-event:${key}:${step.eventType}`);
      events.push({
        actorEmail: step.actorParty === "buyer" ? contract.buyer.ownerEmail : contract.seller.ownerEmail,
        actorParty: step.actorParty,
        category: step.category,
        contractId: key,
        createdAt: stamps[Math.min(index, stamps.length - 1)] as Date,
        eventType: step.eventType,
        id: eventId,
        sequence: index + 1,
      });
      // One intent per party per accepted transition, which is what the
      // repository writes in the same transaction as the event. Both parties are
      // told, so a reviewer signed in as either finds the deal reported.
      for (const recipientParty of ["buyer", "seller"] as const) {
        intents.push({
          contractId: key,
          createdAt: stamps[Math.min(index, stamps.length - 1)] as Date,
          id: marketplaceFixtureUuid(`notification-intent:${eventId}:${recipientParty}`),
          recipientParty,
          templateKey: templateKeyFor(step.eventType),
          timelineEventId: eventId,
        });
      }
    });

    if (target === "disputed") {
      disputes.push({
        contractId: key,
        createdAt: deliveredAt,
        id: marketplaceFixtureUuid(`dispute:${key}`),
        openedByEmail: contract.buyer.ownerEmail,
        openedByParty: "buyer",
        previousFulfillmentStatus: "in_progress",
        reason: "quality_issue",
      });
    }

    if (target === "completed") {
      const baseAmountUzs = Math.trunc(contract.amountUzs);
      commissions.push({
        amountUzs: Math.trunc((baseAmountUzs * commissionRateSnapshot.product) / basisPoints),
        baseAmountUzs,
        contractId: key,
        createdAt: completedAt,
        id: marketplaceFixtureUuid(`commission:${key}`),
        rateSnapshot: commissionRateSnapshot,
        rateVersion: commissionRateVersion,
      });
    }
  }

  return { commissions, disputes, events, fulfillments, intents, settlements };
}
