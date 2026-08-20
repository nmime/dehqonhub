// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import {
  marketplacePublicProfileId,
  marketplacePublicProfileIdNamespace,
  marketplaceReviewAverageRating,
} from '@app/backend-feature-agritech-shared';
import type {
  MarketplaceListingSection,
  MarketplacePublicProfile,
  MarketplacePublicProfileRepository,
  MarketplacePublicProfileReview,
  MarketplacePublicProfileRole,
} from '@app/backend-feature-agritech-shared';
import { marketplaceBuyerRolesSql, marketplaceSellerRolesSql } from './marketplace-role-predicates';

type RawTimestamp = Date | string | number;

interface ProfileCandidateRow {
  partner_id: string;
  role: MarketplacePublicProfileRole;
  display_name: string;
  region: string;
  description: string | null;
  seller_public_id: string | null;
  public_since: RawTimestamp;
}

interface DealSummaryRow {
  as_seller: string | number;
  as_buyer: string | number;
  first_deal_at: RawTimestamp | null;
  last_deal_at: RawTimestamp | null;
}

interface SectionRow {
  section: MarketplaceListingSection;
}

interface ReviewCountRow {
  review_count: string | number;
  rating_sum: string | number;
}

interface ProfileReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  listing_id: string;
  listing_title: string;
  section: MarketplaceListingSection;
  reply_comment: string | null;
  reply_created_at: RawTimestamp | null;
  subject_partner_id: string | null;
  subject_display_name: string | null;
  created_at: RawTimestamp;
}

const timestampFrom = (value: RawTimestamp): Date => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new TypeError('A public profile timestamp column returned an unparsable value.');
  }
  return parsed;
};

const optionalTimestampFrom = (value: RawTimestamp | null): Date | null =>
  value === null ? null : timestampFrom(value);

const integerFrom = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
};

/**
 * The public profile address as PostgreSQL derives it, byte for byte the same
 * value `marketplacePublicProfileId` derives in TypeScript.
 *
 * Resolving the address by recomputing it in the query is what keeps the private
 * partner id out of the URL without a second identity table to keep in step: the
 * derivation is the join key, so there is no row that can drift from it and no
 * write path that has to remember to create one. Only parties the marketplace
 * already holds a moderated public name for are searched, so the scan is over
 * the publication tables the anonymous catalog already reads, never over the
 * private partner directory.
 */
const derivedProfileIdSql = (column: string): string =>
  `left(encode(sha256(convert_to('${marketplacePublicProfileIdNamespace}:' || ${column}::text, 'UTF8')), 'hex'), 32)`;

/**
 * The set of parties a guest may see a profile for: an organization publishing a
 * moderated seller profile, or one whose purchase request publication carries a
 * moderated buyer display name. Anything else has no public name to show, so it
 * has no public profile - which is the opt-in boundary, not a gap.
 */
