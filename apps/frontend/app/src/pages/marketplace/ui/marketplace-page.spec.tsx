// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-ONBOARDING-023
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractLifecycleDto, VerificationViewDto } from '@app/frontend-api-client';
import type { MarketplaceData } from '../model/use-marketplace-data';
import { MarketplacePage } from './marketplace-page';

const testState = vi.hoisted(() => {
  const addToCart = vi.fn();
  const createContractArtifact = vi.fn();
  const createVerification = vi.fn();
  const consentFactoring = vi.fn();
  const getContractLifecycle = vi.fn();
  const linkOneId = vi.fn();
  const listReviews = vi.fn();
  const listSuggestions = vi.fn();
  const storeVerificationDocument = vi.fn();
  const submitVerification = vi.fn();
  const signContract = vi.fn();
  const recordSettlementEvent = vi.fn();
  const transitionContractFulfillment = vi.fn();
  return {
    addToCart,
    api: {
      marketplaceControllerAddToCart: addToCart,
      marketplaceControllerCreateContractArtifact: createContractArtifact,
      marketplaceControllerCreateVerification: createVerification,
      marketplaceControllerConsentFactoring: consentFactoring,
      marketplaceControllerGetContractLifecycle: getContractLifecycle,
      marketplaceControllerLinkOneId: linkOneId,
      marketplaceControllerStoreVerificationDocument: storeVerificationDocument,
      marketplaceControllerSubmitVerification: submitVerification,
      marketplaceControllerSignContract: signContract,
      marketplaceControllerRecordSettlementEvent: recordSettlementEvent,
      marketplaceControllerTransitionContractFulfillment: transitionContractFulfillment,
      marketplacePublicControllerListReviews: listReviews,
      marketplacePublicControllerListSuggestions: listSuggestions,
    },
    createVerification,
    consentFactoring,
    createContractArtifact,
    getContractLifecycle,
    linkOneId,
    listReviews,
    listSuggestions,
    marketplaceData: undefined as MarketplaceData | undefined,
    refresh: vi.fn(),
    requestOptions: {},
    storeVerificationDocument,
    submitVerification,
    signContract,
    recordSettlementEvent,
    transitionContractFulfillment,
    translate: (key: string) => key,
  };
});

vi.mock('@app/frontend-runtime', () => ({
  observer: <T,>(component: T): T => component,
  useI18n: () => ({
    locale: 'en',
    t: testState.translate,
  }),
}));

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useUserApiClient: () => ({
      api: testState.api,
      requestOptions: testState.requestOptions,
    }),
  };
});

vi.mock('../model/use-marketplace-data', () => ({
  useMarketplaceData: () => testState.marketplaceData,
}));

vi.mock('../../../shared/ui', () => ({
  LanguageSwitcher: () => null,
  ThemeSwitcher: () => null,
}));

const product = {
  category: 'seed' as const,
  description: 'Certified corn seed',
  id: 'seed-1',
  images: [],
  kind: 'product' as const,
  name: 'Corn seed',
  priceUzs: 1_250_000,
  promoted: false,
  provenance: 'live' as const,
  region: 'Samarqand',
  sampleAvailable: true,
  section: 'seeds' as const,
  status: 'active' as const,
  stockQuantity: 20,
  supplierId: 'seller-1',
  supplierName: 'Seed cooperative',
  transactional: true,
  unit: 't',
};

const emptyList = { data: [], status: 'empty' as const };

