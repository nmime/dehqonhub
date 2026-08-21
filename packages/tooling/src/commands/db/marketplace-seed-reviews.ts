import { demoMarketplaceContracts } from "./marketplace-seed-contracts.ts";
import { buyerEmail, farmerEmail, marketplaceFixtureUuid } from "./marketplace-seed-roster.ts";

/**
 * Deal-verified ratings for the demo catalog.
 *
 * A public review is not free-standing content. `REQ-AGRITECH-ENGAGEMENT-019`
 * requires an unused eligibility created by a completed contract line, and
 * `assert_marketplace_listing_review_coherence` enforces exactly that in the
 * database: a review row is rejected unless an eligibility exists naming the
 * same buyer, seller partner, publication and source, with an approved buyer
 * partner, an active buyer membership and a verified buying role behind it.
 *
 * That is why the seeded marketplace had no ratings at all. Eligibility rows are
 * written by one path only — `accept_delivery` in
 * `PostgresMarketplaceContractLifecycleRepository.transitionFulfillment` — and
 * the fixture writes settled contracts directly, so it never travelled that
 * path. The completed contracts existed, the eligibilities did not, and every
 * review attempt answered `409` against an empty catalog of ratings.
 *
 * This module closes the gap the way the lifecycle would have: one eligibility
 * per completed contract line, and reviews filed only against those
 * eligibilities. Every buying login in the roster is left one unconsumed
 * eligibility, so the review entry is reachable in the running demo as any of
 * them rather than being a state only a test can see.
 */

export interface DemoReviewEligibilityFixture {
  id: string;
  contractId: string;
  buyerOwnerEmail: string;
  buyerPartnerId: string;
  sellerOwnerEmail: string;
  sellerPartnerId: string;
  sourceKind: "product" | "produce";
  sourceId: string;
  sourcePublicationId: string;
  /** The line's catalog name, which is how a review fixture addresses it. */
  sourceName: string;
  createdAt: Date;
}

export interface DemoReviewReplyFixture {
  id: string;
  sellerOwnerEmail: string;
  sellerPartnerId: string;
  comment: string;
  createdAt: Date;
}

export interface DemoReviewFixture {
  id: string;
  eligibilityId: string;
  listingPublicationId: string;
  sourceKind: "product" | "produce";
  sourceId: string;
  buyerOwnerEmail: string;
  buyerPartnerId: string;
  sellerOwnerEmail: string;
  sellerPartnerId: string;
  rating: number;
  comment: string;
  /**
   * Photographs the buyer attached, named by media fixture key and capped at
   * three by `ck__marketplace_listing_reviews__assets`.
   *
   * The seed turns each key into the `public-asset:<id>` handle the column
   * accepts when object storage took the bytes, and writes an empty array when it
   * did not: a handle whose object is missing renders as nothing, and a review
   * that quietly loses its photograph is better than one that shows a hole.
   */
  assetMediaKeys: readonly string[];
  createdAt: Date;
  reply: DemoReviewReplyFixture | null;
}

/**
 * One eligibility per completed contract line, keyed the way
 * `uq__contract_review_eligibilities__contract_source` is: a contract plus the
 * source it settled. A re-seed therefore updates the row it already wrote rather
 * than granting a buyer a second chance to review the same purchase.
 */
export function demoMarketplaceReviewEligibilities(now: Date): readonly DemoReviewEligibilityFixture[] {
  return demoMarketplaceContracts(now)
    .filter((contract) => contract.status === "completed")
    .flatMap((contract) =>
      contract.lines
        // A rating is left on a listing, and a line drawn from an awarded offer
        // quotes the purchase request instead: `marketplace_listing_reviews`
        // has a column for a product and one for a harvest and none for a
        // request, and its coherence trigger joins the eligibility to a listing
        // publication. So an offer-priced line grants no eligibility.
        .filter((line): line is typeof line & { sourceKind: "product" | "produce" } => line.sourceKind !== "request")
        .map((line) => ({
        id: marketplaceFixtureUuid(`review-eligibility:${contract.id}:${line.sourceKind}:${line.sourceId}`),
        contractId: contract.id,
        buyerOwnerEmail: contract.buyer.ownerEmail,
        buyerPartnerId: contract.buyer.partnerId,
        sellerOwnerEmail: contract.seller.ownerEmail,
        sellerPartnerId: contract.seller.partnerId,
        sourceKind: line.sourceKind,
        sourceId: line.sourceId,
        sourcePublicationId: line.sourcePublicationId,
        sourceName: line.name,
        // The lifecycle stamps an eligibility when delivery is accepted, which
        // for a settled fixture is the day the contract completed.
          createdAt: contract.updatedAt,
        })),
    );
}

interface ReviewSeed {
  /** The login that bought it; only the buyer of record may rate a purchase. */
  buyer: string;
  /** The listing name as the purchased line records it, product or harvest. */
  product: string;
  rating: number;
  comment: string;
  /** Days after delivery was accepted; a buyer rates a purchase, not a promise. */
  daysAfter: number;
  reply?: string;
  /**
   * Photographs the buyer took, by media fixture key. Only the buyer named above
   * may own them: `requireOwnedReferences` refuses a handle the acting account
   * did not upload, so a fixture that borrowed another login's photograph would be
   * seeding a review the API itself would have refused.
   */
  photos?: readonly string[];
}

/**
 * What the buyers wrote.
 *
 * The free text is an authored comment, so it stays in the language it was typed
 * in and is never translated: the API stores one comment per review, not a
 * localized string — which is also why some of these are Russian and some Uzbek.
 * Ratings are mixed on purpose — a catalog of nothing but fives says nothing, and
 * the listings two buyers both bought need two different opinions before their
 * average is a number worth rounding.
 *
 * Every buying login leaves one completed purchase unrated, so a reviewer signed
 * in as any of them finds a real review entry waiting on a real listing rather
 * than a catalog with nothing left to rate.
 *
 * Four reviews carry photographs. `marketplace_listing_reviews.asset_references`
 * has always accepted up to three opaque `public-asset:<id>` handles, and there
 * is now an upload endpoint that mints them, a bucket that holds the bytes, a
 * same-origin read path that serves them and a client that renders them, so the
 * fixture attaches them. It names each photograph by media fixture key rather
 * than by handle, and `marketplace-seed-media.storage` decides whether those
 * keys resolve: on a deployment whose bucket accepted the objects the review
 * carries its handles, and on one without object storage it carries none. What
 * the fixture never does is write a handle for an object that is not there.
 */
