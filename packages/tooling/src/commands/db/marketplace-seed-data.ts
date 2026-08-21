import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";
import {
  buyerEmail,
  demoMarketplaceBuyerOrganizations,
  demoMarketplaceIdentities,
  demoMarketplaceSuppliers,
  farmerEmail,
  marketplaceFixtureTaxId,
  marketplaceFixtureUuid,
  marketplaceSupplierOwner,
  marketplaceSupplierSlug,
  sellerEmail,
  supplierPartnerIdForSlug,
  supplierPartnerKey,
} from "./marketplace-seed-roster.ts";

/**
 * DehqonHub demo marketplace fixture.
 *
 * The review logins published on the marketplace banner could sign in and
 * browse, but every commercial action answered 403 or 404. Two reasons: the
 * repository gates buying on an approved `buyer` organization plus a verified
 * marketplace role and selling on an approved `supplier` one, and the catalog
 * those actions resolve against was the in-memory demo dataset rather than rows
 * a cart can point at. This fixture persists that dataset for the default tenant
 * and hands every login in `marketplace-seed-roster` the organizations and
 * verification the gates ask for, so a reviewer can walk a listing all the way
 * to a signed contract as any of them.
 *
 * Postgres only, because the marketplace repository has no MongoDB counterpart.
 */

export {
  buyerEmail,
  farmerEmail,
  marketplaceFixtureUuid,
  sellerEmail,
  supplierPartnerIdForSlug,
  supplierPartnerKey,
} from "./marketplace-seed-roster.ts";

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
   * Optional, as on `Product` and as in the `name_ru` / `name_uz` /
   * `name_uz_cyrl` columns: a catalog row may carry only its own language. Every
   * demo product happens to name all four, and requiring it here only forced a
   * fabricated translation.
   */
  nameRu?: string;
  nameUz?: string;
  nameUzCyrl?: string;
  category: string;
  description: string;
  /**
   * Root-relative photographs served from the user app's `public/` tree. The
   * `products.images` column is uncapped jsonb, but the demo rows stay at one or
   * two so a published snapshot never approaches the five-asset check constraint
   * on `marketplace_listing_publications`.
   */
  images: readonly string[];
  /** The owning partner's id, which is what a cart and a checkout resolve. */
  supplierId: string;
  supplierName: string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  /**
   * Whether a buyer may request a sample, which is a column on `products` and
   * not a property the reader can infer. Left unwritten it defaults to `false`,
   * so every seeded input listing answered "no samples" while the catalog said
   * otherwise, and the public catalog's `sampleAvailable` filter had nothing to
   * match on the product side.
   */
  sampleAvailable: boolean;
  region: string;
  /**
   * Photographs held in object storage, named by media fixture key. Only rows a
   * seller created carry any; the demo dataset's photographs are checked-in
   * files. When the seed reaches the bucket these replace `images`, and when it
   * does not `images` stands.
   */
  uploadedImageKeys?: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Every organization a listing may be sold through, in roster order.
 *
 * It is no longer derived from the catalog. A produce co-operative sells only
 * harvests, which live in `produce_listings` rather than in `products`, so a
 * catalog-derived list could not name one at all — and the roster has to declare
 * the owner anyway, because the database resolves a selling party through that
 * owner's membership and verification.
 *
 * The catalog is checked against the roster instead of the other way round: a
 * product naming a supplier nobody owns would publish under a seller profile the
 * seed never wrote, and `marketplaceSupplierOwner` says which product is at
 * fault rather than leaving a foreign key to fail unnamed.
 */
export const catalogSuppliers: readonly { name: string; region: string; slug: string }[] =
  demoMarketplaceSuppliers.map((supplier) => ({
    name: supplier.legalName,
    region: supplier.region,
    slug: supplier.slug,
  }));

for (const product of DemoProducts) {
  marketplaceSupplierOwner(product.supplierName);
}

/**
 * Organizations a reviewer buys and sells through. The trade name doubles as the
 * legal name so a listing on screen can be matched to the organization behind
 * it, and the tax ids are one obviously synthetic run — these are demo records,
 * and a plausible-looking INN would belong to a real company.
 */
