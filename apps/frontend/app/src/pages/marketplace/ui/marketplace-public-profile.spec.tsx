// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketplacePublicProfileDto } from '@app/frontend-api-client';
import type { Resource } from '../model/use-marketplace-data';
import { MarketplaceProductCard } from './marketplace-product-card';
import {
  MarketplacePublicProfile,
  marketplacePartyProfileHref,
  marketplaceSellerProfileHref,
} from './marketplace-public-profile';
import type { MarketplaceListing, MarketplaceTranslate } from './marketplace-ui';

const t: MarketplaceTranslate = (key, params) => {
  if (!params) {
    return key;
  }
  return `${key}(${Object.entries(params)
    .map(([name, value]) => `${name}=${value}`)
    .join(',')})`;
};

const profileId = '8febfb65-8579-07e7-2129-5c7cd536d166';
const sellerId = '3ff40b92-6813-5430-85d0-4e7bdfd3b854';

const profile = (overrides: Partial<MarketplacePublicProfileDto> = {}): MarketplacePublicProfileDto => ({
  description: 'Fertilizer supplier',
  displayName: 'Agro Kimyo Servis',
  id: profileId,
  publicSince: '2026-01-01T00:00:00.000Z',
  region: 'Navoiy',
  reputation: {
    completedDeals: 4,
    completedDealsAsBuyer: 1,
    completedDealsAsSeller: 3,
    firstDealAt: '2026-03-09T10:00:00.000Z',
    lastDealAt: '2026-06-08T10:00:00.000Z',
    reviewsReceived: { averageRating: 4.5, count: 4 },
    reviewsWritten: { count: 1 },
    sections: ['seeds'],
  },
  reviewsReceived: [
    {
      comment: 'Granules were even and the bags were sealed.',
      createdAt: '2026-06-16T10:00:00.000Z',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      listingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      listingTitle: 'Urea 46% N',
      rating: 5,
      reply: { comment: 'Thank you for the order.', createdAt: '2026-06-17T10:00:00.000Z' },
      section: 'seeds',
      verifiedDeal: true,
    },
  ],
  reviewsWritten: [
    {
      comment: 'Delivered on time.',
      createdAt: '2026-05-16T10:00:00.000Z',
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      listingId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      listingTitle: 'Disc harrow, 2.4 m',
      rating: 4,
      section: 'equipment',
      subject: { displayName: "Farg'ona Agrotexnika", profileId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
      verifiedDeal: true,
    },
  ],
  roles: ['seller', 'buyer'],
  sellerId,
  verified: true,
  ...overrides,
});

const ready = (data: MarketplacePublicProfileDto): Resource<MarketplacePublicProfileDto | null> => ({
  data,
  status: 'ready',
});

const listing = (): MarketplaceListing => ({
  category: 'fertilizer',
  description: 'Nitrogen fertilizer',
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  images: [],
  kind: 'product',
  name: 'Urea 46% N',
  priceUzs: 412_000,
  promoted: false,
  provenance: 'live',
  publishedAt: '2026-08-07T08:00:00.000Z',
  rating: { average: 4.5, count: 4 },
  region: 'Navoiy',
  sampleAvailable: false,
  section: 'seeds',
  status: 'active',
  stockQuantity: 40,
  supplierId: sellerId,
  supplierName: 'Agro Kimyo Servis',
  supplierVerified: true,
  transactional: true,
  unit: '50 kg',
});

afterEach(cleanup);

describe('MarketplacePublicProfile', () => {
  it('announces the region as busy and withholds the record while it loads', () => {
    render(<MarketplacePublicProfile locale="en" profile={{ data: null, status: 'loading' }} t={t} />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.profile.reputation')).toBeNull();
  });

  it('renders the identity, the reputation counts, and both review directions', () => {
    render(<MarketplacePublicProfile locale="en" profile={ready(profile())} t={t} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Agro Kimyo Servis');
    expect(screen.getByText('agritech.marketplace.profile.verified')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.profile.role.seller')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.profile.role.buyer')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.profile.completedDeals')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Granules were even and the bags were sealed.')).toBeTruthy();
    expect(screen.getByText('Delivered on time.')).toBeTruthy();
    // The reputation boundary is printed, not implied.
    expect(screen.getByText('agritech.marketplace.profile.boundary')).toBeTruthy();
  });

  it('attributes a written review to the seller it was about and leaves a received review author free', () => {
    render(<MarketplacePublicProfile locale="en" profile={ready(profile())} t={t} />);

    expect(screen.getByText("agritech.marketplace.profile.reviewAbout(seller=Farg'ona Agrotexnika)")).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.profile.reviewAnonymous')).toBeTruthy();
  });

  it('states an honest empty record for a party with no completed deal and no review', () => {
    render(
      <MarketplacePublicProfile
        locale="en"
        profile={ready(
          profile({
            reputation: {
              completedDeals: 0,
              completedDealsAsBuyer: 0,
              completedDealsAsSeller: 0,
              firstDealAt: null,
              lastDealAt: null,
              reviewsReceived: { averageRating: null, count: 0 },
              reviewsWritten: { count: 0 },
              sections: [],
            },
            reviewsReceived: [],
            reviewsWritten: [],
          }),
        )}
        t={t}
      />,
    );

    expect(screen.getByText('agritech.marketplace.profile.emptyHistory')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.profile.reviewsReceivedEmpty')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.profile.reviewsWrittenEmpty')).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.profile.completedDeals')).toBeNull();
  });

  it('separates "no public profile" from "the read failed"', () => {
    const { rerender } = render(
      <MarketplacePublicProfile locale="en" profile={{ data: null, status: 'error' }} t={t} />,
    );
    expect(screen.getByText('agritech.marketplace.profile.notFound')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.profile.notFoundDescription')).toBeTruthy();

    rerender(<MarketplacePublicProfile locale="en" profile={{ data: null, status: 'empty' }} t={t} />);
    expect(screen.getByText('agritech.marketplace.profile.unavailable')).toBeTruthy();
  });

  it('omits its own identity block where the page already prints one', () => {
    render(<MarketplacePublicProfile identity={false} locale="en" profile={ready(profile())} t={t} />);

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByText('agritech.marketplace.profile.reputation')).toBeTruthy();
  });

  it('opens a reviewed listing from a review row when the page can navigate', () => {
    const navigate = vi.fn();
    render(<MarketplacePublicProfile locale="en" navigate={navigate} profile={ready(profile())} t={t} />);

    fireEvent.click(
      screen.getByText('agritech.marketplace.profile.reviewListing(listing=Urea 46% N)', { selector: 'button' }),
    );

    expect(navigate).toHaveBeenCalledWith('/products/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });
});

describe('the profile entry points', () => {
  it('addresses a profile by a public identifier only', () => {
    expect(marketplaceSellerProfileHref(sellerId)).toBe(`/sellers/${sellerId}`);
    expect(marketplacePartyProfileHref(profileId)).toBe(`/parties/${profileId}`);
    expect(marketplaceSellerProfileHref(sellerId)).not.toContain('user');
  });

  it('opens the seller profile from a product card', () => {
    const onOpenSeller = vi.fn();
    const product = listing();
    render(
      <MarketplaceProductCard
        favorite={false}
        locale="en"
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onOpenSeller={onOpenSeller}
        product={product}
        t={t}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'agritech.marketplace.profile.open(name=Agro Kimyo Servis)' }),
    );

    expect(onOpenSeller).toHaveBeenCalledWith(product);
  });

  it('keeps the seller name plain text where no profile can be opened', () => {
    render(
      <MarketplaceProductCard
        favorite={false}
        locale="en"
        onAdd={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        product={listing()}
        t={t}
      />,
    );

    expect(screen.queryByRole('button', { name: /profile\.open/u })).toBeNull();
    expect(screen.getByText('Agro Kimyo Servis')).toBeTruthy();
  });
});
