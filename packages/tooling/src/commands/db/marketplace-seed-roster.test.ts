// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";
import { demoMarketplacePartners, demoMarketplaceVerifications } from "./marketplace-seed-data.ts";
import {
  demoMarketplaceBuyerOrganizations,
  demoMarketplaceIdentities,
  demoMarketplaceSuppliers,
  marketplaceIdentity,
  marketplaceSupplierBySlug,
  marketplaceSupplierOwner,
  marketplaceSupplierSlug,
} from "./marketplace-seed-roster.ts";
import { buildSeedUsers } from "./seed-data.ts";

/**
 * The roster is the only place that says who trades and through which
 * organization, and the database checks the two against each other on every
 * commercial insert: a party resolves only against an active membership on an
 * approved organization whose owner holds a verified role the policy admits for
 * that side. A roster that contradicts itself therefore fails inside the seed
 * transaction with a bare constraint name, taking the accounts down with it —
 * so each assertion below restates one of those pairings where the failure can
 * still name the identity at fault.
 */

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

describe("demo marketplace roster", () => {
  it("populates the marketplace with more than a three-account demonstration", () => {
    assert.ok(demoMarketplaceIdentities.length >= 15, `only ${demoMarketplaceIdentities.length} logins trade`);
    for (const role of ["farmer", "seller", "buyer"] as const) {
      const holders = demoMarketplaceIdentities.filter((identity) => identity.role === role);
      assert.ok(holders.length >= 3, `only ${holders.length} logins hold the ${role} role`);
    }
  });

  it("gives every identity the organizations its role may hold and no others", () => {
    // `marketplaceBuyerRoles` is ('farmer', 'buyer') and `marketplaceSellerRoles`
    // is ('farmer', 'seller'). A buyer login holding a supplier organization, or a
    // seller login holding a buyer one, is a party no trigger can resolve.
    for (const identity of demoMarketplaceIdentities) {
      const maySell = identity.role === "farmer" || identity.role === "seller";
      const mayBuy = identity.role === "farmer" || identity.role === "buyer";
      assert.equal(
        identity.suppliers.length > 0,
        maySell,
        `${identity.email} is a ${identity.role} and holds ${identity.suppliers.length} selling organizations`,
      );
      assert.equal(identity.buyer !== null, mayBuy, `${identity.email} is a ${identity.role} with the wrong buying side`);
      // Only a farmer may publish produce, and only through a farm of its own.
      assert.equal(identity.farm !== null, identity.role === "farmer", `${identity.email} holds the wrong farm state`);
    }
  });

  it("trades only in regions the seed recognises", () => {
    for (const identity of demoMarketplaceIdentities) {
      assert.ok(regions.has(identity.region), `${identity.email} trades from ${identity.region}`);
      for (const organization of [...identity.suppliers, ...(identity.buyer ? [identity.buyer] : [])]) {
        assert.ok(regions.has(organization.region), `${organization.legalName} sits in ${organization.region}`);
      }
      if (identity.farm) {
        assert.ok(regions.has(identity.farm.region), `${identity.email}'s farm sits in ${identity.farm.region}`);
        assert.ok(Number(identity.farm.farmSizeHectares) > 0, `${identity.email}'s farm has no area`);
        assert.ok(identity.farm.crops.length > 0, `${identity.email}'s farm grows nothing`);
      }
    }
  });

  it("publishes a password a reviewer can derive from the address", () => {
    // The credentials are public on purpose, and their convention is the reason a
    // reviewer handed an unfamiliar address can still sign in.
    for (const identity of demoMarketplaceIdentities) {
      const mailbox = identity.email.split("@")[0] ?? "";
      assert.match(identity.email, /^[a-z]+@demo\.dehqonhub\.uz$/u, `${identity.email} is not a demo address`);
      assert.equal(
        identity.password,
        `Demo${mailbox.charAt(0).toUpperCase()}${mailbox.slice(1)}2026`,
        `${identity.email} breaks the documented password convention`,
      );
    }
  });

  it("keeps every identifier the seed upserts on unique", () => {
    for (const [label, values] of [
      ["user id", demoMarketplaceIdentities.map((identity) => identity.userId)],
      ["email", demoMarketplaceIdentities.map((identity) => identity.email)],
      ["display name", demoMarketplaceIdentities.map((identity) => identity.displayName)],
      ["verification key", demoMarketplaceIdentities.map((identity) => identity.verificationKey)],
      ["supplier legal name", demoMarketplaceSuppliers.map((supplier) => supplier.legalName)],
      ["supplier slug", demoMarketplaceSuppliers.map((supplier) => supplier.slug)],
      ["buyer legal name", demoMarketplaceBuyerOrganizations.map((organization) => organization.legalName)],
      ["buyer partner key", demoMarketplaceBuyerOrganizations.map((organization) => organization.partnerKey)],
      ["partner id", demoMarketplacePartners.map((partner) => partner.id)],
      // `ux__agritech_partners__tenant_kind_tax` is unique per kind, but a single
      // run keeps them globally distinct so a kind change cannot collide.
      ["partner tax id", demoMarketplacePartners.map((partner) => partner.taxId)],
      ["partner phone", demoMarketplacePartners.map((partner) => partner.phone)],
      // `ux__farmers__tenant_phone` is a real unique constraint on the farm row.
      ["farm phone", demoMarketplaceIdentities.flatMap((identity) => (identity.farm ? [identity.farm.phone] : []))],
      ["verification id", demoMarketplaceVerifications.map((verification) => verification.id)],
    ] as const) {
      assert.equal(new Set(values).size, values.length, `two rows share a ${label}`);
    }
  });

  it("keeps the three original review logins on the ids and keys they were seeded under", () => {
    // A new id here would leave the seeded organizations, verifications, contracts
    // and reviews of the original demo accounts orphaned behind their old rows.
    for (const [email, userId, verificationKey] of [
      ["dehqon@demo.dehqonhub.uz", "30000000-0000-0000-0000-000000000011", "verification:farmer"],
      ["sotuvchi@demo.dehqonhub.uz", "30000000-0000-0000-0000-000000000012", "verification:seller"],
      ["xaridor@demo.dehqonhub.uz", "30000000-0000-0000-0000-000000000013", "verification:buyer"],
    ] as const) {
      const identity = marketplaceIdentity(email);
      assert.equal(identity.userId, userId);
      assert.equal(identity.verificationKey, verificationKey);
    }
    assert.equal(marketplaceIdentity("dehqon@demo.dehqonhub.uz").buyer?.partnerKey, "partner:buyer:farmer");
    assert.equal(marketplaceIdentity("xaridor@demo.dehqonhub.uz").buyer?.partnerKey, "partner:buyer:buyer");
  });

  it("owns every supplier the catalog names, under the slug the catalog carries", () => {
    // A product whose supplier nobody owns would publish under a seller profile
    // the seed never writes, and the slug is the only thing tying the two together.
    for (const product of DemoProducts) {
      const owner = marketplaceSupplierOwner(product.supplierName);
      assert.ok(owner.email, `${product.name} has no owner`);
      assert.equal(marketplaceSupplierSlug(product.supplierName), product.supplierId);
      assert.equal(marketplaceSupplierBySlug(product.supplierId).ownerEmail, owner.email);
    }
  });

  it("spreads the catalogue across more sellers than the original three logins", () => {
    const originals = new Set(["dehqon@demo.dehqonhub.uz", "sotuvchi@demo.dehqonhub.uz", "xaridor@demo.dehqonhub.uz"]);
    const rostered = DemoProducts.filter(
      (product) => !originals.has(marketplaceSupplierOwner(product.supplierName).email),
    );
    assert.ok(rostered.length >= 15, `only ${rostered.length} catalog rows belong to a further seller`);
    assert.ok(
      new Set(rostered.map((product) => product.supplierName)).size >= 6,
      "the further sellers all trade through one organization",
    );
  });

  it("turns every identity into an account the seed can sign in as", () => {
    const users = buildSeedUsers("Seed@Roster1!", "en");
    const byEmail = new Map(users.map((user) => [user.email, user] as const));
    for (const identity of demoMarketplaceIdentities) {
      const user = byEmail.get(identity.email);
      assert.ok(user, `${identity.email} is documented but never seeded`);
      assert.equal(user.id, identity.userId);
      assert.equal(user.password, identity.password);
      assert.equal(user.displayName, identity.displayName);
      assert.equal(user.role, "user");
    }
    assert.equal(new Set(users.map((user) => user.id)).size, users.length, "two seed users share an id");
  });

  it("verifies every identity in the role it actually trades in", () => {
    const byEmail = new Map(demoMarketplaceVerifications.map((verification) => [verification.ownerEmail, verification]));
    for (const identity of demoMarketplaceIdentities) {
      const verification = byEmail.get(identity.email);
      assert.ok(verification, `${identity.email} trades without a verification`);
      assert.equal(verification.role, identity.role);
      assert.ok(["basic", "verified", "trusted"].includes(verification.level));
    }
    // A single tier everywhere would leave the level badge untested.
    assert.ok(new Set(demoMarketplaceVerifications.map((verification) => verification.level)).size === 3);
  });

  it("writes one organization row per declared organization, with the right kind", () => {
    const suppliers = demoMarketplacePartners.filter((partner) => partner.kind === "supplier");
    const buyers = demoMarketplacePartners.filter((partner) => partner.kind === "buyer");
    assert.equal(suppliers.length, demoMarketplaceSuppliers.length);
    assert.equal(buyers.length, demoMarketplaceBuyerOrganizations.length);
    for (const partner of demoMarketplacePartners) {
      assert.match(partner.taxId, /^3[0-9]{8}$/u, `${partner.legalName} carries a malformed tax id`);
      assert.match(partner.phone, /^\+998 \d{2} \d{3}-\d{2}-\d{2}$/u, `${partner.legalName} carries a malformed phone`);
      assert.ok(regions.has(partner.region), `${partner.legalName} sits in ${partner.region}`);
      const owner = marketplaceIdentity(partner.ownerEmail);
      assert.ok(
        partner.kind === "buyer" ? owner.role !== "seller" : owner.role !== "buyer",
        `${partner.legalName} is owned by a ${owner.role} login`,
      );
    }
  });
});
