import { createHash } from "node:crypto";

/**
 * Who trades on the demo marketplace.
 *
 * Every other marketplace fixture module derives its rows from this one table:
 * the auth accounts (`seed-data`), the organizations and verifications
 * (`marketplace-seed-data`), the seller profiles and produce listings
 * (`marketplace-seed-publications`), the deal history
 * (`marketplace-seed-contracts`) and the ratings (`marketplace-seed-reviews`).
 * Keeping the roster in one place is not tidiness: the database resolves a
 * trading party by joining an approved organization, an active membership and a
 * verified marketplace role, so an identity whose account, organization and
 * verification disagree fails inside the seed transaction with a bare constraint
 * name. One table cannot disagree with itself.
 *
 * The three original review logins keep their fixture keys and user ids, so a
 * database seeded before this roster existed still resolves them to the same
 * rows.
 */

const fixtureNamespace = "dehqonhub-demo-marketplace";

/**
 * Every row needs an id that survives re-seeding, and a product carries its
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

/**
 * Nine obviously synthetic digits, derived from the same key as the row's id so
 * that the two always move together. A positional numbering read better but
 * collided with `ux__agritech_partners__tenant_kind_tax` as soon as a key did
 * change: the replacement row arrives with a new id, the row it supersedes keeps
 * its number, and the seed aborted on any database seeded before the change.
 */
export function marketplaceFixtureTaxId(key: string): string {
  const hex = createHash("sha1").update(`${fixtureNamespace}:tax:${key}`).digest("hex").slice(0, 10);
  return `3${String(Number.parseInt(hex, 16) % 100_000_000).padStart(8, "0")}`;
}

/**
 * The catalog's own supplier slug, which is what a product row carries and what
 * every supplier fixture key is built from. It must stay byte-identical to
 * `supplierId` in `demo-catalog`, because a product and its organization are
 * matched on it and nothing reconciles the two afterwards.
 */
export const marketplaceSupplierSlug = (legalName: string): string =>
  `demo-supplier-${legalName.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`;

/**
 * What a login may do, which the database enforces rather than infers: a farmer
 * buys and sells, a seller only sells, a buyer only buys. It has to match the
 * organizations below — `assert_marketplace_resolved_commerce_parties` admits
 * `('buyer', 'farmer')` on the buying side and `('seller', 'farmer')` on the
 * selling side, so a `buyer` verification holding a supplier organization is a
 * row the seed cannot insert.
 */
export type MarketplaceRole = "farmer" | "seller" | "buyer";

export interface DemoOrganizationFixture {
  /** Trade name, which doubles as the legal name so a listing can be traced to it. */
  legalName: string;
  /**
   * The oblast the organization trades from, pinned here rather than derived
   * from its listings: `enforce_marketplace_public_seller_revision_immutability`
   * refuses any change to an approved revision's `region`, so a value that
   * followed whichever listing came first turned a re-seed into a failed
   * transaction as soon as a listing was inserted ahead of the old one.
   */
  region: string;
  phone: string;
}

export interface DemoBuyerOrganizationFixture extends DemoOrganizationFixture {
  /**
   * The fixture key behind the row's id. Explicit because the first two buyer
   * organizations were seeded under `partner:buyer:farmer` and
   * `partner:buyer:buyer` before the roster existed, and a derived key would
   * have re-issued them under new ids while the old rows stayed approved.
   */
  partnerKey: string;
}

export interface DemoFarmFixture {
  firstName: string;
  lastName: string;
  /** Unique per tenant — `ux__farmers__tenant_phone`. */
  phone: string;
  region: string;
  district: string;
  /** `numeric(10,2)`, and `ck__farmers__farm_size` requires it to be positive. */
  farmSizeHectares: string;
  crops: readonly string[];
}

export interface DemoIdentityFixture {
  userId: string;
  email: string;
  displayName: string;
  /**
   * Public demo credentials, published so a reviewer can sign in as any trading
   * party without being handed anything out of band. The convention is
   * `Demo` + the capitalized mailbox + `2026`, which the roster test enforces so
   * a reviewer can derive an unfamiliar login from its address.
   */
  password: string;
  role: MarketplaceRole;
  /** Verification tier on the profile; `status` is always `verified`. */
  level: "basic" | "verified" | "trusted";
  oneIdLinked: boolean;
  /** The fixture key behind the verification row's id. */
  verificationKey: string;
  /** Where the person trades from, which is not always their organization's oblast. */
  region: string;
  /** Organizations it sells through. Empty unless the role may sell. */
  suppliers: readonly DemoOrganizationFixture[];
  /** The organization it buys through. Null unless the role may buy. */
  buyer: DemoBuyerOrganizationFixture | null;
  /**
   * The farm behind its produce listings. Only a farmer has one, and only a
   * farmer can publish produce at all: the public catalog joins a produce
   * publication to `farmers` on `farmer.user_id = seller.owner_user_id`.
   */
  farm: DemoFarmFixture | null;
}

