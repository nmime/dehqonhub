// @requirements REQ-AGRITECH-ENGAGEMENT-019
import type { Locale } from '@app/frontend-runtime';
import { MarketplaceIcon } from './marketplace-icon';
import { formatRating, type MarketplaceListingRating, type MarketplaceTranslate } from './marketplace-ui';

/** The scale every rating on this marketplace is expressed on. */
export const marketplaceRatingScale = 5;

/** Server-side bound on review free text, mirrored here so the field can state it. */
export const marketplaceReviewCommentLimit = 2_000;

/**
 * How many photographs one review may carry.
 *
 * `ck__marketplace_listing_reviews__assets` refuses a fourth entry and the
 * write path rejects one before that, so the field states the same bound rather
 * than letting the server be the first to say no.
 */
export const marketplaceReviewAssetLimit = 3;

const ratingSteps = [1, 2, 3, 4, 5] as const;

/**
 * The glyph row behind a rating.
 *
 * It is `aria-hidden` on purpose: a rating is a value, and the value is spelled
 * out in text beside these stars. Five glyphs read out one by one would say
 * nothing a screen reader user can act on, and a filled-star count can only ever
 * be a rounded retelling of `4.7`.
 */
function RatingStars({ value }: Readonly<{ value: number }>) {
  const filled = Math.round(value);
  return (
    <span aria-hidden="true" className="dh-stars">
      {ratingSteps.map((step) => (
        <span className={step <= filled ? 'dh-stars__star is-on' : 'dh-stars__star'} key={step}>
          <MarketplaceIcon name="star" />
        </span>
      ))}
    </span>
  );
}

export interface MarketplaceRatingSummaryProps {
  /** Where the summary sits: a catalog card line, or the product heading. */
  layout?: 'card' | 'detail';
  locale: Locale;
  rating: MarketplaceListingRating;
  t: MarketplaceTranslate;
}

/**
 * A listing's published rating, wherever the listing appears.
 *
 * Three rules hold on every surface. The average is printed as text next to the
 * stars, so the rating survives without colour or glyphs. The count is always
 * printed with it, so a rounded `4.7` can be weighed against the three reviews
 * it came from rather than taken on trust. And a listing with no reviews says
 * exactly that — it never borrows a neighbouring listing's stars, a demo score,
 * or a hopeful `0.0`.
 */
export function MarketplaceRatingSummary({
  layout = 'card',
  locale,
  rating,
  t,
}: Readonly<MarketplaceRatingSummaryProps>) {
  const className = layout === 'detail' ? 'dh-rating dh-rating--detail' : 'dh-rating dh-product-card__rating';
  if (rating.average === null || rating.count <= 0) {
    return (
      <p className={`${className} dh-rating--empty`}>
        <MarketplaceIcon name="star" />
        <span>{t('agritech.marketplace.reviews.none')}</span>
      </p>
    );
  }
  return (
    <p className={className}>
      <RatingStars value={rating.average} />
      <b>{formatRating(rating.average, locale)}</b>
      <span className="dh-sr-only">{t('agritech.marketplace.reviews.outOf', { scale: marketplaceRatingScale })}</span>
      <span>
        {rating.count === 1
          ? t('agritech.marketplace.reviews.countOne')
          : t('agritech.marketplace.reviews.count', { count: rating.count })}
      </span>
    </p>
  );
}

export interface MarketplaceStarInputProps {
  /** True while the review is being submitted, so the choice cannot change under the request. */
  disabled?: boolean;
  /** Radio group name; unique per listing so two forms on one document stay separate. */
  name: string;
  onChange: (value: number) => void;
  t: MarketplaceTranslate;
  value: number;
}

/**
 * The rating a buyer chooses, as five real radio inputs inside a fieldset.
 *
 * Native radios are the reason this is operable at all: `Tab` reaches the group,
 * the arrow keys move between stars, `Space` selects, the browser exposes the
 * chosen value, and the selection posts with the form. A row of clickable `div`s
 * styled as stars looks identical and offers none of that, so the glyph here is
 * only ever paint on top of an input that already works.
 */
export function MarketplaceStarInput({
  disabled = false,
  name,
  onChange,
  t,
  value,
}: Readonly<MarketplaceStarInputProps>) {
  return (
    <fieldset className="dh-star-input" disabled={disabled}>
      <legend>{t('agritech.marketplace.reviews.rating')}</legend>
      <div className="dh-star-input__row">
        {ratingSteps.map((step) => (
          <label className={step <= value ? 'dh-star-input__star is-on' : 'dh-star-input__star'} key={step}>
            <input
              checked={step === value}
              className="dh-sr-only"
              name={name}
              onChange={() => {
                onChange(step);
              }}
              type="radio"
              value={step}
            />
            <MarketplaceIcon name="star" />
            <span className="dh-sr-only">
              {t('agritech.marketplace.reviews.ratingValue', { rating: step, scale: marketplaceRatingScale })}
            </span>
          </label>
        ))}
        {/* The chosen value in words. Nothing is announced before a star is picked,
            because '0 of 5' would be a rating nobody gave. */}
        {value >= 1 ? (
          <output className="dh-star-input__value">
            {t('agritech.marketplace.reviews.ratingValue', { rating: value, scale: marketplaceRatingScale })}
          </output>
        ) : null}
      </div>
    </fieldset>
  );
}