const reviewSeeds: readonly ReviewSeed[] = [
  {
    buyer: buyerEmail,
    product: "Cotton seed “Omad” F1",
    rating: 5,
    comment: "Всхожесть совпала с заявленной, посеяли 12 га — вышло ровно.",
    daysAfter: 9,
    reply: "Спасибо за отзыв. Партия того же репродукционного класса будет в продаже к следующему севу.",
  },
  {
    buyer: farmerEmail,
    product: "Cotton seed “Omad” F1",
    rating: 4,
    comment: "Семена хорошие, но мешки пришли без пломб — пересчитывали вручную.",
    daysAfter: 12,
  },
  {
    buyer: buyerEmail,
    product: "Ammophos 12:52",
    rating: 4,
    comment: "Гранула ровная, слежавшихся мешков не было. Забирали своим транспортом.",
    daysAfter: 6,
  },
  {
    buyer: buyerEmail,
    product: "Knapsack sprayer, 16 L",
    rating: 3,
    comment: "Два опрыскивателя из двенадцати потекли по штуцеру в первый же день. Фото штуцера прилагаю.",
    daysAfter: 8,
    reply: "Заменили оба по гарантии, штуцеры новой партии уже с уплотнителем.",
    photos: ["review:knapsack-sprayer:1"],
  },
  {
    buyer: farmerEmail,
    product: "Knapsack sprayer, 16 L",
    rating: 4,
    comment: "Для сада хватает, ремни бы пошире.",
    daysAfter: 15,
  },
  {
    buyer: buyerEmail,
    product: "Winter wheat “Durdona”",
    rating: 5,
    comment: "Сортовая чистота подтверждена документами, поле ровное.",
    daysAfter: 21,
  },
  {
    buyer: buyerEmail,
    product: "Drip irrigation kit, 1 ha",
    rating: 5,
    comment: "Фильтростанция в комплекте, монтаж занял один день. Расход воды упал заметно.",
    daysAfter: 11,
  },
  {
    buyer: farmerEmail,
    product: "Drip irrigation kit, 1 ha",
    rating: 4,
    comment: "Работает, но инструкция только на английском — собирали по картинкам. Фото собранного узла прилагаю.",
    daysAfter: 9,
    photos: ["review:drip-kit:1"],
  },
  {
    buyer: buyerEmail,
    product: "Urea 46% N",
    rating: 5,
    comment: "Взяли второй раз, качество то же. Отгрузили за полдня.",
    daysAfter: 5,
  },
  {
    buyer: farmerEmail,
    product: "Urea 46% N",
    rating: 5,
    comment: "Цена честная, довезли без потерь.",
    daysAfter: 7,
  },
  {
    buyer: buyerEmail,
    product: "Reversible plough, 3 furrow",
    rating: 4,
    comment: "Отвалы держат глубину, краска местами сколота при перевозке.",
    daysAfter: 14,
  },
  {
    buyer: buyerEmail,
    product: "Alfalfa seed, first reproduction",
    rating: 5,
    comment: "Люцерна взошла дружно, сорной примеси не заметили.",
    daysAfter: 18,
  },
  {
    buyer: farmerEmail,
    product: "DAP 18:46",
    rating: 4,
    comment: "Пришло на два дня позже срока, в остальном без нареканий.",
    daysAfter: 10,
  },
  {
    buyer: farmerEmail,
    product: "Disc harrow, 2.4 m",
    rating: 5,
    comment: "Собрана аккуратно, подшипники в порядке. Пошла в работу сразу.",
    daysAfter: 13,
  },
  {
    buyer: farmerEmail,
    product: "Drip tape 16 mm, 0.3 m spacing, 1000 m",
    rating: 3,
    comment: "Одна бухта с браком по шву, остальные нормально.",
    daysAfter: 6,
  },
  {
    buyer: farmerEmail,
    product: "Pneumatic seed drill, 12 rows",
    rating: 5,
    comment: "Настраивается быстро, норму высева держит.",
    daysAfter: 16,
  },
  {
    buyer: "nodira@demo.dehqonhub.uz",
    product: "Potassium sulphate 50% K2O",
    rating: 5,
    comment: "Сульфат бесхлорный, виноград отреагировал уже после первой подкормки. Мешки целые, вес точный.",
    daysAfter: 8,
    reply: "Спасибо! Следующая партия того же помола придёт к началу сезона.",
  },
  {
    buyer: "bekzod@demo.dehqonhub.uz",
    product: "Systemic fungicide for orchards, 5 L",
    rating: 5,
    comment: "Парша в саду остановилась после первой обработки. Канистры с мерной шкалой — удобно на баке.",
    daysAfter: 11,
  },
  {
    buyer: "gulnora@demo.dehqonhub.uz",
    product: "Ammonium sulphate 21% N",
    rating: 5,
    comment: "Гранула сухая, ни одного слежавшегося мешка. Разгрузили своим краном без потерь.",
    daysAfter: 9,
    reply: "Рады сотрудничеству, следующую отгрузку подготовим по вашему графику.",
  },
  {
    buyer: "sardor@demo.dehqonhub.uz",
    product: "Lucerne seed “Toshkent-3721”",
    rating: 5,
    comment: "Beda bir tekis unib chiqdi, begona o't aralashmasi ko'rinmadi. Hujjatlari to'liq.",
    daysAfter: 14,
  },
  {
    buyer: "dilnoza@demo.dehqonhub.uz",
    product: "Mulch film, black, 1.2 m × 1000 m",
    rating: 5,
    comment: "Плёнка ровная, без раковин по кромке. На восемь рулонов ни одного брака.",
    daysAfter: 7,
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Seed potato “Riviera”, first reproduction",
    rating: 5,
    comment: "Клубень калиброванный, ростки живые. Посадили без переборки, выпадов нет.",
    daysAfter: 12,
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Milling wheat, class 3",
    rating: 5,
    comment: "Пшеница сухая, натура 780, сор минимальный. Приняли на мельницу без скидки.",
    daysAfter: 6,
    reply: "Спасибо за быструю приёмку. Следующий обмолот отложим под вас.",
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Muskmelon, Ichkizil",
    rating: 5,
    comment: "Дыня доехала целой, укладка в сетку аккуратная. Сахар чувствуется сразу.",
    daysAfter: 5,
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Sweet cherry, calibre 24+",
    rating: 5,
    comment: "Черешня плотная, калибр честный, боя почти нет. Ящики вернули как договаривались.",
    daysAfter: 4,
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Table grapes, Kishmish Kherson",
    rating: 5,
    comment: "Кишмиш без осыпи, гребень зелёный. Взяли всю партию и добрали через неделю.",
    daysAfter: 7,
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Rotary tiller, 1.8 m",
    rating: 5,
    comment: "Фреза пришла в заводской упаковке, карданный вал и запасные ножи в комплекте.",
    daysAfter: 15,
  },
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Feed barley, bulk",
    rating: 5,
    comment: "Ячмень чистый, влажность 13%. Отгрузка шла двумя днями без простоя машин.",
    daysAfter: 6,
    reply: "Благодарим за оперативную приёмку, весы сошлись до килограмма.",
  },
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Alfalfa hay, third cut",
    rating: 5,
    comment: "Pichan quruq, hidi yaxshi, rulonlar bir xil zichlikda. Yo'lda to'kilish bo'lmadi.",
    daysAfter: 10,
  },
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Walnut, in shell, calibre 32+",
    rating: 5,
    comment: "Орех чистый, выход ядра 47%. Мешки по 30 кг, всё сошлось с документами.",
    daysAfter: 13,
  },
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Apple, Golden Delicious, calibre 70+",
    rating: 5,
    comment: "Яблоко однородное, без нажимов. Холодильник держал температуру всю дорогу.",
    daysAfter: 9,
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Seed cotton, hand picked",
    rating: 5,
    comment: "Сырец ручного сбора, сорность низкая, влажность в норме. Взвешивание совпало.",
    daysAfter: 12,
    reply: "Спасибо. Второй сбор с того же участка оставим за вами.",
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Sugar beet, factory grade",
    rating: 5,
    comment: "Свёкла без земли и хвостов, сахаристость по лаборатории 16,4%.",
    daysAfter: 8,
  },
];

