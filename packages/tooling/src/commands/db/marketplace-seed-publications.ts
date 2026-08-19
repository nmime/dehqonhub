import { createHash } from "node:crypto";

import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";
import {
  buyerEmail,
  catalogSupplierOwners,
  catalogSuppliers,
  farmerEmail,
  marketplaceFixtureUuid,
  sellerEmail,
  supplierPartnerKey,
} from "./marketplace-seed-data.ts";

/**
 * The published half of the DehqonHub demo marketplace.
 *
 * A `products` row is not a listing. The public catalog reads
 * `marketplace_listing_publications` joined to a moderated seller profile, and a
 * cart, an offer and a contract all resolve a publication id rather than a
 * product id — so seeding the catalog alone left a reviewer signing in to an
 * empty shop. This module writes the rest of the chain the repository would
 * create: seller profiles with approved revisions, one approved publication per
 * listing, the farm and harvest behind the produce section, and a reverse auction
 * that already has competing offers on it.
 *
 * Everything is derived from stable fixture keys, so re-seeding updates rows in
 * place instead of duplicating them, and the ids survive a deployment.
 */

const fixtureNamespace = "dehqonhub-demo-marketplace";

/** Stable content hash standing in for the repository's canonical fingerprint. */
const fingerprint = (key: string): string =>
  createHash("sha256").update(`${fixtureNamespace}:content:${key}`).digest("hex");

/**
 * `ck__marketplace_listing_publications__content` refuses a snapshot carrying
 * more than five assets. The seed writes every publication inside one
 * transaction, so a sixth photo would abort the whole fixture with a bare
 * constraint name; failing here instead names the listing that is over budget.
 */
export const maxPublicImages = 5;

/** Exported so a test can prove the budget is enforced rather than read the code. */
export const publicImages = (key: string, images: readonly string[]): readonly string[] => {
  if (images.length > maxPublicImages) {
    throw new Error(
      `Demo marketplace publication ${key} carries ${images.length} images; the public snapshot allows at most ${maxPublicImages}.`,
    );
  }
  return images;
};

/**
 * Root-relative photograph served from the user app's `public/` tree. Not under
 * `/marketplace/`: that prefix is a reserved API namespace which the Vite dev
 * proxy and `docker/nginx-fullstack.conf` both route to the user API.
 */
const photo = (name: string): string => `/media/marketplace/${name}.webp`;

export interface DemoPublicSellerFixture {
  id: string;
  partnerId: string;
  ownerEmail: string;
  displayName: string;
  description: string;
  region: string;
  revisionId: string;
  contentFingerprint: string;
}

export interface DemoListingPublicationFixture {
  id: string;
  ownerEmail: string;
  sellerPublicId: string;
  sellerRevisionId: string;
  sourceKind: "product" | "produce";
  productId: string | null;
  produceListingId: string | null;
  section: "equipment" | "seeds" | "produce";
  title: string;
  titleRu: string | null;
  titleUz: string | null;
  titleUzCyrl: string | null;
  description: string;
  category: string | null;
  crop: string | null;
  grade: string | null;
  unit: string;
  region: string;
  /** The approved public snapshot's safe assets, capped at five by `publicImages`. */
  images: readonly string[];
  contentFingerprint: string;
  idempotencyKey: string;
  requestFingerprint: string;
  publishedAt: Date;
}

export interface DemoFarmerFixture {
  id: string;
  ownerEmail: string;
  firstName: string;
  lastName: string;
  phone: string;
  region: string;
  district: string;
  farmSizeHectares: string;
  crops: readonly string[];
}

export interface DemoProduceListingFixture {
  id: string;
  farmerId: string;
  ownerEmail: string;
  crop: string;
  grade: "A" | "B" | "C";
  quantityKg: number;
  availableQuantityKg: number;
  pricePerKgUzs: number;
  region: string;
  sampleAvailable: boolean;
  availableFrom: Date;
  availableUntil: Date;
  /** The organization the harvest is sold through, which the binding records. */
  supplierPartnerId: string;
}

