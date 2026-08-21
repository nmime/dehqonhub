// @requirements REQ-RUNTIME-DATABASE-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertLocalPostgresDatabase, isLocalPostgresDatabase } from "./postgres-environment.ts";

const defaultDatabase = "postgres://postgres:postgres@postgres:5432/nest_react_boilerplate";
const namedDatabase = "postgres://appuser:pw@postgres:5432/dehqonhub";

describe("postgres environment guards", () => {
  // These are the predicates the seed command actually injects. Their twin in
  // seed-safety.ts had a test and these had none, so a fix applied to the twin
  // changed nothing about the command's behaviour and the hole stayed open.
  it("treats a local checkout as local", () => {
    assert.equal(isLocalPostgresDatabase(defaultDatabase, {}), true);
    assert.equal(isLocalPostgresDatabase(defaultDatabase, { NODE_ENV: "development" }), true);
    assert.equal(isLocalPostgresDatabase(defaultDatabase, { NODE_ENV: "test" }), true);
  });

  it("treats every named deployment as remote, whatever its database is called", () => {
    // A deployed stack reaches Postgres at host "postgres" with the default
    // database name, exactly as a laptop does, so the host-and-name heuristic
    // cannot separate them and NODE_ENV is the only signal that can.
    for (const environment of ["production", "staging", "preview", "qa", "demo"]) {
      assert.equal(isLocalPostgresDatabase(defaultDatabase, { NODE_ENV: environment }), false, environment);
    }
  });

  it("refuses a destructive operation against a deployment unless it is asked for", () => {
    assert.throws(
      () => assertLocalPostgresDatabase(defaultDatabase, { NODE_ENV: "staging" }),
      /Refusing destructive database operation while NODE_ENV=staging/u,
    );
    assert.throws(
      () => assertLocalPostgresDatabase(defaultDatabase, { NODE_ENV: "production" }),
      /Refusing destructive database operation while NODE_ENV=production/u,
    );
    assert.doesNotThrow(() =>
      assertLocalPostgresDatabase(defaultDatabase, { DB_ALLOW_DESTRUCTIVE: "true", NODE_ENV: "staging" }),
    );
  });

  it("still refuses a database whose name claims nothing disposable", () => {
    assert.throws(() => assertLocalPostgresDatabase(namedDatabase, {}), /Refusing destructive reset/u);
    assert.doesNotThrow(() => assertLocalPostgresDatabase(defaultDatabase, {}));
  });
});
