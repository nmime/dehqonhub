// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  inspectMarketplaceMedia,
  marketplaceMediaPathFor,
  marketplaceMediaPathPattern,
  marketplaceMediaPublicIdPattern,
  marketplaceMediaReferenceFor,
  marketplaceMediaStorageKey,
} from "../../../../../libs/backend/feature/agritech/shared/lib/src/marketplace-media.ts";
import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";
import { catalogSuppliers, demoMarketplaceSellerCreatedProducts } from "./marketplace-seed-data.ts";
import { demoMarketplaceMediaAsset, demoMarketplaceMediaAssets } from "./marketplace-seed-media.ts";
import { demoMediaResolver, prepareDemoMarketplaceMedia } from "./marketplace-seed-media.storage.ts";
import { farmerEmail, marketplaceIdentity } from "./marketplace-seed-roster.ts";
import { DefaultTenantId } from "./seed-data.ts";
import {
  demoMarketplaceFarmer,
  demoMarketplaceFarmers,
  demoMarketplaceListingPromotions,
  demoMarketplaceListingPublications,
  demoMarketplaceOffers,
  demoMarketplaceProduceListings,
  demoMarketplaceProducePublications,
  demoMarketplacePublicSellers,
  demoMarketplaceRequests,
  demoMarketplaceSellerCreatedPublications,
  maxPublicImages,
  publicImages,
} from "./marketplace-seed-publications.ts";

/**
 * The catalogue fixture's job is to be accepted by the database and then to be
 * worth looking at. Every assertion below restates either one constraint that a
 * bad row would only fail at seed time — inside a transaction that also carries
 * the review logins, so a broken fixture takes the whole seed down with a bare
 * constraint name — or one property a reviewer would notice was missing.
 */

const publications = [
  ...demoMarketplaceListingPublications,
  ...demoMarketplaceSellerCreatedPublications,
  ...demoMarketplaceProducePublications,
];

/** A publication the public catalog will actually serve: it filters empty stock. */
const stockByProductId = new Map(DemoProducts.map((product) => [product.id, product.stockQuantity] as const));
const isVisible = (publication: (typeof publications)[number]): boolean =>
  publication.productId === null ? true : (stockByProductId.get(publication.productId) ?? 0) > 0;

/** Oblast-level regions the seed trades in, spelled as the catalog spells them. */
const regions = new Set([
  "Andijon",
  "Buxoro",
  "Farg'ona",
  "Jizzax",
  "Namangan",
  "Navoiy",
  "Qashqadaryo",
  "Qoraqalpog'iston",
  "Samarqand",
  "Sirdaryo",
  "Surxondaryo",
  "Toshkent",
  "Xorazm",
]);

/** What `ck__listing_promotions__plan` pairs each plan code with. */
const promotionPlans = {
  catalog_7d: { priceUzs: 150_000, durationDays: 7 },
  catalog_14d: { priceUzs: 270_000, durationDays: 14 },
  catalog_30d: { priceUzs: 500_000, durationDays: 30 },
};

describe("demo marketplace public image budget", () => {
  it("passes a snapshot at the limit through untouched", () => {
    const images = Array.from({ length: maxPublicImages }, (_, index) => `/media/marketplace/photo-${index}.webp`);
    assert.deepEqual(publicImages("listing", images), images);
  });

  it("refuses a snapshot over the limit and names the listing", () => {
    const images = Array.from({ length: maxPublicImages + 1 }, (_, index) => `/media/marketplace/photo-${index}.webp`);
    assert.throws(() => publicImages("listing-publication:over-budget", images), {
      message: /listing-publication:over-budget carries 6 images/u,
    });
  });
});

