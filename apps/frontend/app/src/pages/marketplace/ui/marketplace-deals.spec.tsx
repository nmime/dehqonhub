// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractLifecycleDto, ContractViewDto, VerificationViewDto } from '@app/frontend-api-client';
import type { MarketplaceData, Resource } from '../model/use-marketplace-data';
import { MarketplacePage } from './marketplace-page';

const testState = vi.hoisted(() => {
  const apiMocks = new Map<string, ReturnType<typeof vi.fn>>();
  const api = new Proxy<Record<string, ReturnType<typeof vi.fn>>>(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== 'string') {
          return undefined;
        }
        const existing = apiMocks.get(property);
        if (existing) {
          return existing;
        }
        const created = vi.fn();
        apiMocks.set(property, created);
        return created;
      },
    },
  );
  return {
    api,
    apiMocks,
    marketplaceData: undefined as MarketplaceData | undefined,
    requestOptions: { headers: { 'x-test': 'marketplace-deals' } },
  };
});

vi.mock('@app/frontend-runtime', () => ({
  observer: <T,>(component: T): T => component,
  useI18n: () => ({ locale: 'en', t: (key: string) => key }),
}));

vi.mock('@app/frontend-feature-user-logout', () => ({
  useLogout: () => ({ model: { isPending: false }, signOut: () => undefined }),
}));

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useUserApiClient: () => ({ api: testState.api, requestOptions: testState.requestOptions }),
  };
});

vi.mock('../model/use-marketplace-data', () => ({
  useMarketplaceData: () => testState.marketplaceData,
}));

vi.mock('../../../shared/ui', () => ({
  LanguageSwitcher: () => null,
  ThemeSwitcher: () => null,
}));

vi.mock('./marketplace-discovery', () => ({
  MarketplaceCatalog: () => <div data-testid="catalog-view" />,
  MarketplaceEmpty: () => <div data-testid="empty-view" />,
  MarketplaceFavorites: () => <div data-testid="favorites-view" />,
  MarketplaceHome: () => <div data-testid="home-view" />,
  MarketplaceProductDetail: () => <div data-testid="product-view" />,
  MarketplaceSellerProfile: () => <div data-testid="seller-view" />,
  MarketplaceSkeleton: () => <div data-testid="marketplace-skeleton" />,
}));

vi.mock('./marketplace-commerce', () => ({
  MarketplaceAccount: () => <div data-testid="account-view" />,
  MarketplaceCart: () => <div data-testid="cart-view" />,
  MarketplaceContract: () => <div data-testid="contract-view" />,
  MarketplaceRequests: () => <div data-testid="requests-view" />,
  MarketplaceVerification: () => <div data-testid="verification-view" />,
}));

vi.mock('./marketplace-management', () => ({
  MarketplaceUserManagement: () => <div data-testid="management-view" />,
}));

vi.mock('./marketplace-ai', () => ({
  MarketplaceAi: () => <div data-testid="ai-view" />,
}));

const now = '2026-08-09T10:00:00.000Z';

const apiSuccess = <T,>(data: T) => ({ data: { data }, response: new Response() });
const apiFailure = (status: number) => ({
  error: { detail: `request failed with ${status}` },
  response: new Response(null, { status }),
});

const apiMock = (name: string): ReturnType<typeof vi.fn> => testState.api[name] as ReturnType<typeof vi.fn>;

const contract = (overrides: Partial<ContractViewDto> & Pick<ContractViewDto, 'id'>): ContractViewDto => ({
  actorParty: 'buyer',
  amountUzs: 4_500_000,
  buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
  createdAt: now,
  deliveryTerms: 'pickup',
  factoringEnabled: false,
  lines: [],
  revision: 1,
  sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Tashkent' },
  status: 'draft',
  subject: 'Certified corn seed',
  updatedAt: now,
  ...overrides,
});

