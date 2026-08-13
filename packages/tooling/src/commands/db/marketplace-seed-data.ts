import { createHash } from "node:crypto";

import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";

/**
 * DehqonHub demo marketplace fixture.
 *
 * The three review logins published on the marketplace banner could sign in and
 * browse, but every commercial action answered 403 or 404. Two reasons: the
 * repository gates buying on an approved `buyer` organization plus a verified
 * marketplace role and selling on an approved `supplier` one, and the catalog
 * those actions resolve against was the in-memory demo dataset rather than rows
 * a cart can point at. This fixture persists that dataset for the default tenant
 * and hands each review login the organization and verification the gates ask
 * for, so a reviewer can walk a listing all the way to a signed contract.
 *
 * Postgres only, because the marketplace repository has no MongoDB counterpart.
 */

const fixtureNamespace = "dehqonhub-demo-marketplace";

/**
 * Every row here needs an id that survives re-seeding, and a product carries its
 * supplier's partner id, so the two have to agree without a lookup table that
 * can drift. Hashing the fixture key into a v5-shaped uuid gives both: the same
 * key always resolves to the same id, and a new supplier cannot renumber the
 * existing ones.
 */
export function marketplaceFixtureUuid(key: string): string {
  const hex = createHash("sha1").update(`${fixtureNamespace}:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface DemoPartnerFixture {
  id: string;
  /** Resolved to an `auth_users` id by the seed, which owns the account list. */
  ownerEmail: string;
  kind: "buyer" | "supplier";
  legalName: string;
  taxId: string;
  phone: string;
  region: string;
}

export interface DemoVerificationFixture {
  id: string;
  ownerEmail: string;
  role: "farmer" | "seller" | "buyer";
  level: "basic" | "verified" | "trusted";
  oneIdLinked: boolean;
}

export interface DemoProductFixture {
  id: string;
  name: string;
  /**
   * Optional, as on `Product` and as in the `name_ru` / `name_uz` columns: a
   * catalog row may carry only its own language. Every demo product happens to
   * name all three, and requiring it here only forced a fabricated translation.
   */
  nameRu?: string;
  nameUz?: string;
  category: string;
  description: string;
  /** The owning partner's id, which is what a cart and a checkout resolve. */
  supplierId: string;
  supplierName: string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  region: string;
  createdAt: Date;
  updatedAt: Date;
}

const farmerEmail = "dehqon@demo.dehqonhub.uz";
const sellerEmail = "sotuvchi@demo.dehqonhub.uz";
const buyerEmail = "xaridor@demo.dehqonhub.uz";

/**
 * Who owns which catalog supplier. The farmer login owns the co-operative that
 * lists produce, which is what makes it a seller as well as a buyer, and the
 * seller login owns the input and machinery suppliers. Anything not named here
 * falls to the seller login, so adding a demo supplier needs no edit.
 */
const catalogSupplierOwners: Record<string, string> = {
  "Dehqon Bozori Kooperativi": farmerEmail,
};

/**
 * The fixture key behind the organization a catalog listing is sold through. It
 * is the catalog's own supplier slug, not the trade name on screen: the name is
 * display text, and correcting the typography of `Urug'chilik` renumbered the
 * partner every listing points at, while the slug survives any such edit.
 */
const supplierPartnerKey = (supplierSlug: string): string => `partner:supplier:${supplierSlug}`;

/** The partner id a catalog listing is sold through — see `marketplaceFixtureUuid`. */
const supplierPartnerId = (supplierSlug: string): string => marketplaceFixtureUuid(supplierPartnerKey(supplierSlug));

/**
 * Nine obviously synthetic digits, derived from the same key as the row's id so
 * that the two always move together. A positional numbering read better but
 * collided with `ux__agritech_partners__tenant_kind_tax` as soon as a key did
 * change: the replacement row arrives with a new id, the row it supersedes keeps
 * its number, and the seed aborted on any database seeded before the change.
 */
function fixtureTaxId(key: string): string {
  const hex = createHash("sha1").update(`${fixtureNamespace}:tax:${key}`).digest("hex").slice(0, 10);
  return `3${String(Number.parseInt(hex, 16) % 100_000_000).padStart(8, "0")}`;
}

/** Distinct suppliers in catalog order, so their fixture numbering is stable. */
const catalogSuppliers = DemoProducts.reduce<{ name: string; region: string; slug: string }[]>((suppliers, product) => {
  if (!suppliers.some((supplier) => supplier.slug === product.supplierId)) {
    suppliers.push({ name: product.supplierName, region: product.region, slug: product.supplierId });
  }
  return suppliers;
}, []);

/**
 * Organizations a reviewer buys and sells through. The trade name doubles as the
 * legal name so a listing on screen can be matched to the organization behind
 * it, and the tax ids are one obviously synthetic run — these are demo records,
 * and a plausible-looking INN would belong to a real company.
 */
export const demoMarketplacePartners: readonly DemoPartnerFixture[] = [
  ...catalogSuppliers.map((supplier) => ({
    key: supplierPartnerKey(supplier.slug),
    ownerEmail: catalogSupplierOwners[supplier.name] ?? sellerEmail,
    kind: "supplier" as const,
    legalName: supplier.name,
    region: supplier.region,
  })),
  {
    key: "partner:buyer:farmer",
    ownerEmail: farmerEmail,
    kind: "buyer" as const,
    legalName: "Dehqon Demo Xo'jaligi",
    region: "Toshkent",
  },
  {
    key: "partner:buyer:buyer",
    ownerEmail: buyerEmail,
    kind: "buyer" as const,
    legalName: "Xaridor Demo Savdo",
    region: "Toshkent",
  },
].map(({ key, ...partner }, index) => ({
  ...partner,
  id: marketplaceFixtureUuid(key),
  taxId: fixtureTaxId(key),
  phone: `+998 71 200-00-${String(index + 1).padStart(2, "0")}`,
}));

/**
 * Marketplace roles, which decide what each login may do at all: `farmer` both
 * buys and sells, `seller` only sells, `buyer` only buys. Documents stay empty —
 * a demo row pointing at storage keys that hold nothing would read as a broken
 * upload rather than a fixture.
 */
export const demoMarketplaceVerifications: readonly DemoVerificationFixture[] = [
  {
    id: marketplaceFixtureUuid("verification:farmer"),
    ownerEmail: farmerEmail,
    role: "farmer",
    level: "trusted",
    oneIdLinked: true,
  },
  {
    id: marketplaceFixtureUuid("verification:seller"),
    ownerEmail: sellerEmail,
    role: "seller",
    level: "verified",
    oneIdLinked: true,
  },
  {
    id: marketplaceFixtureUuid("verification:buyer"),
    ownerEmail: buyerEmail,
    role: "buyer",
    level: "basic",
    oneIdLinked: false,
  },
];

/**
 * The demo catalog as rows. The API serves the same dataset from memory when a
 * tenant has published nothing, but only a row can be added to a cart, sampled
 * or reviewed, and only a row's `supplier_id` can name the partner a contract is
 * drawn against — so the seed writes it with the partner ids substituted for the
 * in-memory supplier slugs.
 */
export const demoMarketplaceProducts: readonly DemoProductFixture[] = DemoProducts.map((product) => ({
  id: product.id,
  name: product.name,
  nameRu: product.nameRu,
  nameUz: product.nameUz,
  category: product.category,
  description: product.description,
  supplierId: supplierPartnerId(product.supplierId),
  supplierName: product.supplierName,
  priceUzs: product.priceUzs,
  unit: product.unit,
  stockQuantity: product.stockQuantity,
  region: product.region,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
}));
