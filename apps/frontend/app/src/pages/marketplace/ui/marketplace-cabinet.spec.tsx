// @requirements REQ-AGRITECH-EXPERIENCE-026
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerRequestViewDto,
  ContractViewDto,
  MarketplaceOwnedListingPublicationDto,
  MarketplaceRoleDashboardDto,
  MarketplaceSampleDto,
  VerificationViewDto,
} from '@app/frontend-api-client';
import {
  MarketplaceCabinet,
  marketplaceCabinetPath,
  marketplaceCabinetSectionFromLocation,
  marketplaceCabinetSections,
  type MarketplaceCabinetProps,
  type MarketplaceCabinetSection,
} from './marketplace-cabinet';
import { formatMoney, type MarketplaceTranslate } from './marketplace-ui';

const t: MarketplaceTranslate = (key, params) =>
  params === undefined ? key : `${key}:${Object.values(params).join(',')}`;

const emptyList = <T,>() => ({ data: [] as T[], status: 'empty' as const });

/**
 * A money figure as the DOM reports it. `formatMoney` keeps the amount and the
 * currency code together with a non-breaking space, which testing-library's text
 * normalizer collapses to an ordinary one.
 */
const money = (value: number): string => formatMoney(value, 'en').replaceAll(' ', ' ');

const monthlyActivity: MarketplaceRoleDashboardDto['monthlyActivity'] = [
  { completedPurchases: 1, completedSales: 0, month: '2026-03', purchaseSpendUzs: 12_000_000, salesRevenueUzs: 0 },
  { completedPurchases: 0, completedSales: 0, month: '2026-04', purchaseSpendUzs: 0, salesRevenueUzs: 0 },
  { completedPurchases: 2, completedSales: 0, month: '2026-05', purchaseSpendUzs: 41_880_000, salesRevenueUzs: 0 },
  { completedPurchases: 0, completedSales: 0, month: '2026-06', purchaseSpendUzs: 0, salesRevenueUzs: 0 },
  { completedPurchases: 1, completedSales: 0, month: '2026-07', purchaseSpendUzs: 4_600_000, salesRevenueUzs: 0 },
  { completedPurchases: 1, completedSales: 0, month: '2026-08', purchaseSpendUzs: 2_895_000, salesRevenueUzs: 0 },
];

const buyerDashboard: MarketplaceRoleDashboardDto = {
  buyer: {
    activeDeals: 3,
    completedDeals: 5,
    completedSpendUzs: 61_375_000,
    openCarts: 0,
    openPurchaseRequests: 3,
  },
  generatedAt: '2026-08-19T18:00:00.000Z',
  monthlyActivity,
  recentDeals: [
    {
      amountUzs: 2_895_000,
      contractId: 'contract-buyer',
      counterpartyName: 'Samarqand Bogdorchilik',
      side: 'buyer',
      status: 'completed',
      updatedAt: '2026-08-03T10:00:00.000Z',
    },
  ],
  role: 'buyer',
};

const sellerDashboard: MarketplaceRoleDashboardDto = {
  generatedAt: '2026-08-19T18:00:00.000Z',
  monthlyActivity: monthlyActivity.map((month) => ({
    ...month,
    completedPurchases: 0,
    completedSales: month.completedPurchases,
    purchaseSpendUzs: 0,
    salesRevenueUzs: month.purchaseSpendUzs,
  })),
  recentDeals: [],
  role: 'seller',
  seller: {
    activeDeals: 3,
    activeListings: 13,
    completedDeals: 9,
    completedRevenueUzs: 123_465_000,
    offerConversionBps: 3333,
    pendingOffers: 1,
    topListings: [
      {
        completedQuantity: 8,
        listingPublicationId: 'listing-urea',
        revenueUzs: 22_080_000,
        title: 'Urea 46% N',
      },
    ],
  },
};

const contract = (id: string, actorParty: ContractViewDto['actorParty'], subject: string): ContractViewDto => ({
  actorParty,
  amountUzs: 2_895_000,
  buyerPartySnapshot: { legalName: 'Xaridor Demo Savdo', region: 'Toshkent' },
  createdAt: '2026-07-28T10:00:00.000Z',
  deliveryPriceUzs: 0,
  deliveryTerms: 'pickup',
  factoringEnabled: false,
  id,
  lines: [],
  revision: 1,
  sellerPartySnapshot: { legalName: 'Samarqand Bogdorchilik', region: 'Toshkent' },
  status: 'completed',
  subject,
  updatedAt: '2026-08-03T10:00:00.000Z',
});