const lifecycle = (
  contractId: string,
  overrides: Partial<ContractLifecycleDto> = {},
): ContractLifecycleDto => ({
  contractId,
  disputeEvidence: [],
  fulfillment: { createdAt: now, revision: 1, status: 'ready', updatedAt: now },
  notificationIntents: [],
  reputationSignals: [],
  reviewEligibility: { eligible: false, sourceCount: 0 },
  settlement: {
    amountUzs: 4_500_000,
    createdAt: now,
    currency: 'UZS',
    kind: 'direct_payment',
    latestProviderMode: 'mock',
    reconciliationState: 'clear',
    revision: 1,
    simulation: true,
    status: 'awaiting_buyer_confirmation',
    updatedAt: now,
  },
  settlementEvents: [],
  signatures: [],
  timeline: [],
  ...overrides,
});

const verification: VerificationViewDto = {
  createdAt: now,
  documents: [],
  id: 'verification-1',
  identityAssurance: 'mock',
  level: 'verified',
  oneIdLinked: true,
  providerMode: 'mock',
  revision: 5,
  role: 'farmer',
  simulation: true,
  status: 'verified',
  step: 'complete',
  updatedAt: now,
};

const ready = <T,>(data: T): Resource<T> => ({ data, status: 'ready' });
const empty = <T,>(data: T): Resource<T> => ({ data, status: 'empty' });

const marketplaceData = (
  contracts: Resource<ContractViewDto[]>,
  overrides: Partial<MarketplaceData> = {},
): MarketplaceData =>
  ({
    aiConsultations: empty([]),
    auth: 'signed-in',
    carts: empty([]),
    catalog: ready([]),
    contracts,
    dashboard: empty(null),
    favorites: empty([]),
    myRequests: empty([]),
    notifications: empty([]),
    offersByRequest: empty({}),
    ownedListingPublications: empty([]),
    ownedRequestPublications: empty([]),
    partners: empty([]),
    produceListings: empty([]),
    promotionPlans: empty([]),
    promotions: empty([]),
    providerReadiness: empty(null),
    refresh: vi.fn(),
    requests: empty([]),
    sampleUsage: { data: { limit: 5, period: 'current', policyVersion: 1, remaining: 5, used: 0 }, status: 'idle' },
    samples: empty([]),
    seller: { data: null, status: 'idle' },
    sellerCatalog: empty([]),
    selectedListing: { data: null, status: 'idle' },
    supplierProducts: empty([]),
    verification: ready(verification),
    ...overrides,
  }) as MarketplaceData;

const renderDeals = (data: MarketplaceData, navigate = vi.fn()) => {
  testState.marketplaceData = data;
  render(<MarketplacePage navigate={navigate} view="deals" />);
  return navigate;
};

const lane = async (name: 'counterparty' | 'stalled' | 'you') => {
  const region = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`section[data-deal-lane="${name}"]`);
    if (!found) {
      throw new Error(`lane ${name} is not rendered`);
    }
    return found;
  });
  return region;
};

afterEach(() => {
  cleanup();
  testState.apiMocks.clear();
  testState.marketplaceData = undefined;
  vi.clearAllMocks();
});

