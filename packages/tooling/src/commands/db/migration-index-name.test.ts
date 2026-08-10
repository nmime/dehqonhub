// @requirements REQ-RUNTIME-DATABASE-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalMigrationIndexName,
  expectedMigrationIndexName,
  isMigrationIndexNameAccepted,
  postgresIdentifierMaximumLength,
} from "./migration-index-name.ts";

describe("migration index names", () => {
  it("keeps the canonical repository name when it fits PostgreSQL", () => {
    const input = { columns: "tenant_id", table: "orders", unique: true };

    assert.equal(expectedMigrationIndexName(input), canonicalMigrationIndexName(input));
    assert.equal(expectedMigrationIndexName(input), "uq__orders__tenant_id");
  });

  it("uses a deterministic owner-prefixed alias for an overlength canonical name", () => {
    const input = {
      columns: "tenant_id_provider_mode_provider_subject_key",
      table: "marketplace_verifications",
      unique: true,
    };

    const name = expectedMigrationIndexName(input);
    assert.equal(name, "uq__marketplace_verifications__tenant_id_provider_mode_8abb5356");
    assert.equal(Buffer.byteLength(name, "utf8"), postgresIdentifierMaximumLength);
    assert.match(name, /^uq__marketplace_verifications__/u);
  });

  it("does not accept ambiguous or malformed handwritten aliases", () => {
    const input = {
      columns: "verification_id_created_at",
      table: "marketplace_verification_evidence",
      unique: false,
    };
    const expected = expectedMigrationIndexName(input);

    assert.equal(expected, "ix__marketplace_verification_evidence__verification_id_b2bbaa0a");
    assert.notEqual("ix__marketplace_verification_evidence__verification_created", expected);
    assert.notEqual("ix__marketplace_evidence__verification_id_b2bbaa0a", expected);
    assert.notEqual(`${expected}extra`, expected);
  });

  it("grandfathers only exact pre-cutoff canonical names", () => {
    const input = {
      columns: "tenant_id_aggregate_type_aggregate_id",
      table: "transactional_outbox_events",
      unique: false,
    };
    const historicalCanonical = canonicalMigrationIndexName(input);
    const currentAlias = expectedMigrationIndexName(input);

    assert.equal(isMigrationIndexNameAccepted(historicalCanonical, input, "20260606120000"), true);
    assert.equal(isMigrationIndexNameAccepted(currentAlias, input, "20260606120000"), true);
    assert.equal(isMigrationIndexNameAccepted(historicalCanonical, input, "20260810124500"), false);
    assert.equal(
      isMigrationIndexNameAccepted("ix__transactional_outbox_events__tenant_aggregate", input, "20260606120000"),
      false,
    );
  });
});
