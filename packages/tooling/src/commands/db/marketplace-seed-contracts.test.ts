// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";
import { demoMarketplaceSellerCreatedProducts } from "./marketplace-seed-data.ts";
import {
  demoContractPartySnapshot,
  demoMarketplaceCarts,
  demoMarketplaceContracts,
} from "./marketplace-seed-contracts.ts";
import {
  demoMarketplaceListingPublications,
  demoMarketplaceOffers,
  demoMarketplaceProduceListings,
  demoMarketplaceProducePublications,
  demoMarketplaceRequests,
  demoMarketplaceSellerCreatedPublications,
} from "./marketplace-seed-publications.ts";
import { demoMarketplaceContractLifecycle } from "./marketplace-seed-lifecycle.ts";
import { demoMarketplaceIdentities, marketplaceIdentity } from "./marketplace-seed-roster.ts";

/**
 * The fixture's job is to be accepted by the database. Every assertion below
 * restates one constraint on `marketplace_contracts` that a bad row would only
 * fail at seed time, inside a transaction that also carries the review logins —
 * so a broken fixture takes the whole seed down with a bare constraint name.
 */

const now = new Date("2026-08-19T12:00:00.000Z");
const contracts = demoMarketplaceContracts(now);

const monthKey = (date: Date): string => date.toISOString().slice(0, 7);

