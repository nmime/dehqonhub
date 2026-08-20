// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import {
  DemoBuyerRequests,
  DemoRatedListingPublicationIds,
  demoProductReviews,
  demoReviewPage,
  filterDemoBuyerRequests,
} from './demo-marketplace';

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

  // Demo ratings are filed under the publication ids the demo catalog publishes,
  // because that is what the public reviews read is addressed by. Keyed by the
  // private product id, as they once were, the fixture could never be fetched.
  it('reads the ratings of a demo publication, newest first, and nothing for one without any', () => {
    const cottonSeed = demoProductReviews('9d000000-0000-4000-8000-000000000101');

    expect(cottonSeed.map((review) => review.rating)).toEqual([5, 4, 5]);
    expect(cottonSeed.map((review) => review.createdAt.toISOString())).toEqual([
      '2026-07-11T07:25:00.000Z',
      '2026-06-02T14:40:00.000Z',
      '2026-05-18T09:12:00.000Z',
    ]);
    expect(demoProductReviews('9d000000-0000-4000-8000-000000000102')).toHaveLength(2);
    // Two of the six demo listings are deliberately unrated.
    expect(demoProductReviews('9d000000-0000-4000-8000-000000000103')).toEqual([]);
    expect(demoProductReviews('dec0de00-0000-4000-8000-000000000001')).toEqual([]);
  });

  it('files every demo rating under a publication the demo catalog actually publishes', () => {
    expect(DemoRatedListingPublicationIds).toHaveLength(4);
    for (const id of DemoRatedListingPublicationIds) {
      expect(id).toMatch(/^9d000000-0000-4000-8000-0000000001\d{2}$/u);
      expect(demoProductReviews(id).length).toBeGreaterThan(0);
    }
  });

  // The aggregate is derived from the rows beside it, so the header of the block
  // can never disagree with the reviews underneath it.
  it('aggregates the demo ratings of a publication, and answers nothing without any', () => {
    expect(demoReviewPage('9d000000-0000-4000-8000-000000000101')?.aggregate).toEqual({
      // 5 + 5 + 4 over three reviews is 4.666…, published as one decimal.
      averageRating: 4.7,
      listingPublicationId: '9d000000-0000-4000-8000-000000000101',
      reviewCount: 3,
      revision: 1,
    });
    expect(demoReviewPage('9d000000-0000-4000-8000-000000000102')?.aggregate.averageRating).toBe(4.5);
    expect(demoReviewPage('9d000000-0000-4000-8000-000000000103')).toBeUndefined();
  });
});