describe("demo marketplace catalogue fixture", () => {
  it("keeps the catalogue large enough to read as a market", () => {
    const visible = publications.filter(isVisible);
    assert.ok(visible.length >= 55, `only ${visible.length} listings reach the public catalog`);
    for (const section of ["seeds", "equipment", "produce"] as const) {
      const rows = visible.filter((publication) => publication.section === section);
      assert.ok(rows.length >= 15, `the ${section} section has only ${rows.length} visible listings`);
    }
  });

  it("gives every section more than one seller and more than one region", () => {
    for (const section of ["seeds", "equipment", "produce"] as const) {
      const rows = publications.filter((publication) => publication.section === section && isVisible(publication));
      assert.ok(
        new Set(rows.map((row) => row.sellerPublicId)).size > 1,
        `the ${section} section publishes through a single seller`,
      );
      assert.ok(new Set(rows.map((row) => row.region)).size > 1, `the ${section} section sits in a single region`);
    }
  });

  it("names every listing in all four locales", () => {
    for (const publication of publications) {
      for (const [locale, title] of [
        ["ru", publication.titleRu],
        ["uz", publication.titleUz],
        ["uz-cyrl", publication.titleUzCyrl],
      ] as const) {
        assert.ok(title && title.trim() !== "", `${publication.title} has no ${locale} title`);
        assert.notEqual(title, publication.title, `${publication.title} left ${locale} as the English copy`);
      }
    }
  });

  it("writes every catalog row's fourth locale too, so a product page matches its card", () => {
    for (const product of DemoProducts) {
      assert.ok(product.nameRu?.trim(), `${product.name} has no Russian name`);
      assert.ok(product.nameUz?.trim(), `${product.name} has no Uzbek Latin name`);
      assert.ok(product.nameUzCyrl?.trim(), `${product.name} has no Uzbek Cyrillic name`);
    }
  });

  it("stays inside the snapshot's five-asset check constraint", () => {
    for (const publication of publications) {
      assert.ok(
        publication.images.length <= maxPublicImages,
        `${publication.title} carries ${publication.images.length} images`,
      );
      for (const image of publication.images) {
        assert.match(image, /^\/media\/marketplace\/[a-z0-9-]+\.webp$/u, `${publication.title} links ${image}`);
      }
    }
  });

  /**
   * A fresh clone is the machine that matters here. The check above accepts
   * `/media/marketplace/anything.webp`, so a fixture could name a photograph
   * nobody ever committed and still pass it — and that failure surfaces as a
   * broken image on the reviewer's screen rather than as a red test. The
   * checked-in library is the only reason the catalogue can be seeded at all:
   * those files travel in git, unlike an uploaded object, which exists only in
   * the bucket of the machine that uploaded it and is absent from every other
   * install. Holding the fixture to the library keeps the seeded catalogue
   * renderable on a deployment whose object storage is empty, or absent.
   */
  it("names only photographs that travel in git, so a fresh clone renders every card", () => {
    const publicRoot = fileURLToPath(new URL("../../../../../apps/frontend/app/public/", import.meta.url));
    // Publications carry both sections: a harvest's photographs live on its
    // publication, because `produce_listings.images` is left at its empty default
    // and the public catalogue reads the published snapshot.
    const fixtureImages = new Set([
      ...publications.flatMap((publication) => publication.images),
      ...DemoProducts.flatMap((product) => product.images),
    ]);
    assert.ok(fixtureImages.size > 0, "the fixture names no photographs at all");
    for (const image of fixtureImages) {
      assert.match(image, /^\/media\/marketplace\/[a-z0-9-]+\.webp$/u, `${image} is not a checked-in library path`);
      assert.ok(existsSync(join(publicRoot, image.slice(1))), `${image} has no file under apps/frontend/app/public`);
    }
  });

  /**
   * The other half of the same promise. A listing may carry photographs that live
   * in object storage rather than in git, and those cannot travel in a clone — so
   * every listing that names one also names a checked-in fallback, and the seed
   * uses the fallback whenever the bucket did not take the bytes. Without this
   * assertion a listing could be uploaded-only and would render as an empty card
   * on any deployment without S3, which is the normal state of a fresh clone.
   */
  it("gives every listing whose photographs are uploaded objects a checked-in fallback", () => {
    const uploading = [...publications, ...demoMarketplaceSellerCreatedProducts].filter(
      (row) => (row.uploadedImageKeys ?? []).length > 0,
    );
    assert.ok(uploading.length > 0, "no listing demonstrates an uploaded photograph at all");
    for (const row of uploading) {
      assert.ok(row.images.length > 0, `a listing carries uploaded photographs and no fallback`);
    }
  });

  it("mints the reference shapes the upload endpoint mints, owned by the account that publishes", () => {
    const declared = new Set(demoMarketplaceMediaAssets.map((asset) => asset.key));
    for (const publication of publications) {
      for (const key of publication.uploadedImageKeys) {
        assert.ok(declared.has(key), `${publication.title} names the photograph ${key}, which no media seed declares`);
        const asset = demoMarketplaceMediaAsset(key);
        assert.equal(
          asset.ownerEmail,
          publication.ownerEmail,
          `${publication.title} shows a photograph ${publication.ownerEmail} did not upload`,
        );
        assert.equal(asset.path, marketplaceMediaPathFor(asset.publicId));
        assert.equal(asset.reference, marketplaceMediaReferenceFor(asset.publicId));
        assert.match(asset.path, marketplaceMediaPathPattern);
        assert.equal(
          asset.storageKey,
          marketplaceMediaStorageKey({ tenantId: DefaultTenantId, userId: asset.ownerUserId }, asset.publicId),
        );
      }
    }
    // Opaque ids and storage keys are one to one, because a collision would make
    // one photograph overwrite another in the bucket and in the index.
    const publicIds = demoMarketplaceMediaAssets.map((asset) => asset.publicId);
    assert.equal(new Set(publicIds).size, publicIds.length);
    const storageKeys = demoMarketplaceMediaAssets.map((asset) => asset.storageKey);
    assert.equal(new Set(storageKeys).size, storageKeys.length);
    for (const publicId of publicIds) {
      assert.match(publicId, marketplaceMediaPublicIdPattern);
    }
  });

  it("reads every uploaded photograph out of the checked-in library and through the upload route's own inspection", () => {
    const publicRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
    for (const asset of demoMarketplaceMediaAssets) {
      assert.match(
        asset.sourceFile,
        /^apps\/frontend\/app\/public\/media\/marketplace\/[a-z0-9-]+\.webp$/u,
        `${asset.key} reads bytes from outside the checked-in library`,
      );
      const path = join(publicRoot, asset.sourceFile);
      assert.ok(existsSync(path), `${asset.key} reads ${asset.sourceFile}, which is not in the repository`);
      const inspection = inspectMarketplaceMedia(new Uint8Array(readFileSync(path)));
      assert.equal(inspection.status, "ok", `${asset.key} would be refused by the upload route`);
    }
  });

  it("stores nothing and resolves nothing on a deployment with no bucket", async () => {
    const plan = await prepareDemoMarketplaceMedia(undefined, {});
    assert.equal(plan.stored, false);
    assert.deepEqual(plan.objects, []);
    assert.match(plan.reason ?? "", /S3_BUCKET/u);
    const resolver = demoMediaResolver(plan);
    for (const asset of demoMarketplaceMediaAssets) {
      assert.equal(resolver.pathFor(asset.key), undefined);
      assert.equal(resolver.referenceFor(asset.key), undefined);
    }
  });

  it("publishes a request into the feed only when a moderator approved it", () => {
    const states = new Set(demoMarketplaceRequests.map((request) => request.publication));
    assert.deepEqual([...states].sort(), ["approved", "none", "pending", "rejected"]);
    const stages = new Set(demoMarketplaceRequests.map((request) => request.status));
    assert.deepEqual([...stages].sort(), ["offering", "open", "selected"]);
    // An offer can only exist against an approved snapshot, which is what
    // `assert_marketplace_offer_public_request` enforces.
    const answerable = new Set(
      demoMarketplaceRequests.filter((request) => request.publication === "approved").map((request) => request.id),
    );
    for (const offer of demoMarketplaceOffers) {
      assert.ok(answerable.has(offer.requestId), `an offer answers a request no seller can see`);
    }
    // Every awarded request rests at `selected`, and no request rests there
    // without an award.
    const awarded = new Set(
      demoMarketplaceOffers.filter((offer) => offer.status === "accepted").map((offer) => offer.requestId),
    );
    for (const request of demoMarketplaceRequests) {
      assert.equal(
        request.status === "selected",
        awarded.has(request.id),
        `${request.title} disagrees with its own award`,
      );
    }
  });

  it("leaves one assetless listing in every section, so the category illustration stays exercised", () => {
    for (const section of ["seeds", "equipment", "produce"] as const) {
      const assetless = publications.filter(
        (publication) => publication.section === section && isVisible(publication) && publication.images.length === 0,
      );
      assert.ok(assetless.length >= 1, `the ${section} section has no assetless listing`);
    }
  });

  it("keeps a few rows out of stock, so the out-of-stock badge and stock filter have subjects", () => {
    const empty = DemoProducts.filter((product) => product.stockQuantity === 0);
    assert.ok(empty.length >= 3, `only ${empty.length} catalog rows are out of stock`);
    for (const product of empty) {
      assert.ok(
        !publications.some((publication) => publication.productId === product.id && isVisible(publication)),
        `${product.name} is out of stock yet counted as visible`,
      );
    }
  });

  it("offers samples on some listings and not others", () => {
    const offered = DemoProducts.filter((product) => product.sampleAvailable);
    assert.ok(offered.length > 0 && offered.length < DemoProducts.length, "sample availability is uniform");
    const produceOffered = demoMarketplaceProduceListings.filter((listing) => listing.sampleAvailable);
    assert.ok(
      produceOffered.length > 0 && produceOffered.length < demoMarketplaceProduceListings.length,
      "every harvest answers the same way on samples",
    );
  });

  it("prices every row as a positive whole number of som", () => {
    for (const product of DemoProducts) {
      assert.ok(Number.isInteger(product.priceUzs) && product.priceUzs > 0, `${product.name} is priced ${product.priceUzs}`);
    }
    for (const listing of demoMarketplaceProduceListings) {
      assert.ok(
        Number.isInteger(listing.pricePerKgUzs) && listing.pricePerKgUzs > 0,
        `${listing.crop} is priced ${listing.pricePerKgUzs} per kg`,
      );
    }
  });

  it("trades only in regions the seed recognises", () => {
    for (const region of [
      ...DemoProducts.map((product) => product.region),
      ...publications.map((publication) => publication.region),
      ...catalogSuppliers.map((supplier) => supplier.region),
    ]) {
      assert.ok(regions.has(region), `unknown region ${region}`);
    }
  });

  it("keeps every fixture key unique, because the seed upserts on them", () => {
    for (const [label, values] of [
      ["id", publications.map((publication) => publication.id)],
      ["idempotency key", publications.map((publication) => publication.idempotencyKey)],
      ["content fingerprint", publications.map((publication) => publication.contentFingerprint)],
      ["product id", DemoProducts.map((product) => product.id)],
      ["produce listing id", demoMarketplaceProduceListings.map((listing) => listing.id)],
      ["seller profile id", demoMarketplacePublicSellers.map((seller) => seller.id)],
    ] as const) {
      assert.equal(new Set(values).size, values.length, `two rows share a ${label}`);
    }
  });

  it("keeps the original nineteen catalog ids where they were", () => {
    const idFor = (name: string): string | undefined => DemoProducts.find((product) => product.name === name)?.id;
    assert.equal(idFor("Cotton seed “Omad” F1"), "dec0de00-0000-4000-8000-000000000001");
    assert.equal(idFor("Drip irrigation kit, 1 ha"), "dec0de00-0000-4000-8000-000000000011");
    assert.equal(idFor("Cottonseed cake, 38% protein"), "dec0de00-0000-4000-8000-000000000019");
  });

  it("publishes only rows the seed also writes", () => {
    const productIds = new Set([
      ...DemoProducts.map((product) => product.id),
      ...demoMarketplaceSellerCreatedProducts.map((product) => product.id),
    ]);
    const produceIds = new Set(demoMarketplaceProduceListings.map((listing) => listing.id));
    const sellerIds = new Set(demoMarketplacePublicSellers.map((seller) => seller.id));
    for (const publication of publications) {
      assert.ok(sellerIds.has(publication.sellerPublicId), `${publication.title} names an unseeded seller`);
      if (publication.sourceKind === "product") {
        assert.ok(publication.productId && productIds.has(publication.productId), `${publication.title} has no product`);
        assert.equal(publication.produceListingId, null);
        assert.ok(publication.category, `${publication.title} publishes without a category`);
      } else {
        assert.ok(
          publication.produceListingId && produceIds.has(publication.produceListingId),
          `${publication.title} has no harvest`,
        );
        assert.equal(publication.productId, null);
        assert.ok(publication.crop && publication.grade, `${publication.title} publishes without crop or grade`);
      }
      assert.notEqual(publication.title.trim(), "");
      assert.notEqual(publication.unit.trim(), "");
      assert.notEqual(publication.region.trim(), "");
    }
  });

  it("lists every harvest through a co-operative whose own owner holds the farm", () => {
    // The public catalog joins a produce publication to `farmers` on
    // `farmer.user_id = seller.owner_user_id`, so a harvest whose farm belongs to
    // anyone but the co-operative's owner is invisible however well-formed the
    // rest of the chain is — and only a `farmer` verification may sell it at all.
    const sellerById = new Map(demoMarketplacePublicSellers.map((seller) => [seller.id, seller] as const));
    const farmById = new Map(demoMarketplaceFarmers.map((farmer) => [farmer.id, farmer] as const));
    const partnerIds = new Set(demoMarketplacePublicSellers.map((seller) => seller.partnerId));
    for (const listing of demoMarketplaceProduceListings) {
      const farm = farmById.get(listing.farmerId);
      assert.ok(farm, `${listing.crop} names a farm the seed never writes`);
      assert.equal(farm.ownerEmail, listing.ownerEmail, `${listing.crop} is listed by someone else's farm`);
      assert.equal(marketplaceIdentity(listing.ownerEmail).role, "farmer");
      assert.ok(partnerIds.has(listing.supplierPartnerId), `${listing.crop} binds an unseeded organization`);
      assert.ok(listing.availableQuantityKg > 0, `${listing.crop} has nothing available`);
      assert.ok(
        listing.availableFrom.valueOf() < listing.availableUntil.valueOf(),
        `${listing.crop} closes before it opens`,
      );
    }
    for (const publication of demoMarketplaceProducePublications) {
      const seller = sellerById.get(publication.sellerPublicId);
      assert.ok(seller, `${publication.title} publishes through an unseeded seller`);
      assert.equal(publication.ownerEmail, seller.ownerEmail);
      assert.equal(
        marketplaceIdentity(seller.ownerEmail).role,
        "farmer",
        `${publication.title} publishes through a non-farmer seller`,
      );
    }
    // The original farm keeps its own fixture key, because every produce row and
    // organization binding written before the roster existed points at that id.
    assert.equal(demoMarketplaceFarmer.ownerEmail, farmerEmail);
    assert.ok(farmById.has(demoMarketplaceFarmer.id));
  });

  it("attributes a real share of the catalogue to sellers other than the first three logins", () => {
    const originals = new Set(["dehqon@demo.dehqonhub.uz", "sotuvchi@demo.dehqonhub.uz", "xaridor@demo.dehqonhub.uz"]);
    const visible = publications.filter(isVisible);
    const rostered = visible.filter((publication) => !originals.has(publication.ownerEmail));
    assert.ok(
      rostered.length >= visible.length / 5,
      `only ${rostered.length} of ${visible.length} visible listings belong to a login beyond the original three`,
    );
    const sellers = new Set(rostered.map((publication) => publication.ownerEmail));
    assert.ok(sellers.size >= 8, `only ${sellers.size} further logins sell anything`);
  });
});

