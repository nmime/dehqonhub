// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import type { ReactNode } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type { MarketplacePublicProfileDto, MarketplacePublicProfileReviewDto } from '@app/frontend-api-client';
import type { Resource } from '../model/use-marketplace-data';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceListSkeleton, MarketplaceLoadingRegion, MarketplaceStatsSkeleton } from './marketplace-loading';
import { marketplaceRatingScale } from './marketplace-rating';
import { formatDate, formatRating, type MarketplaceNavigate, type MarketplaceTranslate } from './marketplace-ui';

/**
 * Where a profile lives in the browser.
 *
 * A seller keeps the address the catalog already links to, so every existing
 * `/sellers/<id>` link stays valid and the profile is simply what that page now
 * shows. A party without a catalog - a buyer - is addressed by its derived
 * profile id. Neither form is a user, tenant or partner identifier.
 */
export const marketplaceSellerProfileHref = (sellerId: string): string => `/sellers/${encodeURIComponent(sellerId)}`;
export const marketplacePartyProfileHref = (profileId: string): string => `/parties/${encodeURIComponent(profileId)}`;

interface ProfileReviewProps {
  locale: Locale;
  navigate?: MarketplaceNavigate;
  review: MarketplacePublicProfileReviewDto;
  t: MarketplaceTranslate;
}

/**
 * One review row on a profile.
 *
 * A received review has no author line: the marketplace publishes what was said
 * about a listing, never who said it, and a profile page is not an exception to
 * that. A written review names the seller it was about, because the profile is
 * already the author and that seller's public name is guest-visible anyway.
 */
function ProfileReview({ locale, navigate, review, t }: Readonly<ProfileReviewProps>) {
  return (
    <article>
      <div>
        <strong>
          {review.rating}/{marketplaceRatingScale}
        </strong>
        <span>{formatDate(review.createdAt, locale)}</span>
      </div>
      <p className="dh-review-verified">{t('agritech.marketplace.reviews.verifiedDeal')}</p>
      <p className="dh-profile-review__meta">
        {review.subject ? (
          <span>{t('agritech.marketplace.profile.reviewAbout', { seller: review.subject.displayName })}</span>
        ) : (
          <span>{t('agritech.marketplace.profile.reviewAnonymous')}</span>
        )}
        {navigate ? (
          <button
            className="dh-text-button"
            onClick={() => {
              navigate(`/products/${encodeURIComponent(review.listingId)}`);
            }}
            type="button"
          >
            {t('agritech.marketplace.profile.reviewListing', { listing: review.listingTitle })}
          </button>
        ) : (
          <span>{t('agritech.marketplace.profile.reviewListing', { listing: review.listingTitle })}</span>
        )}
      </p>
      {review.comment ? <p>{review.comment}</p> : null}
      {review.reply ? (
        <blockquote className="dh-review-reply">
          <strong>{t('agritech.marketplace.reviews.sellerReply')}</strong>
          <p>{review.reply.comment}</p>
        </blockquote>
      ) : null}
    </article>
  );
}

interface ProfileReviewSectionProps extends ProfileReviewListProps {
  headingId: string;
  title: string;
}

interface ProfileReviewListProps {
  emptyDescription: string;
  emptyTitle: string;
  locale: Locale;
  navigate?: MarketplaceNavigate;
  reviews: readonly MarketplacePublicProfileReviewDto[];
  t: MarketplaceTranslate;
}