describe("demo marketplace contract fixture", () => {
  it("keeps every row inside the six-month window the dashboard aggregates", () => {
    const months = new Set<string>();
    for (let offset = 5; offset >= 0; offset -= 1) {
      months.add(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))));
    }
    assert.ok(contracts.length > 0);
    for (const contract of contracts) {
      assert.ok(
        months.has(monthKey(contract.updatedAt)),
        `${contract.id} settles in ${monthKey(contract.updatedAt)}, outside the aggregated window`,
      );
      assert.ok(contract.createdAt.getTime() < contract.updatedAt.getTime());
    }
  });

  it("never dates a row in the current month later than today", () => {
    const currentMonth = monthKey(now);
    for (const contract of contracts.filter((entry) => monthKey(entry.updatedAt) === currentMonth)) {
      assert.ok(contract.updatedAt.getTime() <= now.getTime(), `${contract.id} settles in the future`);
    }
  });

  it("gives every completed month at least one row, so the chart has a shape", () => {
    const completedMonths = new Set(
      contracts.filter((contract) => contract.status === "completed").map((contract) => monthKey(contract.updatedAt)),
    );
    assert.equal(completedMonths.size, 6);
  });

  it("freezes every line the way ck__marketplace_contracts__resolved_parties requires", () => {
    // A deal drawn from an awarded offer quotes the request rather than a
    // catalogue row: `marketplace_contract_lines_are_frozen` admits `request`
    // beside `product` and `produce`, and the publication it names is the
    // request's public snapshot. So both families of publication and both
    // families of source id count as seeded here.
    const publicationIds = new Set([
      ...demoMarketplaceListingPublications.map((publication) => publication.id),
      ...demoMarketplaceSellerCreatedPublications.map((publication) => publication.id),
      ...demoMarketplaceProducePublications.map((publication) => publication.id),
      ...demoMarketplaceRequests.map((request) => request.publicationId),
    ]);
    const sourceIds = new Set([
      ...DemoProducts.map((product) => product.id),
      ...demoMarketplaceSellerCreatedProducts.map((product) => product.id),
      ...demoMarketplaceProduceListings.map((listing) => listing.id),
      ...demoMarketplaceRequests.map((request) => request.id),
    ]);
    for (const contract of contracts) {
      assert.ok(contract.lines.length > 0, `${contract.id} has no lines`);
      for (const line of contract.lines) {
        assert.ok(publicationIds.has(line.sourcePublicationId), `${line.name} quotes an unseeded publication`);
        assert.ok(sourceIds.has(line.sourceId), `${line.name} quotes an unknown catalog row or harvest`);
        assert.ok(
      ["product", "produce", "request"].includes(line.sourceKind),
      `${line.name} has an unknown source kind`,
    );
        assert.ok(line.sourceRevision >= 1);
        assert.notEqual(line.name.trim(), "");
        assert.notEqual(line.unit.trim(), "");
        assert.ok(line.unitPriceUzs > 0);
        assert.ok(line.quantity > 0);
        assert.equal(line.lineTotalUzs, line.unitPriceUzs * line.quantity);
      }
      // The repository computes a contract amount as the sum of its line totals
      // and nothing else; delivery is priced separately.
      assert.equal(
        contract.amountUzs,
        contract.lines.reduce((sum, line) => sum + line.lineTotalUzs, 0),
      );
      assert.ok(Number.isSafeInteger(contract.amountUzs) && contract.amountUzs > 0);
    }
  });

  it("satisfies ck__marketplace_contracts__party_consent for every status it uses", () => {
    for (const contract of contracts) {
      if (contract.status === "active") {
        assert.ok(contract.buyerSignedAt && contract.sellerSignedAt && contract.signedAt, `${contract.id} is unsigned`);
      }
      if (contract.status === "signed") {
        assert.equal(contract.signedAt, null);
        assert.notEqual(contract.buyerSignedAt === null, contract.sellerSignedAt === null);
      }
      if (contract.status === "cancelled") {
        assert.equal(contract.buyerSignedAt, null);
        assert.equal(contract.sellerSignedAt, null);
        assert.equal(contract.signedAt, null);
      }
    }
  });

  it("satisfies ck__marketplace_contracts__delivery_price for every delivery term", () => {
    for (const contract of contracts) {
      if (contract.deliveryTerms === "pickup") {
        assert.equal(contract.deliveryPriceUzs, 0);
      }
      if (contract.deliveryTerms === "seller_delivery") {
        assert.ok(contract.deliveryPriceUzs === null || contract.deliveryPriceUzs > 0);
      }
      if (contract.deliveryTerms === "by_agreement") {
        assert.equal(contract.deliveryPriceUzs, null);
      }
      assert.ok(contract.deliveryDays === null || contract.deliveryDays > 0);
    }
  });

  it("trades only between the buyer and seller logins the party trigger can resolve", () => {
    // `assert_marketplace_resolved_commerce_parties` resolves each side against an
    // active membership on an approved organization whose owner holds a verified
    // role the policy admits: ('buyer', 'farmer') to buy, ('seller', 'farmer') to
    // sell. A contract naming a login without the organization for its side of the
    // deal is a row the database refuses, so the roster is the authority here.
    const buyingRoles = new Set(["buyer", "farmer"]);
    const sellingRoles = new Set(["seller", "farmer"]);
    for (const contract of contracts) {
      const buyer = marketplaceIdentity(contract.buyer.ownerEmail);
      const seller = marketplaceIdentity(contract.seller.ownerEmail);
      assert.ok(buyingRoles.has(buyer.role), `${contract.id} is bought by a ${buyer.role} login`);
      assert.ok(sellingRoles.has(seller.role), `${contract.id} is sold by a ${seller.role} login`);
      assert.equal(buyer.buyer?.legalName, contract.buyer.legalName);
      assert.ok(
        seller.suppliers.some((supplier) => supplier.legalName === contract.seller.legalName),
        `${contract.seller.legalName} is not an organization ${seller.email} sells through`,
      );
      assert.notEqual(contract.buyer.partnerId, contract.seller.partnerId);
      assert.notEqual(contract.seller.legalName.trim(), "");
      assert.notEqual(contract.seller.region.trim(), "");
    }
  });

  it("gives every trading login in the roster a history of its own", () => {
    // A profile that opens on an empty cabinet says nothing about whether the
    // cabinet works, and one buyer can never give a listing a second opinion.
    const buyers = new Set(contracts.map((contract) => contract.buyer.ownerEmail));
    const sellers = new Set(contracts.map((contract) => contract.seller.ownerEmail));
    for (const identity of demoMarketplaceIdentities) {
      if (identity.buyer) {
        assert.ok(buyers.has(identity.email), `${identity.email} holds a buying organization but never buys`);
      }
      if (identity.suppliers.length > 0) {
        assert.ok(sellers.has(identity.email), `${identity.email} holds a selling organization but never sells`);
      }
    }
  });

  it("sells a harvest as produce rather than as a catalog row standing in for one", () => {
    const produceSellers = new Set(
      contracts
        .filter((contract) => contract.lines.some((line) => line.sourceKind === "produce"))
        .map((contract) => contract.seller.ownerEmail),
    );
    assert.ok(produceSellers.size >= 5, `only ${produceSellers.size} co-operatives sell their own harvest`);
    for (const email of produceSellers) {
      assert.equal(marketplaceIdentity(email).role, "farmer", `${email} sells produce without being a farmer`);
    }
  });

  it("writes a party snapshot the resolved-parties check can validate against the row", () => {
    const [contract] = contracts;
    assert.ok(contract);
    const snapshot = demoContractPartySnapshot(contract.buyer, "tenant-1", "user-1");
    assert.deepEqual(snapshot, {
      legalName: contract.buyer.legalName,
      partnerId: contract.buyer.partnerId,
      region: contract.buyer.region,
      tenantId: "tenant-1",
      userId: "user-1",
    });
  });

  it("keeps stable ids across calls, so a re-seed updates rather than duplicates", () => {
    const later = demoMarketplaceContracts(new Date("2026-08-25T12:00:00.000Z"));
    assert.deepEqual(
      later.map((contract) => contract.id),
      contracts.map((contract) => contract.id),
    );
    assert.equal(new Set(contracts.map((contract) => contract.id)).size, contracts.length);
  });

  it("uses every contract status the cabinet renders a badge for", () => {
    const statuses = new Set(contracts.map((contract) => contract.status));
    assert.deepEqual([...statuses].sort(), ["active", "cancelled", "completed", "draft", "signed"]);
  });

  it("names the cart or the offer every new deal was drawn from, and nothing else", () => {
    const cartIds = new Set(demoMarketplaceCarts(now).map((cart) => cart.id));
    const offerIds = new Set(demoMarketplaceOffers.map((offer) => offer.id));
    for (const contract of contracts) {
      if (contract.sourceType === null) {
        assert.equal(contract.sourceId, null, `${contract.id} carries a source id with no source type`);
        continue;
      }
      assert.ok(contract.sourceId, `${contract.id} names a source type with no id`);
      const known = contract.sourceType === "cart_checkout" ? cartIds : offerIds;
      assert.ok(known.has(contract.sourceId as string), `${contract.id} points at a source the seed never writes`);
    }
  });

  it("keeps one live contract per awarded request, as the offer-selection trigger requires", () => {
    const offersById = new Map(demoMarketplaceOffers.map((offer) => [offer.id, offer] as const));
    const liveByRequest = new Map<string, number>();
    for (const contract of contracts) {
      if (contract.sourceType !== "offer_selection" || contract.status === "cancelled") continue;
      const offer = offersById.get(contract.sourceId as string);
      assert.ok(offer, `${contract.id} is drawn from an offer the seed never writes`);
      liveByRequest.set(offer.requestId, (liveByRequest.get(offer.requestId) ?? 0) + 1);
    }
    for (const [requestId, live] of liveByRequest) {
      assert.equal(live, 1, `request ${requestId} carries ${live} live contracts`);
    }
    // And exactly one accepted offer per request, which is the other half of the
    // pair the database holds.
    const acceptedByRequest = new Map<string, number>();
    for (const offer of demoMarketplaceOffers.filter((candidate) => candidate.status === "accepted")) {
      acceptedByRequest.set(offer.requestId, (acceptedByRequest.get(offer.requestId) ?? 0) + 1);
    }
    for (const [requestId, accepted] of acceptedByRequest) {
      assert.equal(accepted, 1, `request ${requestId} carries ${accepted} accepted offers`);
    }
    assert.deepEqual([...acceptedByRequest.keys()].sort(), [...liveByRequest.keys()].sort());
  });

  it("hands one buying account two open carts from two sellers, so the switcher has a choice", () => {
    const carts = demoMarketplaceCarts(now);
    const open = carts.filter((cart) => cart.status === "open");
    assert.ok(open.length >= 3, `only ${open.length} carts are open`);
    const bySeller = new Map<string, Set<string>>();
    for (const cart of open) {
      const sellers = bySeller.get(cart.buyer.ownerEmail) ?? new Set<string>();
      sellers.add(cart.seller.partnerId);
      bySeller.set(cart.buyer.ownerEmail, sellers);
    }
    assert.ok(
      [...bySeller.values()].some((sellers) => sellers.size >= 2),
      "no buying account holds open carts from two different sellers",
    );
    // One open cart per buyer and seller pair, which is what the partial unique
    // index allows, and every open cart is free of a contract so a reviewer can
    // still check it out.
    const pairs = open.map((cart) => `${cart.buyer.ownerEmail}|${cart.seller.partnerId}`);
    assert.equal(new Set(pairs).size, pairs.length);
    const sourced = new Set(contracts.map((contract) => contract.sourceId));
    for (const cart of open) {
      assert.ok(!sourced.has(cart.id), `open cart ${cart.id} has already been checked out`);
    }
    for (const cart of carts.filter((candidate) => candidate.status === "ordered")) {
      assert.ok(sourced.has(cart.id), `ordered cart ${cart.id} produced no contract`);
    }
  });

  it("leaves the settled half of every deal that reached it, and nothing for the ones that did not", () => {
    const lifecycle = demoMarketplaceContractLifecycle(now);
    const byId = new Map(contracts.map((contract) => [contract.id, contract] as const));
    const settled = new Set(lifecycle.settlements.map((settlement) => settlement.contractId));
    for (const contract of contracts) {
      const reached = contract.status === "completed" || contract.status === "active";
      assert.equal(settled.has(contract.id), reached, `${contract.id} disagrees with its settlement`);
    }
    // A settlement transfers goods plus haulage, which is what the buyer pays.
    for (const settlement of lifecycle.settlements) {
      const contract = byId.get(settlement.contractId);
      assert.ok(contract);
      assert.equal(settlement.amountUzs, contract.amountUzs + (contract.deliveryPriceUzs ?? 0));
      assert.equal(settlement.amountUzs, Math.trunc(settlement.amountUzs));
      assert.equal(settlement.selectedByEmail, contract.buyer.ownerEmail);
    }
    // `ck__contract_fulfillments__timeline` pairs each delivery state with the
    // stamps it must and must not carry.
    for (const fulfillment of lifecycle.fulfillments) {
      const contract = byId.get(fulfillment.contractId);
      assert.ok(contract);
      assert.ok(fulfillment.startedAt, `${fulfillment.contractId} is being delivered with no start time`);
      if (fulfillment.status === "completed") {
        assert.ok(fulfillment.deliveredAt && fulfillment.completedAt);
      } else {
        assert.equal(fulfillment.deliveredAt, null);
        assert.equal(fulfillment.completedAt, null);
      }
      assert.equal(contract.status === "completed", fulfillment.status === "completed");
    }
    assert.equal(lifecycle.disputes.length, 1);
  });

  it("writes one notification intent per party for every timeline event", () => {
    const lifecycle = demoMarketplaceContractLifecycle(now);
    const eventIds = new Set(lifecycle.events.map((event) => event.id));
    assert.equal(lifecycle.intents.length, lifecycle.events.length * 2);
    const seen = new Set<string>();
    for (const intent of lifecycle.intents) {
      assert.ok(eventIds.has(intent.timelineEventId), `an intent reports an event the seed never writes`);
      const key = `${intent.timelineEventId}|${intent.recipientParty}`;
      assert.ok(!seen.has(key), `two intents share ${key}`);
      seen.add(key);
      assert.match(intent.templateKey, /^marketplace\.contract\.[a-z.]+$/u);
    }
    // Sequences start at one and never repeat inside a contract, which is what
    // `uq__contract_lifecycle_events__contract_id_sequence` requires.
    const sequences = new Map<string, number[]>();
    for (const event of lifecycle.events) {
      sequences.set(event.contractId, [...(sequences.get(event.contractId) ?? []), event.sequence]);
    }
    for (const [contractId, values] of sequences) {
      assert.deepEqual(
        [...values].sort((left, right) => left - right),
        values.map((_, index) => index + 1),
        `${contractId} has a gap or a repeat in its timeline`,
      );
    }
  });

  it("charges the marketplace's commission on every closed deal and on no other", () => {
    const lifecycle = demoMarketplaceContractLifecycle(now);
    const charged = new Set(lifecycle.commissions.map((commission) => commission.contractId));
    for (const contract of contracts) {
      assert.equal(charged.has(contract.id), contract.status === "completed", `${contract.id} is charged wrongly`);
    }
    for (const commission of lifecycle.commissions) {
      assert.ok(commission.baseAmountUzs > 0);
      assert.ok(commission.amountUzs >= 0 && commission.amountUzs <= commission.baseAmountUzs);
      assert.equal(commission.amountUzs, Math.trunc(commission.amountUzs));
    }
  });

  it("holds a cart's quote and its contract's frozen lines to the same numbers", () => {
    const cartsById = new Map(demoMarketplaceCarts(now).map((cart) => [cart.id, cart] as const));
    for (const contract of contracts.filter((candidate) => candidate.sourceType === "cart_checkout")) {
      const cart = cartsById.get(contract.sourceId as string);
      assert.ok(cart, `${contract.id} names a cart the seed never writes`);
      assert.deepEqual(cart.lines, contract.lines);
      assert.equal(cart.seller.partnerId, contract.seller.partnerId);
      assert.equal(cart.buyer.partnerId, contract.buyer.partnerId);
    }
  });
});
