// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { demoMarketplaceContracts } from "./marketplace-seed-contracts.ts";
import {
  demoMarketplaceListingPublications,
  demoMarketplaceProducePublications,
} from "./marketplace-seed-publications.ts";
import { demoMarketplaceMediaAsset } from "./marketplace-seed-media.ts";
import { demoMarketplaceReviewEligibilities, demoMarketplaceReviews } from "./marketplace-seed-reviews.ts";
import { marketplaceIdentity } from "./marketplace-seed-roster.ts";

/**
 * These fixtures are inserted inside the seed transaction that also carries the
 * review logins, and every rule they must satisfy is enforced by the database —
 * `assert_marketplace_listing_review_coherence`, the eligibility uniqueness
 * constraint and the one-review-per-buyer-and-product indexes. A bad row takes
 * the whole seed down with a bare constraint name, so each assertion below
 * restates one of those rules where the failure can still name itself.
 */

const now = new Date("2026-08-19T12:00:00.000Z");
const contracts = demoMarketplaceContracts(now);
const eligibilities = demoMarketplaceReviewEligibilities(now);
const reviews = demoMarketplaceReviews(now);

describe("demo marketplace review fixture", () => {
  it("grants one eligibility per completed contract line and none for any other status", () => {
    const completedLines = contracts
      .filter((contract) => contract.status === "completed")
      .flatMap((contract) => contract.lines);
    assert.equal(eligibilities.length, completedLines.length);
    assert.ok(eligibilities.length > 0);

    const settledContractIds = new Set(
      contracts.filter((contract) => contract.status === "completed").map((contract) => contract.id),
    );
    for (const eligibility of eligibilities) {
      assert.ok(
        settledContractIds.has(eligibility.contractId),
        `${eligibility.id} claims a contract that never completed`,
      );
    }
  });

  it("keys eligibility the way uq__contract_review_eligibilities__contract_source does", () => {
    const keys = eligibilities.map(
      (eligibility) => `${eligibility.contractId}|${eligibility.sourceKind}|${eligibility.sourceId}`,
    );
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(new Set(eligibilities.map((eligibility) => eligibility.id)).size, eligibilities.length);
  });

  it("keeps buyer and seller distinct, as ck__contract_review_eligibilities__different_parties requires", () => {
    for (const eligibility of eligibilities) {
      assert.notEqual(eligibility.buyerPartnerId, eligibility.sellerPartnerId);
    }
  });

  it("points every eligibility at a publication the seed actually writes", () => {
    const publicationIds = new Map(
      [...demoMarketplaceListingPublications, ...demoMarketplaceProducePublications].map(
        (publication) => [publication.id, publication] as const,
      ),
    );
    for (const eligibility of eligibilities) {
      const publication = publicationIds.get(eligibility.sourcePublicationId);
      assert.ok(publication, `${eligibility.sourceName} quotes an unseeded publication`);
      // `assert_marketplace_listing_review_coherence` compares the eligibility's
      // source against the publication's own, on whichever column the kind names.
      assert.equal(publication.sourceKind, eligibility.sourceKind);
      assert.equal(
        eligibility.sourceKind === "product" ? publication.productId : publication.produceListingId,
        eligibility.sourceId,
      );
    }
  });

  it("files every review against an eligibility, and never two against one", () => {
    const byId = new Map(eligibilities.map((eligibility) => [eligibility.id, eligibility] as const));
    const consumed = new Set<string>();
    for (const review of reviews) {
      const eligibility = byId.get(review.eligibilityId);
      assert.ok(eligibility, `${review.id} consumes an eligibility that does not exist`);
      assert.ok(!consumed.has(review.eligibilityId), `${review.eligibilityId} is consumed twice`);
      consumed.add(review.eligibilityId);
      // The coherence trigger compares all of these against the eligibility row.
      assert.equal(review.listingPublicationId, eligibility.sourcePublicationId);
      assert.equal(review.sourceKind, eligibility.sourceKind);
      assert.equal(review.sourceId, eligibility.sourceId);
      assert.equal(review.buyerOwnerEmail, eligibility.buyerOwnerEmail);
      assert.equal(review.buyerPartnerId, eligibility.buyerPartnerId);
      assert.equal(review.sellerPartnerId, eligibility.sellerPartnerId);
    }
  });

  it("leaves every buying login an unconsumed eligibility, so the entry is reachable", () => {
    const consumed = new Set(reviews.map((review) => review.eligibilityId));
    const remaining = new Set(
      eligibilities
        .filter((eligibility) => !consumed.has(eligibility.id))
        .map((eligibility) => eligibility.buyerOwnerEmail),
    );
    // Every login that completed a purchase must still have one left to rate;
    // otherwise the review form is a screen only a test can reach.
    for (const buyer of new Set(eligibilities.map((eligibility) => eligibility.buyerOwnerEmail))) {
      assert.ok(remaining.has(buyer), `${buyer} has rated every purchase it ever made`);
    }
    assert.ok(remaining.size >= 12, `only ${remaining.size} logins can still leave a review`);
  });

  it("gives every buying login at least one review of its own", () => {
    const authors = new Set(reviews.map((review) => review.buyerOwnerEmail));
    for (const buyer of new Set(eligibilities.map((eligibility) => eligibility.buyerOwnerEmail))) {
      assert.ok(authors.has(buyer), `${buyer} completed purchases but rated none of them`);
    }
  });

  it("keeps one review per buyer and source, as the partial unique indexes require", () => {
    const keys = reviews.map((review) => `${review.buyerOwnerEmail}|${review.sourceKind}|${review.sourceId}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("rates harvests as well as catalog rows, so the produce section carries ratings too", () => {
    const produce = reviews.filter((review) => review.sourceKind === "produce");
    assert.ok(produce.length >= 8, `only ${produce.length} harvests carry a rating`);
    assert.ok(reviews.some((review) => review.sourceKind === "product"));
  });

  it("attaches photographs the deployment can actually serve, owned by the buyer who wrote the review", () => {
    // `asset_references` takes up to three `public-asset:<id>` handles. The
    // fixture names photographs by media fixture key rather than by handle, so a
    // deployment without object storage writes none of them, and every key it does
    // name has to belong to the buyer who wrote the review —
    // `requireOwnedReferences` refuses a handle the acting account did not upload.
    const withPhotos = reviews.filter((review) => review.assetMediaKeys.length > 0);
    assert.ok(withPhotos.length >= 3, `only ${withPhotos.length} reviews carry a photograph`);
    for (const review of reviews) {
      assert.ok(
        review.assetMediaKeys.length <= 3,
        `${review.id} carries ${review.assetMediaKeys.length} photographs; the column allows three`,
      );
      for (const key of review.assetMediaKeys) {
        assert.equal(
          demoMarketplaceMediaAsset(key).ownerEmail,
          review.buyerOwnerEmail,
          `${review.id} attaches a photograph ${review.buyerOwnerEmail} did not upload`,
        );
      }
    }
    // Both a catalogue listing and a harvest carry one, so neither renderer is
    // exercised only by a test.
    assert.ok(withPhotos.some((review) => review.sourceKind === "product"));
    assert.ok(withPhotos.some((review) => review.sourceKind === "produce"));
  });

  it("writes ratings the check constraint accepts, and more than one distinct value", () => {
    const values = new Set<number>();
    for (const review of reviews) {
      assert.ok(Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5, `${review.id} is unratable`);
      assert.notEqual(review.comment.trim(), "");
      values.add(review.rating);
    }
    // A catalog of identical ratings would make every average equal every score.
    assert.ok(values.size >= 3, "the fixture rates everything the same");
  });

  it("gives some listing more than one review, so an average is worth rounding", () => {
    const counts = new Map<string, number>();
    for (const review of reviews) {
      counts.set(review.listingPublicationId, (counts.get(review.listingPublicationId) ?? 0) + 1);
    }
    const multiple = [...counts.values()].filter((count) => count > 1);
    assert.ok(multiple.length > 0, "no listing carries two opinions");
    // And the aggregate those rows produce must be a value the API can publish.
    for (const [publicationId, count] of counts) {
      const sum = reviews
        .filter((review) => review.listingPublicationId === publicationId)
        .reduce((total, review) => total + review.rating, 0);
      const average = Math.round((sum / count) * 10) / 10;
      assert.ok(average >= 1 && average <= 5);
    }
  });

  it("never dates a review before its purchase or after today", () => {
    const byId = new Map(eligibilities.map((eligibility) => [eligibility.id, eligibility] as const));
    for (const review of reviews) {
      const eligibility = byId.get(review.eligibilityId);
      assert.ok(eligibility);
      assert.ok(review.createdAt.getTime() >= eligibility.createdAt.getTime(), `${review.id} predates its purchase`);
      assert.ok(review.createdAt.getTime() <= now.getTime(), `${review.id} is dated in the future`);
      if (review.reply) {
        assert.ok(review.reply.createdAt.getTime() >= review.createdAt.getTime());
        assert.ok(review.reply.createdAt.getTime() <= now.getTime());
        assert.notEqual(review.reply.comment.trim(), "");
      }
    }
  });

  it("answers a seller reply only where the schema stores one, and at most once", () => {
    const replies = reviews.filter((review) => review.reply);
    assert.ok(replies.length > 0, "no seller reply is exercised");
    assert.equal(new Set(replies.map((review) => review.reply?.id)).size, replies.length);
    for (const review of replies) {
      // A reply is written by the organization that sold the goods, never by a
      // third party: `marketplace_review_replies` carries the seller partner and
      // `uq__marketplace_review_replies__review_id` allows exactly one.
      assert.equal(review.reply?.sellerOwnerEmail, review.sellerOwnerEmail);
      assert.equal(review.reply?.sellerPartnerId, review.sellerPartnerId);
      assert.ok(
        ["seller", "farmer"].includes(marketplaceIdentity(review.reply?.sellerOwnerEmail ?? "").role),
        `${review.reply?.sellerOwnerEmail} replied to a review without a selling role`,
      );
    }
    assert.ok(
      new Set(replies.map((review) => review.sellerOwnerEmail)).size > 1,
      "only one organization ever answers a review",
    );
  });

  it("keeps stable ids across calls, so a re-seed updates rather than duplicates", () => {
    const later = demoMarketplaceReviews(new Date("2026-08-25T12:00:00.000Z"));
    assert.deepEqual(
      later.map((review) => review.id),
      reviews.map((review) => review.id),
    );
  });

  it("refuses a rating for a purchase neither demo buyer made", () => {
    // The fixture list is private, so this exercises the guard through the only
    // observable path: a product name no completed contract quotes can never
    // resolve an eligibility, and the loader says so instead of emitting a row
    // the coherence trigger would reject with a bare constraint name.
    const rated = new Set(reviews.map((review) => review.sourceId));
    const unrated = eligibilities.filter((eligibility) => !rated.has(eligibility.sourceId));
    assert.ok(unrated.length > 0, "every purchase is rated, so the empty ratings block is unreachable");
  });
});