export const farmerEmail = "dehqon@demo.dehqonhub.uz";
export const sellerEmail = "sotuvchi@demo.dehqonhub.uz";
export const buyerEmail = "xaridor@demo.dehqonhub.uz";

/**
 * The three original review logins, one per marketplace role, plus sixteen
 * further trading parties so the marketplace reads as a market rather than as a
 * three-account demonstration. Every login is documented in the table below and
 * seeded with the password shown there.
 *
 * | Login                          | Role   | Password           | Sells through                       | Buys through                    |
 * | ------------------------------ | ------ | ------------------ | ----------------------------------- | ------------------------------- |
 * | dehqon@demo.dehqonhub.uz       | farmer | DemoDehqon2026     | three Dehqon co-operatives          | Dehqon Demo Xo'jaligi           |
 * | sotuvchi@demo.dehqonhub.uz     | seller | DemoSotuvchi2026   | eleven input and machinery traders  | —                               |
 * | xaridor@demo.dehqonhub.uz      | buyer  | DemoXaridor2026    | —                                   | Xaridor Demo Savdo              |
 * | nodira@demo.dehqonhub.uz       | farmer | DemoNodira2026     | Samarqand Meva Kooperativi          | Qodirova Fermer Xo'jaligi       |
 * | bekzod@demo.dehqonhub.uz       | farmer | DemoBekzod2026     | Andijon Bog' Kooperativi            | Ergashev Fermer Xo'jaligi       |
 * | gulnora@demo.dehqonhub.uz      | farmer | DemoGulnora2026    | Xorazm Poliz Kooperativi            | Yo'ldosheva Fermer Xo'jaligi    |
 * | sardor@demo.dehqonhub.uz       | farmer | DemoSardor2026     | Qashqadaryo Dehqon Kooperativi      | Toshmatov Fermer Xo'jaligi      |
 * | dilnoza@demo.dehqonhub.uz      | farmer | DemoDilnoza2026    | Namangan Bog'bon Kooperativi        | Rasulova Fermer Xo'jaligi       |
 * | jahongir@demo.dehqonhub.uz     | seller | DemoJahongir2026   | Toshkent Urug' Markazi              | —                               |
 * | oybek@demo.dehqonhub.uz        | seller | DemoOybek2026      | Farg'ona Gidro Tizim                | —                               |
 * | zulfiya@demo.dehqonhub.uz      | seller | DemoZulfiya2026    | Buxoro Kimyo Savdo                  | —                               |
 * | rustam@demo.dehqonhub.uz       | seller | DemoRustam2026     | Jizzax Yem Kombinati                | —                               |
 * | malika@demo.dehqonhub.uz       | seller | DemoMalika2026     | Navoiy Agro Plastik                 | —                               |
 * | shuhrat@demo.dehqonhub.uz      | seller | DemoShuhrat2026    | Qoraqalpog'iston Agrotexnika        | —                               |
 * | kamola@demo.dehqonhub.uz       | buyer  | DemoKamola2026     | —                                   | Toshkent Oziq-ovqat Savdo       |
 * | farrux@demo.dehqonhub.uz       | buyer  | DemoFarrux2026     | —                                   | Samarqand Ulgurji Savdo         |
 * | saida@demo.dehqonhub.uz        | buyer  | DemoSaida2026      | —                                   | Sirdaryo Don Xarid              |
 * | alisher@demo.dehqonhub.uz      | buyer  | DemoAlisher2026    | —                                   | Surxon Eksport Savdo            |
 * | nigora@demo.dehqonhub.uz       | buyer  | DemoNigora2026     | —                                   | Farg'ona Qayta Ishlash          |
 *
 * Two supplier regions look wrong and are deliberate: `Samarqand Bog'dorchilik`
 * and `Xorazm Hosil Eksport` record the oblasts that were derived and approved
 * before the region was pinned. Correcting them needs a second seller revision
 * rather than an edit, which is not this fixture's job.
 */