const ownedRequest: BuyerRequestViewDto = {
  budgetUzs: 38_000_000,
  createdAt: '2026-08-12T09:00:00.000Z',
  deadline: '2026-09-30',
  id: 'request-onion',
  moderationStatus: 'approved',
  publicationId: 'publication-onion',
  publicationStatus: 'published',
  region: 'Xorazm',
  status: 'open',
  title: 'Yellow onion, 12 tonnes',
  updatedAt: '2026-08-19T18:00:00.000Z',
};

const listingPublication: MarketplaceOwnedListingPublicationDto = {
  id: 'publication-trailer',
  kind: 'listing',
  moderationStatus: 'pending',
  section: 'equipment',
  sellerPublicId: 'seller-public',
  sourceKind: 'product',
  status: 'published',
  title: 'Tipping trailer 2PTS-4, used',
  updatedAt: '2026-08-19T18:00:00.000Z',
};

const sample: MarketplaceSampleDto = {
  actorRole: 'requester',
  createdAt: '2026-08-09T10:00:00.000Z',
  delivery: { itemPriceUzs: 0, method: 'pickup', requesterPays: true },
  id: 'sample-1',
  listing: {
    id: 'listing-seed',
    kind: 'product',
    rating: { average: 4.6, count: 12 },
    sampleAvailable: true,
    seller: { displayName: 'Andijon Urugchilik', id: 'seller-public' },
    title: 'Cotton seed Omad F1',
  },
  policyVersion: 1,
  revision: 1,
  seasonKey: '2026-Q3',
  status: 'received',
  updatedAt: '2026-08-09T10:00:00.000Z',
};

const verified: VerificationViewDto = {
  createdAt: '2026-08-01T10:00:00.000Z',
  documents: [],
  id: 'verification-1',
  identityAssurance: 'provider_verified',
  level: 'verified',
  oneIdLinked: true,
  providerMode: 'live',
  revision: 2,
  role: 'buyer',
  simulation: false,
  status: 'verified',
  step: 'complete',
  updatedAt: '2026-08-02T10:00:00.000Z',
};