export const demoMarketplacePartners: readonly DemoPartnerFixture[] = [
  ...demoMarketplaceSuppliers.map((supplier) => ({
    id: marketplaceFixtureUuid(supplierPartnerKey(supplier.slug)),
    taxId: marketplaceFixtureTaxId(supplierPartnerKey(supplier.slug)),
    ownerEmail: supplier.ownerEmail,
    kind: "supplier" as const,
    legalName: supplier.legalName,
    phone: supplier.phone,
    region: supplier.region,
  })),
  ...demoMarketplaceBuyerOrganizations.map((organization) => ({
    id: marketplaceFixtureUuid(organization.partnerKey),
    taxId: marketplaceFixtureTaxId(organization.partnerKey),
    ownerEmail: organization.ownerEmail,
    kind: "buyer" as const,
    legalName: organization.legalName,
    phone: organization.phone,
    region: organization.region,
  })),
];

/**
 * Marketplace roles, which decide what each login may do at all: `farmer` both
 * buys and sells, `seller` only sells, `buyer` only buys. Documents stay empty —
 * a demo row pointing at storage keys that hold nothing would read as a broken
 * upload rather than a fixture.
 */
export const demoMarketplaceVerifications: readonly DemoVerificationFixture[] = demoMarketplaceIdentities.map(
  (identity) => ({
    id: marketplaceFixtureUuid(identity.verificationKey),
    ownerEmail: identity.email,
    role: identity.role,
    level: identity.level,
    oneIdLinked: identity.oneIdLinked,
  }),
);

/**
 * The demo catalog as rows. The API serves the same dataset from memory when a
 * tenant has published nothing, but only a row can be added to a cart, sampled
 * or reviewed, and only a row's `supplier_id` can name the partner a contract is
 * drawn against — so the seed writes it with the partner ids substituted for the
 * in-memory supplier slugs.
 */
const demoCatalogProducts: readonly DemoProductFixture[] = DemoProducts.map((product) => ({
  id: product.id,
  name: product.name,
  nameRu: product.nameRu,
  nameUz: product.nameUz,
  nameUzCyrl: product.nameUzCyrl,
  category: product.category,
  description: product.description,
  images: product.images,
  supplierId: supplierPartnerIdForSlug(product.supplierId),
  supplierName: product.supplierName,
  priceUzs: product.priceUzs,
  unit: product.unit,
  stockQuantity: product.stockQuantity,
  sampleAvailable: product.sampleAvailable,
  region: product.region,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
}));

/**
 * Catalogue rows a seller created through the marketplace's own form, rather
 * than rows of the in-memory demo dataset.
 *
 * `DemoProducts` is what the API serves when a tenant has published nothing, so
 * it is deliberately not where these belong: each of these was typed into
 * `POST /marketplace/listings` on a seeded tenant, which is a different fact
 * about the deployment and one worth showing. Two of them are published; the
 * third is a catalogue row whose seller has not published it yet, which is the
 * only place in the fixture that state appears.
 *
 * One carries photographs that are uploaded objects rather than checked-in
 * files. It names them by media fixture key; the seed resolves each key to a
 * `/marketplace/media/<id>` path when object storage accepted the bytes, and
 * falls back to `images` when it did not.
 */
export interface DemoSellerCreatedProductFixture extends DemoProductFixture {
  /** The catalog supplier slug, which resolves the seller profile and partner. */
  supplierSlug: string;
  /**
   * Photographs held in object storage, in publication order. Empty for a row
   * whose photographs are checked-in files.
   */
  uploadedImageKeys: readonly string[];
  /** Whether the seed also writes an approved public snapshot for it. */
  published: boolean;
}

const sellerCreatedPhoto = (name: string): string => `/media/marketplace/${name}.webp`;

const sellerCreatedAt = new Date("2026-08-04T09:20:00.000Z");