describe("demo marketplace promotion fixture", () => {
  it("promotes some listings and leaves most alone", () => {
    const promoted = new Set(demoMarketplaceListingPromotions.map((promotion) => promotion.publicationId));
    assert.ok(promoted.size > 0, "no listing is promoted, so the catalog cannot sort by it");
    assert.ok(promoted.size < publications.length / 2, "almost everything is promoted, which makes the marker useless");
  });

  it("spreads the paid slots across all three sections", () => {
    const sections = new Set(
      demoMarketplaceListingPromotions.map(
        (promotion) => publications.find((publication) => publication.id === promotion.publicationId)?.section,
      ),
    );
    assert.deepEqual([...sections].sort(), ["equipment", "produce", "seeds"]);
  });

  it("matches the plan, price and span ck__listing_promotions__plan allows", () => {
    for (const promotion of demoMarketplaceListingPromotions) {
      const plan = promotionPlans[promotion.planCode];
      assert.ok(plan, `unknown plan ${promotion.planCode}`);
      assert.equal(promotion.priceUzs, plan.priceUzs, `${promotion.planCode} is priced ${promotion.priceUzs}`);
      assert.equal(promotion.durationDays, plan.durationDays);
    }
  });

  it("satisfies the promotion row's own shape checks", () => {
    for (const promotion of demoMarketplaceListingPromotions) {
      assert.equal(promotion.activationReference, `promotion:${promotion.id}`);
      assert.match(
        promotion.activationReference,
        /^promotion:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
      );
      assert.match(promotion.requestFingerprint, /^[a-f0-9]{64}$/u);
    }
    const keys = demoMarketplaceListingPromotions.map((promotion) => promotion.idempotencyKey);
    assert.equal(new Set(keys).size, keys.length, "two promotions share an idempotency key");
    const publicationIds = demoMarketplaceListingPromotions.map((promotion) => promotion.publicationId);
    assert.equal(new Set(publicationIds).size, publicationIds.length, "one listing holds two live promotions");
  });

  it("buys a slot only on a listing the catalog will serve", () => {
    const sellerById = new Map(demoMarketplacePublicSellers.map((seller) => [seller.id, seller] as const));
    for (const promotion of demoMarketplaceListingPromotions) {
      const publication = publications.find((candidate) => candidate.id === promotion.publicationId);
      assert.ok(publication, `promotion ${promotion.idempotencyKey} points at no publication`);
      assert.ok(isVisible(publication), `${publication.title} is promoted but never reaches the catalog`);
      const seller = sellerById.get(publication.sellerPublicId);
      assert.equal(promotion.sellerPublicId, publication.sellerPublicId);
      assert.equal(promotion.sellerPartnerId, seller?.partnerId);
      assert.equal(
        promotion.actorEmail,
        publication.ownerEmail,
        `${publication.title} is promoted by an actor that does not own it`,
      );
    }
  });
});
