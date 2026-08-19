// @requirements REQ-AGRITECH-ENGAGEMENT-019
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceReviewDto, MarketplaceReviewSelfStateDto } from '@app/frontend-api-client';
import type { Resource } from '../model/use-marketplace-data';
import { MarketplaceRatingSummary } from './marketplace-rating';
import { MarketplaceReviewsSection, marketplaceReviewerState } from './marketplace-reviews';
import type { MarketplaceListing, MarketplaceTranslate } from './marketplace-ui';

/**
 * Interpolating stand-in for the app's translator: the reviewer states differ by
 * their parameters, so a mock that dropped them would make four distinct strings
 * look like one.
 */
const t: MarketplaceTranslate = (key, params) => {
  if (!params) {
    return key;
  }
  const parts = Object.entries(params).map(([name, value]) => `${name}=${value}`);
  return `${key}(${parts.join(',')})`;
};

const listingId = '11111111-1111-4111-8111-111111111111';

const listing = (rating: MarketplaceListing['rating']): MarketplaceListing => ({
  category: 'seed',
  description: 'Certified cotton seed',
  id: listingId,
  images: [],
  kind: 'product',
  name: 'Cotton seed',
  priceUzs: 412_000,
  promoted: false,
  provenance: 'live',
  publishedAt: '2026-08-07T08:00:00.000Z',
  rating,
  region: 'Andijon',
  sampleAvailable: true,
  section: 'seeds',
  status: 'active',
  stockQuantity: 480,
  supplierId: '22222222-2222-4222-8222-222222222222',
  supplierName: "Andijon Urug'chilik",
  transactional: true,
  unit: '25 kg',
});

const review = (overrides: Partial<MarketplaceReviewDto> = {}): MarketplaceReviewDto => ({
  assetReferences: [],
  comment: 'Germination matched the declared rate.',
  createdAt: '2026-08-09T10:00:00.000Z',
  id: '33333333-3333-4333-8333-333333333333',
  listingPublicationId: listingId,
  rating: 5,
  revision: 1,
  updatedAt: '2026-08-09T10:00:00.000Z',
  verifiedDeal: true,
  ...overrides,
});

const emptyReviews: Resource<MarketplaceReviewDto[]> = { data: [], status: 'empty' };

const renderSection = (
  overrides: Partial<ComponentProps<typeof MarketplaceReviewsSection>> = {},
): { onReview: ReturnType<typeof vi.fn> } => {
  const onReview = vi.fn().mockResolvedValue(true);
  render(
    <MarketplaceReviewsSection
      canReplyToReviews={false}
      canReportReviews={false}
      canReview={false}
      listing={listing({ average: 4.7, count: 3 })}
      locale="en"
      onReplyToReview={vi.fn()}
      onReportReview={vi.fn()}
      onReview={onReview}
      reviews={emptyReviews}
      t={t}
      {...overrides}
    />,
  );
  return { onReview };
};

afterEach(cleanup);

describe('marketplace rating aggregate', () => {
  it('prints the average and the count it was derived from as text', () => {
    render(<MarketplaceRatingSummary locale="en" rating={{ average: 4.7, count: 3 }} t={t} />);

    expect(screen.getByText('4.7')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.reviews.outOf(scale=5)')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.reviews.count(count=3)')).toBeTruthy();
  });

  it('names a single review in the singular rather than counting it as many', () => {
    render(<MarketplaceRatingSummary locale="en" rating={{ average: 5, count: 1 }} t={t} />);

    expect(screen.getByText('5.0')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.reviews.countOne')).toBeTruthy();
  });

  it('says a listing has no ratings instead of publishing a placeholder score', () => {
    const view = render(<MarketplaceRatingSummary locale="en" rating={{ average: null, count: 0 }} t={t} />);

    expect(screen.getByText('agritech.marketplace.reviews.none')).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/\d/u);
  });

  it('keeps the glyph row out of the accessible text, because the value is the text', () => {
    const view = render(<MarketplaceRatingSummary locale="en" rating={{ average: 4.2, count: 8 }} t={t} />);

    const stars = view.container.querySelector('.dh-stars');
    expect(stars?.getAttribute('aria-hidden')).toBe('true');
    // Four of five filled: the row rounds, while `4.2` beside it does not.
    expect(view.container.querySelectorAll('.dh-stars__star.is-on')).toHaveLength(4);
  });
});

