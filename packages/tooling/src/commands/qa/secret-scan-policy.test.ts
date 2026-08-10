// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedSecretScanValue, isSecretScanIgnoredPath, secretValueEntropy } from "./secret-scan-policy.ts";

describe("native secret scan policy", () => {
  it("allows runtime-composed values without allowing static credentials", () => {
    assert.equal(isAllowedSecretScanValue("${encodeURIComponent(password)}@127.0.0.1"), true);
    assert.equal(isAllowedSecretScanValue("actual-static-credential@127.0.0.1"), false);
  });

  it("allows generated HTTP toast variants without globally allowing the same value", () => {
    const variant = ["DELETE", "409", "last-auth-method-unlink-forbidden"].join("_");

    assert.equal(
      isAllowedSecretScanValue(variant, "apps/backend/auth/auth-app-api/contracts/toast/auth-app-api.toast-rules.generated.json"),
      true,
    );
    assert.equal(
      isAllowedSecretScanValue(
        variant,
        "libs/frontend/api-client/lib/src/generated/toast/auth-app-api.toast-rules.frontend.generated.json",
      ),
      true,
    );
    assert.equal(isAllowedSecretScanValue(variant, "src/runtime-config.json"), false);
  });

  // The allowance used to be a filename-suffix match, so anything anywhere named
  // like a generated toast file inherited it — including a path that climbs out
  // of the generated directory. It is anchored to the two real locations now.
  it("allows generated toast variants only at the anchored generated paths", () => {
    const variant = ["DELETE", "409", "last-auth-method-unlink-forbidden"].join("_");

    assert.equal(isAllowedSecretScanValue(variant, "vendor/auth-app-api.toast-rules.generated.json"), false);
    assert.equal(
      isAllowedSecretScanValue(
        variant,
        "apps/backend/auth/auth-app-api/contracts/toast/../../../../secrets/auth-app-api.toast-rules.generated.json",
      ),
      false,
    );
  });

  it("does not allow token-shaped values in generated toast rules", () => {
    assert.equal(
      isAllowedSecretScanValue(
        ["ghp", "0123456789abcdefghijklmnopqrstuvwxyz", "ABCD"].join("_"),
        "apps/backend/auth/auth-app-api/contracts/toast/auth-app-api.toast-rules.generated.json",
      ),
      false,
    );
  });

  it("allows generated Nest operation identifiers only in generated API and toast artifacts", () => {
    const operationId = ["AgriTechAdminController", "reviewMarketplaceRequestPublication"].join("_");

    assert.equal(
      isAllowedSecretScanValue(operationId, "apps/backend/admin/admin-app-api/contracts/openapi/admin-app-api.json"),
      true,
    );
    assert.equal(
      isAllowedSecretScanValue(operationId, "libs/common/api-contracts/lib/src/generated/admin-app-api.ts"),
      true,
    );
    assert.equal(
      isAllowedSecretScanValue(
        operationId,
        "apps/backend/admin/admin-app-api/contracts/toast/admin-app-api.toast-rules.generated.json",
      ),
      true,
    );
    assert.equal(
      isAllowedSecretScanValue(
        operationId,
        "libs/frontend/api-client/lib/src/generated/toast/admin-app-api.toast-rules.frontend.generated.json",
      ),
      true,
    );
    assert.equal(isAllowedSecretScanValue(operationId, "src/runtime-config.ts"), false);
  });

  it("allows migration class identifiers only in component evidence", () => {
    const migration = ["Migration20260810138000", "AddMarketplaceEngagement"].join("");

    assert.equal(
      isAllowedSecretScanValue(
        migration,
        "libs/backend/postgres/main/agritech/lib/src/repositories/marketplace-engagement.component-spec.ts",
      ),
      true,
    );
    assert.equal(isAllowedSecretScanValue(migration, "src/runtime-config.ts"), false);
  });

  it("calculates entropy for the native high-entropy rule", () => {
    assert.equal(secretValueEntropy("aaaaaaaa"), 0);
    assert.ok(secretValueEntropy("abcdefghijklmnopqrstuvwxyz0123456789") > 4.4);
  });

  it("ignores local Claude worktrees without excluding repository Claude configuration", () => {
    assert.equal(isSecretScanIgnoredPath(".claude/worktrees/feature/src/config.ts"), true);
    assert.equal(isSecretScanIgnoredPath(".claude/settings.json"), false);
  });
});
