import { createHash } from "node:crypto";

import {
  marketplaceMediaPathFor,
  marketplaceMediaPublicIdPattern,
  marketplaceMediaReferenceFor,
  marketplaceMediaStorageKey,
} from "../../../../../libs/backend/feature/agritech/shared/lib/src/marketplace-media.ts";
import { marketplaceIdentity } from "./marketplace-seed-roster.ts";
import { DefaultTenantId } from "./seed-data.ts";

/**
 * The demo photographs that travel as uploaded objects rather than as checked-in
 * paths.
 *
 * Every seeded listing used to point at a file in
 * `apps/frontend/app/public/media/marketplace/`, which the browser fetches from
 * the SPA's own `public/` tree. That renders, but it demonstrates nothing about
 * the upload capability: no `marketplace_media_assets` row exists, no object is
 * in the bucket, `/marketplace/media/<id>` resolves nothing, and no review can
 * carry a photograph at all — `asset_references` only accepts the
 * `public-asset:<id>` handle that an upload mints.
 *
 * This module declares the photographs that should exist as stored objects. The
 * bytes come from the same checked-in library, because a fixture must not carry
 * megabytes of its own binaries and because those files are already the demo's
 * photographs; what changes is how they reach the screen. The seed writes each
 * one into object storage under the key
 * `marketplace/media/<tenant>/<user>/<publicId>` — exactly the key
 * `marketplaceMediaStorageKey` builds for a real upload — records the index row,
 * and hands the listing or review the reference shape the upload endpoint would
 * have handed it.
 *
 * Nothing here reads a file or opens a socket. Resolving the bytes and reaching
 * the bucket is `marketplace-seed-media.storage.ts`, so this module stays a
 * declaration a test can read.
 */

const fixtureNamespace = "dehqonhub-demo-marketplace";

/**
 * The opaque public name of a seeded photograph.
 *
 * A real upload calls `createMarketplaceMediaPublicId()`, which is 128 random
 * bits. A fixture cannot: a random id on every seed would orphan the object the
 * previous run wrote and hand the listing a reference that resolves to nothing
 * after a re-seed. Hashing the fixture key into the same 16-byte base64url shape
 * keeps the id stable, keeps the storage key stable, and keeps it inside
 * `marketplaceMediaPublicIdPattern` — which is what the read path validates
 * before it touches the database.
 *
 * The id is therefore predictable from the fixture key, which a real upload's is
 * not. That is acceptable exactly here and nowhere else: these are public demo
 * photographs on public demo listings, and the id is a capability only over
 * bytes the repository already ships in the open.
 */
export function marketplaceFixtureMediaPublicId(key: string): string {
  const digest = createHash("sha256").update(`${fixtureNamespace}:media:${key}`).digest();
  const publicId = digest.subarray(0, 16).toString("base64url");
  if (!marketplaceMediaPublicIdPattern.test(publicId)) {
    throw new Error(`Derived media public id for ${key} is not a valid opaque id: ${publicId}.`);
  }
  return publicId;
}

export interface DemoMediaAssetFixture {
  /** Stable fixture key; a listing or review names a photograph by this. */
  key: string;
  /** The login that uploaded it, which owns the object and its storage prefix. */
  ownerEmail: string;
  /** The account id behind `ownerEmail`, which is a segment of the storage key. */
  ownerUserId: string;
  /** The opaque id the API exposes and the read path resolves. */
  publicId: string;
  /** Where the object lives in the bucket. Never leaves the server. */
  storageKey: string;
  /** Root-relative same-origin path a listing image column may hold. */
  path: string;
  /** The `public-asset:` handle a review's `assetReferences` accepts. */
  reference: string;
  /**
   * The checked-in file the bytes come from, relative to the repository root.
   * The seed reads it, runs it through the same `inspectMarketplaceMedia` the
   * upload route runs, and stores the sanitized result.
   */
  sourceFile: string;
}

interface MediaSeed {
  key: string;
  ownerEmail: string;
  /** File name inside `apps/frontend/app/public/media/marketplace/`. */
  file: string;
}

