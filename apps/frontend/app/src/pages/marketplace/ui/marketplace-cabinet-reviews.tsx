// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { useState } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type { MarketplaceOwnReviewDto, MarketplaceOwnReviewInvitationDto } from '@app/frontend-api-client';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceBusyButton } from './marketplace-loading';
import { marketplaceRatingScale, marketplaceReviewCommentLimit } from './marketplace-rating';
import { formatDate, type MarketplaceNavigate, type MarketplaceTranslate } from './marketplace-ui';

/**
 * Which way a review points.
 *
 * `written` is what this account said about other sellers; `received` is what
 * buyers said about its own listings. They are opposite reputational facts, so
 * the direction is an explicit argument rather than something a row infers from
 * whichever list it happens to be in.
 */
export type MarketplaceCabinetReviewDirection = 'received' | 'written';

export interface MarketplaceCabinetReviewListProps {
  readonly direction: MarketplaceCabinetReviewDirection;
  readonly entries: readonly MarketplaceOwnReviewDto[];
  readonly locale: Locale;
  readonly navigate: MarketplaceNavigate;
  /** Publishes the seller reply. Absent on the written side, which cannot reply. */
  readonly onReply?: (entry: MarketplaceOwnReviewDto, comment: string) => Promise<boolean>;
  readonly replyPending?: string;
  readonly t: MarketplaceTranslate;
}

/**
 * The listing title in the reader's language, falling back the way the catalog
 * does. The engagement summary carries the same four title fields every other
 * engagement read returns, so a Russian reader sees the Russian title here and
 * on the product page rather than one of each.
 */
const listingTitle = (listing: MarketplaceOwnReviewDto['listing'], locale: Locale): string => {
  if (locale === 'ru' && listing.titleRu) {
    return listing.titleRu;
  }
  if (locale === 'uz' && listing.titleUz) {
    return listing.titleUz;
  }
  if (locale === 'uz-cyrl') {
    return listing.titleUzCyrl ?? listing.titleUz ?? listing.title;
  }
  return listing.title;
};

/**
 * One review in the cabinet.
 *
 * The rating is printed as `4/5` and repeated as a full sentence for assistive
 * technology, never drawn as glyphs alone: this row is the record of a rating,
 * and a count of filled stars is a picture of a record rather than the record.
 * The scale and the comment limit come from `marketplace-rating.tsx`, which the
 * product page uses too, so the two screens cannot drift apart on either.
 */
function CabinetReviewRow({
  direction,
  entry,
  locale,
  navigate,
  onReply,
  replyPending,
  t,
}: Readonly<{
  direction: MarketplaceCabinetReviewDirection;
  entry: MarketplaceOwnReviewDto;
  locale: Locale;
  navigate: MarketplaceNavigate;
  onReply?: (entry: MarketplaceOwnReviewDto, comment: string) => Promise<boolean>;
  replyPending?: string;
  t: MarketplaceTranslate;
}>) {
  const [replying, setReplying] = useState(false);
  const { listing, review } = entry;
  return (
    <article className="dh-cabinet-review">
      <div className="dh-cabinet-review__head">
        <button
          className="dh-text-button dh-cabinet-review__listing"
          onClick={() => {
            navigate(`/products/${listing.id}`);
          }}
          type="button"
        >
          {listingTitle(listing, locale)}
        </button>
        <p className="dh-cabinet-review__rating">
          <strong>
            {review.rating}/{marketplaceRatingScale}
          </strong>
          <span className="dh-sr-only">
            {t('agritech.marketplace.reviews.ratingValue', {
              rating: review.rating,
              scale: marketplaceRatingScale,
            })}
          </span>
          <span>{formatDate(review.createdAt, locale)}</span>
        </p>
      </div>
      {/* Who the review is about, stated per row. Two lists on one screen are only
          unambiguous while each row also says which side of the deal it records. */}
      <p className="dh-cabinet-review__party">
        {direction === 'written'
          ? t('agritech.marketplace.reviews.mine.aboutSeller', { seller: listing.seller.displayName })
          : t('agritech.marketplace.reviews.mine.onMyListing')}
      </p>
      {review.comment ? <p className="dh-cabinet-review__comment">{review.comment}</p> : null}
      {review.reply ? (
        <blockquote className="dh-review-reply">
          <strong>{t('agritech.marketplace.reviews.sellerReply')}</strong>
          <p>{review.reply.comment}</p>
        </blockquote>
      ) : null}
      {/* The schema persists at most one reply per review, so a review that already
          carries one offers no second entry and the reply above is simply the
          record. Replying is offered only on the received side, because the reply
          endpoint accepts an active member of the reviewed seller organization and
          nobody else. */}
      {direction === 'received' && onReply && !review.reply ? (
        <div className="dh-cabinet-review__actions">
          <button
            className="dh-text-button"
            onClick={() => {
              setReplying((value) => !value);
            }}
            type="button"
          >
            {t('agritech.marketplace.reviews.reply')}
          </button>
        </div>
      ) : null}
      {direction === 'received' && onReply && !review.reply && replying ? (
        <form
          className="dh-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const field = new FormData(event.currentTarget).get('comment');
            const comment = typeof field === 'string' ? field.trim() : '';
            if (!comment) {
              return;
            }
            void onReply(entry, comment).then((published) => {
              if (published) {
                setReplying(false);
              }
            });
          }}
        >
          <label>
            <span>{t('agritech.marketplace.reviews.reply')}</span>
            <textarea maxLength={marketplaceReviewCommentLimit} name="comment" required rows={3} />
          </label>
          <MarketplaceBusyButton
            busy={replyPending === `review-reply:${review.id}`}
            busyLabel={t('agritech.marketplace.loading')}
            className="dh-button dh-button--secondary"
            type="submit"
          >
            {t('agritech.marketplace.reviews.replySubmit')}
          </MarketplaceBusyButton>
        </form>
      ) : null}
    </article>
  );
}