describe('DehqonHub deals in flight', () => {
  it('groups every in-flight deal by the side it is waiting on and offers one honest action each', async () => {
    const unsignedDraft = contract({ id: 'deal-draft' });
    const mineSigned = contract({ buyerSignedAt: now, id: 'deal-signed', status: 'signed' });
    const deliveryQuotePending = contract({
      actorParty: 'seller',
      deliveryTerms: 'seller_delivery',
      id: 'deal-quote',
      sourceType: 'cart_checkout',
    });
    const inSettlement = contract({
      buyerSignedAt: now,
      id: 'deal-active',
      sellerSignedAt: now,
      signedAt: now,
      status: 'active',
    });
    const disputed = contract({
      buyerSignedAt: now,
      id: 'deal-dispute',
      sellerSignedAt: now,
      status: 'active',
    });
    const unreadable = contract({
      buyerSignedAt: now,
      id: 'deal-unreadable',
      sellerSignedAt: now,
      status: 'active',
    });
    const legacy = contract({ id: 'deal-legacy', status: 'legacy_review_required' });
    const finished = contract({ id: 'deal-done', status: 'completed' });

    const lifecycleResponses = new Map<string, unknown>([
      [
        disputed.id,
        apiSuccess(
          lifecycle(disputed.id, {
            dispute: { createdAt: now, openedByParty: 'buyer', reason: 'quality_issue', status: 'open' },
            fulfillment: { createdAt: now, revision: 2, status: 'disputed', updatedAt: now },
          }),
        ),
      ],
      // A contract with no prepared settlement rows answers this read with a client error.
      [unreadable.id, apiFailure(400)],
      [
        inSettlement.id,
        apiSuccess(
          lifecycle(inSettlement.id, {
            fulfillment: { createdAt: now, deliveredAt: now, revision: 3, status: 'delivered', updatedAt: now },
          }),
        ),
      ],
    ]);
    apiMock('marketplaceControllerGetContractLifecycle').mockImplementation(((id: string) =>
      Promise.resolve(lifecycleResponses.get(id))) as never);

    renderDeals(
      marketplaceData(
        ready([unsignedDraft, mineSigned, deliveryQuotePending, inSettlement, disputed, unreadable, legacy, finished]),
      ),
    );

    const yours = await lane('you');
    const counterparty = await lane('counterparty');
    const stalled = await lane('stalled');

    // Waiting on you: my own consent, my own delivery quote, and my own lifecycle step.
    expect([...yours.querySelectorAll('article')].map((node) => node.dataset['dealStatus'])).toEqual([
      'draft',
      'draft',
      'active',
    ]);
    expect(within(yours).getByText('agritech.marketplace.contract.signOwnParty')).toBeTruthy();
    expect(within(yours).getByText('agritech.marketplace.deals.action.quote')).toBeTruthy();
    expect(within(yours).getByText('agritech.marketplace.deals.action.acceptDelivery')).toBeTruthy();

    // Waiting on the other party: my consent is already recorded, so the only action is to read it.
    expect(counterparty.querySelectorAll('article')).toHaveLength(1);
    expect(within(counterparty).getByText('agritech.marketplace.deals.stage.awaitingConsent')).toBeTruthy();
    expect(within(counterparty).getByText('agritech.marketplace.deals.action.open')).toBeTruthy();

    // Stalled: an open dispute, a lifecycle that cannot be read, and a quarantined contract.
    expect([...stalled.querySelectorAll('article')].map((node) => node.dataset['dealStatus'])).toEqual([
      'active',
      'active',
      'legacy_review_required',
    ]);
    expect(within(stalled).getByText('agritech.marketplace.deals.stage.dispute')).toBeTruthy();
    expect(within(stalled).getByText('agritech.marketplace.deals.stage.lifecycleUnavailable')).toBeTruthy();
    expect(within(stalled).getByText('agritech.marketplace.deals.stage.legacy')).toBeTruthy();
    expect(within(stalled).queryByText('agritech.marketplace.contract.signOwnParty')).toBeNull();

    // A completed deal is not in flight and appears in no lane.
    expect(document.querySelector('article[data-deal-status="completed"]')).toBeNull();
    // Only the active deals were read twice; a draft needs no second request.
    expect(apiMock('marketplaceControllerGetContractLifecycle')).toHaveBeenCalledTimes(3);
  });

  it('submits the lifecycle command the stage allows and opens the contract from the card', async () => {
    const inFulfillment = contract({
      actorParty: 'seller',
      buyerSignedAt: now,
      id: 'deal-start',
      sellerSignedAt: now,
      status: 'active',
    });
    apiMock('marketplaceControllerGetContractLifecycle').mockResolvedValue(apiSuccess(lifecycle(inFulfillment.id)));
    apiMock('marketplaceControllerTransitionContractFulfillment').mockResolvedValue(
      apiSuccess(
        lifecycle(inFulfillment.id, {
          fulfillment: { createdAt: now, revision: 2, startedAt: now, status: 'in_progress', updatedAt: now },
        }),
      ),
    );
    const navigate = renderDeals(marketplaceData(ready([inFulfillment])));

    const yours = await lane('you');
    fireEvent.click(within(yours).getByText('agritech.marketplace.deals.action.startDelivery'));

    await waitFor(() => {
      expect(apiMock('marketplaceControllerTransitionContractFulfillment')).toHaveBeenCalledWith(
        inFulfillment.id,
        { command: 'start' },
        expect.any(String),
        testState.requestOptions,
      );
    });
    // The command answered with the next stage, so the card now offers the next step.
    expect(await within(await lane('you')).findByText('agritech.marketplace.deals.action.markDelivered')).toBeTruthy();

    fireEvent.click(within(await lane('you')).getByText('agritech.marketplace.deals.action.open'));
    expect(navigate).toHaveBeenCalledWith(`/contracts/${inFulfillment.id}`);
  });

  it('does not offer a lifecycle command to an actor the API would refuse', async () => {
    const draft = contract({ id: 'deal-unverified' });
    renderDeals(
      marketplaceData(ready([draft]), {
        verification: ready({ ...verification, level: 'basic', status: 'pending' }),
      }),
    );

    const yours = await lane('you');
    expect(within(yours).queryByText('agritech.marketplace.contract.signOwnParty')).toBeNull();
    expect(within(yours).getByText('agritech.marketplace.deals.action.verify')).toBeTruthy();
  });

  it('distinguishes no deals in flight from nothing needing you right now', async () => {
    const navigate = renderDeals(marketplaceData(ready([contract({ id: 'deal-done', status: 'completed' })])));

    expect(await screen.findByText('agritech.marketplace.deals.empty.title')).toBeTruthy();
    fireEvent.click(screen.getByText('agritech.marketplace.deals.empty.action'));
    expect(navigate).toHaveBeenCalledWith('/catalog');
    expect(document.querySelector('section[data-deal-lane="you"]')).toBeNull();

    cleanup();
    renderDeals(marketplaceData(ready([contract({ buyerSignedAt: now, id: 'deal-signed', status: 'signed' })])));

    const yours = await lane('you');
    expect(within(yours).getByText('agritech.marketplace.deals.lane.you.clear')).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.deals.empty.title')).toBeNull();
  });

  it('reports an unreadable deal list as an error with a retry', async () => {
    const refresh = vi.fn();
    renderDeals(marketplaceData({ data: [], status: 'error' }, { refresh }));

    expect(await screen.findByText('agritech.marketplace.error')).toBeTruthy();
    fireEvent.click(screen.getByText('ui.runtime.retry'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the deals entry only for a signed-in visitor and badges only consent-pending deals', async () => {
    const awaitingMe = contract({ id: 'deal-1' });
    const awaitingMeToo = contract({ id: 'deal-2', sellerSignedAt: now, status: 'signed' });
    const awaitingCounterparty = contract({ buyerSignedAt: now, id: 'deal-3', status: 'signed' });
    const activeDeal = contract({
      buyerSignedAt: now,
      id: 'deal-4',
      sellerSignedAt: now,
      status: 'active',
    });
    const finished = contract({ id: 'deal-5', status: 'completed' });
    apiMock('marketplaceControllerGetContractLifecycle').mockResolvedValue(apiSuccess(lifecycle(activeDeal.id)));

    const navigate = renderDeals(
      marketplaceData(ready([awaitingMe, awaitingMeToo, awaitingCounterparty, activeDeal, finished])),
    );

    const entry = screen.getByRole('button', { name: /agritech\.marketplace\.deals\.nav/u });
    // Two drafts and one half-signed contract await this party's own consent;
    // the counterparty-side deal, the active deal and the completed deal do not.
    expect(within(entry).getByText('2')).toBeTruthy();
    expect(entry.querySelector('em')?.getAttribute('aria-label')).toBe('agritech.marketplace.deals.badge');
    fireEvent.click(entry);
    expect(navigate).toHaveBeenCalledWith('/deals');

    cleanup();
    renderDeals(marketplaceData(empty([]), { auth: 'signed-out', verification: empty(null) }));
    expect(screen.queryByRole('button', { name: /agritech\.marketplace\.deals\.nav/u })).toBeNull();
  });
});