/**
 * The rest of the corpus, written against the deals in
 * `expandedTradeContractSeeds`.
 *
 * A ratings block is only worth reading if it reads like people wrote it, so
 * three properties of this list are deliberate:
 *
 * - **Ratings are distributed, not flattered.** Verified-purchase corpora skew
 *   high and this one does too, but it is J-shaped rather than flat: roughly
 *   half fives, a third fours, and a real tail of threes, twos and ones. A
 *   listing with a three and a five now averages four because two people
 *   disagreed, which is the only way an average means anything.
 * - **Two languages, no translation.** The API stores one comment per review,
 *   not a localized string, so each comment stays in the language its author
 *   typed. Roughly three fifths are Russian and two fifths Uzbek (Latin
 *   script) — the two languages this marketplace is actually traded in. English
 *   appears in none of them, because no buyer here would write a review in it.
 * - **Complaints get answered.** Close to a third carry a seller reply, weighted
 *   towards the low ratings, because a seller who never answers a two-star
 *   review is a seller no reply feature was built for.
 *
 * Lengths vary from a single clause to a paragraph, for the same reason: a
 * corpus of uniformly sized comments is a corpus one hand wrote.
 */
const expandedReviewSeeds: readonly ReviewSeed[] = [
  // Xaridor Demo Savdo — a trading house rating inputs and implements.
  {
    buyer: buyerEmail,
    product: "Tomato “Nurafshon”",
    rating: 4,
    comment: "Взяли на пробу двадцать упаковок: всхожесть хорошая, но калибровка семян неровная, часть мелкая.",
    daysAfter: 17,
  },
  {
    buyer: buyerEmail,
    product: "DAP 18:46",
    rating: 4,
    comment: "Гранула сухая, россыпи в кузове не было. Один мешок пришёл подмоченным по краю, заменили без спора.",
    daysAfter: 8,
    reply: "Спасибо, что сообщили сразу. Подмоченный мешок списали, погрузку теперь укрываем при дожде.",
  },
  {
    buyer: buyerEmail,
    product: "Contact insecticide for cotton bollworm, 5 L",
    rating: 3,
    comment:
      "Ta'siri bor, lekin ikkinchi ishlovdan keyin qurt qayta paydo bo'ldi. Kanistralardan birining qopqog'i zich yopilmagan edi.",
    daysAfter: 14,
    reply: "Qopqoq bo'yicha partiyani tekshirdik. Ikkinchi ishlov uchun normani agronomimiz bilan kelishib olsangiz.",
  },
  {
    buyer: buyerEmail,
    product: "Systemic fungicide, 5 L",
    rating: 5,
    comment: "Работает по вилту, расход как в инструкции.",
    daysAfter: 21,
  },
  {
    buyer: buyerEmail,
    product: "Winter wheat “Bunyodkor”",
    rating: 5,
    comment: "Сортовая чистота по документам 99,2%, поле вышло ровным. Берём второй сезон подряд.",
    daysAfter: 24,
    reply: "Благодарим за повторный заказ. Под следующий сев отложим партию того же репродукционного класса.",
  },
  {
    buyer: buyerEmail,
    product: "Maize seed, silage hybrid",
    rating: 3,
    comment: "Unib chiqishi yaxshi, silos uchun to'g'ri keldi. Qoplarda etiketka faqat ruscha, sertifikat nusxasi yo'q.",
    daysAfter: 19,
  },
  {
    buyer: buyerEmail,
    product: "Mounted stubble cultivator, 2.6 m",
    rating: 5,
    comment: "Стойки крепкие, глубину держит на девяти километрах в час. Собрана аккуратно, follow-up не понадобился.",
    daysAfter: 11,
  },
  {
    buyer: buyerEmail,
    product: "Onion seed, yellow storage type",
    rating: 2,
    comment:
      "Из тридцати килограммов всхожесть дала едва половину, пересевали. Документы на партию пришли только после третьего запроса.",
    daysAfter: 6,
    reply: "Партию сняли с продажи и отправили на повторный анализ. По пересеву готовы возместить семенами.",
  },
  // Dehqon Demo Xo'jaligi — a farm rating what it bought for its own fields.
  {
    buyer: farmerEmail,
    product: "Ammonium nitrate 34.4% N",
    rating: 4,
    comment: "Мешки целые, вес сошёлся. Забирали сами, погрузчик дали без задержки.",
    daysAfter: 9,
  },
  {
    buyer: farmerEmail,
    product: "Systemic fungicide for orchards, 5 L",
    rating: 5,
    comment: "Olma bog'ida qora dog' to'xtadi. Kanistra o'lchov shkalasi bilan — bakka quyish oson.",
    daysAfter: 13,
  },
  {
    buyer: farmerEmail,
    product: "Calcium nitrate, water soluble",
    rating: 3,
    comment: "Растворяется полностью, но два мешка слежались в камень — видимо, лежали на складе у воды.",
    daysAfter: 16,
    reply: "Слежавшиеся мешки заменим при следующей отгрузке, склад перевели на поддоны.",
  },
  {
    buyer: farmerEmail,
    product: "Mulch film, black, 1.2 m × 1000 m",
    rating: 5,
    comment: "Plyonka bir tekis, kromkasi butun. O'nta rulondan birontasi ham brak emas.",
    daysAfter: 10,
  },
  {
    buyer: farmerEmail,
    product: "Greenhouse film, 200 micron, 12 m wide",
    rating: 4,
    comment: "Плотная, натянули без волн. Хотелось бы рукав на четырнадцать метров — под нашу теплицу пришлось кроить.",
    daysAfter: 12,
  },
  {
    buyer: farmerEmail,
    product: "Rotary tiller, 1.8 m",
    rating: 4,
    comment: "Freza zavod qadog'ida keldi, kardan vali va zapas pichoqlar komplektda. Yig'ish qo'llanmasi juda qisqa.",
    daysAfter: 18,
  },
  {
    buyer: farmerEmail,
    product: "Watermelon seed, open field",
    rating: 3,
    comment: "Всхожесть в норме, но в двух пакетах попадались семена другого сорта — на бахче видно.",
    daysAfter: 7,
    reply: "Проверяем упаковочную линию по этой партии. Два пакета возместим при следующем заказе.",
  },
  // Qodirova Fermer Xo'jaligi — Samarqand, wheat and stone fruit.
  {
    buyer: "nodira@demo.dehqonhub.uz",
    product: "Sprinkler irrigation set, 2 ha",
    rating: 4,
    comment: "Tizim yaxshi ishlaydi, bosim yetarli. Montaj bir kunda tugadi, lekin ba'zi fitinglarni alohida oldik.",
    daysAfter: 15,
  },
  {
    buyer: "nodira@demo.dehqonhub.uz",
    product: "Sunflower seed “Zarafshon”, hybrid",
    rating: 5,
    comment: "Гибрид держит засуху, шляпка ровная. Всхожесть по факту выше заявленной.",
    daysAfter: 22,
  },
  {
    buyer: "nodira@demo.dehqonhub.uz",
    product: "Lucerne seed “Toshkent-3721”",
    rating: 4,
    comment: "Beda unib chiqdi, lekin bir qopda begona o't urug'i bor edi. Hujjatlari joyida.",
    daysAfter: 20,
  },
  {
    buyer: "nodira@demo.dehqonhub.uz",
    product: "Selective herbicide for cereals, 10 L",
    rating: 3,
    comment: "По овсюгу сработал, по вьюнку почти нет. Возможно, поздно вышли в поле.",
    daysAfter: 12,
    reply: "По вьюнку нужна обработка до цветения. Напишите нам, подберём схему под ваш севооборот.",
  },
  {
    buyer: "nodira@demo.dehqonhub.uz",
    product: "Ammonium nitrate 34.4% N",
    rating: 5,
    comment: "Пять тонн, ни одного слежавшегося мешка. Забрали своим транспортом за полдня.",
    daysAfter: 8,
  },
  {
    buyer: "nodira@demo.dehqonhub.uz",
    product: "Drip tape 22 mm, 0.2 m spacing, 1000 m",
    rating: 4,
    comment: "Lenta sifatli, choklari puxta. Bir rulon o'ramda ezilgan edi, sotuvchi almashtirdi.",
    daysAfter: 11,
    reply: "Ezilgan rulon uchun uzr. Yuklashda burchak himoyasini qo'shdik.",
  },
  {
    buyer: "nodira@demo.dehqonhub.uz",
    product: "Fruit crates, 20 kg, 200 pcs",
    rating: 5,
    comment: "Ящики крепкие, штабелируются ровно. Взяли восемь упаковок, брака нет.",
    daysAfter: 5,
  },
  // Ergashev Fermer Xo'jaligi — Andijon, cotton and apples.
  {
    buyer: "bekzod@demo.dehqonhub.uz",
    product: "Cotton seed “Omad” F1",
    rating: 4,
    comment: "Yigirma ikki qop, unib chiqishi e'lon qilinganidek. Yetkazib berish sana bo'yicha bo'ldi.",
    daysAfter: 16,
  },
  {
    buyer: "bekzod@demo.dehqonhub.uz",
    product: "Contact insecticide for cotton bollworm, 5 L",
    rating: 5,
    comment: "По коробочному червю отработал с первого раза, повторную обработку не делали.",
    daysAfter: 10,
  },
  {
    buyer: "bekzod@demo.dehqonhub.uz",
    product: "Urea 46% N",
    rating: 4,
    comment: "Шесть тонн, вес сошёлся до мешка. Разгрузка своими силами.",
    daysAfter: 7,
  },
  {
    buyer: "bekzod@demo.dehqonhub.uz",
    product: "Disc harrow, 2.4 m",
    rating: 5,
    comment: "Diskalar o'tkir, podshipniklar joyida. Yig'ilishi puxta, darhol dalaga chiqdik.",
    daysAfter: 14,
  },
  {
    buyer: "bekzod@demo.dehqonhub.uz",
    product: "Knapsack sprayer, 16 L",
    rating: 2,
    comment: "Из шести опрыскивателей три потекли по штуцеру за первую неделю. Ремни трут плечо.",
    daysAfter: 9,
    reply: "Три опрыскивателя меняем по гарантии. Новая партия идёт с уплотнителем и широкими ремнями.",
  },
  {
    buyer: "bekzod@demo.dehqonhub.uz",
    product: "Submersible borehole pump, 5.5 kW",
    rating: 5,
    comment: "Nasos quduqqa muammosiz tushdi, boshqaruv paneli va kabel komplektda. Bosim pasportdagidek.",
    daysAfter: 12,
  },
  {
    buyer: "bekzod@demo.dehqonhub.uz",
    product: "Wettable sulphur for powdery mildew, 25 kg",
    rating: 3,
    comment: "Работает, но пылит сильно при засыпке — без респиратора не подойти.",
    daysAfter: 6,
  },
  // Yo'ldosheva Fermer Xo'jaligi — Xorazm, beet and melons.
  {
    buyer: "gulnora@demo.dehqonhub.uz",
    product: "Composted sheep manure, screened",
    rating: 5,
    comment: "Go'ng elangan, tosh va cho'p yo'q. Hidi o'tkir emas, dalaga bevosita sochdik.",
    daysAfter: 13,
  },
  {
    buyer: "gulnora@demo.dehqonhub.uz",
    product: "Watermelon seed, open field",
    rating: 4,
    comment: "Сорок пакетов, всхожесть ровная. Плод пошёл чуть мельче ожидаемого, но это, скорее, погода.",
    daysAfter: 25,
  },
  {
    buyer: "gulnora@demo.dehqonhub.uz",
    product: "Tomato “Nurafshon”",
    rating: 5,
    comment: "Pomidor bir tekis pishdi, transportga chidamli. Kelasi mavsumda ham shu urug'ni olamiz.",
    daysAfter: 23,
  },
  {
    buyer: "gulnora@demo.dehqonhub.uz",
    product: "Selective herbicide for cereals, 10 L",
    rating: 4,
    comment: "Восемь канистр, все с целыми пломбами. По злаковым сорнякам результат есть.",
    daysAfter: 11,
  },
  {
    buyer: "gulnora@demo.dehqonhub.uz",
    product: "HDPE main pipe 110 mm, PN10, 6 m",
    rating: 2,
    comment:
      "Труба заявленной толщины, но восемь штук из восьмидесяти пришли с задирами по торцу — стыковали с зачисткой, потеряли день.",
    daysAfter: 9,
    reply: "Восемь труб зачтём в следующую поставку. Торцы теперь закрываем заглушками на складе.",
  },
  {
    buyer: "gulnora@demo.dehqonhub.uz",
    product: "Disc filter station 2”, 1 ha",
    rating: 4,
    comment: "Filtr stansiyasi yig'ilgan holda, manometr bilan keldi. O'rnatish yarim kun.",
    daysAfter: 15,
  },
  {
    buyer: "gulnora@demo.dehqonhub.uz",
    product: "Grain combine harvester, 2019",
    rating: 3,
    comment:
      "Машина рабочая, но наработка оказалась больше, чем в объявлении. Пришлось сразу менять ремни и один подшипник.",
    daysAfter: 4,
    reply: "Наработку в карточке поправили. Ремни и подшипник компенсируем по чеку.",
  },
  // Toshmatov Fermer Xo'jaligi — Qashqadaryo, barley, lucerne and wheat.
  {
    buyer: "sardor@demo.dehqonhub.uz",
    product: "Ammonium sulphate 21% N",
    rating: 4,
    comment: "Гранула сухая, вес честный. Забирали сами, очередь на погрузке час.",
    daysAfter: 10,
  },
  {
    buyer: "sardor@demo.dehqonhub.uz",
    product: "Fodder maize seed “Jizzax-4”",
    rating: 5,
    comment: "Unib chiqishi 95 foizdan yuqori, silos uchun juda mos. Hujjatlar to'liq.",
    daysAfter: 21,
  },
  {
    buyer: "sardor@demo.dehqonhub.uz",
    product: "Composted sheep manure, screened",
    rating: 4,
    comment: "Go'ng quruq, elangan. Yigirma besh tonnadan ikki tonnasi mayda tosh bilan aralash edi.",
    daysAfter: 14,
    reply: "Elakni mayda fraksiyaga o'zgartirdik. Ikki tonna uchun keyingi yuklamada hisob-kitob qilamiz.",
  },
  {
    buyer: "sardor@demo.dehqonhub.uz",
    product: "Winter wheat “Bunyodkor”",
    rating: 5,
    comment: "Тридцать мешков, сортовая чистота подтверждена. Всходы дружные.",
    daysAfter: 19,
  },
  {
    buyer: "sardor@demo.dehqonhub.uz",
    product: "Round hay baler, trailed",
    rating: 3,
    comment: "Пресс держит плотность, рулон ровный. Гидравлические шланги на подаче коротковаты, тянули удлинители.",
    daysAfter: 17,
  },
  {
    buyer: "sardor@demo.dehqonhub.uz",
    product: "Tipping trailer 2PTS-4, used",
    rating: 2,
    comment:
      "Кузов варен в двух местах, о чём в объявлении не было. Тормозная система потребовала переборки сразу после приёмки.",
    daysAfter: 8,
    reply: "Сварные швы должны были быть в описании — это наша ошибка. Переборку тормозов возместим.",
  },
  {
    buyer: "sardor@demo.dehqonhub.uz",
    product: "Trailed field sprayer, 600 L",
    rating: 5,
    comment: "Purkagich sozlanishi oson, norma barqaror. Shtanga qanotlari mustahkam.",
    daysAfter: 12,
  },
  // Rasulova Fermer Xo'jaligi — Namangan, grapes, walnuts and a greenhouse.
  {
    buyer: "dilnoza@demo.dehqonhub.uz",
    product: "Submersible borehole pump, 5.5 kW",
    rating: 4,
    comment: "Насос работает тихо, напор как в паспорте. Кабель в комплекте оказался на два метра короче, чем нужно.",
    daysAfter: 13,
  },
  {
    buyer: "dilnoza@demo.dehqonhub.uz",
    product: "Systemic fungicide for orchards, 5 L",
    rating: 5,
    comment: "Bog'da qora dog'ga qarshi bir ishlov yetdi. Kanistralar butun, muddati uzoq.",
    daysAfter: 16,
  },
  {
    buyer: "dilnoza@demo.dehqonhub.uz",
    product: "Potassium sulphate 50% K2O",
    rating: 4,
    comment: "Бесхлорный, виноград принял хорошо. Три тонны, мешки целые.",
    daysAfter: 18,
  },
  {
    buyer: "dilnoza@demo.dehqonhub.uz",
    product: "Greenhouse film, 150 micron, 8 m wide",
    rating: 3,
    comment: "Plyonka o'tadi, lekin ikki rulonda kromka bo'ylab teshikchalar bor edi. Qolganlari normal.",
    daysAfter: 10,
    reply: "Ikki rulonni almashtiramiz. Kromka nuqsoni bo'yicha partiyani qaytadan ko'zdan kechirdik.",
  },
  {
    buyer: "dilnoza@demo.dehqonhub.uz",
    product: "Seedling trays, 105 cells, 100 pcs",
    rating: 5,
    comment: "Кассеты жёсткие, при выборке не ломаются. Взяли десять упаковок, будем брать ещё.",
    daysAfter: 7,
    reply: "Спасибо! Под весеннюю рассаду отложим для вас тот же артикул.",
  },
  {
    buyer: "dilnoza@demo.dehqonhub.uz",
    product: "Walk-behind power tiller, 7 hp petrol",
    rating: 3,
    comment: "Motoblok yaxshi tortadi, lekin qo'llanma faqat inglizcha. Yig'ishni rasmlar bo'yicha qildik.",
    daysAfter: 15,
  },
  {
    buyer: "dilnoza@demo.dehqonhub.uz",
    product: "Fruit crates, 20 kg, 200 pcs",
    rating: 5,
    comment: "Ящики без заусенцев, ручки удобные. Пять упаковок, все целые.",
    daysAfter: 6,
  },
  // Toshkent Oziq-ovqat Savdo — a food wholesaler rating harvests.
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Composted sheep manure, screened",
    rating: 4,
    comment: "Двадцать тонн, доставили в срок. Просеян хорошо, но пыли много при разгрузке.",
    daysAfter: 12,
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Yellow onion, 60+ mm",
    rating: 5,
    comment: "Piyoz kalibri to'g'ri, po'sti quruq. Setkalarda ezilgan bosh deyarli yo'q.",
    daysAfter: 8,
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Fresh apricot, table grade",
    rating: 3,
    comment: "Урюк доехал целым, укладка аккуратная. Два ящика из сорока пришли с перезрелым — на реализацию не пошли.",
    daysAfter: 5,
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Persimmon, chocolate type",
    rating: 5,
    comment: "Шоколадная, сладкая, без вязкости. Калибр ровный, боя нет.",
    daysAfter: 7,
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Greenhouse tomato, table grade",
    rating: 3,
    comment: "Pomidor mazasi yaxshi, ammo yetkazishda pastdagi qatlam ezilgan. Yo'l uzoq bo'lgan shekilli.",
    daysAfter: 4,
    reply: "Pastdagi qatlam uchun uzr. Keyingi yuklamada qattiq tagli yashik ishlatamiz.",
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Table grapes, Husayni grade 1",
    rating: 5,
    comment: "Гроздь целая, осыпи нет. Гребень зелёный — значит, срезали свежим.",
    daysAfter: 6,
    reply: "Спасибо за приёмку без задержки. Следующий срез оставим за вами.",
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Pomegranate, calibre 250+",
    rating: 4,
    comment: "Anor kalibri e'lon qilinganidek, po'sti yorilmagan. Uch tonnadan yo'qotish minimal.",
    daysAfter: 9,
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Carrot, storage grade",
    rating: 2,
    comment: "Морковь мытая, но в трёх сетках из сорока пошла гниль на второй день. Приняли со скидкой.",
    daysAfter: 3,
    reply: "Три сетки вычли из счёта. Партию с того же поля больше не отгружаем без переборки.",
  },
  {
    buyer: "kamola@demo.dehqonhub.uz",
    product: "Sweet cherry, calibre 24+",
    rating: 4,
    comment: "Черешня плотная, холодильник держал температуру. Калибр местами ниже 24, но в пределах допуска.",
    daysAfter: 3,
  },
  // Samarqand Ulgurji Savdo — a wholesaler rating fruit and packaging.
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Fruit crates, 20 kg, 200 pcs",
    rating: 4,
    comment: "Ящики нормальные, но в двух упаковках дно тоньше остальных. Для яблок сойдёт, для черешни нет.",
    daysAfter: 11,
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Dark raisins, sun-dried",
    rating: 5,
    comment: "Mayiz quruq, qumsiz. Uch tonna, og'irligi hujjatdagidek.",
    daysAfter: 9,
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Dried apricot, export grade",
    rating: 5,
    comment: "Курага сухая, цвет ровный, сернистого запаха нет. Взяли под экспорт, претензий нет.",
    daysAfter: 13,
    reply: "Спасибо. Следующую сушку того же сада придержим под ваш объём.",
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Mung bean, food grade",
    rating: 4,
    comment: "Mosh tozalangan, chiqindi kam. Bir qopda tosh bo'lakchalari uchradi.",
    daysAfter: 15,
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Melon, Gurvak",
    rating: 2,
    comment:
      "Дыня сладкая, но девять тонн грузили в жару без тени — часть пошла с подпалом и до склада не дожила. Считали убыток вместе.",
    daysAfter: 6,
    reply: "Согласны, погрузку в полдень больше не ставим. Подпаленную партию пересчитали в вашу пользу.",
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Watermelon, field grade",
    rating: 3,
    comment: "Tarvuz shirin, lekin kalibr aralash — yiriklari bilan mayda birga keldi. Yo'lda yo'qotish oz.",
    daysAfter: 5,
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Apple, Golden Delicious, calibre 70+",
    rating: 5,
    comment: "Яблоко однородное, без нажимов, холодильник держал всю дорогу.",
    daysAfter: 8,
  },
  {
    buyer: "farrux@demo.dehqonhub.uz",
    product: "Walnut, in shell, calibre 32+",
    rating: 4,
    comment: "Yong'oq toza, mag'iz chiqishi 45 foiz. Qoplar 30 kilogramm, hisob to'g'ri keldi.",
    daysAfter: 4,
  },
  // Sirdaryo Don Xarid — a grain and feed buyer.
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Sunflower seed “Zarafshon”, hybrid",
    rating: 1,
    comment:
      "O'ttiz qopdan unib chiqish 40 foizga ham yetmadi, dalani qayta ekishga majbur bo'ldik. Sertifikat uch marta so'ralgandan keyin keldi, unda ham partiya raqami boshqa edi.",
    daysAfter: 20,
    reply: "Partiyani sotuvdan olib qo'ydik va laboratoriyaga qayta yubordik. Qayta ekish xarajatini urug' bilan qoplaymiz.",
  },
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Maize grain, feed quality",
    rating: 4,
    comment: "Кукуруза сухая, влажность 13,5%. Тридцать пять тонн, сор в пределах нормы.",
    daysAfter: 10,
  },
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Alfalfa hay, second cut",
    rating: 5,
    comment: "Pichan quruq, rulonlar bir xil zichlikda. Hidi yaxshi, mol yaxshi yedi.",
    daysAfter: 14,
  },
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Rice, long grain milled",
    rating: 4,
    comment: "Рис чистый, битого мало. Забирали сами, погрузка шла быстро.",
    daysAfter: 7,
  },
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Cottonseed cake, 38% protein",
    rating: 3,
    comment: "Kunjara sifati normal, lekin uch tonnasi nam holda keldi. Qolgani quruq, muammo yo'q.",
    daysAfter: 9,
    reply: "Nam qismini hisobdan chiqardik. Yuklashdan oldin ombor tomini ta'mirladik.",
  },
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Milling wheat, class 3",
    rating: 5,
    comment: "Натура 782, влажность 12,8%. Приняли на элеватор без скидки, тридцать тонн.",
    daysAfter: 6,
    reply: "Спасибо за быструю приёмку. Следующий обмолот с того же поля предложим вам первыми.",
  },
  {
    buyer: "saida@demo.dehqonhub.uz",
    product: "Fodder maize seed “Jizzax-4”",
    rating: 4,
    comment: "Urug' toza, unib chiqishi yaxshi. Qoplarda etiketka yopishtirilmagan edi.",
    daysAfter: 5,
  },
  // Surxon Eksport Savdo — an exporter rating fruit and packaging.
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Fruit crates, 20 kg, 200 pcs",
    rating: 1,
    comment:
      "Из шести упаковок в четырёх дно проламывается уже на двадцати килограммах. Под экспорт такие ящики не годятся, отправили обратно за свой счёт и закрывали заказ у другого поставщика.",
    daysAfter: 7,
    reply: "Ящики принимаем обратно и возвращаем стоимость с доставкой. Партию с этой линии сняли с продажи.",
  },
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Pomegranate, calibre 250+",
    rating: 5,
    comment: "Anor kalibri katta, po'sti butun. Eksport qadoqqa mos, yo'qotish deyarli yo'q.",
    daysAfter: 12,
    reply: "Rahmat. Kelasi yig'im-terimda ham shu kalibrni siz uchun ajratamiz.",
  },
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Dried apricot, export grade",
    rating: 4,
    comment: "Курага ровная, влажность в норме. По весу сошлось, цвет чуть темнее образца.",
    daysAfter: 15,
  },
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Persimmon, chocolate type",
    rating: 5,
    comment: "Плод твёрдый, вязкости нет. Довезли холодильником, брака почти не было.",
    daysAfter: 10,
  },
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Garlic, dry, calibre 50+",
    rating: 3,
    comment: "Sarimsoq quruq, lekin uch tonnadan yuz kilogrammchasi unib ketgan. Qolgani yaxshi.",
    daysAfter: 8,
    reply: "Unib ketgan qismini hisobdan chiqardik. Omborni quruqroq bo'limga ko'chirdik.",
  },
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Table grapes, Kishmish Kherson",
    rating: 3,
    comment: "Kishmish to'kilmagan, g'ujum yashil. Ammo yigirma foizi mayda g'ujum bo'ldi, saralashga vaqt ketdi.",
    daysAfter: 6,
  },
  {
    buyer: "alisher@demo.dehqonhub.uz",
    product: "Melon, Gurvak",
    rating: 5,
    comment: "Пятнадцать тонн, сахар чувствуется сразу. Погрузили за день, потерь в дороге нет.",
    daysAfter: 4,
  },
  // Farg'ona Qayta Ishlash — a processor rating raw crops and chemistry.
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Rice, long grain milled",
    rating: 1,
    comment:
      "Заявлен длиннозёрный шлифованный, по факту битого зерна больше пятнадцати процентов и запах затхлый. Двадцать тонн пришлось перевести в крупу низшего сорта, разницу в цене закрывали сами.",
    daysAfter: 11,
    reply: "Партию признаём несортовой и возвращаем разницу. Склад с этой сушилки закрыли до ремонта вентиляции.",
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Calcium nitrate, water soluble",
    rating: 4,
    comment: "Растворяется без осадка, форсунки не забивает. Четыре тонны, мешки целые.",
    daysAfter: 9,
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Feed barley, bulk",
    rating: 5,
    comment: "Arpa toza, namligi 13 foiz. Qirq besh tonna ikki kunda tushirildi, mashinalar kutmadi.",
    daysAfter: 13,
    reply: "Rahmat, tarozi kilogrammgacha to'g'ri keldi. Keyingi partiyani grafik bo'yicha tayyorlaymiz.",
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Alfalfa hay, third cut",
    rating: 4,
    comment: "Pichan quruq, rulonlar bir xil. Bir mashinada past qatlam nam edi.",
    daysAfter: 16,
    reply: "Nam rulonlarni hisobdan chiqardik, ortishda tagiga to'shama qo'yamiz.",
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Muskmelon, Ichkizil",
    rating: 5,
    comment: "Дыня доехала целой, укладка в сетку плотная. Сахаристость высокая.",
    daysAfter: 6,
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Carrot, storage grade",
    rating: 2,
    comment: "Морковь калиброванная, но мойка слабая — землю снимали сами перед линией, потеряли смену.",
    daysAfter: 5,
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Mung bean, food grade",
    rating: 5,
    comment: "Mosh yirik, bir xil. Ikki tonnadan chiqindi ikki kilogramm ham emas.",
    daysAfter: 8,
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Apple, Golden Delicious, calibre 70+",
    rating: 3,
    comment: "Для сока подходит, но нажимов больше, чем ожидали. Двенадцать тонн приняли с переборкой.",
    daysAfter: 7,
  },
  {
    buyer: "nigora@demo.dehqonhub.uz",
    product: "Potassium sulphate 50% K2O",
    rating: 4,
    comment: "Sulfat xlorsiz, o'simlik tez javob berdi. Qoplar butun, tarozi to'g'ri keldi.",
    daysAfter: 10,
  },
];