export const demoMarketplaceIdentities: readonly DemoIdentityFixture[] = [
  {
    userId: "30000000-0000-0000-0000-000000000011",
    email: farmerEmail,
    displayName: "Dehqon Demo",
    password: "DemoDehqon2026",
    role: "farmer",
    level: "trusted",
    oneIdLinked: true,
    verificationKey: "verification:farmer",
    region: "Toshkent",
    suppliers: [
      { legalName: "Dehqon Bozori Kooperativi", region: "Toshkent", phone: "+998 71 200-00-01" },
      { legalName: "Farg'ona Dehqon Kooperativi", region: "Farg'ona", phone: "+998 73 200-00-02" },
      { legalName: "Xorazm Dehqon Kooperativi", region: "Xorazm", phone: "+998 62 200-00-03" },
    ],
    buyer: {
      partnerKey: "partner:buyer:farmer",
      legalName: "Dehqon Demo Xo'jaligi",
      region: "Toshkent",
      phone: "+998 71 200-00-04",
    },
    farm: {
      firstName: "Dehqon",
      lastName: "Demo",
      phone: "+998 71 200-01-00",
      region: "Toshkent",
      district: "Zangiota",
      farmSizeHectares: "12.5",
      crops: ["grape", "melon", "onion", "potato"],
    },
  },
  {
    userId: "30000000-0000-0000-0000-000000000012",
    email: sellerEmail,
    displayName: "Sotuvchi Demo",
    password: "DemoSotuvchi2026",
    role: "seller",
    level: "verified",
    oneIdLinked: true,
    verificationKey: "verification:seller",
    region: "Toshkent",
    suppliers: [
      { legalName: "Agro Kimyo Servis", region: "Navoiy", phone: "+998 79 200-00-05" },
      { legalName: "Andijon Urug'chilik", region: "Andijon", phone: "+998 74 200-00-06" },
      { legalName: "Buxoro Agro Ta'minot", region: "Buxoro", phone: "+998 65 200-00-07" },
      { legalName: "Farg'ona Agrotexnika", region: "Farg'ona", phone: "+998 73 200-00-08" },
      { legalName: "Namangan Issiqxona Servis", region: "Namangan", phone: "+998 69 200-00-09" },
      { legalName: "Qashqadaryo Suv Tizim", region: "Qashqadaryo", phone: "+998 75 200-00-10" },
      { legalName: "Samarqand Bog'dorchilik", region: "Toshkent", phone: "+998 66 200-00-11" },
      { legalName: "Sirdaryo Don Terminali", region: "Sirdaryo", phone: "+998 67 200-00-12" },
      { legalName: "Surxon Meva Savdo", region: "Surxondaryo", phone: "+998 76 200-00-13" },
      { legalName: "Toshkent Agroservis Markazi", region: "Toshkent", phone: "+998 71 200-00-14" },
      { legalName: "Xorazm Hosil Eksport", region: "Farg'ona", phone: "+998 62 200-00-15" },
    ],
    buyer: null,
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-000000000013",
    email: buyerEmail,
    displayName: "Xaridor Demo",
    password: "DemoXaridor2026",
    role: "buyer",
    level: "basic",
    oneIdLinked: false,
    verificationKey: "verification:buyer",
    region: "Toshkent",
    suppliers: [],
    buyer: {
      partnerKey: "partner:buyer:buyer",
      legalName: "Xaridor Demo Savdo",
      region: "Toshkent",
      phone: "+998 71 200-00-16",
    },
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-000000000021",
    email: "nodira@demo.dehqonhub.uz",
    displayName: "Nodira Qodirova",
    password: "DemoNodira2026",
    role: "farmer",
    level: "trusted",
    oneIdLinked: true,
    verificationKey: "verification:nodira",
    region: "Samarqand",
    suppliers: [{ legalName: "Samarqand Meva Kooperativi", region: "Samarqand", phone: "+998 66 200-00-21" }],
    buyer: {
      partnerKey: "partner:buyer:nodira",
      legalName: "Qodirova Fermer Xo'jaligi",
      region: "Samarqand",
      phone: "+998 66 200-00-22",
    },
    farm: {
      firstName: "Nodira",
      lastName: "Qodirova",
      phone: "+998 66 200-01-21",
      region: "Samarqand",
      district: "Payariq",
      farmSizeHectares: "240.00",
      crops: ["wheat", "cherry", "grape"],
    },
  },
  {
    userId: "30000000-0000-0000-0000-000000000022",
    email: "bekzod@demo.dehqonhub.uz",
    displayName: "Bekzod Ergashev",
    password: "DemoBekzod2026",
    role: "farmer",
    level: "verified",
    oneIdLinked: true,
    verificationKey: "verification:bekzod",
    region: "Andijon",
    suppliers: [{ legalName: "Andijon Bog' Kooperativi", region: "Andijon", phone: "+998 74 200-00-23" }],
    buyer: {
      partnerKey: "partner:buyer:bekzod",
      legalName: "Ergashev Fermer Xo'jaligi",
      region: "Andijon",
      phone: "+998 74 200-00-24",
    },
    farm: {
      firstName: "Bekzod",
      lastName: "Ergashev",
      phone: "+998 74 200-01-22",
      region: "Andijon",
      district: "Asaka",
      farmSizeHectares: "180.50",
      crops: ["cotton", "apple"],
    },
  },
  {
    userId: "30000000-0000-0000-0000-000000000023",
    email: "gulnora@demo.dehqonhub.uz",
    displayName: "Gulnora Yo'ldosheva",
    password: "DemoGulnora2026",
    role: "farmer",
    level: "verified",
    oneIdLinked: false,
    verificationKey: "verification:gulnora",
    region: "Xorazm",
    suppliers: [{ legalName: "Xorazm Poliz Kooperativi", region: "Xorazm", phone: "+998 62 200-00-25" }],
    buyer: {
      partnerKey: "partner:buyer:gulnora",
      legalName: "Yo'ldosheva Fermer Xo'jaligi",
      region: "Xorazm",
      phone: "+998 62 200-00-26",
    },
    farm: {
      firstName: "Gulnora",
      lastName: "Yo'ldosheva",
      phone: "+998 62 200-01-23",
      region: "Xorazm",
      district: "Yangibozor",
      farmSizeHectares: "320.00",
      crops: ["sugar beet", "melon", "pumpkin"],
    },
  },
  {
    userId: "30000000-0000-0000-0000-000000000024",
    email: "sardor@demo.dehqonhub.uz",
    displayName: "Sardor Toshmatov",
    password: "DemoSardor2026",
    role: "farmer",
    level: "trusted",
    oneIdLinked: true,
    verificationKey: "verification:sardor",
    region: "Qashqadaryo",
    suppliers: [{ legalName: "Qashqadaryo Dehqon Kooperativi", region: "Qashqadaryo", phone: "+998 75 200-00-27" }],
    buyer: {
      partnerKey: "partner:buyer:sardor",
      legalName: "Toshmatov Fermer Xo'jaligi",
      region: "Qashqadaryo",
      phone: "+998 75 200-00-28",
    },
    farm: {
      firstName: "Sardor",
      lastName: "Toshmatov",
      phone: "+998 75 200-01-24",
      region: "Qashqadaryo",
      district: "Kitob",
      farmSizeHectares: "410.00",
      crops: ["barley", "alfalfa", "wheat"],
    },
  },
  {
    userId: "30000000-0000-0000-0000-000000000025",
    email: "dilnoza@demo.dehqonhub.uz",
    displayName: "Dilnoza Rasulova",
    password: "DemoDilnoza2026",
    role: "farmer",
    level: "basic",
    oneIdLinked: false,
    verificationKey: "verification:dilnoza",
    region: "Namangan",
    suppliers: [{ legalName: "Namangan Bog'bon Kooperativi", region: "Namangan", phone: "+998 69 200-00-29" }],
    buyer: {
      partnerKey: "partner:buyer:dilnoza",
      legalName: "Rasulova Fermer Xo'jaligi",
      region: "Namangan",
      phone: "+998 69 200-00-30",
    },
    farm: {
      firstName: "Dilnoza",
      lastName: "Rasulova",
      phone: "+998 69 200-01-25",
      region: "Namangan",
      district: "Chust",
      farmSizeHectares: "96.00",
      crops: ["grape", "walnut"],
    },
  },
  {
    userId: "30000000-0000-0000-0000-000000000026",
    email: "jahongir@demo.dehqonhub.uz",
    displayName: "Jahongir Sultonov",
    password: "DemoJahongir2026",
    role: "seller",
    level: "trusted",
    oneIdLinked: true,
    verificationKey: "verification:jahongir",
    region: "Toshkent",
    suppliers: [{ legalName: "Toshkent Urug' Markazi", region: "Toshkent", phone: "+998 71 200-00-31" }],
    buyer: null,
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-000000000027",
    email: "oybek@demo.dehqonhub.uz",
    displayName: "Oybek Nazarov",
    password: "DemoOybek2026",
    role: "seller",
    level: "verified",
    oneIdLinked: true,
    verificationKey: "verification:oybek",
    region: "Farg'ona",
    suppliers: [{ legalName: "Farg'ona Gidro Tizim", region: "Farg'ona", phone: "+998 73 200-00-32" }],
    buyer: null,
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-000000000028",
    email: "zulfiya@demo.dehqonhub.uz",
    displayName: "Zulfiya Ahmedova",
    password: "DemoZulfiya2026",
    role: "seller",
    level: "verified",
    oneIdLinked: false,
    verificationKey: "verification:zulfiya",
    region: "Buxoro",
    suppliers: [{ legalName: "Buxoro Kimyo Savdo", region: "Buxoro", phone: "+998 65 200-00-33" }],
    buyer: null,
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-000000000029",
    email: "rustam@demo.dehqonhub.uz",
    displayName: "Rustam Xolmatov",
    password: "DemoRustam2026",
    role: "seller",
    level: "basic",
    oneIdLinked: false,
    verificationKey: "verification:rustam",
    region: "Jizzax",
    suppliers: [{ legalName: "Jizzax Yem Kombinati", region: "Jizzax", phone: "+998 72 200-00-34" }],
    buyer: null,
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-00000000002a",
    email: "malika@demo.dehqonhub.uz",
    displayName: "Malika Sobirova",
    password: "DemoMalika2026",
    role: "seller",
    level: "verified",
    oneIdLinked: true,
    verificationKey: "verification:malika",
    region: "Navoiy",
    suppliers: [{ legalName: "Navoiy Agro Plastik", region: "Navoiy", phone: "+998 79 200-00-35" }],
    buyer: null,
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-00000000002b",
    email: "shuhrat@demo.dehqonhub.uz",
    displayName: "Shuhrat Berdiyev",
    password: "DemoShuhrat2026",
    role: "seller",
    level: "trusted",
    oneIdLinked: true,
    verificationKey: "verification:shuhrat",
    region: "Qoraqalpog'iston",
    suppliers: [
      { legalName: "Qoraqalpog'iston Agrotexnika", region: "Qoraqalpog'iston", phone: "+998 61 200-00-36" },
    ],
    buyer: null,
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-00000000002c",
    email: "kamola@demo.dehqonhub.uz",
    displayName: "Kamola Isroilova",
    password: "DemoKamola2026",
    role: "buyer",
    level: "trusted",
    oneIdLinked: true,
    verificationKey: "verification:kamola",
    region: "Toshkent",
    suppliers: [],
    buyer: {
      partnerKey: "partner:buyer:kamola",
      legalName: "Toshkent Oziq-ovqat Savdo",
      region: "Toshkent",
      phone: "+998 71 200-00-37",
    },
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-00000000002d",
    email: "farrux@demo.dehqonhub.uz",
    displayName: "Farrux Umarov",
    password: "DemoFarrux2026",
    role: "buyer",
    level: "verified",
    oneIdLinked: true,
    verificationKey: "verification:farrux",
    region: "Samarqand",
    suppliers: [],
    buyer: {
      partnerKey: "partner:buyer:farrux",
      legalName: "Samarqand Ulgurji Savdo",
      region: "Samarqand",
      phone: "+998 66 200-00-38",
    },
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-00000000002e",
    email: "saida@demo.dehqonhub.uz",
    displayName: "Saida Mirzayeva",
    password: "DemoSaida2026",
    role: "buyer",
    level: "verified",
    oneIdLinked: false,
    verificationKey: "verification:saida",
    region: "Sirdaryo",
    suppliers: [],
    buyer: {
      partnerKey: "partner:buyer:saida",
      legalName: "Sirdaryo Don Xarid",
      region: "Sirdaryo",
      phone: "+998 67 200-00-39",
    },
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-00000000002f",
    email: "alisher@demo.dehqonhub.uz",
    displayName: "Alisher Qosimov",
    password: "DemoAlisher2026",
    role: "buyer",
    level: "basic",
    oneIdLinked: false,
    verificationKey: "verification:alisher",
    region: "Surxondaryo",
    suppliers: [],
    buyer: {
      partnerKey: "partner:buyer:alisher",
      legalName: "Surxon Eksport Savdo",
      region: "Surxondaryo",
      phone: "+998 76 200-00-40",
    },
    farm: null,
  },
  {
    userId: "30000000-0000-0000-0000-000000000030",
    email: "nigora@demo.dehqonhub.uz",
    displayName: "Nigora Tursunova",
    password: "DemoNigora2026",
    role: "buyer",
    level: "verified",
    oneIdLinked: true,
    verificationKey: "verification:nigora",
    region: "Farg'ona",
    suppliers: [],
    buyer: {
      partnerKey: "partner:buyer:nigora",
      legalName: "Farg'ona Qayta Ishlash",
      region: "Farg'ona",
      phone: "+998 73 200-00-41",
    },
    farm: null,
  },
];