const candidateSql = (sellerPredicate: string, buyerPredicate: string): string => `
  select seller.partner_id as partner_id,
         'seller' as role,
         revision.display_name as display_name,
         revision.region as region,
         revision.description as description,
         seller.id as seller_public_id,
         seller.created_at as public_since
    from marketplace_public_sellers seller
    join lateral (
      select candidate.display_name, candidate.description, candidate.region
        from marketplace_public_seller_revisions candidate
       where candidate.seller_public_id = seller.id
         and candidate.tenant_id = seller.tenant_id
         and candidate.moderation_status = 'approved'
       order by candidate.content_revision desc
       limit 1
    ) revision on true
    join agritech_partners partner
      on partner.id = seller.partner_id
     and partner.tenant_id = seller.tenant_id
     and partner.owner_user_id = seller.owner_user_id
     and partner.status = 'approved'
     and partner.kind = 'supplier'
   where seller.status = 'published'
     and exists (
       select 1 from marketplace_verifications verification
        where verification.tenant_id = seller.tenant_id
          and verification.user_id = seller.owner_user_id
          and verification.status = 'verified'
          and verification.role in (${marketplaceSellerRolesSql})
     )
     and ${sellerPredicate}
  union all
  select publication.buyer_partner_id as partner_id,
         'buyer' as role,
         publication.buyer_display_name as display_name,
         publication.public_region as region,
         null as description,
         null as seller_public_id,
         publication.created_at as public_since
    from marketplace_request_publications publication
    join agritech_partners partner
      on partner.id = publication.buyer_partner_id
     and partner.tenant_id = publication.tenant_id
     and partner.owner_user_id = publication.buyer_user_id
     and partner.status = 'approved'
     and partner.kind = 'buyer'
   where publication.status = 'published'
     and publication.moderation_status = 'approved'
     and exists (
       select 1 from marketplace_verifications verification
        where verification.tenant_id = publication.tenant_id
          and verification.user_id = publication.buyer_user_id
          and verification.status = 'verified'
          and verification.role in (${marketplaceBuyerRolesSql})
     )
     and ${buyerPredicate}
`;

/**
 * A `union all` cannot be ordered by an expression over its own output columns,
 * so the branches are collected in a CTE first. The seller branch sorts ahead of
 * the buyer branch because a moderated seller revision is the more authoritative
 * public name for a party that holds both roles.
 */
const orderedCandidateSql = (sellerPredicate: string, buyerPredicate: string): string => `
  with candidate as (${candidateSql(sellerPredicate, buyerPredicate)})
  select partner_id, role, display_name, region, description, seller_public_id, public_since
    from candidate
   order by (role = 'seller') desc, public_since asc
`;

/** Resolved by recomputing the address, so both roles of one party come back together. */
const candidateByProfileIdSql = orderedCandidateSql(
  `${derivedProfileIdSql('seller.partner_id')} = ?`,
  `${derivedProfileIdSql('publication.buyer_partner_id')} = ?`,
);

/** Resolved by the public seller address, which can only ever match the seller branch. */
const candidateBySellerIdSql = orderedCandidateSql('seller.id = ?', 'false');

/** Only an eligible publication may lend its title to a public review row. */
const eligiblePublicationJoin = `
  join marketplace_listing_publications publication
    on publication.id = review.listing_publication_id
   and publication.status = 'published'
   and publication.moderation_status = 'approved'
`;