export interface DemoListingPromotionFixture {
  id: string;
  publicationId: string;
  sellerPublicId: string;
  sellerPartnerId: string;
  /** The seller-side login that paid for the slot; it holds the membership. */
  actorEmail: string;
  planCode: "catalog_7d" | "catalog_14d" | "catalog_30d";
  /** Fixed by `ck__listing_promotions__plan`, which pairs plan with price. */
  priceUzs: number;
  /** Whole days, also fixed by the plan check: ends_at = starts_at + this. */
  durationDays: number;
  idempotencyKey: string;
  requestFingerprint: string;
  activationReference: string;
}

export interface DemoRequestFixture {
  id: string;
  publicationId: string;
  buyerEmail: string;
  buyerPartnerKey: string;
  buyerDisplayName: string;
  title: string;
  product: string;
  volume: string;
  region: string;
  deadline: string;
  budgetUzs: number;
  requirements: string;
  status: "open" | "offering";
  contentFingerprint: string;
  idempotencyKey: string;
  requestFingerprint: string;
  createdAt: Date;
}

export interface DemoOfferFixture {
  id: string;
  requestId: string;
  requestPublicId: string;
  buyerEmail: string;
  buyerPartnerKey: string;
  sellerEmail: string;
  sellerSupplierSlug: string;
  priceUzs: number;
  deliveryTerms: "pickup" | "seller_delivery" | "by_agreement";
  deliveryPriceUzs: number | null;
  deliveryDays: number;
  deliveryNote: string;
  createdAt: Date;
}

/** Section a catalog category publishes into, mirroring the repository's own map. */
const sectionForCategory = (category: string): "equipment" | "seeds" | null => {
  if (category === "equipment" || category === "irrigation") {
    return "equipment";
  }
  if (category === "seed" || category === "fertilizer" || category === "pesticide") {
    return "seeds";
  }
  return null;
};

export const demoMarketplacePublicSellers: readonly DemoPublicSellerFixture[] = catalogSuppliers.map((supplier) => ({
  id: marketplaceFixtureUuid(`public-seller:${supplier.slug}`),
  partnerId: marketplaceFixtureUuid(supplierPartnerKey(supplier.slug)),
  ownerEmail: catalogSupplierOwners[supplier.name] ?? sellerEmail,
  displayName: supplier.name,
  description: `Demo marketplace profile for ${supplier.name}.`,
  region: supplier.region,
  revisionId: marketplaceFixtureUuid(`public-seller-revision:${supplier.slug}`),
  contentFingerprint: fingerprint(`public-seller:${supplier.slug}`),
}));

const publicSellerBySlug = new Map(
  catalogSuppliers.map((supplier, index) => [supplier.slug, demoMarketplacePublicSellers[index]!] as const),
);

/** The organization a catalog supplier trades through, addressed by its stable slug. */
export const supplierPartnerIdForSlug = (slug: string): string =>
  marketplaceFixtureUuid(supplierPartnerKey(slug));

/**
 * Inputs and machinery. Produce-shaped catalog rows carry the category `other`,
 * which the repository refuses to publish into the produce section, so they are
 * represented by real produce listings further down rather than mislabelled here.
 */
export const demoMarketplaceListingPublications: readonly DemoListingPublicationFixture[] = DemoProducts.flatMap(
  (product, index) => {
    const section = sectionForCategory(product.category);
    const seller = publicSellerBySlug.get(product.supplierId);
    if (!section || !seller) {
      return [];
    }
    const key = `listing-publication:${product.id}`;
    return [
      {
        id: marketplaceFixtureUuid(key),
        ownerEmail: seller.ownerEmail,
        sellerPublicId: seller.id,
        sellerRevisionId: seller.revisionId,
        sourceKind: "product" as const,
        productId: product.id,
        produceListingId: null,
        section,
        title: product.name,
        titleRu: product.nameRu ?? null,
        titleUz: product.nameUz ?? null,
        titleUzCyrl: product.nameUzCyrl ?? null,
        description: product.description,
        category: product.category,
        crop: null,
        grade: null,
        unit: product.unit,
        region: product.region,
        images: publicImages(key, product.images),
        contentFingerprint: fingerprint(key),
        idempotencyKey: `seed:${key}`,
        requestFingerprint: fingerprint(`request:${key}`),
        publishedAt: new Date(`2026-07-${String((index % 27) + 1).padStart(2, "0")}T08:00:00.000Z`),
      },
    ];
  },
);

