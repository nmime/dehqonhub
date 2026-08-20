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
      contract.lines.map((line) => ({
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
 * No review carries a photograph. `marketplace_listing_reviews.asset_references`
 * exists and takes up to three entries, but the column stores opaque
 * `public-asset:<id>` handles and nothing in this repository uploads, stores or
 * resolves one — there is no asset endpoint, no storage bucket and no client code
 * that renders them. Seeding handles would assert a provenance the deployment
 * cannot honour and would render as three broken images, so the fixture attaches
 * none and says so here instead.
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
    comment: "Два опрыскивателя из двенадцати потекли по штуцеру в первый же день.",
    daysAfter: 8,
    reply: "Заменили оба по гарантии, штуцеры новой партии уже с уплотнителем.",
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
    comment: "Работает, но инструкция только на английском — собирали по картинкам.",
    daysAfter: 9,
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
  return reviewSeeds.map((seed) => {
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