const libraryDirectory = "apps/frontend/app/public/media/marketplace";

/**
 * Which photographs are stored objects, and who uploaded each.
 *
 * Ownership is not decoration. `requireOwnedReferences` refuses a reference the
 * acting account did not upload, so a seller's listing photograph has to belong
 * to that seller's login and a buyer's review photograph to that buyer's — a
 * fixture that got this wrong would seed rows the API itself would have refused
 * to create.
 */
const mediaSeeds: readonly MediaSeed[] = [
  // The trailed sprayer listing, photographed by the seller from five angles.
  // Five is the ceiling `ck__marketplace_listing_publications__content` allows,
  // which makes this listing the one that proves the cap is reachable rather
  // than theoretical.
  { key: "listing:trailed-sprayer:1", ownerEmail: "sotuvchi@demo.dehqonhub.uz", file: "pesticide-spraying" },
  { key: "listing:trailed-sprayer:2", ownerEmail: "sotuvchi@demo.dehqonhub.uz", file: "knapsack-sprayer" },
  { key: "listing:trailed-sprayer:3", ownerEmail: "sotuvchi@demo.dehqonhub.uz", file: "tractor-field" },
  { key: "listing:trailed-sprayer:4", ownerEmail: "sotuvchi@demo.dehqonhub.uz", file: "fertilizer-spreading" },
  { key: "listing:trailed-sprayer:5", ownerEmail: "sotuvchi@demo.dehqonhub.uz", file: "cotton-field" },
  // A harvest photographed by the farmer who grew it. `produce_listings` has no
  // image column, so this reference lives on the public snapshot only.
  { key: "listing:field-tomato:1", ownerEmail: "nodira@demo.dehqonhub.uz", file: "tomato-fruit" },
  // What the buyers photographed after delivery. A review asset must belong to
  // the buyer who wrote the review, so each of these names that buyer's login.
  { key: "review:trailed-sprayer:1", ownerEmail: "xaridor@demo.dehqonhub.uz", file: "pesticide-spraying" },
  { key: "review:knapsack-sprayer:1", ownerEmail: "xaridor@demo.dehqonhub.uz", file: "knapsack-sprayer" },
  { key: "review:drip-kit:1", ownerEmail: "dehqon@demo.dehqonhub.uz", file: "drip-irrigation" },
  { key: "review:raisins:1", ownerEmail: "xaridor@demo.dehqonhub.uz", file: "raisins" },
  { key: "review:raisins:2", ownerEmail: "xaridor@demo.dehqonhub.uz", file: "uzbek-bazaar" },
];

export const demoMarketplaceMediaAssets: readonly DemoMediaAssetFixture[] = mediaSeeds.map((seed) => {
  const ownerUserId = marketplaceIdentity(seed.ownerEmail).userId;
  const publicId = marketplaceFixtureMediaPublicId(seed.key);
  return {
    key: seed.key,
    ownerEmail: seed.ownerEmail,
    ownerUserId,
    publicId,
    storageKey: marketplaceMediaStorageKey({ tenantId: DefaultTenantId, userId: ownerUserId }, publicId),
    path: marketplaceMediaPathFor(publicId),
    reference: marketplaceMediaReferenceFor(publicId),
    sourceFile: `${libraryDirectory}/${seed.file}.webp`,
  };
});

const mediaByKey = new Map(demoMarketplaceMediaAssets.map((asset) => [asset.key, asset] as const));

/**
 * The stored photograph behind a fixture key.
 *
 * A listing or a review names a photograph by key rather than by id, so a typo
 * fails here — where the message can say which key is unknown — instead of
 * seeding a reference that resolves to nothing and renders as a broken frame.
 */
export function demoMarketplaceMediaAsset(key: string): DemoMediaAssetFixture {
  const asset = mediaByKey.get(key);
  if (!asset) {
    throw new Error(`Demo marketplace fixture names the photograph ${key}, which no media seed declares.`);
  }
  return asset;
}