/**
 * The farm behind the produce section. Publishing produce is gated on the
 * publisher being a farmer whose own organization is the public seller, so the
 * harvest can only be listed by the farmer login.
 */
export const demoMarketplaceFarmer: DemoFarmerFixture = {
  id: marketplaceFixtureUuid("farmer:dehqon"),
  ownerEmail: farmerEmail,
  firstName: "Dehqon",
  lastName: "Demo",
  phone: "+998 71 200-01-00",
  region: "Toshkent",
  district: "Zangiota",
  farmSizeHectares: "12.5",
  crops: ["grape", "melon", "onion", "potato"],
};

/**
 * The organizations a harvest is sold through. All three are owned by the farmer
 * login, because the public catalog joins a produce publication to `farmers` on
 * `farmer.user_id = seller.owner_user_id`: a harvest listed through an
 * organization the farmer does not own never reaches the catalog, however
 * well-formed the rest of the chain is. Splitting the harvest across three gives
 * the produce section more than one seller to filter by.
 */
const produceCooperatives = new Map(
  ["Dehqon Bozori Kooperativi", "Farg'ona Dehqon Kooperativi", "Xorazm Dehqon Kooperativi"].map((displayName) => {
    const seller = demoMarketplacePublicSellers.find((candidate) => candidate.displayName === displayName);
    if (!seller) {
      throw new Error(`Demo marketplace fixture expects a produce co-operative named ${displayName}.`);
    }
    if (seller.ownerEmail !== farmerEmail) {
      throw new Error(`${displayName} lists produce, so it has to be owned by the farmer login.`);
    }
    return [displayName, seller] as const;
  }),
);

/**
 * `produce_listings` has no image column, so a harvest photograph belongs to the
 * public snapshot rather than the source row — which is also why a real
 * `publishProduceListing` publishes assetless. The cottonseed cake carries none
 * on purpose: it keeps the client's category illustration exercised against a
 * live listing instead of only against an empty database.
 *
 * `crop` doubles as the fixture key behind the row's id, so it is the one field
 * here that must never be reworded: an edited crop name arrives as a new listing
 * and leaves the row it replaced published under the old id.
 */