@Injectable()
export class PostgresMarketplacePublicProfileRepository implements MarketplacePublicProfileRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async findPublicProfile(profileId: string, reviewLimit: number): Promise<MarketplacePublicProfile | undefined> {
    const derived = profileId.replaceAll('-', '');
    return this.buildProfile(
      await this.executeRows<ProfileCandidateRow>(candidateByProfileIdSql, [derived, derived]),
      reviewLimit,
    );
  }

  async findPublicProfileBySellerId(
    sellerPublicId: string,
    reviewLimit: number,
  ): Promise<MarketplacePublicProfile | undefined> {
    const resolved = await this.executeRows<ProfileCandidateRow>(candidateBySellerIdSql, [sellerPublicId]);
    const seller = resolved[0];
    if (!seller) {
      return undefined;
    }
    // The seller address only names one of the roles this organization may hold,
    // so the full candidate set is re-read from its derived address. A party that
    // sells and buys gets one profile with both roles, never two half profiles.
    const derived = marketplacePublicProfileId(seller.partner_id).replaceAll('-', '');
    return this.buildProfile(
      await this.executeRows<ProfileCandidateRow>(candidateByProfileIdSql, [derived, derived]),
      reviewLimit,
    );
  }

  private async buildProfile(
    candidates: ProfileCandidateRow[],
    reviewLimit: number,
  ): Promise<MarketplacePublicProfile | undefined> {
    const first = candidates[0];
    if (!first) {
      return undefined;
    }
    const partnerId = first.partner_id;
    const [deals, sections, received, written, receivedPage, writtenPage] = await Promise.all([
      this.readDealSummary(partnerId),
      this.readDealSections(partnerId),
      this.readReviewCounts('review.seller_partner_id', partnerId),
      this.readReviewCounts('review.buyer_partner_id', partnerId),
      this.readReceivedReviews(partnerId, reviewLimit),
      this.readWrittenReviews(partnerId, reviewLimit),
    ]);

    const roles = [...new Set(candidates.map((candidate) => candidate.role))];
    const asSeller = integerFrom(deals.as_seller);
    const asBuyer = integerFrom(deals.as_buyer);
    const publicSince = candidates
      .map((candidate) => timestampFrom(candidate.public_since))
      .reduce((earliest, value) => (value < earliest ? value : earliest));

    return {
      id: marketplacePublicProfileId(partnerId),
      displayName: first.display_name,
      region: first.region,
      ...(first.description ? { description: first.description } : {}),
      roles,
      // Every candidate branch already required a current verified authority, so
      // a resolved profile is a verified one; the flag stays explicit because the
      // client renders a verification state rather than assuming one.
      verified: true,
      publicSince,
      ...(first.seller_public_id ? { sellerId: first.seller_public_id } : {}),
      reputation: {
        completedDeals: asSeller + asBuyer,
        completedDealsAsSeller: asSeller,
        completedDealsAsBuyer: asBuyer,
        firstDealAt: optionalTimestampFrom(deals.first_deal_at),
        lastDealAt: optionalTimestampFrom(deals.last_deal_at),
        sections: sections.map((row) => row.section),
        reviewsReceived: {
          count: integerFrom(received.review_count),
          averageRating: marketplaceReviewAverageRating(
            integerFrom(received.rating_sum),
            integerFrom(received.review_count),
          ),
        },
        reviewsWritten: { count: integerFrom(written.review_count) },
      },
      reviewsReceived: receivedPage,
      reviewsWritten: writtenPage,
    };
  }

  /**
   * Completed contracts only, and only as counts. A draft, active, signed,
   * cancelled or disputed contract is a live negotiation between two parties and
   * never public; a completed one is a fact about whether this organization
   * finishes what it starts.
   */
  private async readDealSummary(partnerId: string): Promise<DealSummaryRow> {
    const rows = await this.executeRows<DealSummaryRow>(
      `
        select count(*) filter (where contract.seller_partner_id = ?) as as_seller,
               count(*) filter (where contract.buyer_partner_id = ?) as as_buyer,
               min(coalesce(contract.signed_at, contract.created_at)) as first_deal_at,
               max(coalesce(contract.signed_at, contract.created_at)) as last_deal_at
          from marketplace_contracts contract
         where contract.status = 'completed'
           and (contract.seller_partner_id = ? or contract.buyer_partner_id = ?)
      `,
      [partnerId, partnerId, partnerId, partnerId],
    );
    return rows[0] ?? { as_buyer: 0, as_seller: 0, first_deal_at: null, last_deal_at: null };
  }

  /**
   * Which marketplace sections the completed deals happened in. A section is
   * already a public facet of every listing, so it describes what the party
   * trades without naming one counterparty, quantity or price.
   */
  private readDealSections(partnerId: string): Promise<SectionRow[]> {
    return this.executeRows<SectionRow>(
      `
        select distinct publication.section
          from marketplace_contracts contract
          cross join lateral jsonb_array_elements(contract.lines) line
          join marketplace_listing_publications publication
            on publication.id = (line->>'sourcePublicationId')::uuid
         where contract.status = 'completed'
           and line->>'sourceKind' in ('product', 'produce')
           and (contract.seller_partner_id = ? or contract.buyer_partner_id = ?)
         order by publication.section asc
      `,
      [partnerId, partnerId],
    );
  }

  private async readReviewCounts(column: string, partnerId: string): Promise<ReviewCountRow> {
    const rows = await this.executeRows<ReviewCountRow>(
      `
        select count(*) as review_count, coalesce(sum(review.rating), 0) as rating_sum
          from marketplace_listing_reviews review
          ${eligiblePublicationJoin}
         where ${column} = ? and review.visibility = 'visible'
      `,
      [partnerId],
    );
    return rows[0] ?? { rating_sum: 0, review_count: 0 };
  }

  /**
   * Reviews this organization received, author-free.
   *
   * The public listing projection carries no review author, and a profile is not
   * a licence to reintroduce one: naming the buyer here would publish the fact
   * that a named organization bought a named product, which the buyer never
   * offered to publish.
   */
  private async readReceivedReviews(partnerId: string, limit: number): Promise<MarketplacePublicProfileReview[]> {
    const rows = await this.executeRows<ProfileReviewRow>(
      `
        select review.id, review.rating, review.comment,
               publication.id as listing_id, publication.public_title as listing_title, publication.section,
               reply.comment as reply_comment, reply.created_at as reply_created_at,
               null as subject_partner_id, null as subject_display_name,
               review.created_at
          from marketplace_listing_reviews review
          ${eligiblePublicationJoin}
          left join marketplace_review_replies reply on reply.review_id = review.id
         where review.seller_partner_id = ? and review.visibility = 'visible'
         order by review.created_at desc, review.id asc
         limit ?
      `,
      [partnerId, limit],
    );
    return rows.map(reviewFromRow);
  }

  /**
   * Reviews this organization wrote. The profile is already the author, so the
   * row names the seller it was written about - a party whose public display
   * name and profile address are guest-visible anyway.
   */
  private async readWrittenReviews(partnerId: string, limit: number): Promise<MarketplacePublicProfileReview[]> {
    const rows = await this.executeRows<ProfileReviewRow>(
      `
        select review.id, review.rating, review.comment,
               publication.id as listing_id, publication.public_title as listing_title, publication.section,
               reply.comment as reply_comment, reply.created_at as reply_created_at,
               review.seller_partner_id as subject_partner_id, subject.display_name as subject_display_name,
               review.created_at
          from marketplace_listing_reviews review
          ${eligiblePublicationJoin}
          join marketplace_public_sellers seller
            on seller.partner_id = review.seller_partner_id
           and seller.status = 'published'
          join lateral (
            select candidate.display_name
              from marketplace_public_seller_revisions candidate
             where candidate.seller_public_id = seller.id
               and candidate.moderation_status = 'approved'
             order by candidate.content_revision desc
             limit 1
          ) subject on true
          left join marketplace_review_replies reply on reply.review_id = review.id
         where review.buyer_partner_id = ? and review.visibility = 'visible'
         order by review.created_at desc, review.id asc
         limit ?
      `,
      [partnerId, limit],
    );
    return rows.map(reviewFromRow);
  }

  private executeRows<T>(sql: string, parameters: unknown[]): Promise<T[]> {
    return this.em
      .getConnection()
      .execute(sql, parameters)
      .then((rows) => rows as unknown as T[]);
  }
}

const reviewFromRow = (row: ProfileReviewRow): MarketplacePublicProfileReview => ({
  id: row.id,
  rating: row.rating,
  ...(row.comment ? { comment: row.comment } : {}),
  verifiedDeal: true,
  listingId: row.listing_id,
  listingTitle: row.listing_title,
  section: row.section,
  ...(row.reply_comment && row.reply_created_at
    ? { reply: { comment: row.reply_comment, createdAt: timestampFrom(row.reply_created_at) } }
    : {}),
  ...(row.subject_partner_id && row.subject_display_name
    ? {
        subject: {
          displayName: row.subject_display_name,
          profileId: marketplacePublicProfileId(row.subject_partner_id),
        },
      }
    : {}),
  createdAt: timestampFrom(row.created_at),
});