describe('marketplace review entry', () => {
  it('offers five real radios inside one named group rather than clickable glyphs', () => {
    renderSection({ canReview: true });

    const group = screen.getByRole('group', { name: 'agritech.marketplace.reviews.rating' });
    const stars = within(group).getAllByRole('radio');
    expect(stars).toHaveLength(5);
    for (const star of stars) {
      expect(star.tagName).toBe('INPUT');
      expect(star.getAttribute('type')).toBe('radio');
      // One shared name is what makes the arrow keys move within the group.
      expect(star.getAttribute('name')).toBe(stars[0]?.getAttribute('name'));
    }
  });

  it('submits the chosen rating with an optional comment', async () => {
    const { onReview } = renderSection({ canReview: true });

    fireEvent.click(screen.getAllByRole('radio')[3]!);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.comment'), {
      target: { value: 'Delivered on time.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.submit' }));

    await waitFor(() => {
      expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: listingId }), 4, 'Delivered on time.');
    });
  });

  it('refuses to submit a review that carries no rating at all', () => {
    const { onReview } = renderSection({ canReview: true });

    const submit = screen.getByRole('button', { name: 'agritech.marketplace.reviews.submit' });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.submit(submit.closest('form')!);

    expect(onReview).not.toHaveBeenCalled();
  });

  it('states the comment limit and enforces the same number the API does', () => {
    renderSection({ canReview: true });

    const comment = screen.getByLabelText('agritech.marketplace.reviews.comment');
    expect(comment.getAttribute('maxLength')).toBe('2000');
    expect(screen.getByText('agritech.marketplace.reviews.commentLimit(count=0,limit=2000)')).toBeTruthy();

    fireEvent.change(comment, { target: { value: 'Six.' } });
    expect(screen.getByText('agritech.marketplace.reviews.commentLimit(count=4,limit=2000)')).toBeTruthy();
    expect(comment.getAttribute('aria-describedby')).toBe(
      screen.getByText('agritech.marketplace.reviews.commentLimit(count=4,limit=2000)').id,
    );
  });

  it('reports the submission as busy through the shared control', () => {
    renderSection({ canReview: true, pendingAction: `review:${listingId}` });

    const submit = screen.getByRole('button', { name: 'agritech.marketplace.reviews.submit' });
    expect(submit.getAttribute('aria-busy')).toBe('true');
    expect(submit.hasAttribute('disabled')).toBe(true);
  });
});

describe('marketplace reviewer states', () => {
  it('shows the entry to a caller the server says is eligible', () => {
    const selfState: MarketplaceReviewSelfStateDto = {
      canReview: true,
      listingPublicationId: listingId,
    };
    renderSection({ canReview: false, selfState, selfStateStatus: 'ready' });

    expect(screen.getByRole('group', { name: 'agritech.marketplace.reviews.rating' })).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.reviews.gated')).toBeNull();
  });

  it('shows a caller their own review instead of a second entry', () => {
    const selfState: MarketplaceReviewSelfStateDto = {
      canReview: false,
      listingPublicationId: listingId,
      review: review({ comment: 'Mine, and only readable as mine here.' }),
    };
    renderSection({ canReview: true, selfState, selfStateStatus: 'ready' });

    expect(screen.getByText('agritech.marketplace.reviews.yourReview')).toBeTruthy();
    expect(screen.getByText('Mine, and only readable as mine here.')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.reviews.alreadyReviewed')).toBeTruthy();
    // The optimistic shell hint loses to the server's answer, so a review the API
    // would refuse is never offered.
    expect(screen.queryByRole('group', { name: 'agritech.marketplace.reviews.rating' })).toBeNull();
  });

  it('shows a caller who never purchased the aggregate and nothing that invites a rating', () => {
    renderSection({
      canReview: false,
      selfState: { canReview: false, listingPublicationId: listingId },
      selfStateStatus: 'ready',
    });

    expect(screen.getByText('agritech.marketplace.reviews.count(count=3)')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.reviews.gated')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'agritech.marketplace.reviews.rating' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.reviews.submit' })).toBeNull();
  });

  it('labels a published review as a verified purchase', () => {
    renderSection({ reviews: { data: [review()], status: 'ready' } });

    expect(screen.getByText('agritech.marketplace.reviews.verifiedDeal')).toBeTruthy();
    expect(screen.getByText('5/5')).toBeTruthy();
  });

  it('resolves the reviewer state from the server first and the shell only until it answers', () => {
    const selfState: MarketplaceReviewSelfStateDto = {
      canReview: false,
      listingPublicationId: listingId,
    };
    expect(marketplaceReviewerState({ canReview: true, justSubmitted: false })).toBe('eligible');
    expect(marketplaceReviewerState({ canReview: false, justSubmitted: false })).toBe('ineligible');
    expect(marketplaceReviewerState({ canReview: true, justSubmitted: true })).toBe('submitted');
    expect(
      marketplaceReviewerState({ canReview: true, justSubmitted: false, selfState, selfStateStatus: 'ready' }),
    ).toBe('ineligible');
    // A failed read must not silently promote the caller to eligible.
    expect(
      marketplaceReviewerState({ canReview: false, justSubmitted: false, selfState, selfStateStatus: 'error' }),
    ).toBe('ineligible');
  });
});
