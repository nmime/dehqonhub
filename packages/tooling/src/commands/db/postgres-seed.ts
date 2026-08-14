import { pbkdf2Sync, randomBytes } from 'node:crypto';
import pg from 'pg';

import {
  demoMarketplacePartners,
  demoMarketplaceProducts,
  demoMarketplaceVerifications,
} from './marketplace-seed-data.ts';
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
const marketplaceTables = ['products', 'agritech_partners', 'marketplace_verifications'];

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
             "id", "tenant_id", "name", "name_ru", "name_uz", "category", "description",
             "supplier_id", "supplier_name", "price_uzs", "unit", "stock_quantity", "region",
             "status", "images", "created_at", "updated_at"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', '[]'::jsonb, $14, $15)
           ON CONFLICT ("id") DO UPDATE SET
             "name" = excluded."name", "name_ru" = excluded."name_ru", "name_uz" = excluded."name_uz",
             "category" = excluded."category", "description" = excluded."description",
             "supplier_id" = excluded."supplier_id", "supplier_name" = excluded."supplier_name",
             "price_uzs" = excluded."price_uzs", "unit" = excluded."unit",
             "stock_quantity" = excluded."stock_quantity", "region" = excluded."region",
             "status" = 'active', "updated_at" = excluded."updated_at"
           RETURNING ("xmax" = 0) AS "inserted"`,
          [
            product.id,
            DefaultTenantId,
            product.name,
            product.nameRu,
            product.nameUz,
            product.category,
            product.description,
            product.supplierId,
            product.supplierName,
            product.priceUzs,
            product.unit,
            product.stockQuantity,
            product.region,
            product.createdAt,
            product.updatedAt,
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