function ProfileReviewSection({ headingId, title, ...list }: Readonly<ProfileReviewSectionProps>) {
  return (
    <section aria-labelledby={headingId} className="dh-detail-section">
      <div className="dh-section__head">
        <h2 id={headingId}>{title}</h2>
      </div>
      {list.reviews.length === 0 ? (
        <div className="dh-inline-empty">
          <strong>{list.emptyTitle}</strong>
          <p className="dh-muted">{list.emptyDescription}</p>
        </div>
      ) : (
        <div className="dh-review-list">
          {list.reviews.map((review) => (
            <ProfileReview
              key={review.id}
              locale={list.locale}
              navigate={list.navigate}
              review={review}
              t={list.t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const sectionLabelKeys = {
  equipment: 'agritech.marketplace.section.equipment',
  produce: 'agritech.marketplace.section.produce',
  seeds: 'agritech.marketplace.section.seeds',
} as const;

interface ProfileReputationProps {
  locale: Locale;
  profile: MarketplacePublicProfileDto;
  t: MarketplaceTranslate;
}

/**
 * The reputation block.
 *
 * Every figure here is a count or a date the server derived from completed
 * deals; nothing on this page can be added up into somebody else's contract. The
 * privacy note is printed rather than assumed, so a visitor knows what the page
 * deliberately does not say.
 */
function ProfileReputation({ locale, profile, t }: Readonly<ProfileReputationProps>) {
  const { reputation } = profile;
  const noHistory = reputation.completedDeals === 0 && reputation.reviewsReceived.count === 0;
  return (
    <section aria-labelledby="dh-profile-reputation" className="dh-detail-section">
      <div className="dh-section__head">
        <h2 id="dh-profile-reputation">{t('agritech.marketplace.profile.reputation')}</h2>
      </div>
      {noHistory ? (
        <div className="dh-inline-empty">
          <strong>{t('agritech.marketplace.profile.emptyHistory')}</strong>
          <p className="dh-muted">{t('agritech.marketplace.profile.emptyHistoryDescription')}</p>
        </div>
      ) : (
        <>
          <div className="dh-stat-grid">
            <div>
              <strong>{reputation.completedDeals}</strong>
              <span>{t('agritech.marketplace.profile.completedDeals')}</span>
            </div>
            <div>
              <strong>{reputation.completedDealsAsSeller}</strong>
              <span>{t('agritech.marketplace.profile.completedDealsAsSeller')}</span>
            </div>
            <div>
              <strong>{reputation.completedDealsAsBuyer}</strong>
              <span>{t('agritech.marketplace.profile.completedDealsAsBuyer')}</span>
            </div>
          </div>
          <dl className="dh-profile-facts">
            <div>
              <dt>{t('agritech.marketplace.profile.averageRating')}</dt>
              <dd>
                {reputation.reviewsReceived.averageRating === null
                  ? t('agritech.marketplace.reviews.none')
                  : `${formatRating(reputation.reviewsReceived.averageRating, locale)} / ${marketplaceRatingScale}`}
              </dd>
            </div>
            {reputation.firstDealAt && reputation.lastDealAt ? (
              <div>
                {/* The row states when this party traded, not how much: labelling it
                    "completed deals" repeated the tile above and named the wrong thing. */}
                <dt>{t('agritech.marketplace.profile.dealPeriod')}</dt>
                <dd>
                  {t('agritech.marketplace.profile.dealWindow', {
                    from: formatDate(reputation.firstDealAt, locale),
                    to: formatDate(reputation.lastDealAt, locale),
                  })}
                </dd>
              </div>
            ) : null}
            {reputation.sections.length > 0 ? (
              <div>
                <dt>{t('agritech.marketplace.profile.sections')}</dt>
                <dd>{reputation.sections.map((section) => t(sectionLabelKeys[section])).join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        </>
      )}
      <p className="dh-muted dh-profile-boundary">{t('agritech.marketplace.profile.boundary')}</p>
    </section>
  );
}

export interface MarketplacePublicProfileProps {
  /** Rendered under the reviews, e.g. the seller's own catalog. */
  children?: ReactNode;
  /**
   * Whether this block owns the page heading. The seller route already prints the
   * organization's name and verification from the catalog's own seller read, so
   * it renders the record without a second identity block; the standalone party
   * route owns the whole page and keeps it.
   */
  identity?: boolean;
  locale: Locale;
  navigate?: MarketplaceNavigate;
  profile: Resource<MarketplacePublicProfileDto | null>;
  t: MarketplaceTranslate;
}

/**
 * Another party's public profile: who they are, what their trading record adds
 * up to, and the deal-verified reviews pointing in both directions.
 *
 * Loading and failure are states of this region rather than separate screens, so
 * the same landmark that announced the profile as loading announces it as ready.
 * "Not public" is spelled out as its own honest answer: the API answers 404 for a
 * party the marketplace holds no moderated public name for, and inventing a
 * placeholder identity for them would be worse than saying so.
 */
export function MarketplacePublicProfile({
  children,
  identity = true,
  locale,
  navigate,
  profile,
  t,
}: Readonly<MarketplacePublicProfileProps>) {
  return (
    <MarketplaceLoadingRegion
      busy={profile.status === 'loading' || profile.status === 'idle'}
      label={t('agritech.marketplace.profile.title')}
      skeleton={
        <div className="dh-page-stack">
          <MarketplaceStatsSkeleton count={3} />
          <MarketplaceListSkeleton count={2} lines={3} tone="plain" trailing={false} />
        </div>
      }
      t={t}
    >
      <MarketplacePublicProfileBody
        identity={identity}
        locale={locale}
        navigate={navigate}
        profile={profile}
        t={t}
      >
        {children}
      </MarketplacePublicProfileBody>
    </MarketplaceLoadingRegion>
  );
}

function MarketplacePublicProfileBody({
  children,
  identity = true,
  locale,
  navigate,
  profile,
  t,
}: Readonly<MarketplacePublicProfileProps>) {
  if (!profile.data) {
    return (
      <div className="dh-inline-empty">
        <strong>{t('agritech.marketplace.profile.notFound')}</strong>
        <p className="dh-muted">
          {t(
            profile.status === 'error'
              ? 'agritech.marketplace.profile.notFoundDescription'
              : 'agritech.marketplace.profile.unavailable',
          )}
        </p>
      </div>
    );
  }
  const data = profile.data;
  return (
    <div className="dh-page-stack">
      {identity ? (
      <div className="dh-account-hero">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.profile.title')}</p>
          <h1>{data.displayName}</h1>
          <p>{data.description ?? t('agritech.marketplace.profile.noDescription')}</p>
          <small>{data.region}</small>
          <p className="dh-profile-roles">
            {data.roles.map((role) => (
              <span className="dh-badge dh-badge--outline" key={role}>
                {t(
                  role === 'seller'
                    ? 'agritech.marketplace.profile.role.seller'
                    : 'agritech.marketplace.profile.role.buyer',
                )}
              </span>
            ))}
            <span className="dh-badge dh-badge--neutral">
              {t('agritech.marketplace.profile.publicSince', { date: formatDate(data.publicSince, locale) })}
            </span>
          </p>
        </div>
        <div className={`dh-verification-chip${data.verified ? ' dh-verification-chip--verified' : ''}`}>
          <MarketplaceIcon name="shield" />
          <span>{t('agritech.marketplace.profile.verified')}</span>
        </div>
      </div>
      ) : null}
      <ProfileReputation locale={locale} profile={data} t={t} />
      <ProfileReviewSection
        emptyDescription={t('agritech.marketplace.profile.reviewsReceivedEmptyDescription')}
        emptyTitle={t('agritech.marketplace.profile.reviewsReceivedEmpty')}
        headingId="dh-profile-reviews-received"
        locale={locale}
        navigate={navigate}
        reviews={data.reviewsReceived}
        t={t}
        title={t('agritech.marketplace.profile.reviewsReceived')}
      />
      <ProfileReviewSection
        emptyDescription={t('agritech.marketplace.profile.reviewsWrittenEmptyDescription')}
        emptyTitle={t('agritech.marketplace.profile.reviewsWrittenEmpty')}
        headingId="dh-profile-reviews-written"
        locale={locale}
        navigate={navigate}
        reviews={data.reviewsWritten}
        t={t}
        title={t('agritech.marketplace.profile.reviewsWritten')}
      />
      {children}
    </div>
  );
}