const lifecycleFixture = (contractId: string, factoring = false): ContractLifecycleDto => ({
  contractId,
  disputeEvidence: [],
  fulfillment: {
    createdAt: '2026-08-09T10:00:00.000Z',
    revision: 1,
    status: 'awaiting_settlement',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
  notificationIntents: [],
  reputationSignals: [],
  reviewEligibility: { eligible: false, sourceCount: 0 },
  settlement: factoring
    ? {
        amountUzs: product.priceUzs,
        createdAt: '2026-08-09T10:00:00.000Z',
        currency: 'UZS',
        kind: 'FactoringSettlementDto',
        latestProviderMode: 'mock',
        reconciliationState: 'clear',
        revision: 1,
        simulation: true,
        status: 'awaiting_consents',
        updatedAt: '2026-08-09T10:00:00.000Z',
      }
    : {
        amountUzs: product.priceUzs,
        createdAt: '2026-08-09T10:00:00.000Z',
        currency: 'UZS',
        kind: 'DirectPaymentSettlementDto',
        latestProviderMode: 'mock',
        reconciliationState: 'clear',
        revision: 1,
        simulation: true,
        status: 'awaiting_buyer_confirmation',
        updatedAt: '2026-08-09T10:00:00.000Z',
      },
  settlementEvents: [],
  signatures: [],
  timeline: [],
});

const apiSuccess = <T,>(data: T) => ({ data: { data }, response: new Response() });

const verificationFixture = (revision: number, oneIdLinked: boolean): VerificationViewDto => ({
  createdAt: '2026-08-09T10:00:00.000Z',
  documents: [],
  id: 'verification-1',
  identityAssurance: 'mock' as const,
  level: 'basic' as const,
  oneIdLinked,
  providerMode: 'mock' as const,
  revision,
  role: 'buyer' as const,
  simulation: true,
  status: 'none',
  step: oneIdLinked ? 'documents' : 'identity',
  updatedAt: '2026-08-09T10:00:00.000Z',
});

describe('MarketplacePage mutations', () => {
  beforeEach(() => {
    testState.refresh.mockReset();
    testState.addToCart.mockReset();
    testState.createContractArtifact.mockReset();
    testState.createVerification.mockReset();
    testState.consentFactoring.mockReset();
    testState.getContractLifecycle.mockReset();
    testState.linkOneId.mockReset();
    testState.listReviews.mockReset();
    testState.listSuggestions.mockReset();
    testState.storeVerificationDocument.mockReset();
    testState.submitVerification.mockReset();
    testState.signContract.mockReset();
    testState.recordSettlementEvent.mockReset();
    testState.transitionContractFulfillment.mockReset();
    testState.createContractArtifact.mockResolvedValue({ id: 'artifact-1' });
    testState.createVerification.mockResolvedValue(apiSuccess(verificationFixture(1, false)));
    testState.linkOneId.mockResolvedValue(apiSuccess(verificationFixture(2, true)));
    testState.listReviews.mockResolvedValue({ items: [] });
    testState.listSuggestions.mockResolvedValue(
      apiSuccess({ items: [{ id: 'seller-1', kind: 'seller', label: 'Seed cooperative' }] }),
    );
    testState.storeVerificationDocument.mockImplementation(() =>
      Promise.resolve(apiSuccess(verificationFixture(2 + testState.storeVerificationDocument.mock.calls.length, true))),
    );
    testState.submitVerification.mockResolvedValue(apiSuccess({ ...verificationFixture(5, true), status: 'pending' }));
    testState.signContract.mockResolvedValue({ id: 'contract-1' });
    testState.getContractLifecycle.mockResolvedValue(apiSuccess(lifecycleFixture('contract-1')));
    testState.consentFactoring.mockResolvedValue(apiSuccess(lifecycleFixture('contract-1', true)));
    testState.recordSettlementEvent.mockResolvedValue(apiSuccess(lifecycleFixture('contract-1')));
    testState.transitionContractFulfillment.mockResolvedValue(apiSuccess(lifecycleFixture('contract-1')));
    testState.marketplaceData = {
      aiConsultations: emptyList,
      auth: 'signed-in',
      carts: emptyList,
      catalog: { data: [product], status: 'ready' },
      contracts: emptyList,
      dashboard: { data: null, status: 'empty' },
      favorites: emptyList,
      myRequests: emptyList,
      notifications: emptyList,
      offersByRequest: { data: {}, status: 'empty' },
      ownedListingPublications: emptyList,
      ownedRequestPublications: emptyList,
      partners: {
        data: [
          {
            createdAt: '2026-08-09T10:00:00.000Z',
            id: 'buyer-partner',
            kind: 'buyer',
            legalName: 'Buyer cooperative',
            ownerUserId: 'buyer-1',
            phone: '+998901234567',
            region: 'Samarqand',
            status: 'approved',
            taxId: '123456789',
            tenantId: 'tenant-1',
            updatedAt: '2026-08-09T10:00:00.000Z',
          },
        ],
        status: 'ready',
      },
      produceListings: emptyList,
      promotionPlans: emptyList,
      promotions: emptyList,
      providerReadiness: {
        data: Object.fromEntries(
          [
            'contractArtifactStorage',
            'directPayment',
            'factoring',
            'notificationDelivery',
            'oneId',
            'promotionBilling',
            'qualifiedSignature',
            'verificationDocuments',
          ].map((capability) => [
            capability,
            {
              mode: 'mock',
              providerName: 'test',
              ready: true,
              reconciliation: 'idempotent-retry',
              simulation: true,
              timeoutMs: 5_000,
            },
          ]),
        ) as MarketplaceData['providerReadiness']['data'],
        status: 'ready',
      },
      refresh: testState.refresh,
      requests: emptyList,
      samples: emptyList,
      seller: { data: null, status: 'idle' },
      sellerCatalog: emptyList,
      sampleUsage: {
        data: { limit: 5, period: '2026', policyVersion: 1, remaining: 5, used: 0 },
        status: 'ready',
      },
      selectedListing: { data: product, status: 'ready' },
      supplierProducts: emptyList,
      verification: {
        data: {
          createdAt: '2026-08-09T10:00:00.000Z',
          documents: [],
          id: 'verification-1',
          identityAssurance: 'mock',
          level: 'verified',
          oneIdLinked: true,
          providerMode: 'mock',
          revision: 1,
          role: 'buyer',
          simulation: true,
          status: 'verified',
          step: 'complete',
          updatedAt: '2026-08-09T10:00:00.000Z',
        },
        status: 'ready',
      },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    [404, 'agritech.marketplace.action.notFound'],
    [409, 'agritech.marketplace.action.conflict'],
  ] as const)('refreshes authoritative marketplace state after a mutation fails with %s', async (status, message) => {
    testState.addToCart.mockResolvedValue({
      error: { detail: 'The stock changed.' },
      response: new Response(null, { status }),
    });

    render(<MarketplacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' }));

    expect((await screen.findByRole('alert')).textContent).toContain(message);
    await waitFor(() => {
      expect(testState.refresh).toHaveBeenCalledOnce();
    });
  });

  it('reuses the command key after an unknown response for the same logical action', async () => {
    testState.addToCart
      .mockRejectedValueOnce(new TypeError('connection closed after send'))
      .mockResolvedValueOnce(apiSuccess({ id: 'cart-1' }));

    render(<MarketplacePage />);
    const addButton = screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' });
    fireEvent.click(addButton);
    await screen.findByRole('alert');
    await waitFor(() => {
      expect(addButton.hasAttribute('disabled')).toBe(false);
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(testState.addToCart).toHaveBeenCalledTimes(2);
    });
    expect(testState.addToCart.mock.calls[0]?.[1]).toBe(testState.addToCart.mock.calls[1]?.[1]);
  });

  it('uses a new command key when the user edits the command input after an unknown response', async () => {
    testState.addToCart
      .mockRejectedValueOnce(new TypeError('connection closed after send'))
      .mockResolvedValueOnce(apiSuccess({ id: 'cart-1' }));

    render(<MarketplacePage navigate={vi.fn()} productId={product.id} view="product" />);
    const addButton = screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' });
    fireEvent.click(addButton);
    await screen.findByRole('alert');
    await waitFor(() => {
      expect(addButton.hasAttribute('disabled')).toBe(false);
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.product.quantity'), { target: { value: '2' } });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(testState.addToCart).toHaveBeenCalledTimes(2);
    });
    expect(testState.addToCart.mock.calls[0]?.[1]).not.toBe(testState.addToCart.mock.calls[1]?.[1]);
  });

  it('contains confirmation focus, hides the background, and restores the invoking control', async () => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    testState.marketplaceData = {
      ...testState.marketplaceData,
      carts: {
        data: [
          {
            createdAt: '2026-08-09T10:00:00.000Z',
            id: 'cart-confirmation',
            items: [{ listingPublicationId: product.id, quantity: 1, sourceKind: 'product' }],
            seller: { displayName: product.supplierName, region: product.region },
            status: 'open',
            updatedAt: '2026-08-09T10:00:00.000Z',
          },
        ],
        status: 'ready',
      },
    };

    render(<MarketplacePage navigate={vi.fn()} view="cart" />);
    const trigger = screen.getByRole('button', { name: /agritech.marketplace.cart.reviewContract/u });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', {
      name: 'agritech.marketplace.cart.reviewContract',
    });
    const closeButton = within(dialog).getByRole('button', { name: 'agritech.marketplace.close' });
    expect(document.activeElement).toBe(confirmButton);
    const header = document.querySelector<HTMLElement>('.dh-header');
    expect(header?.inert).toBe(true);
    expect(header?.getAttribute('aria-hidden')).toBe('true');

    fireEvent.keyDown(globalThis, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(globalThis, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirmButton);
    fireEvent.keyDown(globalThis, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
    expect(header?.inert).not.toBe(true);
    expect(header?.hasAttribute('aria-hidden')).toBe(false);
  });

  it.each([
    ['active', false],
    ['completed', true],
  ] as const)('shows review authoring only for a completed purchase, not %s', async (status, expected) => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    testState.marketplaceData = {
      ...testState.marketplaceData,
      contracts: {
        data: [
          {
            actorParty: 'buyer',
            amountUzs: product.priceUzs,
            buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
            createdAt: '2026-08-09T10:00:00.000Z',
            deliveryPriceUzs: 0,
            deliveryTerms: 'pickup',
            factoringEnabled: false,
            id: `contract-${status}`,
            revision: 1,
            lines: [
              {
                lineTotalUzs: product.priceUzs,
                name: product.name,
                quantity: 1,
                sourceKind: 'product',
                sourcePublicationId: product.id,
                sourceRevision: 1,
                unit: product.unit,
                unitPriceUzs: product.priceUzs,
              },
            ],
            sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
            sourceType: 'cart_checkout',
            status,
            subject: product.name,
            updatedAt: '2026-08-09T10:00:00.000Z',
          },
        ],
        status: 'ready',
      },
    };

    render(<MarketplacePage navigate={vi.fn()} productId={product.id} view="product" />);
    await waitFor(() => {
      expect(testState.listReviews).toHaveBeenCalledOnce();
    });

    const rating = screen.queryByLabelText('agritech.marketplace.reviews.rating');
    expect(Boolean(rating)).toBe(expected);
  });

  it('renders the public catalog for an anonymous visitor while keeping private favorites behind auth', () => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    testState.marketplaceData = {
      ...testState.marketplaceData,
      auth: 'signed-out',
      partners: emptyList,
      verification: { data: null, status: 'empty' },
    };

    const catalogView = render(<MarketplacePage navigate={vi.fn()} view="catalog" />);
    expect(screen.getByText(product.name)).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.auth.title')).toBeNull();

    catalogView.rerender(<MarketplacePage navigate={vi.fn()} view="favorites" />);
    expect(screen.getByText('agritech.marketplace.auth.title')).toBeTruthy();
  });

  it('renders the public purchase-request feed without a session', () => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    testState.marketplaceData = {
      ...testState.marketplaceData,
      auth: 'signed-out',
      partners: emptyList,
      requests: {
        data: [
          {
            buyerDisplayName: 'Regional buyer',
            createdAt: '2026-08-09T10:00:00.000Z',
            id: 'request-publication-1',
            region: 'Samarqand',
            status: 'open',
            title: 'Need certified corn seed',
            updatedAt: '2026-08-09T10:00:00.000Z',
          },
        ],
        status: 'ready',
      },
      verification: { data: null, status: 'empty' },
    };

    render(<MarketplacePage navigate={vi.fn()} view="requests" />);
    expect(screen.getByText('Need certified corn seed')).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.auth.title')).toBeNull();
  });

  it.each(['pending', 'rejected'] as const)(
    'fails closed for %s verification even when approved partner records remain',
    (verificationStatus) => {
      if (!testState.marketplaceData) {
        throw new Error('Marketplace fixture is unavailable.');
      }
      const currentVerification = testState.marketplaceData.verification.data;
      if (!currentVerification) {
        throw new Error('Verification fixture is unavailable.');
      }
      testState.marketplaceData = {
        ...testState.marketplaceData,
        partners: {
          data: [
            ...testState.marketplaceData.partners.data,
            {
              createdAt: '2026-08-09T10:00:00.000Z',
              id: 'supplier-partner',
              kind: 'supplier',
              legalName: 'Seed cooperative',
              ownerUserId: 'seller-1',
              phone: '+998901234568',
              region: 'Samarqand',
              status: 'approved',
              taxId: '987654321',
              tenantId: 'tenant-1',
              updatedAt: '2026-08-09T10:00:00.000Z',
            },
          ],
          status: 'ready',
        },
        promotionPlans: {
          data: [{ code: 'catalog_7d', currency: 'UZS', durationDays: 7, priceUzs: 100_000 }],
          status: 'ready',
        },
        supplierProducts: {
          data: [
            {
              category: 'seed',
              description: 'Certified corn seed',
              id: 'source-product-1',
              name: 'Corn seed source',
              partnerId: 'supplier-partner',
              priceUzs: product.priceUzs,
              region: product.region,
              sampleAvailable: true,
              status: 'active',
              stockQuantity: product.stockQuantity,
              unit: product.unit,
            },
          ],
          status: 'ready',
        },
        verification: {
          data: {
            ...currentVerification,
            level: 'basic',
            role: 'seller',
            status: verificationStatus,
            step: 'review',
          },
          status: 'ready',
        },
      };

      const view = render(<MarketplacePage navigate={vi.fn()} view="catalog" />);
      const addToCart = screen.getByRole('button', { name: 'agritech.marketplace.product.addToCart' });
      expect(addToCart.hasAttribute('disabled')).toBe(true);
      expect(screen.getByText('agritech.marketplace.access.verify')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'agritech.marketplace.access.action.verify' })).toBeTruthy();

      view.rerender(<MarketplacePage navigate={vi.fn()} view="account" />);
      expect(
        screen
          .getAllByRole('button', { name: 'agritech.marketplace.publication.publish' })
          .every((button) => button.hasAttribute('disabled')),
      ).toBe(true);
      expect(screen.getByRole('heading', { name: 'agritech.marketplace.promotion.title' })).toBeTruthy();
      expect(screen.getAllByText('agritech.marketplace.access.verify').length).toBeGreaterThan(0);
    },
  );

  it('loads public search suggestions and follows a seller result with keyboard-accessible controls', async () => {
    const navigate = vi.fn();
    render(<MarketplacePage navigate={navigate} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'agritech.marketplace.search' }), {
      target: { value: 'seed' },
    });
    const suggestion = await screen.findByRole('button', { name: /Seed cooperative/u });
    expect(testState.listSuggestions).toHaveBeenCalledWith({ limit: 6, q: 'seed' }, testState.requestOptions);
    fireEvent.click(suggestion);
    expect(navigate).toHaveBeenCalledWith('/sellers/seller-1');
  });

  it('starts verification only after the user explicitly chooses a role and continues', async () => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    testState.marketplaceData = {
      ...testState.marketplaceData,
      verification: { data: null, status: 'empty' },
    };

    render(<MarketplacePage navigate={vi.fn()} view="verification" />);
    fireEvent.click(screen.getByRole('button', { name: /agritech.marketplace.account.role.buyer/u }));
    expect(testState.createVerification).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.verify.start' }));

    await waitFor(() => {
      expect(testState.createVerification).toHaveBeenCalledOnce();
    });
    expect(testState.createVerification).toHaveBeenCalledWith(
      { expectedRevision: 0, role: 'buyer' },
      expect.any(String),
      testState.requestOptions,
    );
    expect(testState.linkOneId).not.toHaveBeenCalled();
    expect(testState.storeVerificationDocument).not.toHaveBeenCalled();
    expect(testState.submitVerification).not.toHaveBeenCalled();
  });

  it('uploads the exact user-selected evidence instead of browser-authored operational claims', async () => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    testState.marketplaceData = {
      ...testState.marketplaceData,
      verification: { data: verificationFixture(2, true), status: 'ready' },
    };

    render(<MarketplacePage navigate={vi.fn()} view="verification" />);
    const evidence = new File(['real identity evidence'], 'identity.pdf', { type: 'application/pdf' });
    const identityInput = screen.getAllByLabelText(/agritech.marketplace.verify.uploadDocument/u)[0];
    if (!identityInput) {
      throw new Error('Identity evidence input is unavailable.');
    }
    Object.defineProperty(identityInput, 'files', { configurable: true, value: [evidence] });
    fireEvent.change(identityInput);

    await waitFor(() => {
      expect(testState.storeVerificationDocument).toHaveBeenCalledOnce();
    });
    const [document, idempotencyKey, requestOptions] = testState.storeVerificationDocument.mock.calls[0] ?? [];
    expect(document).toMatchObject({
      contentBase64: globalThis.btoa('real identity evidence'),
      fileName: 'identity.pdf',
      kind: 'id',
      mimeType: 'application/pdf',
    });
    expect(document.contentBase64).not.toContain('DehqonHub mock verification evidence');
    expect(idempotencyKey).toEqual(expect.any(String));
    expect(requestOptions).toBe(testState.requestOptions);
    expect(testState.submitVerification).not.toHaveBeenCalled();
  });

  it('submits a complete verification case at the current persisted revision', async () => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    const completeVerification: VerificationViewDto = {
      ...verificationFixture(4, true),
      documents: [
        { fileName: 'identity.pdf', kind: 'id', mimeType: 'application/pdf', simulation: true },
        { fileName: 'business.pdf', kind: 'business', mimeType: 'application/pdf', simulation: true },
      ],
    };
    testState.marketplaceData = {
      ...testState.marketplaceData,
      verification: { data: completeVerification, status: 'ready' },
    };

    render(<MarketplacePage navigate={vi.fn()} view="verification" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.verify.submit' }));

    await waitFor(() => {
      expect(testState.submitVerification).toHaveBeenCalledOnce();
    });
    expect(testState.submitVerification).toHaveBeenCalledWith(
      { expectedRevision: 4 },
      expect.any(String),
      testState.requestOptions,
    );
    expect(testState.refresh).toHaveBeenCalledOnce();
  });

  it('prepares the mock factoring artifact before recording a contract signature', async () => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    testState.marketplaceData = {
      ...testState.marketplaceData,
      contracts: {
        data: [
          {
            actorParty: 'buyer',
            amountUzs: product.priceUzs,
            buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
            createdAt: '2026-08-09T10:00:00.000Z',
            deliveryPriceUzs: 0,
            deliveryTerms: 'pickup',
            factoringEnabled: true,
            id: 'contract-1',
            revision: 1,
            lines: [
              {
                lineTotalUzs: product.priceUzs,
                name: product.name,
                quantity: 1,
                sourceKind: 'product',
                sourcePublicationId: product.id,
                sourceRevision: 1,
                unit: product.unit,
                unitPriceUzs: product.priceUzs,
              },
            ],
            sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
            sourceType: 'cart_checkout',
            status: 'draft',
            subject: product.name,
            updatedAt: '2026-08-09T10:00:00.000Z',
          },
        ],
        status: 'ready',
      },
    };

    render(<MarketplacePage contractId="contract-1" navigate={vi.fn()} view="contract" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.contract.signOwnParty' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'agritech.marketplace.contract.signOwnParty',
      }),
    );

    await waitFor(() => {
      expect(testState.signContract).toHaveBeenCalledOnce();
    });
    expect(testState.createContractArtifact).toHaveBeenCalledOnce();
    expect(testState.createContractArtifact.mock.invocationCallOrder[0]).toBeLessThan(
      testState.signContract.mock.invocationCallOrder[0]!,
    );
    const artifactCall = testState.createContractArtifact.mock.calls[0]!;
    const signatureCall = testState.signContract.mock.calls[0]!;
    expect(artifactCall[0]).toBe('contract-1');
    expect(artifactCall[1]).toEqual({ settlementKind: 'factoring' });
    expect(artifactCall[2]).toMatch(/:artifact$/u);
    expect(signatureCall[0]).toBe('contract-1');
    expect(signatureCall[1]).toBe(String(artifactCall[2]).replace(/:artifact$/u, ':signature'));
    expect(testState.refresh).toHaveBeenCalledOnce();
  });

  it('advances the actor-authorized mock factoring lifecycle from the existing contract panel', async () => {
    if (!testState.marketplaceData) {
      throw new Error('Marketplace fixture is unavailable.');
    }
    const lifecycle = lifecycleFixture('contract-factoring', true);
    testState.getContractLifecycle.mockResolvedValue(apiSuccess(lifecycle));
    testState.consentFactoring.mockResolvedValue(apiSuccess(lifecycle));
    testState.marketplaceData = {
      ...testState.marketplaceData,
      contracts: {
        data: [
          {
            actorParty: 'buyer',
            amountUzs: product.priceUzs,
            buyerPartySnapshot: { legalName: 'Buyer cooperative', region: 'Samarqand' },
            buyerSignedAt: '2026-08-09T10:02:00.000Z',
            createdAt: '2026-08-09T10:00:00.000Z',
            deliveryPriceUzs: 0,
            deliveryTerms: 'pickup',
            factoringEnabled: true,
            id: 'contract-factoring',
            revision: 1,
            lines: [],
            sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Toshkent' },
            sellerSignedAt: '2026-08-09T10:03:00.000Z',
            signedAt: '2026-08-09T10:03:00.000Z',
            sourceType: 'cart_checkout',
            status: 'active',
            subject: product.name,
            updatedAt: '2026-08-09T10:03:00.000Z',
          },
        ],
        status: 'ready',
      },
    };

    render(<MarketplacePage contractId="contract-factoring" navigate={vi.fn()} view="contract" />);
    fireEvent.click(await screen.findByRole('button', { name: 'agritech.marketplace.contract.settlement.advance' }));

    await waitFor(() => {
      expect(testState.consentFactoring).toHaveBeenCalledOnce();
    });
    expect(testState.consentFactoring).toHaveBeenCalledWith(
      'contract-factoring',
      expect.any(String),
      testState.requestOptions,
    );
    expect(testState.refresh).toHaveBeenCalledOnce();
  });
});
