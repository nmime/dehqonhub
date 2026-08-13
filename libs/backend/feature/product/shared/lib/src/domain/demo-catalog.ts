import type { Product, ProductCategory } from './product';

/**
 * Demo catalog content, served by the API.
 *
 * A freshly migrated tenant has published nothing, so every discovery surface —
 * shelves, section catalogs, region and category filters, sort, search, product
 * detail — renders as an empty shell. This dataset stands in for that tenant so
 * the marketplace can be explored end to end, and it is delivered through the
 * same `marketplace/catalog` endpoints as real listings: the client receives
 * catalog rows and never carries a copy of them.
 *
 * It is never mixed into live tenant data. `ListProductsUseCase` reaches for it
 * only when the tenant's own catalog comes back empty, and the response marks
 * itself as demo content so the UI can say so.
 *
 * Product names carry the `name`/`nameRu`/`nameUz` triple the catalog stores,
 * while `description` stays single-language on purpose: it mirrors the
 * seller-authored free-text field, so it is listing content rather than app copy
 * and is deliberately not routed through translation keys.
 */

/** Fixed timestamps keep the dataset deterministic across requests and tests. */
const createdAt = new Date('2026-03-02T08:00:00.000Z');
const updatedAt = new Date('2026-07-28T08:00:00.000Z');

/**
 * Demo rows carry v4-shaped identifiers because the marketplace routes parse
 * product ids as UUIDs. The `dec0de00` prefix marks them as demo content at a
 * glance, and the trailing counter keeps them stable between deployments.
 */
const demoProductId = (index: number): string => `dec0de00-0000-4000-8000-${String(index).padStart(12, '0')}`;

const suppliers = {
  agroKimyo: 'Agro Kimyo Servis',
  andijonUrug: "Andijon Urug'chilik",
  dehqonBozor: 'Dehqon Bozori Kooperativi',
  fargonaTexnika: "Farg'ona Agrotexnika",
  qashqaSuv: 'Qashqadaryo Suv Tizim',
  samarqandBog: "Samarqand Bog'dorchilik",
  xorazmHosil: 'Xorazm Hosil Eksport',
} as const;

interface DemoProductSeed {
  category: ProductCategory;
  description: string;
  name: string;
  nameRu: string;
  nameUz: string;
  priceUzs: number;
  region: string;
  stockQuantity: number;
  supplier: string;
  unit: string;
}

const seeds: readonly DemoProductSeed[] = [
  {
    category: 'seed',
    description:
      'Гибрид F1 для открытого грунта. Срок вегетации 105–115 дней, устойчив к фузариозу. Партия сертифицирована, всхожесть 96%.',
    name: 'Cotton seed “Omad” F1',
    nameRu: 'Семена хлопка «Омад» F1',
    nameUz: "Paxta urug'i «Omad» F1",
    priceUzs: 412_000,
    region: 'Andijon',
    stockQuantity: 480,
    supplier: suppliers.andijonUrug,
    unit: '25 kg',
  },
  {
    category: 'seed',
    description:
      'Озимая пшеница для орошаемых земель Ферганской долины. Урожайность до 7,2 т/га, зимостойкость высокая.',
    name: 'Winter wheat “Durdona”',
    nameRu: 'Озимая пшеница «Дурдона»',
    nameUz: "Kuzgi bug'doy «Durdona»",
    priceUzs: 268_000,
    region: "Farg'ona",
    stockQuantity: 1_240,
    supplier: suppliers.andijonUrug,
    unit: '50 kg',
  },
  {
    category: 'seed',
    description: 'Ранний томат для теплиц, плод 140–160 г, лежкость 18 дней. Пробная партия доступна бесплатно.',
    name: 'Tomato “Nurafshon”',
    nameRu: 'Томат «Нурафшон»',
    nameUz: 'Pomidor «Nurafshon»',
    priceUzs: 96_500,
    region: 'Toshkent',
    stockQuantity: 320,
    supplier: suppliers.samarqandBog,
    unit: '500 g',
  },
  {
    category: 'seed',
    description: 'Люцерна для сенокоса, 3–4 укоса за сезон. Чистота семян 99,1%, без карантинных сорняков.',
    name: 'Alfalfa seed, first reproduction',
    nameRu: 'Семена люцерны, первая репродукция',
    nameUz: "Beda urug'i, birinchi reproduksiya",
    priceUzs: 184_000,
    region: 'Samarqand',
    stockQuantity: 96,
    supplier: suppliers.andijonUrug,
    unit: '20 kg',
  },
  {
    category: 'fertilizer',
    description: 'Аммофос 12:52, гранулированный. Для основной заправки под хлопок и зерновые.',
    name: 'Ammophos 12:52',
    nameRu: 'Аммофос 12:52',
    nameUz: 'Ammofos 12:52',
    priceUzs: 3_150_000,
    region: 'Navoiy',
    stockQuantity: 42,
    supplier: suppliers.agroKimyo,
    unit: '1 t',
  },
  {
    category: 'fertilizer',
    description: 'Карбамид 46% азота, азотная подкормка. Отгрузка со склада в Навои, минимальная партия 1 тонна.',
    name: 'Urea 46% N',
    nameRu: 'Карбамид 46% N',
    nameUz: 'Karbamid 46% N',
    priceUzs: 2_760_000,
    region: 'Navoiy',
    stockQuantity: 88,
    supplier: suppliers.agroKimyo,
    unit: '1 t',
  },
  {
    category: 'pesticide',
    description: 'Системный фунгицид против мучнистой росы на винограде и овощных. Срок ожидания 14 дней.',
    name: 'Systemic fungicide, 5 L',
    nameRu: 'Системный фунгицид, 5 л',
    nameUz: 'Tizimli fungitsid, 5 l',
    priceUzs: 428_000,
    region: 'Samarqand',
    stockQuantity: 130,
    supplier: suppliers.agroKimyo,
    unit: '5 l',
  },
];

