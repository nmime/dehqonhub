// @requirements REQ-RUNTIME-DATABASE-008
import { createHash } from "node:crypto";

export const postgresIdentifierMaximumLength = 63;
export const strictIndexNamingMigrationTimestamp = "20260810124500";

export interface MigrationIndexNameInput {
  columns: string;
  table: string;
  unique: boolean;
}

export function canonicalMigrationIndexName(input: MigrationIndexNameInput): string {
  return `${input.unique ? "uq" : "ix"}__${input.table}__${input.columns}`;
}

/**
 * PostgreSQL silently truncates identifiers beyond 63 bytes. Generate an explicit,
 * collision-resistant alias while preserving the repository's type/table owner prefix.
 */
export function expectedMigrationIndexName(input: MigrationIndexNameInput): string {
  const canonical = canonicalMigrationIndexName(input);
  if (Buffer.byteLength(canonical, "utf8") <= postgresIdentifierMaximumLength) {
    return canonical;
  }

  const prefix = `${input.unique ? "uq" : "ix"}__${input.table}__`;
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 8);
  const availableColumnBytes = postgresIdentifierMaximumLength - Buffer.byteLength(prefix, "utf8") - digest.length - 1;
  if (availableColumnBytes < 1) {
    throw new Error(`Index owner prefix exceeds PostgreSQL's identifier limit: ${prefix}`);
  }
  const abbreviatedColumns = input.columns.slice(0, availableColumnBytes).replace(/_+$/u, "");
  return `${prefix}${abbreviatedColumns}_${digest}`;
}

export function isMigrationIndexNameAccepted(
  actual: string,
  input: MigrationIndexNameInput,
  migrationTimestamp: string,
): boolean {
  if (actual === expectedMigrationIndexName(input)) {
    return true;
  }

  // Applied historical migrations cannot safely rename physical indexes in place.
  // Grandfather only their exact canonical spelling; new migrations must use the
  // explicit collision-resistant alias instead of relying on PostgreSQL truncation.
  return (
    migrationTimestamp < strictIndexNamingMigrationTimestamp &&
    actual === canonicalMigrationIndexName(input)
  );
}