const identitiesByEmail = new Map(demoMarketplaceIdentities.map((identity) => [identity.email, identity] as const));

/** The trading party behind a login, which every other fixture addresses it by. */
export function marketplaceIdentity(email: string): DemoIdentityFixture {
  const identity = identitiesByEmail.get(email);
  if (!identity) {
    throw new Error(`Demo marketplace fixture has no identity for ${email}.`);
  }
  return identity;
}

/** Every organization a login sells through, addressed by its legal name. */
const supplierOwners = new Map(
  demoMarketplaceIdentities.flatMap((identity) =>
    identity.suppliers.map((supplier) => [supplier.legalName, identity] as const),
  ),
);

/** Who owns the organization a listing is sold through. */
export function marketplaceSupplierOwner(legalName: string): DemoIdentityFixture {
  const owner = supplierOwners.get(legalName);
  if (!owner) {
    throw new Error(
      `Demo marketplace supplier ${legalName} has no owner in the roster; a listing cannot be published without one.`,
    );
  }
  return owner;
}

/** Suppliers in roster order, which is the order their fixture rows are written. */
export const demoMarketplaceSuppliers: readonly (DemoOrganizationFixture & { slug: string; ownerEmail: string })[] =
  demoMarketplaceIdentities.flatMap((identity) =>
    identity.suppliers.map((supplier) => ({
      ...supplier,
      ownerEmail: identity.email,
      slug: marketplaceSupplierSlug(supplier.legalName),
    })),
  );

