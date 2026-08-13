// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import { DemoBuyerRequests, demoProductReviews, demoReviewPage, filterDemoBuyerRequests } from './demo-marketplace';

describe('demo marketplace activity', () => {
  it('marks every fixture as demo content the routes can parse as an id', () => {
    expect(DemoBuyerRequests).toHaveLength(3);
    for (const request of DemoBuyerRequests) {
      expect(request.id).toMatch(/^dec0de01-0000-4000-8000-\d{12}$/u);
      expect(request.tenantId).toBe('demo-tenant');
    }
  });

  it('answers the whole feed when no status narrows it', () => {
    expect(filterDemoBuyerRequests().map((request) => request.status)).toEqual(['open', 'offering', 'open']);
    expect(filterDemoBuyerRequests('all')).toHaveLength(3);
  });

  // The demo feed is filtered the same way the repository filters live rows, so a
  // status tab reads alike on both.
  it('narrows the feed to one status, and answers nothing for a status it has none of', () => {
    expect(filterDemoBuyerRequests('open').map((request) => request.title)).toEqual([
      'Нужен столовый виноград, 8 т к сентябрю',
      'Семена озимой пшеницы, 60 мешков',
    ]);
    expect(filterDemoBuyerRequests('offering')).toHaveLength(1);
    expect(filterDemoBuyerRequests('selected')).toEqual([]);
  });

  it('hands a copy of the feed to each caller rather than the fixture itself', () => {
    const feed = filterDemoBuyerRequests();
    feed.pop();

    expect(filterDemoBuyerRequests()).toHaveLength(3);
  });

  it('reads the ratings of a demo product, and nothing for a product without any', () => {
    const seedReviews = demoProductReviews('dec0de00-0000-4000-8000-000000000001');

    expect(seedReviews.map((review) => review.rating)).toEqual([5, 4]);
    expect(demoProductReviews('dec0de00-0000-4000-8000-000000000011')).toHaveLength(1);
    expect(demoProductReviews('dec0de00-0000-4000-8000-000000000099')).toEqual([]);
  });

  // The aggregate is derived from the rows beside it, so the header of the block
  // can never disagree with the reviews underneath it.
  it('aggregates the demo ratings of a publication, and answers nothing without any', () => {
    expect(demoReviewPage('dec0de00-0000-4000-8000-000000000001')?.aggregate).toEqual({
      averageRating: 4.5,
      listingPublicationId: 'dec0de00-0000-4000-8000-000000000001',
      reviewCount: 2,
      revision: 1,
    });
    expect(demoReviewPage('dec0de00-0000-4000-8000-000000000011')?.aggregate.averageRating).toBe(5);
    expect(demoReviewPage('dec0de00-0000-4000-8000-000000000099')).toBeUndefined();
  });
});
