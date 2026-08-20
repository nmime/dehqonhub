// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";
import { demoContractPartySnapshot, demoMarketplaceContracts } from "./marketplace-seed-contracts.ts";
import {
  demoMarketplaceListingPublications,
  demoMarketplaceProduceListings,
  demoMarketplaceProducePublications,
} from "./marketplace-seed-publications.ts";
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
    const publicationIds = new Set(
      [...demoMarketplaceListingPublications, ...demoMarketplaceProducePublications].map(
        (publication) => publication.id,
      ),
    );
    const sourceIds = new Set([
      ...DemoProducts.map((product) => product.id),
      ...demoMarketplaceProduceListings.map((listing) => listing.id),
    ]);
    for (const contract of contracts) {
      assert.ok(contract.lines.length > 0, `${contract.id} has no lines`);
      for (const line of contract.lines) {
        assert.ok(publicationIds.has(line.sourcePublicationId), `${line.name} quotes an unseeded publication`);
        assert.ok(sourceIds.has(line.sourceId), `${line.name} quotes an unknown catalog row or harvest`);
        assert.ok(["product", "produce"].includes(line.sourceKind), `${line.name} has an unknown source kind`);
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
    assert.deepEqual([...statuses].sort(), ["active", "cancelled", "completed", "signed"]);
  });
});