const suppliersBySlug = new Map(demoMarketplaceSuppliers.map((supplier) => [supplier.slug, supplier] as const));

/** The organization behind a catalog row's `supplierId`. */
export function marketplaceSupplierBySlug(slug: string): DemoOrganizationFixture & {
  slug: string;
  ownerEmail: string;
} {
  const supplier = suppliersBySlug.get(slug);
  if (!supplier) {
    throw new Error(`Demo marketplace catalog names the supplier slug ${slug}, which the roster does not declare.`);
  }
  return supplier;
}

/** Buyer organizations in roster order. */
export const demoMarketplaceBuyerOrganizations: readonly (DemoBuyerOrganizationFixture & { ownerEmail: string })[] =
  demoMarketplaceIdentities.flatMap((identity) =>
    identity.buyer ? [{ ...identity.buyer, ownerEmail: identity.email }] : [],
  );

/** The organization a login buys through, which a contract resolves as its party. */
export function marketplaceBuyerOrganization(email: string): DemoBuyerOrganizationFixture {
  const identity = marketplaceIdentity(email);
  if (!identity.buyer) {
    throw new Error(`${email} is a ${identity.role} login and holds no buying organization.`);
  }
  return identity.buyer;
}

/** The farm behind a farmer's produce listings. */
export function marketplaceFarm(email: string): DemoFarmFixture {
  const identity = marketplaceIdentity(email);
  if (!identity.farm) {
    throw new Error(`${email} is a ${identity.role} login and holds no farm, so it cannot list produce.`);
  }
  return identity.farm;
}

/** The partner id an organization trades under — see `marketplaceFixtureUuid`. */
export const supplierPartnerKey = (supplierSlug: string): string => `partner:supplier:${supplierSlug}`;
export const supplierPartnerIdForSlug = (slug: string): string => marketplaceFixtureUuid(supplierPartnerKey(slug));
export const buyerPartnerIdFor = (email: string): string =>
  marketplaceFixtureUuid(marketplaceBuyerOrganization(email).partnerKey);