const harvest = [
  {
    crop: "Table grapes, Husayni grade 1",
    cropRu: "Виноград столовый «Хусайни», 1 сорт",
    cropUz: "Uzum «Husayni», 1-navli",
    cropUzCyrl: "Узум «Ҳусайни», 1-навли",
    grade: "A",
    tons: 18,
    pricePerKgUzs: 14_800,
    region: "Samarqand",
    sample: true,
    images: [photo("table-grapes")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2026-11-01T00:00:00.000Z",
  },
  {
    crop: "Dried apricot, export grade",
    cropRu: "Урюк сушёный, экспортный",
    cropUz: "Quritilgan o'rik, eksport sifati",
    cropUzCyrl: "Қуритилган ўрик, экспорт сифати",
    grade: "A",
    tons: 6,
    pricePerKgUzs: 42_500,
    region: "Farg'ona",
    sample: true,
    images: [photo("dried-apricots")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2026-11-01T00:00:00.000Z",
  },
  {
    crop: "Melon, Gurvak",
    cropRu: "Дыня «Гурвак»",
    cropUz: "Qovun «G'urvak»",
    cropUzCyrl: "Қовун «Ғурвак»",
    grade: "B",
    tons: 24,
    pricePerKgUzs: 5_600,
    region: "Xorazm",
    sample: false,
    images: [photo("melon")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2026-11-01T00:00:00.000Z",
  },
  {
    crop: "Ware potato, Riviera",
    cropRu: "Картофель продовольственный «Ривьера»",
    cropUz: "Oziq-ovqat kartoshkasi «Riviera»",
    cropUzCyrl: "Озиқ-овқат картошкаси «Ривиера»",
    grade: "B",
    tons: 40,
    pricePerKgUzs: 4_200,
    region: "Toshkent",
    sample: false,
    images: [photo("ware-potatoes")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2026-11-01T00:00:00.000Z",
  },
  {
    crop: "Yellow onion, 60+ mm",
    cropRu: "Лук репчатый жёлтый, 60+ мм",
    cropUz: "Sariq piyoz, 60+ mm",
    cropUzCyrl: "Сариқ пиёз, 60+ мм",
    grade: "A",
    tons: 55,
    pricePerKgUzs: 2_950,
    region: "Xorazm",
    sample: true,
    images: [photo("yellow-onions"), photo("uzbek-bazaar")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2026-12-01T00:00:00.000Z",
  },
  {
    crop: "Cottonseed cake, 38% protein",
    cropRu: "Хлопковый жмых, протеин 38%",
    cropUz: "Paxta kunjarasi, 38% protein",
    cropUzCyrl: "Пахта кунжараси, 38% протеин",
    grade: "C",
    tons: 30,
    pricePerKgUzs: 3_400,
    region: "Andijon",
    sample: false,
    images: [],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2026-12-01T00:00:00.000Z",
  },
  {
    crop: "Watermelon, field grade",
    cropRu: "Арбуз продовольственный",
    cropUz: "Tarvuz, oziq-ovqat navi",
    cropUzCyrl: "Тарвуз, озиқ-овқат нави",
    grade: "B",
    tons: 60,
    pricePerKgUzs: 2_450,
    region: "Xorazm",
    sample: false,
    images: [photo("watermelon-field")],
    cooperative: "Xorazm Dehqon Kooperativi",
    availableUntil: "2026-10-15T00:00:00.000Z",
  },
  {
    crop: "Rice, long grain milled",
    cropRu: "Рис длиннозёрный, шлифованный",
    cropUz: "Guruch, uzun donli, silliqlangan",
    cropUzCyrl: "Гуруч, узун донли, силлиқланган",
    grade: "A",
    tons: 35,
    pricePerKgUzs: 11_200,
    region: "Qoraqalpog'iston",
    sample: true,
    images: [photo("rice-paddy")],
    cooperative: "Xorazm Dehqon Kooperativi",
    availableUntil: "2027-03-01T00:00:00.000Z",
  },
  {
    crop: "Maize grain, feed quality",
    cropRu: "Кукуруза фуражная",
    cropUz: "Makkajo'xori doni, yem sifati",
    cropUzCyrl: "Маккажўхори дони, ем сифати",
    grade: "B",
    tons: 80,
    pricePerKgUzs: 3_650,
    region: "Sirdaryo",
    sample: false,
    images: [photo("maize-cobs")],
    cooperative: "Xorazm Dehqon Kooperativi",
    availableUntil: "2027-02-01T00:00:00.000Z",
  },
  {
    crop: "Pomegranate, calibre 250+",
    cropRu: "Гранат, калибр 250+",
    cropUz: "Anor, kalibr 250+",
    cropUzCyrl: "Анор, калибр 250+",
    grade: "A",
    tons: 12,
    pricePerKgUzs: 9_800,
    region: "Surxondaryo",
    sample: true,
    images: [photo("pomegranate")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2026-12-15T00:00:00.000Z",
  },
  {
    crop: "Persimmon, chocolate type",
    cropRu: "Хурма шоколадная",
    cropUz: "Shokolad turidagi xurmo",
    cropUzCyrl: "Шоколад туридаги хурмо",
    grade: "A",
    tons: 9,
    pricePerKgUzs: 8_600,
    region: "Surxondaryo",
    sample: true,
    images: [photo("persimmon")],
    cooperative: "Farg'ona Dehqon Kooperativi",
    availableUntil: "2026-12-20T00:00:00.000Z",
  },
  {
    crop: "Fresh apricot, table grade",
    cropRu: "Абрикос свежий, столовый",
    cropUz: "Yangi o'rik, iste'mol navi",
    cropUzCyrl: "Янги ўрик, истеъмол нави",
    grade: "B",
    tons: 14,
    pricePerKgUzs: 12_600,
    region: "Farg'ona",
    sample: false,
    images: [photo("fresh-apricots")],
    cooperative: "Farg'ona Dehqon Kooperativi",
    availableUntil: "2026-11-01T00:00:00.000Z",
  },
  {
    crop: "Garlic, dry, calibre 50+",
    cropRu: "Чеснок сухой, калибр 50+",
    cropUz: "Sarimsoq, quruq, kalibr 50+",
    cropUzCyrl: "Саримсоқ, қуруқ, калибр 50+",
    grade: "A",
    tons: 11,
    pricePerKgUzs: 16_900,
    region: "Namangan",
    sample: true,
    images: [photo("garlic-bulbs")],
    cooperative: "Farg'ona Dehqon Kooperativi",
    availableUntil: "2027-02-01T00:00:00.000Z",
  },
  {
    crop: "Dark raisins, sun-dried",
    cropRu: "Кишмиш тёмный, сушёный на солнце",
    cropUz: "Quyoshda quritilgan qora kishmish",
    cropUzCyrl: "Қуёшда қуритилган қора кишмиш",
    grade: "A",
    tons: 8,
    pricePerKgUzs: 28_400,
    region: "Samarqand",
    sample: true,
    images: [photo("raisins"), photo("uzbek-bazaar")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2027-04-01T00:00:00.000Z",
  },
  {
    crop: "Alfalfa hay, second cut",
    cropRu: "Сено люцерны, второй укос",
    cropUz: "Beda pichani, ikkinchi o'rim",
    cropUzCyrl: "Беда пичани, иккинчи ўрим",
    grade: "B",
    tons: 120,
    pricePerKgUzs: 1_850,
    region: "Jizzax",
    sample: false,
    images: [photo("alfalfa-bales")],
    cooperative: "Xorazm Dehqon Kooperativi",
    availableUntil: "2027-03-01T00:00:00.000Z",
  },
  {
    crop: "Mung bean, food grade",
    cropRu: "Маш продовольственный",
    cropUz: "Mosh, oziq-ovqat sifati",
    cropUzCyrl: "Мош, озиқ-овқат сифати",
    grade: "A",
    tons: 16,
    pricePerKgUzs: 19_400,
    region: "Farg'ona",
    sample: true,
    images: [photo("mung-beans")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2027-01-15T00:00:00.000Z",
  },
  {
    crop: "Carrot, storage grade",
    cropRu: "Морковь продовольственная, лежкая",
    cropUz: "Sabzi, saqlash uchun",
    cropUzCyrl: "Сабзи, сақлаш учун",
    grade: "B",
    tons: 45,
    pricePerKgUzs: 3_100,
    region: "Toshkent",
    sample: false,
    images: [photo("carrots")],
    cooperative: "Dehqon Bozori Kooperativi",
    availableUntil: "2027-02-15T00:00:00.000Z",
  },
  {
    crop: "Greenhouse tomato, table grade",
    cropRu: "Томат тепличный, столовый",
    cropUz: "Issiqxona pomidori, iste'mol navi",
    cropUzCyrl: "Иссиқхона помидори, истеъмол нави",
    grade: "A",
    tons: 7,
    pricePerKgUzs: 13_400,
    region: "Farg'ona",
    sample: true,
    images: [photo("tomato-fruit"), photo("tomato-greenhouse")],
    cooperative: "Farg'ona Dehqon Kooperativi",
    availableUntil: "2026-11-15T00:00:00.000Z",
  },
] as const;

const harvestByCrop = new Map<string, (typeof harvest)[number]>(
  harvest.map((entry) => [entry.crop, entry] as const),
);

/** The harvest fixture behind a seeded produce row, addressed by its crop. */
const harvestFor = (crop: string): (typeof harvest)[number] => {
  const entry = harvestByCrop.get(crop);
  if (!entry) {
    throw new Error(`Demo marketplace fixture has no harvest named ${crop}.`);
  }
  return entry;
};

/** The co-operative a harvest is sold through, as a published seller profile. */
const cooperativeFor = (crop: string): DemoPublicSellerFixture => {
  const seller = produceCooperatives.get(harvestFor(crop).cooperative);
  if (!seller) {
    throw new Error(`Demo marketplace harvest ${crop} names an unseeded co-operative.`);
  }
  return seller;
};

export const demoMarketplaceProduceListings: readonly DemoProduceListingFixture[] = harvest.map((entry) => ({
  id: marketplaceFixtureUuid(`produce:${entry.crop}`),
  farmerId: demoMarketplaceFarmer.id,
  ownerEmail: farmerEmail,
  crop: entry.crop,
  grade: entry.grade,
  quantityKg: entry.tons * 1000,
  availableQuantityKg: entry.tons * 1000,
  pricePerKgUzs: entry.pricePerKgUzs,
  region: entry.region,
  sampleAvailable: entry.sample,
  availableFrom: new Date("2026-08-01T00:00:00.000Z"),
  availableUntil: new Date(entry.availableUntil),
  supplierPartnerId: cooperativeFor(entry.crop).partnerId,
}));

export const demoMarketplaceProducePublications: readonly DemoListingPublicationFixture[] =
  demoMarketplaceProduceListings.map((listing, index) => {
    const key = `produce-publication:${listing.id}`;
    const entry = harvestFor(listing.crop);
    const cooperative = cooperativeFor(listing.crop);
    return {
      id: marketplaceFixtureUuid(key),
      ownerEmail: farmerEmail,
      sellerPublicId: cooperative.id,
      sellerRevisionId: cooperative.revisionId,
      sourceKind: "produce" as const,
      productId: null,
      produceListingId: listing.id,
      section: "produce" as const,
      title: listing.crop,
      titleRu: entry.cropRu,
      titleUz: entry.cropUz,
      titleUzCyrl: entry.cropUzCyrl,
      description: `Harvest from the demo co-operative, graded ${listing.grade}.`,
      category: null,
      crop: listing.crop,
      grade: listing.grade,
      unit: "kg",
      region: listing.region,
      images: publicImages(key, entry.images),
      contentFingerprint: fingerprint(key),
      idempotencyKey: `seed:${key}`,
      requestFingerprint: fingerprint(`request:${key}`),
      publishedAt: new Date(`2026-08-${String(index + 2).padStart(2, "0")}T08:00:00.000Z`),
    };
  });

/**
 * A reverse auction a reviewer can read without creating anything first. Every
 * request belongs to the wholesale buyer and every offer to the seller logins,
 * because the database resolves a bound party only against a verification whose
 * role is exactly `buyer` or exactly `seller`: the farmer login trades as
 * `farmer`, so it can list its harvest in the catalog but cannot hold a resolved
 * request or offer. All three are published and approved — an unapproved request
 * is invisible to sellers and cannot receive an offer at all.
 */
export const demoMarketplaceRequests: readonly DemoRequestFixture[] = [
  {
    key: "request:grapes",
    buyerEmail,
    buyerPartnerKey: "partner:buyer:buyer",
    buyerDisplayName: "Xaridor Demo Savdo",
    title: "Table grapes, 8 tonnes by September",
    product: "Table grapes, grade 1",
    volume: "8 t",
    region: "Samarqand",
    deadline: "2026-09-15",
    budgetUzs: 96_000_000,
    requirements: "Grade 1 only, crates returned after unloading.",
    status: "offering" as const,
  },
  {
    key: "request:wheat-seed",
    buyerEmail,
    buyerPartnerKey: "partner:buyer:buyer",
    buyerDisplayName: "Xaridor Demo Savdo",
    title: "Winter wheat seed, 60 bags",
    product: "Winter wheat seed, elite reproduction",
    volume: "60 bags",
    region: "Farg'ona",
    deadline: "2026-10-01",
    budgetUzs: 18_000_000,
    requirements: "State certificate required, germination above 95%.",
    status: "offering" as const,
  },
  {
    key: "request:onion",
    buyerEmail,
    buyerPartnerKey: "partner:buyer:buyer",
    buyerDisplayName: "Xaridor Demo Savdo",
    title: "Yellow onion, 12 tonnes",
    product: "Yellow onion, 60+ mm",
    volume: "12 t",
    region: "Xorazm",
    deadline: "2026-09-30",
    budgetUzs: 38_000_000,
    requirements: "Calibrated, in 25 kg mesh bags.",
    status: "open" as const,
  },
].map((entry, index) => {
  const { key, ...request } = entry;
  return {
    ...request,
    id: marketplaceFixtureUuid(key),
    publicationId: marketplaceFixtureUuid(`request-publication:${key}`),
    contentFingerprint: fingerprint(key),
    idempotencyKey: `seed:${key}`,
    requestFingerprint: fingerprint(`request:${key}`),
    createdAt: new Date(`2026-08-1${index}T09:00:00.000Z`),
  };
});

const requestByKey = (key: string): DemoRequestFixture => {
  const request = demoMarketplaceRequests.find((entry) => entry.id === marketplaceFixtureUuid(key));
  if (!request) {
    throw new Error(`Demo marketplace fixture is missing the request ${key}.`);
  }
  return request;
};

/**
 * Competing offers, so the buyer's screen has something to compare rather than
 * an empty list. The grape request gets two, which is what makes the "best
 * price" marker meaningful; the seed request gets one.
 */
export const demoMarketplaceOffers: readonly DemoOfferFixture[] = [
  {
    key: "offer:grapes:orchard",
    request: requestByKey("request:grapes"),
    sellerEmail,
    sellerSupplierSlug: "demo-supplier-samarqand-bog-dorchilik",
    priceUzs: 88_000_000,
    deliveryTerms: "seller_delivery" as const,
    deliveryPriceUzs: 2_400_000,
    deliveryDays: 4,
    deliveryNote: "Refrigerated truck, unloading included.",
  },
  {
    key: "offer:grapes:export",
    request: requestByKey("request:grapes"),
    sellerEmail,
    sellerSupplierSlug: "demo-supplier-xorazm-hosil-eksport",
    priceUzs: 93_500_000,
    deliveryTerms: "pickup" as const,
    deliveryPriceUzs: 0,
    deliveryDays: 2,
    deliveryNote: "Ready for pickup from the Xorazm warehouse.",
  },
  {
    key: "offer:wheat-seed:andijon",
    request: requestByKey("request:wheat-seed"),
    sellerEmail,
    sellerSupplierSlug: "demo-supplier-andijon-urug-chilik",
    priceUzs: 16_800_000,
    deliveryTerms: "seller_delivery" as const,
    deliveryPriceUzs: 900_000,
    deliveryDays: 6,
    deliveryNote: "Certificates travel with the shipment.",
  },
].map((entry, index) => {
  const { key, request, ...offer } = entry;
  return {
    ...offer,
    id: marketplaceFixtureUuid(key),
    requestId: request.id,
    requestPublicId: request.publicationId,
    buyerEmail: request.buyerEmail,
    buyerPartnerKey: request.buyerPartnerKey,
    createdAt: new Date(`2026-08-1${index + 2}T10:00:00.000Z`),
  };
});

/** The three plans `ck__listing_promotions__plan` allows, price and span fixed. */
const promotionPlans = {
  catalog_7d: { priceUzs: 150_000, durationDays: 7 },
  catalog_14d: { priceUzs: 270_000, durationDays: 14 },
  catalog_30d: { priceUzs: 500_000, durationDays: 30 },
} as const;

const publicationsByTitle = new Map(
  [...demoMarketplaceListingPublications, ...demoMarketplaceProducePublications].map(
    (publication) => [publication.title, publication] as const,
  ),
);

/**
 * The publication a promotion buys a slot on, addressed by the title on screen
 * rather than by a recomputed fixture key: a promotion pointing at a listing the
 * seed never published fails the database's coherence trigger with a bare
 * constraint name, and out-of-stock listings never reach the catalog at all.
 */
const promotedPublication = (title: string): DemoListingPublicationFixture => {
  const publication = publicationsByTitle.get(title);
  if (!publication) {
    throw new Error(`Demo marketplace promotion names ${title}, which the seed never publishes.`);
  }
  return publication;
};

const sellerByPublicId = (publicId: string): DemoPublicSellerFixture => {
  const seller = demoMarketplacePublicSellers.find((candidate) => candidate.id === publicId);
  if (!seller) {
    throw new Error(`Demo marketplace promotion points at an unseeded seller profile ${publicId}.`);
  }
  return seller;
};

/**
 * Paid catalog slots, which is the only thing that sets `promoted` on a public
 * listing: the catalog derives it from a live row in
 * `marketplace_listing_promotions`, so without these every listing sorted and
 * rendered as unpromoted and the "promoted" facet had nothing to show.
 *
 * A promotion row is nearly immutable by design — `tr__marketplace_listing_promotions__guard`
 * accepts an update only as the one-way transition to `expired` — so the seed
 * cannot refresh one in place. It inserts on conflict-do-nothing instead and
 * deletes only a row whose window no longer covers now, which keeps a re-seed at
 * zero inserts while still healing a fixture that has run past its end date.
 */
export const demoMarketplaceListingPromotions: readonly DemoListingPromotionFixture[] = [
  { key: "promotion:cotton-seed", listing: "Cotton seed “Omad” F1", planCode: "catalog_30d" as const },
  { key: "promotion:dap", listing: "DAP 18:46", planCode: "catalog_14d" as const },
  { key: "promotion:rice-seed", listing: "Rice seed, first reproduction", planCode: "catalog_7d" as const },
  { key: "promotion:drip-kit", listing: "Drip irrigation kit, 1 ha", planCode: "catalog_30d" as const },
  { key: "promotion:combine", listing: "Grain combine harvester, 2019", planCode: "catalog_14d" as const },
  { key: "promotion:greenhouse-film", listing: "Greenhouse film, 150 micron, 8 m wide", planCode: "catalog_7d" as const },
  { key: "promotion:table-grapes", listing: "Table grapes, Husayni grade 1", planCode: "catalog_14d" as const },
  { key: "promotion:raisins", listing: "Dark raisins, sun-dried", planCode: "catalog_7d" as const },
].map((entry) => {
  const publication = promotedPublication(entry.listing);
  const seller = sellerByPublicId(publication.sellerPublicId);
  const plan = promotionPlans[entry.planCode];
  const id = marketplaceFixtureUuid(entry.key);
  return {
    id,
    publicationId: publication.id,
    sellerPublicId: seller.id,
    sellerPartnerId: seller.partnerId,
    actorEmail: publication.ownerEmail,
    planCode: entry.planCode,
    priceUzs: plan.priceUzs,
    durationDays: plan.durationDays,
    idempotencyKey: `seed:${entry.key}`,
    requestFingerprint: fingerprint(entry.key),
    activationReference: `promotion:${id}`,
  };
});