const sellerCreatedProductSeeds: readonly (Omit<
  DemoSellerCreatedProductFixture,
  "id" | "supplierId" | "supplierName" | "createdAt" | "updatedAt"
> & { supplierName: string })[] = [
  {
    name: "Self-propelled greenhouse mist blower, 200 L",
    nameRu: "Самоходный туманообразователь для теплиц, 200 л",
    nameUz: "Issiqxona uchun o'zi yuruvchi tuman purkagich, 200 l",
    nameUzCyrl: "Иссиқхона учун ўзи юрувчи туман пуркагич, 200 л",
    category: "equipment",
    description:
      "Self-propelled mist blower for glasshouse and tunnel crops: 200 litre tank, adjustable droplet size, electric drive on rails or wheels. Serviced and demonstrated at the buyer's greenhouse.",
    images: [sellerCreatedPhoto("pesticide-spraying"), sellerCreatedPhoto("knapsack-sprayer")],
    uploadedImageKeys: [
      "listing:trailed-sprayer:1",
      "listing:trailed-sprayer:2",
      "listing:trailed-sprayer:3",
      "listing:trailed-sprayer:4",
      "listing:trailed-sprayer:5",
    ],
    published: true,
    supplierName: "Namangan Issiqxona Servis",
    supplierSlug: marketplaceSupplierSlug("Namangan Issiqxona Servis"),
    priceUzs: 42_000_000,
    unit: "1 pc",
    stockQuantity: 3,
    sampleAvailable: false,
    region: "Samarqand",
  },
  {
    name: "Winter wheat seed “Krasnodar 99”",
    nameRu: "Семена пшеницы озимой «Краснодар 99»",
    nameUz: "Kuzgi bug'doy urug'i «Krasnodar 99»",
    nameUzCyrl: "Кузги буғдой уруғи «Краснодар 99»",
    category: "seed",
    description:
      "Certified first-reproduction winter wheat seed, 2026 season, germination 96 percent. State certificate travels with every consignment.",
    images: [sellerCreatedPhoto("wheat-grain"), sellerCreatedPhoto("winter-wheat-field")],
    uploadedImageKeys: [],
    published: true,
    supplierName: "Andijon Urug'chilik",
    supplierSlug: marketplaceSupplierSlug("Andijon Urug'chilik"),
    priceUzs: 9_800_000,
    unit: "1 t",
    stockQuantity: 48,
    sampleAvailable: true,
    region: "Andijon",
  },
  {
    // Deliberately unpublished. The seller's cabinet shows it as a draft, the
    // public catalogue does not show it at all, and that pairing is the only
    // way a reviewer can see what publishing actually changes.
    name: "Humate organic fertilizer, 25 kg",
    nameRu: "Гуминовое органическое удобрение, 25 кг",
    nameUz: "Gumat asosidagi organik o'g'it, 25 kg",
    nameUzCyrl: "Гумат асосидаги органик ўғит, 25 кг",
    category: "fertilizer",
    description:
      "Screened leonardite humate in 25 kg sacks, for pre-sowing soil treatment and drip fertigation. Co-operative's own production, sold by the pallet.",
    images: [sellerCreatedPhoto("fertilizer-granules")],
    uploadedImageKeys: [],
    published: false,
    supplierName: "Farg'ona Dehqon Kooperativi",
    supplierSlug: marketplaceSupplierSlug("Farg'ona Dehqon Kooperativi"),
    priceUzs: 250_000,
    unit: "25 kg",
    stockQuantity: 5,
    sampleAvailable: false,
    region: "Farg'ona",
  },
];

export const demoMarketplaceSellerCreatedProducts: readonly DemoSellerCreatedProductFixture[] =
  sellerCreatedProductSeeds.map((seed) => {
    marketplaceSupplierOwner(seed.supplierName);
    return {
      ...seed,
      createdAt: sellerCreatedAt,
      id: marketplaceFixtureUuid(`product:${seed.name}`),
      supplierId: supplierPartnerIdForSlug(seed.supplierSlug),
      updatedAt: sellerCreatedAt,
    };
  });

/**
 * Every `products` row the seed writes: the demo dataset plus what the sellers
 * added themselves. Kept as one list because the writer, the counters and the
 * publication chain all treat a catalogue row the same way whoever created it.
 */
export const demoMarketplaceProducts: readonly DemoProductFixture[] = [
  ...demoCatalogProducts,
  ...demoMarketplaceSellerCreatedProducts,
];
