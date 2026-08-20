// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { useState, type ReactNode } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type { MarketplaceReviewDto, MarketplaceReviewSelfStateDto } from '@app/frontend-api-client';
import type { Resource, ResourceStatus } from '../model/use-marketplace-data';
import { MarketplaceBusyButton, MarketplaceListSkeleton } from './marketplace-loading';
import {
  MarketplaceRatingSummary,
  MarketplaceStarInput,
  marketplaceRatingScale,
  marketplaceReviewCommentLimit,
} from './marketplace-rating';
import { formatDate, type MarketplaceListing, type MarketplaceTranslate } from './marketplace-ui';

const reportReasons = ['abuse', 'off_topic', 'privacy', 'spam'] as const;

type ReportReason = (typeof reportReasons)[number];

const formText = (form: FormData, field: string): string => {
  const value = form.get(field);
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * What this visitor may do with the ratings of the listing in front of them.
 *
 * `eligible` means the server holds an unconsumed completed-contract eligibility
 * for them. `submitted` means they already rated this listing. `ineligible`
 * covers everybody else — anonymous visitors, the seller, and buyers who never
 * completed a contract for it — and it is deliberately not a shade of eligible:
 * that state shows the aggregate and nothing that reads like an invitation.
 */
export type MarketplaceReviewerState = 'eligible' | 'ineligible' | 'submitted';

/**
 * Resolves the reviewer state from the server's answer, falling back to what the
 * shell derived from the caller's own completed contracts.
 *
 * The server read is authoritative because it is the same state the write path
 * consumes; the fallback only decides whether to offer the form before that read
 * lands, and a local `submitted` flag keeps a buyer who has just rated from being
 * invited to rate again while the read is still in flight.
 */
export const marketplaceReviewerState = ({
  canReview,
  justSubmitted,
  selfState,
  selfStateStatus = 'idle',
}: Readonly<{
  canReview: boolean;
  justSubmitted: boolean;
  selfState?: MarketplaceReviewSelfStateDto;
  selfStateStatus?: ResourceStatus;
}>): MarketplaceReviewerState => {
  if (selfStateStatus === 'ready' && selfState) {
    if (selfState.review) {
      return 'submitted';
    }
    return selfState.canReview ? 'eligible' : 'ineligible';
  }
  if (justSubmitted) {
    return 'submitted';
  }
  return canReview ? 'eligible' : 'ineligible';
};

interface ReviewRowProps {
  canReplyToReviews: boolean;
  canReportReviews: boolean;
  locale: Locale;
  onReplyToReview: (review: MarketplaceReviewDto, comment: string) => Promise<boolean>;
  onReportReview: (review: MarketplaceReviewDto, reason: ReportReason, comment?: string) => Promise<boolean>;
  pendingAction?: string;
  review: MarketplaceReviewDto;
  t: MarketplaceTranslate;
}

/**
 * One published review. The rating is printed as `4/5` rather than only drawn,
 * because this row is the record of what a buyer said and a glyph count is not a
 * record. Seller replies are rendered when the review carries one — the schema
 * persists exactly one reply per review, so there is never a thread to unfold.
 */
function ReviewRow({
  canReplyToReviews,
  canReportReviews,
  locale,
  onReplyToReview,
  onReportReview,
  pendingAction,
  review,
  t,
}: Readonly<ReviewRowProps>) {
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  return (
    <article>
      <div>
        <strong>
          {review.rating}/{marketplaceRatingScale}
        </strong>
        <span>{formatDate(review.createdAt, locale)}</span>
      </div>
      {/* Every published review is deal verified — the API only ever creates one
          from a completed contract — so the label is unconditional rather than a
          flag the browser has to trust. */}
      <p className="dh-review-verified">{t('agritech.marketplace.reviews.verifiedDeal')}</p>
      {review.comment && <p>{review.comment}</p>}
      {review.reply ? (
        <blockquote className="dh-review-reply">
          <strong>{t('agritech.marketplace.reviews.sellerReply')}</strong>
          <p>{review.reply.comment}</p>
        </blockquote>
      ) : null}
      <div className="dh-review-actions">
        {canReplyToReviews && !review.reply ? (
          <button
            className="dh-text-button"
            onClick={() => {
              setReplying((value) => !value);
              setReporting(false);
            }}
            type="button"
          >
            {t('agritech.marketplace.reviews.reply')}
          </button>
        ) : null}
        {canReportReviews ? (
          <button
            className="dh-text-button"
            onClick={() => {
              setReporting((value) => !value);
              setReplying(false);
            }}
            type="button"
          >
            {t('agritech.marketplace.reviews.report')}
          </button>
        ) : null}
      </div>
      {replying ? (
        <form
          className="dh-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const comment = formText(new FormData(event.currentTarget), 'comment');
            if (comment) {
              void onReplyToReview(review, comment).then((submitted) => {
                if (submitted) {
                  setReplying(false);
                }
              });
            }
          }}
        >
          <label>
            <span>{t('agritech.marketplace.reviews.reply')}</span>
            <textarea maxLength={marketplaceReviewCommentLimit} name="comment" required rows={3} />
          </label>
          <MarketplaceBusyButton
            busy={pendingAction === `review-reply:${review.id}`}
            busyLabel={t('agritech.marketplace.loading')}
            className="dh-button dh-button--secondary"
            type="submit"
          >
            {t('agritech.marketplace.reviews.replySubmit')}
          </MarketplaceBusyButton>
        </form>
      ) : null}
      {reporting ? (
        <form
          className="dh-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const reason = formText(form, 'reason') as ReportReason;
            const comment = formText(form, 'comment');
            void onReportReview(review, reason, comment || undefined).then((submitted) => {
              if (submitted) {
                setReporting(false);
              }
            });
          }}
        >
          <label>
            <span>{t('agritech.marketplace.reviews.reportReason')}</span>
            <select name="reason">
              {reportReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`agritech.marketplace.reviews.reportReason.${reason}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('agritech.marketplace.reviews.reportComment')}</span>
            <textarea maxLength={1000} name="comment" rows={2} />
          </label>
          <MarketplaceBusyButton
            busy={pendingAction === `review-report:${review.id}`}
            busyLabel={t('agritech.marketplace.loading')}
            className="dh-button dh-button--secondary"
            type="submit"
          >
            {t('agritech.marketplace.reviews.reportSubmit')}
          </MarketplaceBusyButton>
        </form>
      ) : null}
    </article>
  );
}

/**
 * The review this caller already left, shown in place of an entry they can no
 * longer use.
 *
 * The review itself is present only once the server has answered with it: the
 * public projection is author-free, so a browser that has just posted knows that
 * it rated the listing but not which visible row is its own. That case renders
 * the acknowledgement alone rather than guessing at a row.
 */
function OwnReview({
  locale,
  review,
  t,
}: Readonly<{ locale: Locale; review?: MarketplaceReviewDto; t: MarketplaceTranslate }>) {
  return (
    <div className="dh-review-own">
      <h3>{t('agritech.marketplace.reviews.yourReview')}</h3>
      {review ? (
        <p className="dh-review-own__rating">
          <strong>
            {review.rating}/{marketplaceRatingScale}
          </strong>
          <span>{formatDate(review.createdAt, locale)}</span>
        </p>
      ) : null}
      {review?.comment ? <p>{review.comment}</p> : null}
      {review?.reply ? (
        <blockquote className="dh-review-reply">
          <strong>{t('agritech.marketplace.reviews.sellerReply')}</strong>
          <p>{review.reply.comment}</p>
        </blockquote>
      ) : null}
      {/* One review per completed purchase, and the API exposes no update command
          for a published review, so this states the limit instead of offering an
          edit the server would refuse. */}
      <p className="dh-muted">{t('agritech.marketplace.reviews.alreadyReviewed')}</p>
    </div>
  );
}

interface ReviewFormProps {
  listing: MarketplaceListing;
  onReview: (product: MarketplaceListing, rating: number, comment?: string) => Promise<boolean>;
  onSubmitted: () => void;
  pendingAction?: string;
  t: MarketplaceTranslate;
}

/**
 * The rating entry itself: a star radio group and an optional comment.
 *
 * The comment limit is the server's own `MaxLength(2000)`, stated next to the
 * field and enforced by `maxLength` as well, so the field cannot compose a review
 * the API will reject. The rating starts unset rather than at five stars: a
 * pre-filled top score is a rating the buyer never gave, so the submit control
 * stays disabled until a star is actually chosen.
 */
function ReviewForm({ listing, onReview, onSubmitted, pendingAction, t }: Readonly<ReviewFormProps>) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const busy = pendingAction === `review:${listing.id}`;
  const limitId = `marketplace-review-comment-limit-${listing.id}`;
  return (
    <form
      className="dh-review-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating < 1) {
          return;
        }
        void onReview(listing, rating, comment.trim() || undefined).then((submitted) => {
          if (submitted) {
            setComment('');
            setRating(0);
            onSubmitted();
          }
        });
      }}
    >
      <h3>{t('agritech.marketplace.reviews.write')}</h3>
      <MarketplaceStarInput
        disabled={busy}
        name={`marketplace-review-rating-${listing.id}`}
        onChange={setRating}
        t={t}
        value={rating}
      />
      {/* The counter sits beside the label rather than inside it: a label's whole
          text is the field's accessible name, and a name that changes on every
          keystroke is a name no assistive technology can hold on to. */}
      <div className="dh-review-form__field">
        <label>
          <span>{t('agritech.marketplace.reviews.comment')}</span>
          <textarea
            aria-describedby={limitId}
            maxLength={marketplaceReviewCommentLimit}
            onChange={(event) => {
              setComment(event.target.value);
            }}
            placeholder={t('agritech.marketplace.reviews.commentPlaceholder')}
            rows={3}
            value={comment}
          />
        </label>
        <small className="dh-review-form__limit" id={limitId}>
          {t('agritech.marketplace.reviews.commentLimit', {
            count: comment.length,
            limit: marketplaceReviewCommentLimit,
          })}
        </small>
      </div>
      <MarketplaceBusyButton
        busy={busy}
        busyLabel={t('agritech.marketplace.loading')}
        className="dh-button dh-button--primary"
        disabled={rating < 1}
        type="submit"
      >
        {t('agritech.marketplace.reviews.submit')}
      </MarketplaceBusyButton>
    </form>
  );
}

export interface MarketplaceReviewsSectionProps {
  /** The shell grants this to an active member of the reviewed seller organization. */
  canReplyToReviews: boolean;
  /** The shell grants this to any signed-in visitor. */
  canReportReviews: boolean;
  /** The shell's own reading of the caller's completed contracts, used until the server answers. */
  canReview: boolean;
  listing: MarketplaceListing;
  locale: Locale;
  onReplyToReview: (review: MarketplaceReviewDto, comment: string) => Promise<boolean>;
  onReportReview: (review: MarketplaceReviewDto, reason: ReportReason, comment?: string) => Promise<boolean>;
  onReview: (product: MarketplaceListing, rating: number, comment?: string) => Promise<boolean>;
  pendingAction?: string;
  reviews: Resource<MarketplaceReviewDto[]>;
  /** The server's answer to whether this caller may rate this listing, when it has been read. */
  selfState?: MarketplaceReviewSelfStateDto;
  selfStateStatus?: ResourceStatus;
  t: MarketplaceTranslate;
}

/**
 * The ratings block of a product page: the aggregate, the entry a buyer has
 * earned, and the reviews everybody can read.
 *
 * Hiding the form is presentation, never protection — the server refuses a
 * review from a caller without an unconsumed completed-contract eligibility
 * whatever this component renders. What the component owes the reader is honesty
 * in the other direction: a listing nobody has rated says so, a visitor who
 * cannot rate is not shown a form that would be rejected, and a buyer who has
 * already rated is told that instead of being invited to write a second review
 * the server would answer with a conflict.
 */
export function MarketplaceReviewsSection({
  canReplyToReviews,
  canReportReviews,
  canReview,
  listing,
  locale,
  onReplyToReview,
  onReportReview,
  onReview,
  pendingAction,
  reviews,
  selfState,
  selfStateStatus,
  t,
}: Readonly<MarketplaceReviewsSectionProps>) {
  const [justSubmitted, setJustSubmitted] = useState(false);
  const reviewerState = marketplaceReviewerState({ canReview, justSubmitted, selfState, selfStateStatus });
  const ownReview = selfState?.review;

  let list: ReactNode;
  if (reviews.status === 'loading') {
    /* Reviews are plain white cards in a single column, so the placeholder is a
       column of rows on `.dh-review-list article`'s own surface, not a grid of
       tall tiles. */
    list = <MarketplaceListSkeleton count={2} lines={3} tone="plain" trailing={false} />;
  } else if (reviews.data.length > 0) {
    list = (
      <div
        aria-label={t('agritech.marketplace.product.reviewsTab')}
        className="dh-review-list"
        role="group"
        tabIndex={0}
      >
        {reviews.data.map((review) => (
          <ReviewRow
            canReplyToReviews={canReplyToReviews}
            canReportReviews={canReportReviews}
            key={review.id}
            locale={locale}
            onReplyToReview={onReplyToReview}
            onReportReview={onReportReview}
            pendingAction={pendingAction}
            review={review}
            t={t}
          />
        ))}
      </div>
    );
  } else {
    list = (
      <p className="dh-muted">
        {t(
          reviews.status === 'error'
            ? 'agritech.marketplace.reviews.unavailable'
            : 'agritech.marketplace.reviews.empty',
        )}
      </p>
    );
  }

  return (
    <section aria-labelledby="dh-reviews-title" className="dh-detail-section">
      <div className="dh-section__head">
        <h2 id="dh-reviews-title">{t('agritech.marketplace.product.reviewsTab')}</h2>
        <MarketplaceRatingSummary layout="detail" locale={locale} rating={listing.rating} t={t} />
      </div>
      {reviewerState === 'eligible' ? (
        <ReviewForm
          listing={listing}
          onReview={onReview}
          onSubmitted={() => {
            setJustSubmitted(true);
          }}
          pendingAction={pendingAction}
          t={t}
        />
      ) : null}
      {reviewerState === 'submitted' ? <OwnReview locale={locale} review={ownReview} t={t} /> : null}
      {reviewerState === 'ineligible' ? (
        <p className="dh-muted dh-review-gate">{t('agritech.marketplace.reviews.gated')}</p>
      ) : null}
      {list}
    </section>
  );
}