const equipment: readonly DemoProductSeed[] = [
  {
    category: 'equipment',
    description:
      'Трактор 80 л.с., 2023 год, наработка 640 моточасов. Полный сервисный лист, гарантия поставщика 6 месяцев.',
    name: 'Tractor TTZ-80, 2023',
    nameRu: 'Трактор ТТЗ-80, 2023',
    nameUz: 'Traktor TTZ-80, 2023',
    priceUzs: 268_000_000,
    region: "Farg'ona",
    stockQuantity: 3,
    supplier: suppliers.fargonaTexnika,
    unit: '1 pc',
  },
  {
    category: 'equipment',
    description: 'Навесной оборотный плуг, 3 корпуса, ширина захвата 1,05 м. Для тракторов от 60 л.с.',
    name: 'Reversible plough, 3 furrow',
    nameRu: 'Плуг оборотный, 3 корпуса',
    nameUz: 'Aylanuvchi plug, 3 korpus',
    priceUzs: 18_400_000,
    region: "Farg'ona",
    stockQuantity: 11,
    supplier: suppliers.fargonaTexnika,
    unit: '1 pc',
  },
  {
    category: 'equipment',
    description: 'Ручной опрыскиватель 16 л с телескопической штангой. Ремкомплект в комплекте.',
    name: 'Knapsack sprayer, 16 L',
    nameRu: 'Опрыскиватель ранцевый, 16 л',
    nameUz: "Yelkada ko'tariladigan purkagich, 16 l",
    priceUzs: 640_000,
    region: 'Toshkent',
    stockQuantity: 210,
    supplier: suppliers.fargonaTexnika,
    unit: '1 pc',
  },
  {
    category: 'irrigation',
    description: 'Комплект капельного орошения на 1 га: лента, фитинги, фильтростанция. Монтаж по договорённости.',
    name: 'Drip irrigation kit, 1 ha',
    nameRu: 'Комплект капельного орошения, 1 га',
    nameUz: "Tomchilatib sug'orish to'plami, 1 ga",
    priceUzs: 12_900_000,
    region: 'Qashqadaryo',
    stockQuantity: 24,
    supplier: suppliers.qashqaSuv,
    unit: '1 set',
  },
  {
    category: 'irrigation',
    description: 'Дизельный насос 4”, подача 90 м³/ч, напор 32 м. Для поливных каналов и водоёмов.',
    name: 'Diesel water pump 4”',
    nameRu: 'Дизельный водяной насос 4”',
    nameUz: 'Dizel suv nasosi 4”',
    priceUzs: 9_450_000,
    region: 'Qashqadaryo',
    stockQuantity: 7,
    supplier: suppliers.qashqaSuv,
    unit: '1 pc',
  },
  {
    category: 'equipment',
    description: 'Прицеп тракторный самосвальный 2ПТС-4, грузоподъёмность 4 т, б/у, состояние рабочее.',
    name: 'Tipping trailer 2PTS-4, used',
    nameRu: 'Прицеп самосвальный 2ПТС-4, б/у',
    nameUz: "O'zi yuk tushiruvchi tirkama 2PTS-4",
    priceUzs: 21_700_000,
    region: 'Jizzax',
    stockQuantity: 2,
    supplier: suppliers.fargonaTexnika,
    unit: '1 pc',
  },
];