const cabinet = (
  section: MarketplaceCabinetSection,
  overrides: Partial<MarketplaceCabinetProps> = {},
): MarketplaceCabinetProps => ({
  contracts: emptyList<ContractViewDto>(),
  dashboard: { data: buyerDashboard, status: 'ready' },
  listingPublications: emptyList<MarketplaceOwnedListingPublicationDto>(),
  locale: 'en',
  myRequests: emptyList<BuyerRequestViewDto>(),
  navigate: vi.fn(),
  offersByRequest: { data: {}, status: 'empty' },
  onRetry: vi.fn(),
  publicRequests: emptyList<never>(),
  requestPublications: emptyList<never>(),
  samples: emptyList<MarketplaceSampleDto>(),
  section,
  t,
  verification: { data: verified, status: 'ready' },
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('DehqonHub marketplace cabinet', () => {
  it('resolves every section from its own deep link and falls back to the overview', () => {
    expect(marketplaceCabinetSectionFromLocation('/account')).toBe('overview');
    expect(marketplaceCabinetSectionFromLocation('/account/')).toBe('overview');
    expect(marketplaceCabinetSectionFromLocation('/account/finance')).toBe('finance');
    expect(marketplaceCabinetSectionFromLocation('/account/finance/')).toBe('finance');
    expect(marketplaceCabinetSectionFromLocation('/account/publications')).toBe('publications');
    // A stale or mistyped segment must land somewhere real, not on an empty frame.
    expect(marketplaceCabinetSectionFromLocation('/account/statistics')).toBe('overview');
    expect(marketplaceCabinetSectionFromLocation('/requests')).toBe('overview');
    expect(marketplaceCabinetPath('overview')).toBe('/account');
    for (const section of marketplaceCabinetSections.filter((candidate) => candidate !== 'overview')) {
      expect(marketplaceCabinetPath(section)).toBe(`/account/${section}`);
    }
  });

  it('lists every section in a keyboard-operable rail, marks the current one, and navigates by deep link', () => {
    const navigate = vi.fn();
    render(<MarketplaceCabinet {...cabinet('finance', { navigate })} />);

    const rail = screen.getByRole('navigation', { name: 'agritech.marketplace.cabinet.nav' });
    const links = within(rail).getAllByRole('button');
    expect(links).toHaveLength(marketplaceCabinetSections.length);
    // Native buttons, so Tab and Enter reach every section without a key handler.
    expect(links.every((link) => link.tagName === 'BUTTON')).toBe(true);

    const active = within(rail).getByRole('button', { name: 'agritech.marketplace.cabinet.section.finance' });
    expect(active.getAttribute('aria-current')).toBe('page');
    const overview = within(rail).getByRole('button', { name: 'agritech.marketplace.cabinet.section.overview' });
    expect(overview.hasAttribute('aria-current')).toBe(false);

    fireEvent.click(within(rail).getByRole('button', { name: 'agritech.marketplace.cabinet.section.selling' }));
    expect(navigate).toHaveBeenCalledWith('/account/selling');
    fireEvent.click(overview);
    expect(navigate).toHaveBeenCalledWith('/account');
  });

  it('gives the chart a value table as its accessible equivalent, visible only in the finance section', () => {
    const compact = render(<MarketplaceCabinet {...cabinet('overview')} />);
    const overviewTable = screen.getByRole('table', {
      name: 'agritech.marketplace.cabinet.chart.tableCaption',
    });
    // The bars are decoration; the table is what assistive technology reads.
    expect(overviewTable.className).toContain('dh-sr-only');
    expect(compact.container.querySelector('.dh-cabinet-chart__plot')?.getAttribute('aria-hidden')).toBe('true');
    compact.unmount();

    render(<MarketplaceCabinet {...cabinet('finance')} />);
    const table = screen.getByRole('table', { name: 'agritech.marketplace.cabinet.chart.tableCaption' });
    expect(table.className).not.toContain('dh-sr-only');
    // Six months in, six rows out, including the two that settled nothing.
    expect(within(table).getAllByRole('row')).toHaveLength(8);
    expect(within(table).getByRole('rowheader', { name: 'agritech.marketplace.cabinet.chart.total' })).toBeTruthy();
    // The window total is the sum of the six months, formatted by the shared helper.
    expect(within(table).getByText(money(61_375_000))).toBeTruthy();
  });

  it('draws only the series the dashboard scope actually reports', () => {
    const buyerView = render(<MarketplaceCabinet {...cabinet('finance')} />);
    const buyerTable = screen.getByRole('table', { name: 'agritech.marketplace.cabinet.chart.tableCaption' });
    expect(
      within(buyerTable).getByRole('columnheader', { name: 'agritech.marketplace.cabinet.chart.spend' }),
    ).toBeTruthy();
    expect(
      within(buyerTable).queryByRole('columnheader', { name: 'agritech.marketplace.cabinet.chart.revenue' }),
    ).toBeNull();
    buyerView.unmount();

    render(<MarketplaceCabinet {...cabinet('finance', { dashboard: { data: sellerDashboard, status: 'ready' } })} />);
    const sellerTable = screen.getByRole('table', { name: 'agritech.marketplace.cabinet.chart.tableCaption' });
    expect(
      within(sellerTable).getByRole('columnheader', { name: 'agritech.marketplace.cabinet.chart.revenue' }),
    ).toBeTruthy();
    expect(
      within(sellerTable).queryByRole('columnheader', { name: 'agritech.marketplace.cabinet.chart.spend' }),
    ).toBeNull();
  });

  it('says a six-month window with no completed contract is empty instead of plotting zeroes', () => {
    const flat = monthlyActivity.map((month) => ({
      ...month,
      completedPurchases: 0,
      purchaseSpendUzs: 0,
    }));
    render(
      <MarketplaceCabinet
        {...cabinet('finance', {
          dashboard: { data: { ...buyerDashboard, monthlyActivity: flat }, status: 'ready' },
        })}
      />,
    );

    expect(screen.getByText('agritech.marketplace.cabinet.chart.empty')).toBeTruthy();
    // The empty state replaces the trend, not the record: all six months stay listed.
    const table = screen.getByRole('table', { name: 'agritech.marketplace.cabinet.chart.tableCaption' });
    expect(within(table).getAllByRole('rowheader')).toHaveLength(7);
  });

  it('separates the deals I buy from the deals I fulfil on the party the API stamps', () => {
    const contracts = {
      data: [
        contract('contract-buyer', 'buyer', 'Tomato Nurafshon'),
        contract('contract-seller', 'seller', 'Urea 46% N'),
      ],
      status: 'ready' as const,
    };
    const navigate = vi.fn();
    const buying = render(<MarketplaceCabinet {...cabinet('buying', { contracts, navigate })} />);
    expect(screen.getByText('Tomato Nurafshon')).toBeTruthy();
    expect(screen.queryByText('Urea 46% N')).toBeNull();
    // A buyer row names the seller it is against.
    expect(screen.getByText(/Samarqand Bogdorchilik/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tomato Nurafshon/u }));
    expect(navigate).toHaveBeenCalledWith('/contracts/contract-buyer');
    buying.unmount();

    render(<MarketplaceCabinet {...cabinet('selling', { contracts, navigate })} />);
    expect(screen.getAllByText('Urea 46% N').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tomato Nurafshon')).toBeNull();
    // A seller row names the buyer it is against.
    expect(screen.getByText(/Xaridor Demo Savdo/u)).toBeTruthy();
  });

  it('states each owned request with its publication and moderation state and its offer count', () => {
    const navigate = vi.fn();
    render(
      <MarketplaceCabinet
        {...cabinet('buying', {
          myRequests: { data: [ownedRequest], status: 'ready' },
          navigate,
          offersByRequest: {
            data: {
              'request-onion': [
                {
                  createdAt: '2026-08-13T10:00:00.000Z',
                  deliveryTerms: 'pickup',
                  id: 'offer-1',
                  priceUzs: 36_000_000,
                  requestPublicId: 'publication-onion',
                  seller: { displayName: 'Xorazm Hosil Eksport', id: 'seller-public', verified: true },
                  status: 'pending',
                },
              ],
            },
            status: 'ready',
          },
        })}
      />,
    );

    expect(screen.getByText('Yellow onion, 12 tonnes')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.orders.open')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.publication.moderation.approved')).toBeTruthy();
    expect(screen.getByText(/agritech\.marketplace\.cabinet\.buying\.offers:1/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Yellow onion/u }));
    expect(navigate).toHaveBeenCalledWith('/requests/request-onion');
  });

  it('carries an explicit loading, empty and error state for the publication queue', () => {
    const loading = render(
      <MarketplaceCabinet {...cabinet('publications', { listingPublications: { data: [], status: 'loading' } })} />,
    );
    expect(loading.container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
    loading.unmount();

    const empty = render(<MarketplaceCabinet {...cabinet('publications')} />);
    expect(screen.getAllByText('agritech.marketplace.cabinet.publications.empty')).toHaveLength(2);
    empty.unmount();

    const onRetry = vi.fn();
    const failed = render(
      <MarketplaceCabinet
        {...cabinet('publications', { listingPublications: { data: [], status: 'error' }, onRetry })}
      />,
    );
    expect(screen.getByText('agritech.marketplace.publication.historyUnavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    failed.unmount();

    render(
      <MarketplaceCabinet
        {...cabinet('publications', { listingPublications: { data: [listingPublication], status: 'ready' } })}
      />,
    );
    expect(screen.getByText('Tipping trailer 2PTS-4, used')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.publication.moderation.pending')).toBeTruthy();
  });

  it('keeps the verification state, level, identity link and sample history reachable', () => {
    const navigate = vi.fn();
    render(<MarketplaceCabinet {...cabinet('account', { navigate, samples: { data: [sample], status: 'ready' } })} />);

    expect(screen.getByText('agritech.marketplace.cabinet.account.level.verified')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.verify.identityLinked')).toBeTruthy();
    expect(screen.getByText('Cotton seed Omad F1')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.samples.status.received')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.verification' })[0]!);
    expect(navigate).toHaveBeenCalledWith('/verification');
  });

  it('reports a signed-in account that never started verification as not started', () => {
    render(<MarketplaceCabinet {...cabinet('account', { verification: { data: null, status: 'empty' } })} />);

    // `none` has no catalog entry of its own; a raw key must never reach the screen.
    expect(screen.getAllByText('agritech.marketplace.verify.notStarted').length).toBeGreaterThan(0);
    expect(screen.queryByText('agritech.marketplace.verify.none')).toBeNull();
    expect(screen.getByText('agritech.marketplace.verify.title')).toBeTruthy();
  });

  it('reports the dashboard read as unavailable rather than showing a zero', () => {
    const onRetry = vi.fn();
    render(<MarketplaceCabinet {...cabinet('overview', { dashboard: { data: null, status: 'error' }, onRetry })} />);

    expect(screen.getByText('agritech.marketplace.account.dashboardUnavailable')).toBeTruthy();
    expect(screen.queryByLabelText('agritech.marketplace.account.dashboard')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
