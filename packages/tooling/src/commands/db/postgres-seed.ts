import { pbkdf2Sync, randomBytes } from 'node:crypto';
import pg from 'pg';

import {
  demoMarketplacePartners,
  demoMarketplaceProducts,
  demoMarketplaceVerifications,
} from './marketplace-seed-data.ts';
import {
  demoContractPartySnapshot,
  demoMarketplaceCarts,
  demoMarketplaceContracts,
} from './marketplace-seed-contracts.ts';
import {
  demoMarketplaceOrders,
  demoMarketplaceReviewReports,
  demoMarketplaceSampleRequests,
  demoSamplePolicy,
} from './marketplace-seed-engagement.ts';
import { demoMarketplaceContractLifecycle } from './marketplace-seed-lifecycle.ts';
import { demoMarketplaceReviewEligibilities, demoMarketplaceReviews } from './marketplace-seed-reviews.ts';
import {
  demoMediaResolver,
  prepareDemoMarketplaceMedia,
  type DemoMediaPlan,
  type DemoMediaResolver,
} from './marketplace-seed-media.storage.ts';
import { marketplaceFixtureUuid } from './marketplace-seed-roster.ts';
import {
  demoMarketplaceFarmers,
  demoMarketplaceListingPublications,
  demoMarketplaceOffers,
  demoMarketplaceProduceListings,
  demoMarketplaceProducePublications,
  demoMarketplaceListingPromotions,
  demoMarketplacePublicSellers,
  demoMarketplaceRequests,
  demoMarketplaceSellerCreatedPublications,
  supplierPartnerIdForSlug,
} from './marketplace-seed-publications.ts';
import {
  DefaultTenantId,
  permissionUuids,
  permissions,
  rolePermissions,
  roleUuids,
  roles,
  type SeedUser,
} from './seed-data.ts';

export * from './postgres-environment.ts';

const authTables = ['auth_users', 'auth_roles', 'auth_permissions', 'auth_role_permissions', 'auth_user_roles'];

/**
 * The marketplace fixture is optional on purpose. Its tables arrive with the
 * agritech migrations, and one missing table inside the seed's single
 * transaction would roll back the accounts too — so a database migrated only as
 * far as auth still gets its users, and the fixture waits for `pnpm db:migrate`.
 */
const marketplaceTables = [
  'products',
  'agritech_partners',
  'marketplace_verifications',
  'marketplace_public_sellers',
  'marketplace_public_seller_revisions',
  'marketplace_listing_publications',
  'marketplace_listing_promotions',
  'farmers',
  'produce_listings',
  'marketplace_produce_organization_bindings',
  'marketplace_requests',
  'marketplace_request_publications',
  'marketplace_request_offers',
  'marketplace_contracts',
  // The review tables gate the ratings fixture. A database migrated before
  // reviews existed still seeds its catalog; it simply seeds no ratings, rather
  // than failing on a table it has never heard of.
  'marketplace_contract_review_eligibilities',
  'marketplace_listing_reviews',
  'marketplace_review_replies',
  // Carts, the settled half of a deal and the photograph index arrive with later
  // agritech migrations. Listing them here keeps a database migrated only as far
  // as the catalog seeding its catalog instead of aborting the whole transaction
  // on a table it has never heard of.
  'marketplace_carts',
  'marketplace_contract_settlements',
  'marketplace_contract_fulfillments',
  'marketplace_contract_lifecycle_events',
  'marketplace_contract_notification_intents',
  'marketplace_contract_disputes',
  'marketplace_contract_commissions',
  'marketplace_media_assets',
  'marketplace_sample_policies',
  'marketplace_listing_samples',
  'marketplace_review_reports',
  'orders',
];