/**
 * Ratings left through the marketplace itself rather than written by this
 * fixture. Both carry photographs, which is the whole reason they are kept: a
 * marketplace that accepts a photograph with a review and shows none on screen
 * has not demonstrated the feature.
 */
const uploadedPhotoReviewSeeds: readonly ReviewSeed[] = [
  {
    buyer: buyerEmail,
    product: "Trailed field sprayer, 600 L",
    rating: 5,
    comment:
      "Пришёл в срок, штанга ровная, форсунки без подтёков. Настройка нормы вылива заняла полчаса, фото на поле прилагаю.",
    daysAfter: 7,
    reply: "Спасибо. По этой модели держим сменные форсунки на складе, при необходимости поменяем по гарантии.",
    photos: ["review:trailed-sprayer:1"],
  },
  {
    buyer: buyerEmail,
    product: "Dark raisins, sun-dried",
    rating: 5,
    comment: "Кишмиш сухой, без песка и черенков, калибр ровный. Десять килограммов на пробу, берём партию.",
    daysAfter: 5,
    photos: ["review:raisins:1", "review:raisins:2"],
  },
];

const dayInMs = 24 * 60 * 60 * 1000;

/**
 * The reviews the demo buyers left, each bound to the eligibility its purchase
 * created. A seed naming a purchase neither buyer made is a fixture the database
 * would reject at insert time with a bare constraint name, so it is refused here
 * instead — where the message can say which one.
 */