const produce: readonly DemoProductSeed[] = [
  {
    category: 'other',
    description: 'Столовый сорт, калибр 22+, урожай 2026. Хранение в холодильной камере, готово к отгрузке.',
    name: 'Table grapes “Husayni”, grade 1',
    nameRu: 'Виноград столовый «Хусайни», 1 сорт',
    nameUz: 'Uzum «Husayni», 1-navli',
    priceUzs: 14_800_000,
    region: 'Samarqand',
    stockQuantity: 36,
    supplier: suppliers.samarqandBog,
    unit: '1 t',
  },
  {
    category: 'other',
    description: 'Сушёный урюк без сердцевины, влажность 18%, фасовка по 10 кг. Экспортное качество.',
    name: 'Dried apricot, export grade',
    nameRu: 'Урюк сушёный, экспортный',
    nameUz: "Quritilgan o'rik, eksport sifati",
    priceUzs: 42_500_000,
    region: "Farg'ona",
    stockQuantity: 18,
    supplier: suppliers.xorazmHosil,
    unit: '1 t',
  },
  {
    category: 'other',
    description: 'Картофель продовольственный, калибр 45–70 мм, сорт Ривьера. Минимальная партия 5 т.',
    name: 'Ware potato “Riviera”',
    nameRu: 'Картофель продовольственный «Ривьера»',
    nameUz: 'Oziq-ovqat kartoshkasi «Riviera»',
    priceUzs: 4_200_000,
    region: 'Toshkent',
    stockQuantity: 120,
    supplier: suppliers.dehqonBozor,
    unit: '1 t',
  },
  {
    category: 'other',
    description: 'Лук репчатый жёлтый, калибр 60+, урожай текущего сезона. Сетка 25 кг.',
    name: 'Yellow onion, 60+ mm',
    nameRu: 'Лук репчатый жёлтый, 60+ мм',
    nameUz: 'Sarimsoq piyoz, 60+ mm',
    priceUzs: 2_950_000,
    region: 'Xorazm',
    stockQuantity: 240,
    supplier: suppliers.xorazmHosil,
    unit: '1 t',
  },
  {
    // Deliberately sold out: it is the row that exercises the out-of-stock badge
    // and the "in stock" filter. The listing itself stays active, because the
    // catalog endpoints only ever publish active rows.
    category: 'other',
    description: 'Дыня «Гурвак», средний вес плода 4,5 кг. Отгрузка партиями от 3 тонн, самовывоз.',
    name: 'Melon “Gurvak”',
    nameRu: 'Дыня «Гурвак»',
    nameUz: "Qovun «G'urvak»",
    priceUzs: 5_600_000,
    region: 'Xorazm',
    stockQuantity: 0,
    supplier: suppliers.xorazmHosil,
    unit: '1 t',
  },
  {
    category: 'other',
    description: 'Хлопковый жмых, протеин 38%, для кормовых смесей. Отгрузка навалом или в биг-бэгах.',
    name: 'Cottonseed cake, 38% protein',
    nameRu: 'Хлопковый жмых, протеин 38%',
    nameUz: 'Paxta kunjarasi, 38% protein',
    priceUzs: 3_400_000,
    region: 'Andijon',
    stockQuantity: 64,
    supplier: suppliers.dehqonBozor,
    unit: '1 t',
  },
];

const supplierId = (name: string): string => `demo-supplier-${name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')}`;

/**
 * Whether a demo listing offers a sample. A buyer can ask for a handful of seed
 * or a sack of fertilizer before committing to a truckload, but nobody samples a
 * tractor, so machinery and irrigation kits offer none.
 */
const sampleAvailableFor = (category: ProductCategory): boolean =>
  category !== 'equipment' && category !== 'irrigation';

const toProduct = (seed: DemoProductSeed, index: number): Product => ({
  category: seed.category,
  createdAt,
  description: seed.description,
  id: demoProductId(index + 1),
  images: [],
  name: seed.name,
  nameRu: seed.nameRu,
  nameUz: seed.nameUz,
  priceUzs: seed.priceUzs,
  region: seed.region,
  sampleAvailable: sampleAvailableFor(seed.category),
  status: 'active',
  stockQuantity: seed.stockQuantity,
  supplierId: supplierId(seed.supplier),
  supplierName: seed.supplier,
  unit: seed.unit,
  updatedAt,
});

export const DemoProducts: readonly Product[] = [...seeds, ...equipment, ...produce].map(toProduct);

/** Mirrors the repository filter so demo and live reads answer a query alike. */
export function filterDemoProducts(filter?: { category?: ProductCategory; region?: string }): Product[] {
  return DemoProducts.filter(
    (product) =>
      (!filter?.category || product.category === filter.category) &&
      (!filter?.region || product.region === filter.region),
  );
}

/** Resolves a demo listing by id, so product detail works on demo content too. */
export const findDemoProduct = (id: string): Product | undefined => DemoProducts.find((product) => product.id === id);

/** Whether an id belongs to the demo dataset rather than a tenant's own catalog. */
export const isDemoProductId = (id: string): boolean => DemoProducts.some((product) => product.id === id);