/** One direction's rows, or nothing at all when that direction is empty. */
export function MarketplaceCabinetReviewList({
  direction,
  entries,
  locale,
  navigate,
  onReply,
  replyPending,
  t,
}: Readonly<MarketplaceCabinetReviewListProps>) {
  if (entries.length === 0) {
    return (
      <p className="dh-muted">
        {t(
          direction === 'written'
            ? 'agritech.marketplace.reviews.mine.writtenEmpty'
            : 'agritech.marketplace.reviews.mine.receivedEmpty',
        )}
      </p>
    );
  }
  return (
    <div className="dh-cabinet-review-list">
      {entries.map((entry) => (
        <CabinetReviewRow
          direction={direction}
          entry={entry}
          key={entry.review.id}
          locale={locale}
          navigate={navigate}
          {...(onReply ? { onReply } : {})}
          {...(replyPending === undefined ? {} : { replyPending })}
          t={t}
        />
      ))}
    </div>
  );
}

export interface MarketplaceCabinetReviewInvitationsProps {
  readonly invitations: readonly MarketplaceOwnReviewInvitationDto[];
  readonly locale: Locale;
  readonly navigate: MarketplaceNavigate;
  readonly t: MarketplaceTranslate;
}

/**
 * The purchases this account may still rate.
 *
 * This block appears only when the server actually holds an unused
 * completed-contract eligibility, so it is never a general hint that reviewing
 * exists. The rating itself is written on the listing's own page, where the star
 * input and the comment limit already live, so each row is a link there rather
 * than a second authoring form the product page would then have to agree with.
 */
export function MarketplaceCabinetReviewInvitations({
  invitations,
  locale,
  navigate,
  t,
}: Readonly<MarketplaceCabinetReviewInvitationsProps>) {
  if (invitations.length === 0) {
    return null;
  }
  return (
    <div className="dh-cabinet-review-invitations">
      {/* One purchase is not "1 completed purchases": the singular has its own
          catalogue entry, exactly as the review count does. */}
      <p>
        {invitations.length === 1
          ? t('agritech.marketplace.reviews.mine.awaitingOne')
          : t('agritech.marketplace.reviews.mine.awaiting', { count: invitations.length })}
      </p>
      <ul className="dh-cabinet-rows">
        {invitations.map((invitation) => (
          <li key={invitation.listing.id}>
            <button
              onClick={() => {
                navigate(`/products/${invitation.listing.id}`);
              }}
              type="button"
            >
              <span className="dh-cabinet-rows__main">
                <strong>{listingTitle(invitation.listing, locale)}</strong>
                <small>
                  {invitation.listing.seller.displayName} · {formatDate(invitation.completedAt, locale)}
                </small>
              </span>
              <MarketplaceIcon name="arrow" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