export function demoMarketplaceReviews(now: Date): readonly DemoReviewFixture[] {
  const eligibilities = demoMarketplaceReviewEligibilities(now);
  const byBuyerAndProduct = new Map(
    eligibilities.map((eligibility) => [`${eligibility.buyerOwnerEmail}|${eligibility.sourceName}`, eligibility]),
  );
  return [...reviewSeeds, ...expandedReviewSeeds, ...uploadedPhotoReviewSeeds].map((seed) => {
    const eligibility = byBuyerAndProduct.get(`${seed.buyer}|${seed.product}`);
    if (!eligibility) {
      throw new Error(
        `Demo review fixture rates ${seed.product}, which ${seed.buyer} never completed a contract for.`,
      );
    }
    // A review cannot predate its purchase, and a fixture must not claim a date
    // that has not happened yet either.
    const createdAt = new Date(Math.min(eligibility.createdAt.getTime() + seed.daysAfter * dayInMs, now.getTime()));
    return {
      id: marketplaceFixtureUuid(`review:${eligibility.id}`),
      eligibilityId: eligibility.id,
      listingPublicationId: eligibility.sourcePublicationId,
      sourceKind: eligibility.sourceKind,
      sourceId: eligibility.sourceId,
      buyerOwnerEmail: eligibility.buyerOwnerEmail,
      buyerPartnerId: eligibility.buyerPartnerId,
      sellerOwnerEmail: eligibility.sellerOwnerEmail,
      sellerPartnerId: eligibility.sellerPartnerId,
      rating: seed.rating,
      comment: seed.comment,
      assetMediaKeys: seed.photos ?? [],
      createdAt,
      reply: seed.reply
        ? {
            id: marketplaceFixtureUuid(`review-reply:${eligibility.id}`),
            sellerOwnerEmail: eligibility.sellerOwnerEmail,
            sellerPartnerId: eligibility.sellerPartnerId,
            comment: seed.reply,
            createdAt: new Date(Math.min(createdAt.getTime() + 2 * dayInMs, now.getTime())),
          }
        : null,
    };
  });
}
