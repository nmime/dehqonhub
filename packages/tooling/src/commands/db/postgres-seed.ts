import { pbkdf2Sync, randomBytes } from 'node:crypto';
import pg from 'pg';

import {
  demoMarketplacePartners,
  demoMarketplaceProducts,
  demoMarketplaceVerifications,
} from './marketplace-seed-data.ts';
import { demoContractPartySnapshot, demoMarketplaceContracts } from './marketplace-seed-contracts.ts';
import { demoMarketplaceReviewEligibilities, demoMarketplaceReviews } from './marketplace-seed-reviews.ts';
import {
  demoMarketplaceFarmers,
  demoMarketplaceListingPublications,
  demoMarketplaceOffers,
  demoMarketplaceProduceListings,
  demoMarketplaceProducePublications,
  demoMarketplaceListingPromotions,
  demoMarketplacePublicSellers,
  demoMarketplaceRequests,
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
    return await seed(client, seedUsers, marketplaceTables.every((table) => found.has(table)));
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
): Promise<Record<string, number>> {
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
    demoPublicSellers: 0,
    demoListingPublications: 0,
    demoListingPromotions: 0,
    demoProduceListings: 0,
    demoRequests: 0,
    demoOffers: 0,
    demoContracts: 0,
    demoReviewEligibilities: 0,
    demoReviews: 0,
    demoReviewReplies: 0,
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
            JSON.stringify(product.images),
            product.createdAt,
            product.updatedAt,
          ],
        );
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
      for (const publication of [...demoMarketplaceListingPublications, ...demoMarketplaceProducePublications]) {
        const ownerUserId = userIdsByEmail.get(publication.ownerEmail);
        if (!ownerUserId) continue;
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
            JSON.stringify(publication.images),
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
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 'active',
             now() - interval '1 day',
             now() - interval '1 day' + make_interval(days => $8::int),
             $9, 'UZS', $10, $11, $12, now() - interval '1 day', 0, now(), now()
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
             'published', 'approved', $15, now(), $16, $17, 0, $18, now(), now()
           )
           ON CONFLICT ("id") DO UPDATE SET
             "public_title" = excluded."public_title", "public_product" = excluded."public_product",
             "public_volume" = excluded."public_volume", "public_region" = excluded."public_region",
             "public_deadline" = excluded."public_deadline",
             "public_budget_uzs" = excluded."public_budget_uzs",
             "public_requirements" = excluded."public_requirements",
             "content_fingerprint" = excluded."content_fingerprint",
             "status" = 'published', "moderation_status" = 'approved',
             "moderated_by" = excluded."moderated_by", "moderated_at" = now(),
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
           ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', 'resolved', $14)
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
             "version", "created_at", "updated_at"
           ) VALUES (
             $1, $2, $3, $4, $5, $2, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             false, $16, $17, $18, $19, 'resolved', 0, $20, $21
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
          // a harvest. `asset_references` stays empty: the column accepts up to
          // three opaque `public-asset:<id>` handles, but nothing in this
          // repository uploads, stores or serves one, so a seeded handle would
          // render as a broken image.
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
                  '[]'::jsonb, true, 'visible', 1, $12::timestamptz, $12
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
    }
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const digest = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}