export async function seedPostgresDatabase(
  connectionString: string,
  seedUsers: SeedUser[],
): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)
       ORDER BY table_name`,
      [[...authTables, ...marketplaceTables]],
    );
    const found = new Set(tableCheck.rows.map((row) => row.table_name as string));
    const missing = authTables.filter((table) => !found.has(table));
    if (missing.length > 0) throw new Error(`Missing tables: ${missing.join(', ')}. Run migrations first (pnpm db:migrate).`);
    // Object storage is written to before the transaction opens, never inside it.
    // A bucket is not transactional, so an upload cannot be rolled back, and
    // holding a database transaction open across eleven network round trips would
    // make a slow bucket look like a stuck seed. The order also matches the upload
    // route's own: the object first, the row that points at it second, so a
    // failure leaves an unreferenced object rather than a reference to nothing.
    const media = await prepareDemoMarketplaceMedia();
    // Said out loud, because "the listings have no photographs" and "this
    // deployment has no bucket" look identical on screen otherwise.
    console.log(
      media.stored
        ? `[seed] Stored ${media.objects.length} demo photographs in object storage.`
        : `[seed] ${media.reason ?? 'Object storage was not used.'} Listings fall back to checked-in photographs and reviews carry none.`,
    );
    return await seed(client, seedUsers, marketplaceTables.every((table) => found.has(table)), media);
  } finally {
    await client.end();
  }
}

/**
 * Role and permission ids as the database actually holds them.
 *
 * The RBAC migrations create both sets with `gen_random_uuid()`, so a migrated
 * database already holds every system role and permission under an id the
 * migration invented rather than the fixed ids in `seed-data`. The inserts below
 * therefore no-op on their unique keys, and pointing the grants at the seed's own
 * ids raised a foreign-key violation that rolled the whole seed back — users,
 * demo review logins and all. Reading the ids back keys the joins to the rows
 * that exist, whichever of the two created them.
 */
async function readIdsByKey(client: pg.Client, query: string, values: unknown[] = []): Promise<Map<string, string>> {
  const { rows } = await client.query<{ id: string; key: string }>(query, values);
  return new Map(rows.map((row) => [row.key, row.id]));
}

/**
 * Whether the upsert wrote a new row rather than refreshing one.
 *
 * The fixture rows below are upserted so a re-seed restores stock a demo
 * checkout consumed and an organization an admin rejected, and that makes
 * `rowCount` count refreshes too. `xmax` is zero only on a row this transaction
 * inserted, which keeps the command's `inserted` summary honest on a re-run.
 */
async function insertedCount(client: pg.Client, sql: string, values: unknown[]): Promise<number> {
  const { rows } = await client.query<{ inserted: boolean }>(sql, values);
  return rows[0]?.inserted ? 1 : 0;
}

async function seed(
  client: pg.Client,
  seedUsers: SeedUser[],
  withMarketplace: boolean,
  mediaPlan: DemoMediaPlan,
): Promise<Record<string, number>> {
  const media = demoMediaResolver(mediaPlan);
  await client.query('BEGIN');
  const counts = {
    permissions: 0,
    roles: 0,
    rolePermissions: 0,
    users: 0,
    userRoles: 0,
    demoPartners: 0,
    demoVerifications: 0,
    demoProducts: 0,
    demoMediaAssets: 0,
    demoPublicSellers: 0,
    demoListingPublications: 0,
    demoListingPromotions: 0,
    demoProduceListings: 0,
    demoRequests: 0,
    demoOffers: 0,
    demoCarts: 0,
    demoContracts: 0,
    demoSettlements: 0,
    demoFulfillments: 0,
    demoLifecycleEvents: 0,
    demoNotificationIntents: 0,
    demoDisputes: 0,
    demoCommissions: 0,
    demoReviewEligibilities: 0,
    demoReviews: 0,
    demoReviewReplies: 0,
    demoSampleRequests: 0,
    demoReviewReports: 0,
    demoOrders: 0,
  };
  try {
    for (const permission of permissions) {
      const uuid = permissionUuids[permission.key];
      if (!uuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_permissions" ("id", "key", "resource", "action", "description", "created_at")
         VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT ("key") DO NOTHING`,
        [uuid, permission.key, permission.resource, permission.action, permission.description],
      );
      if (rowCount) counts.permissions += rowCount;
    }
    for (const role of roles) {
      const uuid = roleUuids[role.key];
      if (!uuid) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_roles" ("id", "tenant_id", "key", "label", "description", "is_system", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, true, now(), now()) ON CONFLICT ("tenant_id", "key") DO NOTHING`,
        [uuid, DefaultTenantId, role.key, role.label, role.description],
      );
      if (rowCount) counts.roles += rowCount;
    }
    const roleIds = await readIdsByKey(client, 'SELECT "id", "key" FROM "auth_roles" WHERE "tenant_id" = $1', [
      DefaultTenantId,
    ]);
    const permissionIds = await readIdsByKey(client, 'SELECT "id", "key" FROM "auth_permissions"');
    for (const role of roles) {
      const roleId = roleIds.get(role.key);
      if (!roleId) continue;
      for (const permissionKey of rolePermissions[role.key] ?? []) {
        const permissionId = permissionIds.get(permissionKey);
        if (!permissionId) continue;
        const { rowCount } = await client.query(
          `INSERT INTO "auth_role_permissions" ("role_id", "permission_id", "created_at")
           VALUES ($1, $2, now()) ON CONFLICT DO NOTHING`,
          [roleId, permissionId],
        );
        if (rowCount) counts.rolePermissions += rowCount;
      }
    }
    for (const user of seedUsers) {
      // Roles and permissions are not columns on the user: the RBAC migrations
      // moved them into "auth_user_roles" and "auth_role_permissions", which the
      // grants above and the assignment below fill. Writing them here failed the
      // whole seed on a migrated database.
      const { rowCount } = await client.query(
        `INSERT INTO "auth_users" (
           "id", "tenant_id", "email", "display_name", "password_hash", "status",
           "locale", "theme", "last_login_at", "avatar_url", "avatar_hash", "avatar_status", "created_at", "updated_at"
         ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7,
           'epoch'::timestamptz, '', '', 'none', now(), now()) ON CONFLICT DO NOTHING`,
        [user.id, DefaultTenantId, user.email, user.displayName, hashPassword(user.password), user.locale, user.theme],
      );
      if (rowCount) counts.users += rowCount;
    }
    for (const user of seedUsers) {
      const roleId = roleIds.get(user.role);
      if (!roleId) continue;
      const { rowCount } = await client.query(
        `INSERT INTO "auth_user_roles" ("auth_user_id", "role_id", "tenant_id", "created_at")
         VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING`,
        [user.id, roleId, DefaultTenantId],
      );
      if (rowCount) counts.userRoles += rowCount;
    }
    if (withMarketplace) {
      const userIdsByEmail = new Map(seedUsers.map((user) => [user.email, user.id]));
      // Approvals and verifications carry a reviewer, and the local administrator
      // is the only account that could have granted them.
      const reviewedBy = seedUsers.find((user) => user.role === 'admin')?.id ?? null;
      for (const partner of demoMarketplacePartners) {
        const ownerUserId = userIdsByEmail.get(partner.ownerEmail);
        if (!ownerUserId) continue;
        counts.demoPartners += await insertedCount(
          client,
          `INSERT INTO "agritech_partners" (
             "id", "tenant_id", "owner_user_id", "kind", "legal_name", "tax_id", "phone", "region",
             "status", "reviewed_by", "reviewed_at", "created_at", "updated_at"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9, now(), now(), now())
           ON CONFLICT ("id") DO UPDATE SET
             "owner_user_id" = excluded."owner_user_id", "kind" = excluded."kind",
             "legal_name" = excluded."legal_name", "tax_id" = excluded."tax_id",
             "phone" = excluded."phone", "region" = excluded."region",
             "status" = 'approved', "reviewed_by" = excluded."reviewed_by",
             "reviewed_at" = now(), "updated_at" = now()
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            partner.id,
            DefaultTenantId,
            ownerUserId,
            partner.kind,
            partner.legalName,
            partner.taxId,
            partner.phone,
            partner.region,
            reviewedBy,
          ],
        );
      }
      for (const verification of demoMarketplaceVerifications) {
        const userId = userIdsByEmail.get(verification.ownerEmail);
        if (!userId) continue;
        counts.demoVerifications += await insertedCount(
          client,
          `INSERT INTO "marketplace_verifications" (
             "id", "tenant_id", "user_id", "role", "level", "status", "one_id_linked",
             "provider_mode", "identity_assurance", "documents", "reviewed_by", "reviewed_at",
             "created_at", "updated_at"
           ) VALUES (
             $1, $2, $3, $4, $5, 'verified', $6,
             CASE WHEN $6 THEN 'legacy' ELSE 'none' END,
             CASE WHEN $6 THEN 'legacy_unknown' ELSE 'none' END,
             '[]'::jsonb, $7, now(), now(), now()
           )
           ON CONFLICT ("tenant_id", "user_id") DO UPDATE SET
             "role" = excluded."role", "level" = excluded."level", "status" = 'verified',
             "one_id_linked" = excluded."one_id_linked", "provider_mode" = excluded."provider_mode",
             "identity_assurance" = excluded."identity_assurance", "provider_name" = null,
             "provider_subject_key" = null, "provider_receipt_id" = null, "one_id_linked_at" = null,
             "reviewed_by" = excluded."reviewed_by",
             "reviewed_at" = now(), "rejection_reason" = null, "updated_at" = now()
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            verification.id,
            DefaultTenantId,
            userId,
            verification.role,
            verification.level,
            verification.oneIdLinked,
            reviewedBy,
          ],
        );
      }
      for (const product of demoMarketplaceProducts) {
        const productImages = resolvePublicationImages(product.uploadedImageKeys ?? [], product.images, media);
        counts.demoProducts += await insertedCount(
          client,
          `INSERT INTO "products" (
             "id", "tenant_id", "name", "name_ru", "name_uz", "name_uz_cyrl", "category", "description",
             "supplier_id", "supplier_name", "price_uzs", "unit", "stock_quantity", "sample_available",
             "region", "status", "images", "created_at", "updated_at"
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active', $16::jsonb, $17, $18
           )
           ON CONFLICT ("id") DO UPDATE SET
             "name" = excluded."name", "name_ru" = excluded."name_ru", "name_uz" = excluded."name_uz",
             "name_uz_cyrl" = excluded."name_uz_cyrl",
             "category" = excluded."category", "description" = excluded."description",
             "supplier_id" = excluded."supplier_id", "supplier_name" = excluded."supplier_name",
             "price_uzs" = excluded."price_uzs", "unit" = excluded."unit",
             "stock_quantity" = excluded."stock_quantity",
             "sample_available" = excluded."sample_available", "region" = excluded."region",
             "status" = 'active', "images" = excluded."images", "updated_at" = excluded."updated_at"
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            product.id,
            DefaultTenantId,
            product.name,
            product.nameRu,
            product.nameUz,
            product.nameUzCyrl,
            product.category,
            product.description,
            product.supplierId,
            product.supplierName,
            product.priceUzs,
            product.unit,
            product.stockQuantity,
            product.sampleAvailable,
            product.region,
            JSON.stringify(productImages),
            product.createdAt,
            product.updatedAt,
          ],
        );
      }
      // The index from an opaque public id to a stored object. Written only when
      // the objects are actually in the bucket: a row without its object makes
      // `/marketplace/media/<id>` answer 404 with a problem document, which is a
      // broken photograph on every listing that points at it.
      if (media.stored) {
        for (const object of media.objects) {
          counts.demoMediaAssets += await insertedCount(
            client,
            `INSERT INTO "marketplace_media_assets" (
               "id", "tenant_id", "owner_user_id", "public_id", "storage_key",
               "media_type", "byte_size", "checksum_sha256", "created_at"
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
             ON CONFLICT ("public_id") DO UPDATE SET
               "storage_key" = excluded."storage_key", "media_type" = excluded."media_type",
               "byte_size" = excluded."byte_size", "checksum_sha256" = excluded."checksum_sha256"
             RETURNING ("xmax" = 0) AS "inserted"`,
            [
              marketplaceFixtureUuid(`media-asset:${object.key}`),
              DefaultTenantId,
              object.ownerUserId,
              object.publicId,
              object.storageKey,
              object.mediaType,
              object.byteSize,
              object.checksumSha256,
            ],
          );
        }
      }
      // A catalog row is invisible until it is published: the public catalog reads
      // publications joined to a moderated seller profile, and carts, offers and
      // contracts all resolve a publication id. Seller profile first, because the
      // publication's coherence trigger checks the pair.
      for (const seller of demoMarketplacePublicSellers) {
        const ownerUserId = userIdsByEmail.get(seller.ownerEmail);
        if (!ownerUserId) continue;
        counts.demoPublicSellers += await insertedCount(
          client,
          `INSERT INTO "marketplace_public_sellers" (
             "id", "tenant_id", "partner_id", "partner_kind", "owner_user_id",
             "content_revision", "status", "created_at", "updated_at"
           ) VALUES ($1, $2, $3, 'supplier', $4, 1, 'published', now(), now())
           ON CONFLICT ("id") DO UPDATE SET
             "partner_id" = excluded."partner_id", "owner_user_id" = excluded."owner_user_id",
             "content_revision" = 1, "status" = 'published', "updated_at" = now()
           RETURNING ("xmax" = 0) AS "inserted"`,
          [seller.id, DefaultTenantId, seller.partnerId, ownerUserId],
        );
        await client.query(
          `INSERT INTO "marketplace_public_seller_revisions" (
             "id", "seller_public_id", "tenant_id", "content_revision", "content_fingerprint",
             "display_name", "description", "region", "moderation_status", "moderated_by",
             "moderated_at", "created_at", "updated_at"
           ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, 'approved', $8, now(), now(), now())
           ON CONFLICT ("id") DO UPDATE SET
             "content_fingerprint" = excluded."content_fingerprint",
             "display_name" = excluded."display_name", "description" = excluded."description",
             "region" = excluded."region", "moderation_status" = 'approved',
             "moderated_by" = excluded."moderated_by", "moderated_at" = now(), "updated_at" = now()`,
          [
            seller.revisionId,
            seller.id,
            DefaultTenantId,
            seller.contentFingerprint,
            seller.displayName,
            seller.description,
            seller.region,
            reviewedBy,
          ],
        );
      }
      // The farms and their harvests, which is the only way the produce section
      // gets rows: publishing produce is gated on the publisher being a farmer
      // whose own organization is the public seller, so every co-operative in the
      // fixture needs its owner's `farmers` row to exist first.
      for (const farmer of demoMarketplaceFarmers) {
        const farmerUserId = userIdsByEmail.get(farmer.ownerEmail);
        if (!farmerUserId) continue;
        await client.query(
          `INSERT INTO "farmers" (
             "id", "tenant_id", "user_id", "phone", "first_name", "last_name", "region",
             "district", "farm_size_hectares", "crops", "status", "created_at", "updated_at"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'active', now(), now())
           ON CONFLICT ("id") DO UPDATE SET
             "user_id" = excluded."user_id", "phone" = excluded."phone",
             "first_name" = excluded."first_name", "last_name" = excluded."last_name",
             "region" = excluded."region", "district" = excluded."district",
             "farm_size_hectares" = excluded."farm_size_hectares", "crops" = excluded."crops",
             "status" = 'active', "updated_at" = now()`,
          [
            farmer.id,
            DefaultTenantId,
            farmerUserId,
            farmer.phone,
            farmer.firstName,
            farmer.lastName,
            farmer.region,
            farmer.district,
            farmer.farmSizeHectares,
            JSON.stringify(farmer.crops),
          ],
        );
      }
      for (const listing of demoMarketplaceProduceListings) {
        const farmerUserId = userIdsByEmail.get(listing.ownerEmail);
        if (!farmerUserId) continue;
        counts.demoProduceListings += await insertedCount(
          client,
          `INSERT INTO "produce_listings" (
             "id", "tenant_id", "farmer_id", "crop", "grade", "quantity_kg",
             "available_quantity_kg", "price_per_kg_uzs", "region", "available_from",
             "available_until", "sample_available", "status", "created_at", "updated_at"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', now(), now())
           ON CONFLICT ("id") DO UPDATE SET
             "crop" = excluded."crop", "grade" = excluded."grade",
             "quantity_kg" = excluded."quantity_kg",
             "available_quantity_kg" = excluded."available_quantity_kg",
             "price_per_kg_uzs" = excluded."price_per_kg_uzs", "region" = excluded."region",
             "available_from" = excluded."available_from", "available_until" = excluded."available_until",
             "sample_available" = excluded."sample_available", "status" = 'active', "updated_at" = now()
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            listing.id,
            DefaultTenantId,
            listing.farmerId,
            listing.crop,
            listing.grade,
            listing.quantityKg,
            listing.availableQuantityKg,
            listing.pricePerKgUzs,
            listing.region,
            listing.availableFrom,
            listing.availableUntil,
            listing.sampleAvailable,
          ],
        );
        await client.query(
          `INSERT INTO "marketplace_produce_organization_bindings" (
             "produce_listing_id", "tenant_id", "farmer_id", "owner_user_id",
             "supplier_partner_id", "created_at"
           ) VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT ("produce_listing_id") DO UPDATE SET
             "farmer_id" = excluded."farmer_id", "owner_user_id" = excluded."owner_user_id",
             "supplier_partner_id" = excluded."supplier_partner_id"`,
          [listing.id, DefaultTenantId, listing.farmerId, farmerUserId, listing.supplierPartnerId],
        );
      }
      for (const publication of [
        ...demoMarketplaceListingPublications,
        ...demoMarketplaceSellerCreatedPublications,
        ...demoMarketplaceProducePublications,
      ]) {
        const ownerUserId = userIdsByEmail.get(publication.ownerEmail);
        if (!ownerUserId) continue;
        const publicationImages = resolvePublicationImages(publication.uploadedImageKeys, publication.images, media);
        counts.demoListingPublications += await insertedCount(
          client,
          `INSERT INTO "marketplace_listing_publications" (
             "id", "tenant_id", "owner_user_id", "seller_public_id", "seller_revision_id",
             "seller_content_revision", "product_id", "produce_listing_id", "source_kind",
             "section", "public_title", "public_title_ru", "public_title_uz", "public_title_uz_cyrl",
             "public_description",
             "public_category", "public_crop", "public_grade", "public_unit", "public_region",
             "public_images", "content_fingerprint", "content_revision", "status",
             "moderation_status", "moderated_by", "moderated_at", "idempotency_key",
             "request_fingerprint", "revision", "published_at", "created_at", "updated_at"
           ) VALUES (
             $1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
             $20::jsonb, $21, 1, 'published', 'approved', $22, now(), $23, $24, 0, $25, now(), now()
           )
           ON CONFLICT ("id") DO UPDATE SET
             "public_title" = excluded."public_title", "public_title_ru" = excluded."public_title_ru",
             "public_title_uz" = excluded."public_title_uz",
             "public_title_uz_cyrl" = excluded."public_title_uz_cyrl",
             "public_description" = excluded."public_description",
             "public_category" = excluded."public_category", "public_crop" = excluded."public_crop",
             "public_grade" = excluded."public_grade", "public_unit" = excluded."public_unit",
             "public_region" = excluded."public_region",
             "public_images" = excluded."public_images",
             "content_fingerprint" = excluded."content_fingerprint",
             "status" = 'published', "moderation_status" = 'approved',
             "moderated_by" = excluded."moderated_by", "moderated_at" = now(),
             "published_at" = excluded."published_at", "updated_at" = now()
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            publication.id,
            DefaultTenantId,
            ownerUserId,
            publication.sellerPublicId,
            publication.sellerRevisionId,
            publication.productId,
            publication.produceListingId,
            publication.sourceKind,
            publication.section,
            publication.title,
            publication.titleRu,
            publication.titleUz,
            publication.titleUzCyrl,
            publication.description,
            publication.category,
            publication.crop,
            publication.grade,
            publication.unit,
            publication.region,
            JSON.stringify(publicationImages),
            publication.contentFingerprint,
            reviewedBy,
            publication.idempotencyKey,
            publication.requestFingerprint,
            publication.publishedAt,
          ],
        );
      }
      // Paid catalog slots, which is the only source of the public catalog's
      // `promoted` flag. Written last of the listing chain because the database's
      // coherence trigger reads the publication, its seller profile and the
      // seller's approved organization on insert.
      //
      // The guard trigger accepts an update only as the one-way transition to
      // `expired`, so an `ON CONFLICT DO UPDATE` here would fail rather than
      // refresh. Instead a row whose window no longer covers now is dropped first
      // and reinserted, which leaves a same-day re-seed at zero inserts while
      // still healing a fixture that has run past its end date.
      //
      // `uq__marketplace_listing_promotions__listing_publication_id` also allows
      // one live slot per listing, and a seller who bought one through the API
      // already holds it. The fixture yields to that row rather than aborting the
      // whole seed on a slot somebody paid for.
      for (const promotion of demoMarketplaceListingPromotions) {
        const actorUserId = userIdsByEmail.get(promotion.actorEmail);
        if (!actorUserId) continue;
        await client.query(
          `DELETE FROM "marketplace_listing_promotions"
            WHERE "id" = $1 AND ("starts_at" > now() OR "ends_at" <= now())`,
          [promotion.id],
        );
        counts.demoListingPromotions += await insertedCount(
          client,
          `INSERT INTO "marketplace_listing_promotions" (
             "id", "tenant_id", "actor_user_id", "seller_partner_id", "seller_public_id",
             "listing_publication_id", "plan_code", "status", "starts_at", "ends_at", "price_uzs",
             "currency", "idempotency_key", "request_fingerprint", "activation_reference",
             "activated_at", "revision", "created_at", "updated_at"
           )
           SELECT $1::uuid, $2::varchar, $3::varchar, $4::uuid, $5::uuid, $6::uuid, $7::varchar, 'active',
                  now() - interval '1 day',
                  now() - interval '1 day' + make_interval(days => $8::int),
                  $9::numeric, 'UZS', $10::varchar, $11::varchar, $12::varchar,
                  now() - interval '1 day', 0, now(), now()
            WHERE NOT EXISTS (
              SELECT 1 FROM "marketplace_listing_promotions" "existing"
               WHERE "existing"."listing_publication_id" = $6 AND "existing"."id" <> $1
                 AND "existing"."starts_at" <= now() AND "existing"."ends_at" > now()
            )
           ON CONFLICT ("id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            promotion.id,
            DefaultTenantId,
            actorUserId,
            promotion.sellerPartnerId,
            promotion.sellerPublicId,
            promotion.publicationId,
            promotion.planCode,
            promotion.durationDays,
            promotion.priceUzs,
            promotion.idempotencyKey,
            promotion.requestFingerprint,
            promotion.activationReference,
          ],
        );
      }
      // Organization membership is not seeded: approving a partner row already
      // creates the owner's active membership through a database trigger, and
      // writing our own would collide with it on (partner, user, capability).
      //
      // A reverse auction a reviewer can read on arrival, instead of an empty feed
      // that only fills after they create something themselves.
      //
      // The fixture stage is an opening position, not an assertion about a
      // request that has since been used. Writing `excluded."status"`
      // unconditionally walked a `selected` request back to `offering` on every
      // re-seed, which re-armed a decided request for a second award and is how
      // one grapes request came to hold four accepted offers and four contracts.
      // Only a request still sitting at `open` is moved by the fixture now;
      // `tr__marketplace_requests__stage_authority` refuses the walk-back
      // outright, so attempting it here would also fail the whole seed.
      const partnerIdsByKey = new Map(
        demoMarketplacePartners.map((partner) => [partner.legalName, partner.id] as const),
      );
      const buyerPartnerIdFor = (displayName: string): string | undefined => partnerIdsByKey.get(displayName);
      for (const request of demoMarketplaceRequests) {
        const buyerUserId = userIdsByEmail.get(request.buyerEmail);
        const buyerPartnerId = buyerPartnerIdFor(request.buyerDisplayName);
        if (!buyerUserId || !buyerPartnerId) continue;
        counts.demoRequests += await insertedCount(
          client,
          `INSERT INTO "marketplace_requests" (
             "id", "tenant_id", "buyer_user_id", "buyer_partner_id", "title", "product", "volume",
             "region", "deadline", "budget_uzs", "requirements", "status", "binding_status",
             "created_at", "updated_at"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'review_required', $13, now())
           ON CONFLICT ("id") DO UPDATE SET
             "buyer_partner_id" = excluded."buyer_partner_id", "title" = excluded."title",
             "product" = excluded."product", "volume" = excluded."volume",
             "region" = excluded."region", "deadline" = excluded."deadline",
             "budget_uzs" = excluded."budget_uzs", "requirements" = excluded."requirements",
             "status" = case
               when "marketplace_requests"."status" = 'open' then excluded."status"
               else "marketplace_requests"."status"
             end,
             "updated_at" = now()
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            request.id,
            DefaultTenantId,
            buyerUserId,
            buyerPartnerId,
            request.title,
            request.product,
            request.volume,
            request.region,
            request.deadline,
            request.budgetUzs,
            request.requirements,
            request.status,
            request.createdAt,
          ],
        );
        // A request the buyer never published has no public snapshot at all, and
        // `assert_marketplace_offer_public_request` is what makes that matter: a
        // seller cannot answer it. Skipping the insert is the whole of that state.
        if (request.publication === 'none') continue;
        await client.query(
          `INSERT INTO "marketplace_request_organization_bindings" (
             "request_id", "tenant_id", "buyer_user_id", "buyer_partner_id", "created_at"
           ) VALUES ($1, $2, $3, $4, now())
           ON CONFLICT ("request_id") DO UPDATE SET
             "buyer_user_id" = excluded."buyer_user_id", "buyer_partner_id" = excluded."buyer_partner_id"`,
          [request.id, DefaultTenantId, buyerUserId, buyerPartnerId],
        );
        await client.query(
          `INSERT INTO "marketplace_request_publications" (
             "id", "tenant_id", "buyer_user_id", "buyer_partner_id", "request_id",
             "buyer_display_name", "public_title", "public_product", "public_volume",
             "public_region", "public_deadline", "public_budget_uzs", "public_requirements",
             "content_fingerprint", "content_revision", "status", "moderation_status",
             "moderated_by", "moderated_at", "idempotency_key", "request_fingerprint",
             "revision", "published_at", "created_at", "updated_at"
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1,
             $19::varchar, $20::varchar,
             CASE WHEN $20::varchar = 'pending' THEN NULL ELSE $15 END,
             CASE WHEN $20::varchar = 'pending' THEN NULL ELSE now() END,
             $16, $17, 0, $18, now(), now()
           )
           ON CONFLICT ("id") DO UPDATE SET
             "public_title" = excluded."public_title", "public_product" = excluded."public_product",
             "public_volume" = excluded."public_volume", "public_region" = excluded."public_region",
             "public_deadline" = excluded."public_deadline",
             "public_budget_uzs" = excluded."public_budget_uzs",
             "public_requirements" = excluded."public_requirements",
             "content_fingerprint" = excluded."content_fingerprint",
             "status" = excluded."status", "moderation_status" = excluded."moderation_status",
             "moderated_by" = excluded."moderated_by", "moderated_at" = excluded."moderated_at",
             "published_at" = excluded."published_at", "updated_at" = now()`,
          [
            request.publicationId,
            DefaultTenantId,
            buyerUserId,
            buyerPartnerId,
            request.id,
            request.buyerDisplayName,
            request.title,
            request.product,
            request.volume,
            request.region,
            request.deadline,
            request.budgetUzs,
            request.requirements,
            request.contentFingerprint,
            reviewedBy,
            request.idempotencyKey,
            request.requestFingerprint,
            request.createdAt,
            // `ck__marketplace_request_publications__moderation` pairs the two:
            // a pending snapshot has no moderator and no decision time, and an
            // approved or rejected one must have both.
            request.publication === 'rejected' ? 'rejected' : 'published',
            request.publication,
          ],
        );
      }
      for (const offer of demoMarketplaceOffers) {
        const buyerUserId = userIdsByEmail.get(offer.buyerEmail);
        const sellerUserId = userIdsByEmail.get(offer.sellerEmail);
        const buyerPartnerId = buyerPartnerIdFor(
          demoMarketplaceRequests.find((request) => request.id === offer.requestId)?.buyerDisplayName ?? '',
        );
        const sellerPartnerId = supplierPartnerIdForSlug(offer.sellerSupplierSlug);
        if (!buyerUserId || !sellerUserId || !buyerPartnerId) continue;
        counts.demoOffers += await insertedCount(
          client,
          `INSERT INTO "marketplace_request_offers" (
             "id", "request_id", "request_public_id", "tenant_id", "seller_tenant_id",
             "seller_user_id", "seller_partner_id", "buyer_user_id", "buyer_partner_id",
             "price_uzs", "delivery_terms", "delivery_price_uzs", "delivery_days",
             "delivery_note", "status", "binding_status", "created_at"
           )
           SELECT $1::uuid, $2::uuid, $3::uuid, $4::varchar, $4, $5::varchar, $6::uuid, $7::varchar, $8::uuid,
                  $9::numeric, $10::varchar, $11::numeric, $12::int, $13::varchar, $15::varchar, 'resolved',
                  $14::timestamptz
            WHERE NOT ($15::varchar = 'accepted' AND EXISTS (
              SELECT 1 FROM "marketplace_request_offers" "existing"
               WHERE "existing"."request_id" = $2 AND "existing"."status" = 'accepted' AND "existing"."id" <> $1
            ))
           ON CONFLICT ("id") DO UPDATE SET
             "price_uzs" = excluded."price_uzs", "delivery_terms" = excluded."delivery_terms",
             "delivery_price_uzs" = excluded."delivery_price_uzs",
             "delivery_days" = excluded."delivery_days", "delivery_note" = excluded."delivery_note",
             "binding_status" = 'resolved'
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            offer.id,
            offer.requestId,
            offer.requestPublicId,
            DefaultTenantId,
            sellerUserId,
            sellerPartnerId,
            buyerUserId,
            buyerPartnerId,
            offer.priceUzs,
            offer.deliveryTerms,
            offer.deliveryPriceUzs,
            offer.deliveryDays,
            offer.deliveryNote,
            offer.createdAt,
            // The outcome is written on insert and never refreshed, and an award is
            // skipped outright when another offer on the same request already holds
            // it: `uq__marketplace_request_offers__request_id` allows one accepted
            // offer per request, and a tender a person decided must not be
            // re-decided by a re-seed.
            //
            // A reviewer who
            // awards or declines a seeded offer through the API moves it, and that
            // move is paired with a contract by
            // `assert_marketplace_single_offer_selection_contract`; putting the
            // fixture's own value back would break the pair and re-arm a decided
            // tender for a second award.
            offer.status,
          ],
        );
      }
      // The carts. Written before the deals because a cart-checkout contract names
      // the cart it came out of, and a reviewer reading a deal should be able to
      // reach the cart rather than a dangling id.
      //
      // The open ones are guarded rather than upserted blindly:
      // `uq__marketplace_carts__tenant_id_user_id_buyer_partner...` allows one open
      // cart per buyer and seller, and a reviewer who filled their own cart for the
      // same pair already holds it. The fixture yields to that cart instead of
      // aborting the seed on a bare constraint name.
      for (const cart of demoMarketplaceCarts(new Date())) {
        const buyerUserId = userIdsByEmail.get(cart.buyer.ownerEmail);
        const sellerUserId = userIdsByEmail.get(cart.seller.ownerEmail);
        if (!buyerUserId || !sellerUserId) continue;
        counts.demoCarts += await insertedCount(
          client,
          `INSERT INTO "marketplace_carts" (
             "id", "tenant_id", "user_id", "seller_id", "items", "status",
             "buyer_partner_id", "seller_tenant_id", "seller_user_id", "seller_partner_id",
             "binding_status", "created_at", "updated_at"
           )
           SELECT $1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::jsonb, $6::varchar,
                  $7::uuid, $2, $8::varchar, $9::uuid, 'resolved', $10::timestamptz, $10
            WHERE NOT ($6 = 'open' AND EXISTS (
              SELECT 1 FROM "marketplace_carts" "existing"
               WHERE "existing"."tenant_id" = $2 AND "existing"."user_id" = $3
                 AND "existing"."buyer_partner_id" = $7 AND "existing"."seller_tenant_id" = $2
                 AND "existing"."seller_partner_id" = $9 AND "existing"."status" = 'open'
                 AND "existing"."binding_status" = 'resolved' AND "existing"."id" <> $1
            ))
           ON CONFLICT ("id") DO UPDATE SET
             "items" = excluded."items", "updated_at" = now()
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            cart.id,
            DefaultTenantId,
            buyerUserId,
            cart.seller.partnerId,
            // The cart column carries only what a cart needs; the price a checkout
            // freezes is read from the listing again at that moment.
            JSON.stringify(
              cart.lines.map((cartLine) => ({
                listingPublicationId: cartLine.sourcePublicationId,
                quantity: cartLine.quantity,
                sourceId: cartLine.sourceId,
                sourceKind: cartLine.sourceKind,
              })),
            ),
            cart.status,
            cart.buyer.partnerId,
            sellerUserId,
            cart.seller.partnerId,
            cart.createdAt,
          ],
        );
      }
      // Settled trading history, without which the cabinet's month chart and its
      // buyer/seller totals aggregate a single draft contract into a flat line.
      // `updated_at` is the column the dashboard buckets by, and it is also the
      // only date on a resolved contract the frozen-authority trigger still lets
      // a re-seed move — so the same fixture keeps landing inside the rolling
      // six-month window instead of ageing out of it.
      for (const contract of demoMarketplaceContracts(new Date())) {
        const buyerUserId = userIdsByEmail.get(contract.buyer.ownerEmail);
        const sellerUserId = userIdsByEmail.get(contract.seller.ownerEmail);
        if (!buyerUserId || !sellerUserId) continue;
        counts.demoContracts += await insertedCount(
          client,
          `INSERT INTO "marketplace_contracts" (
             "id", "tenant_id", "buyer_user_id", "buyer_partner_id", "buyer_party_snapshot",
             "seller_tenant_id", "seller_user_id", "seller_partner_id", "seller_party_snapshot",
             "subject", "amount_uzs", "lines", "delivery_terms", "delivery_price_uzs",
             "delivery_days", "delivery_note", "factoring_enabled", "status",
             "buyer_signed_at", "seller_signed_at", "signed_at", "binding_status",
             "version", "created_at", "updated_at", "source_type", "source_id"
           ) VALUES (
             $1, $2, $3, $4, $5, $2, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             false, $16, $17, $18, $19, 'resolved', 0, $20, $21, $22::varchar, $23::varchar
           )
           ON CONFLICT ("id") DO UPDATE SET
             "status" = excluded."status", "buyer_signed_at" = excluded."buyer_signed_at",
             "seller_signed_at" = excluded."seller_signed_at", "signed_at" = excluded."signed_at",
             "updated_at" = excluded."updated_at"
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            contract.id,
            DefaultTenantId,
            buyerUserId,
            contract.buyer.partnerId,
            JSON.stringify(demoContractPartySnapshot(contract.buyer, DefaultTenantId, buyerUserId)),
            sellerUserId,
            contract.seller.partnerId,
            JSON.stringify(demoContractPartySnapshot(contract.seller, DefaultTenantId, sellerUserId)),
            contract.subject,
            contract.amountUzs,
            JSON.stringify(contract.lines),
            contract.deliveryTerms,
            contract.deliveryPriceUzs,
            contract.deliveryDays,
            contract.deliveryNote,
            contract.status,
            contract.buyerSignedAt,
            contract.sellerSignedAt,
            contract.signedAt,
            contract.createdAt,
            contract.updatedAt,
            // Provenance is written on insert only. It is inside the tuple
            // `tr__marketplace_contracts__frozen_authority` refuses to see change,
            // so an `ON CONFLICT` that touched it would abort the seed on any
            // database that already holds the row.
            contract.sourceType,
            contract.sourceId,
          ],
        );
      }
      // What a settled deal left behind: the payment record, the delivery record,
      // the timeline, and one notification per party per step.
      //
      // Both the settlement and the fulfilment are walked rather than written at
      // their end state. `guard_marketplace_contract_settlement` and
      // `guard_marketplace_contract_fulfillment` admit exactly one forward step at
      // a time and require the revision to advance with it, so the initial row goes
      // in and each transition is a guarded update that no-ops once the row has
      // already arrived. That is also what makes a re-seed free: the second run
      // matches nothing.
      const lifecycle = demoMarketplaceContractLifecycle(new Date());
      for (const settlement of lifecycle.settlements) {
        const selectedByUserId = userIdsByEmail.get(settlement.selectedByEmail);
        if (!selectedByUserId) continue;
        counts.demoSettlements += await insertedCount(
          client,
          `INSERT INTO "marketplace_contract_settlements" (
             "id", "contract_id", "kind", "status", "amount_uzs", "currency",
             "selected_by_tenant_id", "selected_by_user_id", "selection_idempotency_key",
             "selection_request_fingerprint", "latest_provider_mode", "reconciliation_state",
             "revision", "created_at", "updated_at"
           ) VALUES (
             $1, $2, 'direct_payment', 'awaiting_buyer_confirmation', $3, 'UZS',
             $4, $5, $6, $7, 'none', 'clear', 0, $8, $8
           )
           ON CONFLICT ("contract_id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            settlement.id,
            settlement.contractId,
            settlement.amountUzs,
            DefaultTenantId,
            selectedByUserId,
            settlement.selectionIdempotencyKey,
            settlement.selectionRequestFingerprint,
            settlement.createdAt,
          ],
        );
        if (settlement.status === 'awaiting_buyer_confirmation') continue;
        await client.query(
          `UPDATE "marketplace_contract_settlements"
              SET "status" = 'buyer_confirmed', "revision" = "revision" + 1, "updated_at" = $2
            WHERE "contract_id" = $1 AND "status" = 'awaiting_buyer_confirmation'`,
          [settlement.contractId, settlement.updatedAt],
        );
        if (settlement.status === 'buyer_confirmed') continue;
        await client.query(
          `UPDATE "marketplace_contract_settlements"
              SET "status" = 'seller_received', "revision" = "revision" + 1, "updated_at" = $2
            WHERE "contract_id" = $1 AND "status" = 'buyer_confirmed'`,
          [settlement.contractId, settlement.updatedAt],
        );
      }
      for (const fulfillment of lifecycle.fulfillments) {
        counts.demoFulfillments += await insertedCount(
          client,
          `INSERT INTO "marketplace_contract_fulfillments" (
             "id", "contract_id", "status", "revision", "created_at", "updated_at"
           ) VALUES ($1, $2, 'awaiting_settlement', 0, $3, $3)
           ON CONFLICT ("contract_id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [fulfillment.id, fulfillment.contractId, fulfillment.createdAt],
        );
        const advance = async (from: string, to: string, columns: string, values: unknown[]): Promise<void> => {
          await client.query(
            `UPDATE "marketplace_contract_fulfillments"
                SET "status" = '${to}', "revision" = "revision" + 1, "updated_at" = $2${columns}
              WHERE "contract_id" = $1 AND "status" = '${from}'`,
            values,
          );
        };
        if (fulfillment.status === 'awaiting_settlement') continue;
        await advance('awaiting_settlement', 'ready', '', [fulfillment.contractId, fulfillment.updatedAt]);
        // `ck__contract_fulfillments__timeline` requires the start time from
        // `in_progress` onwards, and the delivery and completion times with their
        // own statuses, so each step carries the stamp its state demands.
        await advance('ready', 'in_progress', ', "started_at" = $3', [
          fulfillment.contractId,
          fulfillment.updatedAt,
          fulfillment.startedAt,
        ]);
        if (fulfillment.status === 'in_progress') continue;
        if (fulfillment.status === 'disputed') {
          await advance('in_progress', 'disputed', '', [fulfillment.contractId, fulfillment.updatedAt]);
          continue;
        }
        await advance('in_progress', 'delivered', ', "delivered_at" = $3', [
          fulfillment.contractId,
          fulfillment.updatedAt,
          fulfillment.deliveredAt,
        ]);
        if (fulfillment.status === 'delivered') continue;
        await advance('delivered', 'completed', ', "completed_at" = $3', [
          fulfillment.contractId,
          fulfillment.updatedAt,
          fulfillment.completedAt,
        ]);
      }
      for (const dispute of lifecycle.disputes) {
        const openedByUserId = userIdsByEmail.get(dispute.openedByEmail);
        if (!openedByUserId) continue;
        counts.demoDisputes += await insertedCount(
          client,
          `INSERT INTO "marketplace_contract_disputes" (
             "id", "contract_id", "opened_by_party", "opened_by_tenant_id", "opened_by_user_id",
             "reason", "status", "previous_fulfillment_status", "revision", "created_at"
           ) VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, 0, $8)
           ON CONFLICT ("contract_id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            dispute.id,
            dispute.contractId,
            dispute.openedByParty,
            DefaultTenantId,
            openedByUserId,
            dispute.reason,
            dispute.previousFulfillmentStatus,
            dispute.createdAt,
          ],
        );
      }
      // The timeline. Every event here involves no external provider, which is why
      // `provider_mode` is `none` and every provider column stays null — the same
      // shape the running application writes for these five steps.
      //
      // The guard is on the sequence rather than the id, because
      // `uq__contract_lifecycle_events__contract_id_sequence` can already be
      // satisfied by an event a reviewer's own action wrote, and the immutability
      // trigger refuses to let anything overwrite it.
      for (const event of lifecycle.events) {
        const actorUserId = userIdsByEmail.get(event.actorEmail);
        if (!actorUserId) continue;
        counts.demoLifecycleEvents += await insertedCount(
          client,
          `INSERT INTO "marketplace_contract_lifecycle_events" (
             "id", "contract_id", "sequence", "category", "event_type",
             "actor_party", "actor_tenant_id", "actor_user_id", "provider_mode", "created_at"
           )
           SELECT $1::uuid, $2::uuid, $3::int, $4::varchar, $5::varchar,
                  $6::varchar, $7::varchar, $8::varchar, 'none', $9::timestamptz
            WHERE NOT EXISTS (
              SELECT 1 FROM "marketplace_contract_lifecycle_events" "existing"
               WHERE "existing"."contract_id" = $2 AND ("existing"."sequence" = $3 OR "existing"."id" = $1)
            )
           ON CONFLICT ("id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            event.id,
            event.contractId,
            event.sequence,
            event.category,
            event.eventType,
            event.actorParty,
            DefaultTenantId,
            actorUserId,
            event.createdAt,
          ],
        );
      }
      // One durable intent per party per accepted transition, which is the
      // invariant the repository upholds by writing both in the same transaction.
      // Without them the notification surface answered an empty list to every
      // login while the deals it reports on sat in the database.
      //
      // They are left `pending`: no notification provider is called while seeding,
      // and a deployment that has one configured will dispatch them on its own
      // schedule and watermark the result as a simulation.
      for (const intent of lifecycle.intents) {
        counts.demoNotificationIntents += await insertedCount(
          client,
          `INSERT INTO "marketplace_contract_notification_intents" (
             "id", "contract_id", "timeline_event_id", "recipient_party", "template_key",
             "status", "channel", "provider_mode", "recipient_locale", "simulation",
             "attempts", "channel_attempts", "next_attempt_at", "created_at", "updated_at"
           )
           SELECT $1::uuid, $2::uuid, $3::uuid, $4::varchar, $5::varchar,
                  'pending', 'telegram', 'none', 'en', false, 0, 0, $6::timestamptz, $6, $6
            WHERE EXISTS (SELECT 1 FROM "marketplace_contract_lifecycle_events" WHERE "id" = $3)
           ON CONFLICT ("timeline_event_id", "recipient_party") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [intent.id, intent.contractId, intent.timelineEventId, intent.recipientParty, intent.templateKey, intent.createdAt],
        );
      }
      // The marketplace's own cut of a closed deal, charged against the rate policy
      // the migrations activate. It is the only row that makes the revenue surface
      // read as anything other than zero.
      for (const commission of lifecycle.commissions) {
        counts.demoCommissions += await insertedCount(
          client,
          `INSERT INTO "marketplace_contract_commissions" (
             "id", "contract_id", "rate_version", "rate_snapshot", "base_amount_uzs",
             "amount_uzs", "currency", "created_at"
           ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'UZS', $7)
           ON CONFLICT ("contract_id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            commission.id,
            commission.contractId,
            commission.rateVersion,
            JSON.stringify(commission.rateSnapshot),
            commission.baseAmountUzs,
            commission.amountUzs,
            commission.createdAt,
          ],
        );
      }
      // Review eligibility, which no other seed path can produce. It is created
      // only by `accept_delivery` on a contract's fulfillment, and the fixture
      // writes settled contracts directly — so without this loop the demo held
      // completed purchases that could never be rated, and the ratings block of
      // every listing was permanently empty.
      const reviewNow = new Date();
      for (const eligibility of demoMarketplaceReviewEligibilities(reviewNow)) {
        const buyerUserId = userIdsByEmail.get(eligibility.buyerOwnerEmail);
        if (!buyerUserId) continue;
        counts.demoReviewEligibilities += await insertedCount(
          client,
          `INSERT INTO "marketplace_contract_review_eligibilities" (
             "id", "contract_id", "buyer_tenant_id", "buyer_user_id", "buyer_partner_id",
             "seller_tenant_id", "seller_partner_id", "source_kind", "source_id",
             "source_publication_id", "created_at"
           ) VALUES ($1, $2, $3, $4, $5, $3, $6, $7, $8, $9, $10)
           ON CONFLICT ("contract_id", "source_kind", "source_id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            eligibility.id,
            eligibility.contractId,
            DefaultTenantId,
            buyerUserId,
            eligibility.buyerPartnerId,
            eligibility.sellerPartnerId,
            eligibility.sourceKind,
            eligibility.sourceId,
            eligibility.sourcePublicationId,
            eligibility.createdAt,
          ],
        );
      }
      // The ratings themselves. Insert-only rather than an upsert because
      // `tr__marketplace_listing_reviews__aggregate` adds to
      // `marketplace_review_aggregates` on insert and never recomputes: an
      // updated row would leave the published average quoting a rating no
      // review carries any more. The aggregate is therefore never written by
      // this seed at all — the trigger owns it, and letting it own it is what
      // keeps every published average equal to the rows behind it.
      //
      // The guard is a `WHERE NOT EXISTS` rather than `ON CONFLICT` because
      // three different uniqueness rules can already be satisfied by a review
      // this fixture did not write: `uq__marketplace_listing_reviews__eligibility`
      // and the two partial indexes on buyer plus source. A reviewer signed in
      // as a demo login and rating a purchase through the API consumes exactly
      // those, and a seeded row must never displace or duplicate a rating a real
      // person left — so the fixture yields the eligibility instead of aborting
      // the whole seed on a bare constraint name.
      for (const review of demoMarketplaceReviews(reviewNow)) {
        const buyerUserId = userIdsByEmail.get(review.buyerOwnerEmail);
        const sellerUserId = userIdsByEmail.get(review.sellerOwnerEmail);
        if (!buyerUserId || !sellerUserId) continue;
        counts.demoReviews += await insertedCount(
          client,
          // `ck__marketplace_listing_reviews__source_pair` requires exactly one of
          // the two source columns, chosen by `source_kind`, so the rated id goes
          // to `product_id` for a catalog listing and to `produce_listing_id` for
          // a harvest. `asset_references` carries up to three
          // `public-asset:<id>` handles, and it carries them only when the seed
          // actually put those objects in the bucket — on a deployment without
          // object storage the same review is written with none, because a handle
          // whose object is missing is a photograph nobody can see.
          //
          // The casts in the `SELECT` list are load-bearing: in an
          // `INSERT ... SELECT` Postgres deduces a parameter's type from every
          // use, and `source_kind` is used both as an inserted value and as a
          // comparison — which it refuses to reconcile without them.
          `INSERT INTO "marketplace_listing_reviews" (
             "id", "listing_publication_id", "source_kind", "product_id", "produce_listing_id",
             "review_eligibility_id",
             "buyer_tenant_id", "buyer_user_id", "buyer_partner_id", "seller_tenant_id",
             "seller_partner_id", "rating", "comment", "asset_references", "verified_deal",
             "visibility", "revision", "created_at", "updated_at"
           )
           SELECT $1::uuid, $2::uuid, $3::varchar, $4::uuid, $13::uuid, $5::uuid,
                  $6::varchar, $7::varchar, $8::uuid, $6, $9::uuid, $10::int, $11::varchar,
                  $14::jsonb, true, 'visible', 1, $12::timestamptz, $12
            WHERE NOT EXISTS (
              SELECT 1 FROM "marketplace_listing_reviews" "existing"
               WHERE "existing"."review_eligibility_id" = $5
                  OR ("existing"."buyer_tenant_id" = $6 AND "existing"."buyer_user_id" = $7
                    AND "existing"."source_kind" = $3
                    AND "existing"."product_id" IS NOT DISTINCT FROM $4
                    AND "existing"."produce_listing_id" IS NOT DISTINCT FROM $13)
            )
           ON CONFLICT ("id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            review.id,
            review.listingPublicationId,
            review.sourceKind,
            review.sourceKind === 'product' ? review.sourceId : null,
            review.eligibilityId,
            DefaultTenantId,
            buyerUserId,
            review.buyerPartnerId,
            review.sellerPartnerId,
            review.rating,
            review.comment,
            review.createdAt,
            review.sourceKind === 'produce' ? review.sourceId : null,
            JSON.stringify(resolveReviewAssets(review.assetMediaKeys, media)),
          ],
        );
        if (!review.reply) continue;
        counts.demoReviewReplies += await insertedCount(
          client,
          // A reply exists only for a review that exists, so the same guard that
          // let a reviewer's own rating stand has to be honoured here: without
          // the `EXISTS` the reply would fail the review foreign key on exactly
          // the row the fixture just declined to write.
          `INSERT INTO "marketplace_review_replies" (
             "id", "review_id", "seller_tenant_id", "seller_user_id", "seller_partner_id",
             "comment", "revision", "created_at", "updated_at"
           )
           SELECT $1, $2, $3, $4, $5, $6, 1, $7, $7
            WHERE EXISTS (SELECT 1 FROM "marketplace_listing_reviews" WHERE "id" = $2)
              AND NOT EXISTS (SELECT 1 FROM "marketplace_review_replies" WHERE "review_id" = $2)
           ON CONFLICT ("id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            review.reply.id,
            review.id,
            DefaultTenantId,
            sellerUserId,
            review.reply.sellerPartnerId,
            review.reply.comment,
            review.reply.createdAt,
          ],
        );
      }
      // Sample requests waiting on a seller. The policy row goes first: the
      // sample's coherence trigger joins it to an active policy of the same
      // version and monthly limit, and the same trigger writes the requester's
      // monthly-usage row, so the fixture must not write that itself.
      const engagementNow = new Date();
      await client.query(
        `INSERT INTO "marketplace_sample_policies" (
           "id", "tenant_id", "version", "monthly_limit", "active", "activated_by_user_id",
           "active_from", "created_at"
         ) VALUES ($1, $2, $3, $4, true, $5, now(), now())
         ON CONFLICT DO NOTHING`,
        [demoSamplePolicy.id, DefaultTenantId, demoSamplePolicy.version, demoSamplePolicy.monthlyLimit, reviewedBy],
      );
      for (const sample of demoMarketplaceSampleRequests(engagementNow)) {
        const requesterUserId = userIdsByEmail.get(sample.requesterEmail);
        const sellerUserId = userIdsByEmail.get(sample.sellerOwnerEmail);
        if (!requesterUserId || !sellerUserId) continue;
        counts.demoSampleRequests += await insertedCount(
          client,
          // Guarded on the two partial unique indexes rather than upserted: a
          // reviewer who asked for the same sample themselves already holds the
          // row, and the coherence trigger increments a quota on every insert, so
          // a second write would charge them twice.
          `INSERT INTO "marketplace_listing_samples" (
             "id", "listing_publication_id", "source_kind", "product_id",
             "requester_tenant_id", "requester_user_id", "requester_partner_id",
             "seller_tenant_id", "seller_user_id", "seller_partner_id",
             "season_key", "month_key", "policy_id", "policy_version", "monthly_limit",
             "delivery_method", "item_price_uzs", "status", "revision", "created_at", "updated_at"
           )
           SELECT $1::uuid, $2::uuid, 'product', $3::uuid, $4::varchar, $5::varchar, $6::uuid,
                  $4, $7::varchar, $8::uuid,
                  to_char($9::timestamptz, 'YYYY') || '-Q' || to_char($9::timestamptz, 'Q'),
                  to_char($9::timestamptz, 'YYYY-MM'),
                  $10::uuid, $11::int, $12::int, $13::varchar, 0, 'requested', 0, $9::timestamptz, $9
            WHERE NOT EXISTS (
              SELECT 1 FROM "marketplace_listing_samples" "existing"
               WHERE "existing"."requester_tenant_id" = $4 AND "existing"."requester_user_id" = $5
                 AND "existing"."product_id" = $3
                 AND "existing"."season_key" = to_char($9::timestamptz, 'YYYY') || '-Q' || to_char($9::timestamptz, 'Q')
            )
           ON CONFLICT ("id") DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            sample.id,
            sample.listingPublicationId,
            sample.productId,
            DefaultTenantId,
            requesterUserId,
            sample.requesterPartnerId,
            sellerUserId,
            sample.sellerPartnerId,
            sample.createdAt,
            sample.policyId,
            sample.policyVersion,
            sample.monthlyLimit,
            sample.deliveryMethod,
          ],
        );
      }
      // One reported review, so the moderation queue has a subject. It stays
      // `pending`: a decided report is a decision no moderator on this instance
      // made.
      for (const report of demoMarketplaceReviewReports(reviewNow)) {
        const reporterUserId = userIdsByEmail.get(report.reporterEmail);
        if (!reporterUserId) continue;
        counts.demoReviewReports += await insertedCount(
          client,
          `INSERT INTO "marketplace_review_reports" (
             "id", "review_id", "moderation_tenant_id", "reporter_tenant_id", "reporter_user_id",
             "reason", "comment", "status", "review_snapshot", "revision", "created_at", "updated_at"
           )
           SELECT $1::uuid, $2::uuid, $3::varchar, $3, $4::varchar, $5::varchar, $6::varchar,
                  'pending', $7::jsonb, 0, $8::timestamptz, $8
            WHERE EXISTS (SELECT 1 FROM "marketplace_listing_reviews" WHERE "id" = $2)
           ON CONFLICT ON CONSTRAINT "uq__marketplace_review_reports__reporter_reason" DO NOTHING
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            report.id,
            report.reviewId,
            DefaultTenantId,
            reporterUserId,
            report.reason,
            report.comment,
            JSON.stringify(report.reviewSnapshot),
            report.createdAt,
          ],
        );
      }
      // The older AgriTech order book, which the admin app lists beside partners
      // and farmers. Without these that panel was blank on every install.
      for (const order of demoMarketplaceOrders(engagementNow)) {
        const buyerUserId = userIdsByEmail.get(order.buyerEmail);
        if (!buyerUserId) continue;
        counts.demoOrders += await insertedCount(
          client,
          `INSERT INTO "orders" (
             "id", "tenant_id", "user_id", "farmer_id", "kind", "buyer_partner_id",
             "produce_listing_id", "items", "total_amount_uzs", "status",
             "delivery_address", "region", "notes", "history", "created_at", "updated_at"
           ) VALUES (
             $1, $2, $3, $4, 'produce', $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13::jsonb, $14, $14
           )
           ON CONFLICT ("id") DO UPDATE SET
             "items" = excluded."items", "total_amount_uzs" = excluded."total_amount_uzs",
             "status" = excluded."status", "delivery_address" = excluded."delivery_address",
             "region" = excluded."region", "history" = excluded."history", "updated_at" = excluded."updated_at"
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            order.id,
            DefaultTenantId,
            buyerUserId,
            order.farmerId,
            order.buyerPartnerId,
            order.produceListingId,
            JSON.stringify([
              {
                productId: order.produceListingId,
                productName: order.crop,
                quantity: order.quantityKg,
                totalUzs: order.totalAmountUzs,
                unitPriceUzs: order.unitPriceUzs,
              },
            ]),
            order.totalAmountUzs,
            order.status,
            order.deliveryAddress,
            order.region,
            order.notes,
            JSON.stringify([{ actorUserId: buyerUserId, at: order.createdAt.toISOString(), status: order.status }]),
            order.createdAt,
          ],
        );
      }
    }
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/**
 * The photographs a published snapshot carries.
 *
 * A listing that declares uploaded photographs uses them outright rather than
 * appending them to its checked-in ones: the five-asset cap is real, and mixing
 * the two would show the same machine twice. When the objects are not stored the
 * checked-in list stands, which is why every listing that names uploads also
 * names a fallback.
 */
function resolvePublicationImages(
  uploadedKeys: readonly string[],
  fallback: readonly string[],
  media: DemoMediaResolver,
): readonly string[] {
  if (uploadedKeys.length === 0 || !media.stored) {
    return fallback;
  }
  const paths = uploadedKeys.map((key) => media.pathFor(key)).filter((path): path is string => path !== undefined);

  return paths.length === uploadedKeys.length ? paths : fallback;
}

/**
 * The handles a published review carries, or none.
 *
 * All or nothing per review: a review that showed one of its two photographs
 * would read as a bug in the upload path rather than as a deployment without a
 * bucket.
 */
function resolveReviewAssets(assetKeys: readonly string[], media: DemoMediaResolver): readonly string[] {
  if (assetKeys.length === 0 || !media.stored) {
    return [];
  }
  const references = assetKeys
    .map((key) => media.referenceFor(key))
    .filter((reference): reference is string => reference !== undefined);

  return references.length === assetKeys.length ? references : [];
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const digest = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}
