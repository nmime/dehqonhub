## 1. Durable Contract

- [x] 1.1 Add `REQ-AGRITECH-ROUTING-015` to the durable AgriTech specification.
- [x] 1.2 Add the high-risk API profile, exact project ownership, Cucumber disposition, and Vitest/contract evidence to the version 3 sidecar.

## 2. Provider Routes

- [x] 2.1 Remove the `/agritech` prefix from user AgriTech, farmer, catalog, order, and payment controllers.
- [x] 2.2 Remove the nested `agritech` prefix from the guarded admin controller while retaining `/admin`, guards, and endpoint permissions.
- [x] 2.3 Add user/admin API route-metadata tests covering the complete controller prefix inventory and absence of the legacy namespace.

## 3. Product Clients

- [x] 3.1 Mount the AgriTech user workflow at `/`, remove `/marketplace`, update payment returns/navigation, and add an explicit localized not-found state.
- [x] 3.2 Mount the AgriTech operator workflow at `/admin`, retain the generic dashboard at `/admin/dashboard`, and remove `/admin/agritech` from routing/navigation.
- [x] 3.3 Update user/admin frontend API wrappers and route tests for the canonical resource paths.

## 4. Generated Contracts and Documentation

- [x] 4.1 Regenerate OpenAPI documents, shared contract types, frontend generated clients, and API presentation artifacts from source.
- [x] 4.2 Update the canonical AgriTech platform guide with the product-root route contract, breaking migration, and rollback boundary.
- [x] 4.3 Confirm stale HTTP path scans exclude domain identifiers and the intentional Telegram `/agritech` command while rejecting legacy web/API paths.

## 5. Verification and Delivery

- [x] 5.1 Run formatting, focused provider/client builds and tests, frontend FSD, API contract/client/presentation freshness, and OpenAPI lint.
- [x] 5.2 Run `spec:validate`, strict OpenSpec validation, impact selection, and the mapped exact-revision evidence lane.
- [x] 5.3 Run `git diff --check`, review generated/source diffs, verify rollback needs no data action, and publish the exact validated revision.
