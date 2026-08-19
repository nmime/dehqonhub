import { demoMarketplaceContracts } from "./marketplace-seed-contracts.ts";
import { buyerEmail, farmerEmail, marketplaceFixtureUuid } from "./marketplace-seed-data.ts";

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
 * eligibilities. Two eligibilities are deliberately left unconsumed so the review
 * entry is reachable in the running demo rather than being a state only a test
 * can see.
 */

export interface DemoReviewEligibilityFixture {
  id: string;
  contractId: string;
  buyerOwnerEmail: string;
  buyerPartnerId: string;
  sellerOwnerEmail: string;
  sellerPartnerId: string;
  sourceKind: "product";
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
  sourceKind: "product";
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
  buyer: "farmer" | "trader";
  /** The catalog name of the purchased product, joined to its eligibility. */
  product: string;
  rating: number;
  comment: string;
  /** Days after delivery was accepted; a buyer rates a purchase, not a promise. */
  daysAfter: number;
  reply?: string;
}

const buyerEmails = { farmer: farmerEmail, trader: buyerEmail } as const;

/**
 * What the two demo buyers wrote.
 *
 * The free text is an authored comment, so it stays in the language it was typed
 * in and is never translated: the API stores one comment per review, not a
 * localized string. Ratings are mixed on purpose — a catalog of nothing but
 * fives says nothing, and the four listings both buyers bought need two
 * different opinions before their average is a number worth rounding.
 *
 * `contract:tomato-seed` (the trading house) and
 * `contract:farmer:ammonium-nitrate` (the farmer) are absent here deliberately.
 * Both settled this month and their eligibilities stay unconsumed, so a reviewer
 * signed in as either account finds a real entry waiting on a real listing.
 */
const reviewSeeds: readonly ReviewSeed[] = [
  {
    buyer: "trader",
    product: "Cotton seed “Omad” F1",
    rating: 5,
    comment: "Всхожесть совпала с заявленной, посеяли 12 га — вышло ровно.",
    daysAfter: 9,
    reply: "Спасибо за отзыв. Партия того же репродукционного класса будет в продаже к следующему севу.",
  },
  {
    buyer: "farmer",
    product: "Cotton seed “Omad” F1",
    rating: 4,
    comment: "Семена хорошие, но мешки пришли без пломб — пересчитывали вручную.",
    daysAfter: 12,
  },
  {
    buyer: "trader",
    product: "Ammophos 12:52",
    rating: 4,
    comment: "Гранула ровная, слежавшихся мешков не было. Забирали своим транспортом.",
    daysAfter: 6,
  },
  {
    buyer: "trader",
    product: "Knapsack sprayer, 16 L",
    rating: 3,
    comment: "Два опрыскивателя из двенадцати потекли по штуцеру в первый же день.",
    daysAfter: 8,
    reply: "Заменили оба по гарантии, штуцеры новой партии уже с уплотнителем.",
  },
  {
    buyer: "farmer",
    product: "Knapsack sprayer, 16 L",
    rating: 4,
    comment: "Для сада хватает, ремни бы пошире.",
    daysAfter: 15,
  },
  {
    buyer: "trader",
    product: "Winter wheat “Durdona”",
    rating: 5,
    comment: "Сортовая чистота подтверждена документами, поле ровное.",
    daysAfter: 21,
  },
  {
    buyer: "trader",
    product: "Drip irrigation kit, 1 ha",
    rating: 5,
    comment: "Фильтростанция в комплекте, монтаж занял один день. Расход воды упал заметно.",
    daysAfter: 11,
  },
  {
    buyer: "farmer",
    product: "Drip irrigation kit, 1 ha",
    rating: 4,
    comment: "Работает, но инструкция только на английском — собирали по картинкам.",
    daysAfter: 9,
  },
  {
    buyer: "trader",
    product: "Urea 46% N",
    rating: 5,
    comment: "Взяли второй раз, качество то же. Отгрузили за полдня.",
    daysAfter: 5,
  },
  {
    buyer: "farmer",
    product: "Urea 46% N",
    rating: 5,
    comment: "Цена честная, довезли без потерь.",
    daysAfter: 7,
  },
  {
    buyer: "trader",
    product: "Reversible plough, 3 furrow",
    rating: 4,
    comment: "Отвалы держат глубину, краска местами сколота при перевозке.",
    daysAfter: 14,
  },
  {
    buyer: "trader",
    product: "Alfalfa seed, first reproduction",
    rating: 5,
    comment: "Люцерна взошла дружно, сорной примеси не заметили.",
    daysAfter: 18,
  },
  {
    buyer: "farmer",
    product: "DAP 18:46",
    rating: 4,
    comment: "Пришло на два дня позже срока, в остальном без нареканий.",
    daysAfter: 10,
  },
  {
    buyer: "farmer",
    product: "Disc harrow, 2.4 m",
    rating: 5,
    comment: "Собрана аккуратно, подшипники в порядке. Пошла в работу сразу.",
    daysAfter: 13,
  },
  {
    buyer: "farmer",
    product: "Drip tape 16 mm, 0.3 m spacing, 1000 m",
    rating: 3,
    comment: "Одна бухта с браком по шву, остальные нормально.",
    daysAfter: 6,
  },
  {
    buyer: "farmer",
    product: "Pneumatic seed drill, 12 rows",
    rating: 5,
    comment: "Настраивается быстро, норму высева держит.",
    daysAfter: 16,
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
    const eligibility = byBuyerAndProduct.get(`${buyerEmails[seed.buyer]}|${seed.product}`);
    if (!eligibility) {
      throw new Error(
        `Demo review fixture rates ${seed.product}, which the demo ${seed.buyer} never completed a contract for.`,
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
