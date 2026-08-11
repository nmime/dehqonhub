// @requirements REQ-AUTH-RECOVERY-010 REQ-AGRITECH-WEB-006 REQ-AGRITECH-ONBOARDING-023 REQ-AGRITECH-DEMO-024 REQ-AGRITECH-ROUTING-015 REQ-FRONTEND-ACCESSIBILITY-003
import { expect, test, type Page, type Route } from '@playwright/test';
import type {
  ContractArtifactDto,
  ContractDisputeEvidenceDto,
  ContractLifecycleDto,
  ContractViewDto,
  MarketplaceAiConsultationDto,
  MarketplaceListingPromotionDto,
  MarketplaceListingPublicationDto,
  MarketplaceOwnedListingPublicationDto,
  MarketplaceOwnedRequestPublicationDto,
  MarketplaceProviderReadinessDto,
  MarketplacePublicProductListingDto,
  MarketplaceRoleDashboardDto,
  MarketplaceSampleDto,
  MarketplaceSampleUsageDto,
  OfferViewDto,
  PartnerViewDto,
  SupplierProductViewDto,
  VerificationViewDto,
} from '@app/frontend-api-client';

const now = '2026-08-09T10:00:00.000Z';
const listingId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const offerId = '33333333-3333-4333-8333-333333333333';
const contractId = '44444444-4444-4444-8444-444444444444';
const selectedContractId = '45454545-4545-4545-8545-454545454545';
const pendingListingId = '12121212-1212-4212-8212-121212121212';
const sourceProductId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const seller = {
  description: 'Certified seed cooperative',
  displayName: 'Seed cooperative',
  id: '55555555-5555-4555-8555-555555555555',
  provenance: 'live',
  region: 'Samarqand',
  verified: true,
} satisfies MarketplacePublicProductListingDto['seller'];

const listing = {
  availableQuantity: 20,
  category: 'seed',
  description: 'Certified corn seed',
  id: listingId,
  images: [],
  kind: 'product',
  priceUzs: 1_250_000,
  promoted: false,
  provenance: 'live',
  publishedAt: now,
  region: 'Samarqand',
  sampleAvailable: true,
  section: 'seeds',
  seller,
  title: 'Certified corn seed',
  transactional: true,
  unit: 't',
  updatedAt: now,
} satisfies MarketplacePublicProductListingDto;

const demoListing = {
  ...listing,
  availableQuantity: 80,
  id: '9d000000-0000-4000-8000-000000000101',
  provenance: 'demo',
  sampleAvailable: true,
  seller: {
    description: 'Synthetic preview profile',
    displayName: 'DehqonHub demo farm',
    id: '9d000000-0000-4000-8000-000000000001',
    provenance: 'demo',
    region: 'Samarqand',
    verified: false,
  },
  title: 'Premium demo cotton seed',
  transactional: false,
} satisfies MarketplacePublicProductListingDto;

const providerCapability = {
  mode: 'mock',
  providerName: 'deterministic-browser-fixture',
  ready: true,
  reconciliation: 'idempotent-retry',
  simulation: true,
  timeoutMs: 1_000,
} satisfies MarketplaceProviderReadinessDto['directPayment'];

const providerReadiness = {
  contractArtifactStorage: providerCapability,
  directPayment: providerCapability,
  factoring: providerCapability,
  notificationDelivery: providerCapability,
  oneId: providerCapability,
  promotionBilling: providerCapability,
  qualifiedSignature: providerCapability,
  verificationDocuments: providerCapability,
} satisfies MarketplaceProviderReadinessDto;

const verifiedVerification = {
  createdAt: now,
  documents: [],
  id: '66666666-6666-4666-8666-666666666666',
  identityAssurance: 'mock',
  level: 'verified',
  oneIdLinked: true,
  providerMode: 'mock',
  providerName: 'deterministic-browser-fixture',
  revision: 8,
  role: 'farmer',
  simulation: true,
  status: 'verified',
  step: 'complete',
  updatedAt: now,
} satisfies VerificationViewDto;

const draftVerification = {
  ...verifiedVerification,
  documents: [
    {
      fileName: 'identity.pdf',
      kind: 'id',
      mimeType: 'application/pdf',
      providerMode: 'mock',
      providerName: 'deterministic-browser-fixture',
      simulation: true,
      storedAt: now,
    },
    {
      fileName: 'business.pdf',
      kind: 'business',
      mimeType: 'application/pdf',
      providerMode: 'mock',
      providerName: 'deterministic-browser-fixture',
      simulation: true,
      storedAt: now,
    },
  ],
  level: 'basic',
  revision: 9,
  role: 'buyer',
  status: 'none',
  step: 'documents',
} satisfies VerificationViewDto;

const pendingVerification = {
  ...draftVerification,
  revision: 10,
  status: 'pending',
  step: 'review',
} satisfies VerificationViewDto;

const contract = {
  actorParty: 'buyer',
  amountUzs: 1_250_000,
  buyerPartySnapshot: { legalName: 'Regional buyer', region: 'Toshkent' },
  buyerSignedAt: now,
  createdAt: now,
  deliveryPriceUzs: 0,
  deliveryTerms: 'pickup',
  factoringEnabled: false,
  id: contractId,
  lines: [
    {
      lineTotalUzs: 1_250_000,
      name: listing.title,
      quantity: 1,
      sourceKind: 'product',
      sourcePublicationId: listingId,
      sourceRevision: 1,
      unit: 't',
      unitPriceUzs: 1_250_000,
    },
  ],
  revision: 4,
  sellerPartySnapshot: { legalName: seller.displayName, region: seller.region },
  sellerSignedAt: now,
  signedAt: now,
  sourceType: 'offer_selection',
  status: 'active',
  subject: listing.title,
  updatedAt: now,
} satisfies ContractViewDto;

const selectedDraftContract = {
  ...contract,
  buyerSignedAt: undefined,
  id: selectedContractId,
  revision: 1,
  sellerSignedAt: undefined,
  signedAt: undefined,
  status: 'draft',
} satisfies ContractViewDto;

const artifact = {
  byteSize: 2_048,
  checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  createdAt: now,
  mediaType: 'application/pdf',
  providerMode: 'mock',
  providerName: 'deterministic-artifact-store',
  simulation: true,
  snapshotFingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  snapshotRevision: 1,
  templateVersion: 'dehqonhub-contract-v1',
  watermark: 'MOCK PROVIDER — NOT A LEGAL CONTRACT',
} satisfies ContractArtifactDto;

const disputeEvidence = {
  byteSize: 14,
  checksumSha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  createdAt: now,
  fileName: 'quality-photo.png',
  id: '77777777-7777-4777-8777-777777777777',
  mediaType: 'image/png',
  providerMode: 'mock',
  providerName: 'deterministic-evidence-store',
  revision: 1,
  simulation: true,
  uploadedByParty: 'buyer',
} satisfies ContractDisputeEvidenceDto;

const promotion = {
  activatedAt: now,
  activationReference: 'browser-activation-reference',
  createdAt: now,
  currency: 'UZS',
  endsAt: '2026-08-16T10:00:00.000Z',
  id: '88888888-8888-4888-8888-888888888888',
  listingPublicId: listingId,
  planCode: 'catalog_7d',
  priceUzs: 100_000,
  revision: 1,
  sellerPartnerId: '99999999-9999-4999-8999-999999999999',
  startsAt: now,
  status: 'active',
  updatedAt: now,
} satisfies MarketplaceListingPromotionDto;

const aiConsultation = {
  answer: 'catalog_match',
  createdAt: now,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  kind: 'recommendation',
  listingPublicationIds: [listingId],
  question: 'Which seed is available?',
  response: {
    explanationCodes: ['grounded_at_consultation_time'],
    recommendations: [
      {
        availability: { quantity: 20, status: 'in_stock_at_consultation', unit: 't', warningCode: 'stock_may_change' },
        listingPublicationId: listingId,
        priceUzs: 1_250_000,
        reasonCodes: ['query_terms_match'],
        sellerPublicId: seller.id,
        titles: { en: listing.title, ru: listing.title, uz: listing.title, uzCyrl: listing.title },
      },
    ],
    starterCartPreview: {
      sellerPartitions: [{ listingPublicationIds: [listingId], sellerPublicId: seller.id }],
      status: 'requires_confirmation',
    },
  },
  updatedAt: now,
} satisfies MarketplaceAiConsultationDto;

const existingOwnedListing = {
  id: listingId,
  kind: 'listing',
  moderationStatus: 'approved',
  publishedAt: now,
  revision: 3,
  section: 'seeds',
  sellerPublicId: seller.id,
  sourceKind: 'product',
  status: 'published',
  title: listing.title,
  updatedAt: now,
} satisfies MarketplaceOwnedListingPublicationDto;

const pendingOwnedListing = {
  id: pendingListingId,
  kind: 'listing',
  moderationStatus: 'pending',
  publishedAt: now,
  revision: 1,
  section: 'seeds',
  sellerPublicId: seller.id,
  sourceKind: 'product',
  status: 'published',
  title: 'Corn seed source publication',
  updatedAt: now,
} satisfies MarketplaceOwnedListingPublicationDto;

const ownedRequestPublication = {
  buyerDisplayName: 'Regional buyer',
  id: requestId,
  kind: 'request',
  moderationStatus: 'pending',
  publishedAt: now,
  revision: 1,
  status: 'published',
  title: 'Need certified corn seed',
  updatedAt: now,
} satisfies MarketplaceOwnedRequestPublicationDto;

const listingPublicationReceipt = {
  id: pendingListingId,
  moderationStatus: 'pending',
  publishedAt: now,
  revision: 1,
  section: 'seeds',
  sellerPublicId: seller.id,
  sourceId: sourceProductId,
  sourceKind: 'product',
  status: 'published',
  updatedAt: now,
} satisfies MarketplaceListingPublicationDto;

interface CommandRecord {
  idempotencyKey?: string;
  method: string;
  path: string;
}

class MarketplaceFixtureApi {
  artifactDownloadRequests = 0;
  readonly commands: CommandRecord[] = [];
  readonly unhandledApiPaths = new Set<string>();
  private dashboardRequests = 0;
  private disputeOpen = false;
  private evidenceUploaded = false;
  private offerSelected = false;
  private promotionActive = false;
  private publicationSubmitted = false;
  private settlementAdvanced = false;
  private verification: VerificationViewDto = verifiedVerification;

  useDraftVerification(): void {
    this.verification = draftVerification;
  }

  useVerifiedVerification(): void {
    this.verification = verifiedVerification;
  }

  async install(page: Page): Promise<void> {
    await page.route('**/*', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const key = `${method} ${path}`;
      if (method !== 'GET' && this.isApiPath(path)) {
        this.commands.push({
          idempotencyKey: request.headers()['idempotency-key'],
          method,
          path,
        });
      }
      if (key === 'GET /marketplace/dashboard') {
        this.dashboardRequests += 1;
        if (this.dashboardRequests === 1) {
          await this.problem(route, 503, 'Dashboard fixture is temporarily unavailable.');
        } else {
          await this.ok(route, this.dashboard());
        }
        return;
      }
      if (key === `GET /marketplace/contracts/${contractId}/artifact/download`) {
        this.artifactDownloadRequests += 1;
        await route.fulfill({
          body: Buffer.from('%PDF-1.7\ndeterministic browser artifact\n%%EOF'),
          contentType: 'application/pdf',
          headers: { 'content-disposition': `attachment; filename="dehqonhub-contract-${contractId}.pdf"` },
          status: 200,
        });
        return;
      }
      if (key === `GET /marketplace/contracts/${selectedContractId}/lifecycle`) {
        await this.problem(route, 409, 'Prepare and sign the contract artifact before lifecycle actions.');
        return;
      }
      const mutation = this.mutations().get(key);
      if (mutation) {
        await mutation(route);
        return;
      }
      const response = this.getResponses()[path];
      if (method === 'GET' && response !== undefined) {
        await this.ok(route, response);
        return;
      }
      if (this.isApiPath(path)) {
        this.unhandledApiPaths.add(key);
        await this.problem(route, 501, `Unhandled deterministic API route: ${key}`);
        return;
      }
      await route.continue();
    });
  }

  private dashboard(): MarketplaceRoleDashboardDto {
    return {
      buyer: {
        activeDeals: 1,
        completedDeals: 1,
        completedSpendUzs: 1_250_000,
        openCarts: 1,
        openPurchaseRequests: 1,
      },
      generatedAt: now,
      monthlyActivity: [],
      recentDeals: [],
      role: 'farmer',
    };
  }

  private getResponses(): Record<string, unknown> {
    return {
      '/auth/problem-presentations': { items: [] },
      '/marketplace/ai/consultations': { items: [aiConsultation] },
      '/marketplace/cart': { items: [] },
      '/marketplace/contracts': { items: this.offerSelected ? [selectedDraftContract, contract] : [contract] },
      [`/marketplace/contracts/${contractId}/artifact`]: artifact,
      [`/marketplace/contracts/${contractId}/lifecycle`]: this.lifecycle(),
      '/marketplace/favorites': { items: [] },
      '/marketplace/notifications': {
        items: [
          {
            attempts: 0,
            contractId,
            contractPath: `/contracts/${contractId}`,
            deliveryChannel: 'telegram',
            event: 'artifact_stored',
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            locale: 'en',
            message: 'Contract document is ready',
            occurredAt: now,
            recipientParty: 'buyer',
            simulation: true,
            status: 'simulated',
            surface: 'in-app',
          },
        ],
      },
      '/marketplace/promotions': { items: this.promotionActive ? [promotion] : [] },
      '/marketplace/promotions/plans': {
        items: [{ code: 'catalog_7d', currency: 'UZS', durationDays: 7, priceUzs: 100_000 }],
      },
      '/marketplace/public/catalog': { items: [listing, demoListing] },
      '/marketplace/public/requests': {
        items: [
          {
            buyerDisplayName: 'Regional buyer',
            createdAt: now,
            id: requestId,
            region: 'Toshkent',
            title: 'Need certified corn seed',
            updatedAt: now,
          },
        ],
      },
      '/marketplace/publications/mine': {
        listings: this.publicationSubmitted ? [pendingOwnedListing, existingOwnedListing] : [existingOwnedListing],
        requests: [ownedRequestPublication],
      },
      '/marketplace/requests/mine': {
        items: [
          {
            createdAt: now,
            id: requestId,
            region: 'Toshkent',
            status: 'offering',
            title: 'Need certified corn seed',
            updatedAt: now,
          },
        ],
      },
      [`/marketplace/requests/${requestId}/offers`]: {
        items: [
          {
            createdAt: now,
            deliveryPriceUzs: 0,
            deliveryTerms: 'pickup',
            id: offerId,
            priceUzs: 1_250_000,
            requestPublicId: requestId,
            seller: { displayName: seller.displayName, region: seller.region },
            status: 'pending',
          } satisfies OfferViewDto,
        ],
      },
      '/marketplace/samples': {
        items: [
          {
            actorRole: 'seller',
            createdAt: now,
            delivery: { itemPriceUzs: 0, method: 'pickup', requesterPays: true },
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            listing: {
              id: listingId,
              kind: 'product',
              sampleAvailable: true,
              seller: { displayName: seller.displayName, id: seller.id },
              title: listing.title,
            },
            policyVersion: 1,
            revision: 1,
            seasonKey: '2026-Q1',
            status: 'requested',
            updatedAt: now,
          } satisfies MarketplaceSampleDto,
        ],
      },
      '/marketplace/samples/usage': {
        limit: 5,
        period: '2026-08',
        policyVersion: 1,
        remaining: 4,
        used: 1,
      } satisfies MarketplaceSampleUsageDto,
      '/marketplace/verification': this.verification,
      '/marketplace/verification/providers/readiness': providerReadiness,
      '/partners': {
        items: [
          this.partner('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'buyer', 'Regional buyer'),
          this.partner('99999999-9999-4999-8999-999999999999', 'supplier', seller.displayName),
        ],
      },
      '/produce': { items: [] },
      '/supplier/products': {
        items: [
          {
            category: 'seed',
            description: 'Source record ready for publication',
            id: sourceProductId,
            name: 'Corn seed source',
            partnerId: '99999999-9999-4999-8999-999999999999',
            priceUzs: 1_250_000,
            region: seller.region,
            sampleAvailable: true,
            status: 'active',
            stockQuantity: 20,
            unit: 't',
          } satisfies SupplierProductViewDto,
        ],
      },
    };
  }

  private isApiPath(path: string): boolean {
    return (
      path.startsWith('/auth/') ||
      path.startsWith('/marketplace/') ||
      path === '/partners' ||
      path === '/produce' ||
      path.startsWith('/supplier/')
    );
  }

  private lifecycle(): ContractLifecycleDto {
    const timeline: ContractLifecycleDto['timeline'] = this.settlementAdvanced
      ? [
          {
            actorParty: 'buyer',
            category: 'settlement',
            createdAt: now,
            eventType: 'buyer_payment_confirmed',
            providerMode: 'mock',
            sequence: 1,
            simulation: true,
          },
        ]
      : [];
    return {
      artifact,
      contractId,
      dispute: this.disputeOpen
        ? { createdAt: now, openedByParty: 'buyer', reason: 'quality_issue', status: 'open' }
        : undefined,
      disputeEvidence: this.evidenceUploaded ? [disputeEvidence] : [],
      fulfillment: { createdAt: now, revision: 1, status: 'awaiting_settlement', updatedAt: now },
      notificationIntents: [],
      reputationSignals: [],
      reviewEligibility: { eligible: false, sourceCount: 0 },
      settlement: {
        amountUzs: 1_250_000,
        createdAt: now,
        currency: 'UZS',
        kind: 'direct_payment',
        latestProviderMode: 'mock',
        reconciliationState: 'clear',
        revision: this.settlementAdvanced ? 2 : 1,
        simulation: true,
        status: this.settlementAdvanced ? 'buyer_confirmed' : 'awaiting_buyer_confirmation',
        updatedAt: now,
      },
      settlementEvents: [],
      signatures: [],
      timeline,
    };
  }

  private mutations(): ReadonlyMap<string, (route: Route) => Promise<void>> {
    return new Map([
      ['POST /marketplace/ai/consultations', (route) => this.ok(route, aiConsultation)],
      [
        `POST /marketplace/ai/consultations/${aiConsultation.id}/starter-cart`,
        (route) =>
          this.ok(route, {
            carts: [
              {
                cartId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                listingPublicationIds: [listingId],
                sellerPublicId: seller.id,
              },
            ],
            confirmedAt: now,
            consultationId: aiConsultation.id,
            status: 'confirmed',
          }),
      ],
      [
        `POST /marketplace/contracts/${contractId}/dispute`,
        async (route) => {
          this.disputeOpen = true;
          await this.ok(route, this.lifecycle());
        },
      ],
      [
        `POST /marketplace/contracts/${contractId}/dispute-evidence`,
        async (route) => {
          this.evidenceUploaded = true;
          await this.ok(route, disputeEvidence);
        },
      ],
      [
        `POST /marketplace/contracts/${contractId}/settlement/events`,
        async (route) => {
          this.settlementAdvanced = true;
          await this.ok(route, this.lifecycle());
        },
      ],
      [
        'POST /marketplace/promotions',
        async (route) => {
          this.promotionActive = true;
          await this.ok(route, promotion);
        },
      ],
      [
        'POST /marketplace/publications/listings',
        async (route) => {
          this.publicationSubmitted = true;
          await this.ok(route, listingPublicationReceipt);
        },
      ],
      [
        `POST /marketplace/requests/${requestId}/offers/${offerId}/choose`,
        async (route) => {
          this.offerSelected = true;
          await this.ok(route, { contractId: selectedContractId, offerId, requestPublicId: requestId });
        },
      ],
      [
        'POST /marketplace/verification/submit',
        async (route) => {
          this.verification = pendingVerification;
          await this.ok(route, pendingVerification);
        },
      ],
    ]);
  }

  private async ok(route: Route, data: unknown): Promise<void> {
    await route.fulfill({
      body: JSON.stringify({ data }),
      contentType: 'application/json',
      status: 200,
    });
  }

  private partner(id: string, kind: 'buyer' | 'supplier', legalName: string): PartnerViewDto {
    return {
      createdAt: now,
      id,
      kind,
      legalName,
      ownerUserId: 'browser-user',
      phone: '+998901234567',
      region: 'Toshkent',
      status: 'approved',
      taxId: '123456789',
      tenantId: 'browser-tenant',
      updatedAt: now,
    };
  }

  private async problem(route: Route, status: number, detail: string): Promise<void> {
    await route.fulfill({
      body: JSON.stringify({ detail, status, title: 'Unavailable', type: 'about:blank' }),
      contentType: 'application/problem+json',
      status,
    });
  }
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} should not overflow horizontally`).toBeLessThanOrEqual(1);
}

const viewports = [
  { height: 740, name: '320px mobile', width: 320 },
  { height: 812, name: '375px mobile', width: 375 },
  { height: 960, name: 'desktop', width: 1440 },
] as const;

for (const viewport of viewports) {
  test(`${viewport.name}: authenticated marketplace management and transaction journey`, async ({ page }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    const fixture = new MarketplaceFixtureApi();
    await fixture.install(page);

    await page.goto('/account');
    await expect(page.getByText('Dashboard metrics could not be loaded. No totals are assumed.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dashboard' })).toHaveCount(0);
    await page
      .getByText('Dashboard metrics could not be loaded. No totals are assumed.')
      .locator('..')
      .getByRole('button', { name: 'Retry' })
      .click();
    await expect(page.getByRole('region', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Publication and moderation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Catalog promotion' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Contract notifications' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Consultation history' })).toBeVisible();
    await expect(page.getByText('Simulation — no external message was delivered')).toBeVisible();
    await expect(page.getByText('Which seed is available?')).toBeVisible();
    await expectNoHorizontalOverflow(page, `${viewport.name} account`);

    await page
      .locator('article')
      .filter({ hasText: 'Corn seed source' })
      .getByRole('button', { name: 'Send for publication' })
      .click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(pendingOwnedListing.title)).toBeVisible();
    await page.getByLabel('Published listing').selectOption(listingId);
    await page.getByLabel('Promotion plan').selectOption('catalog_7d');
    const activatePromotion = page.getByRole('button', { name: 'Activate promotion' });
    await expect(activatePromotion).toBeEnabled();
    await activatePromotion.click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'View details' })).toBeVisible();

    await page.getByRole('button', { name: 'Open AI assistant' }).click();
    await page.getByPlaceholder('Ask about available catalog products and prices…').fill('Build a starter seed cart');
    await page.getByRole('button', { name: 'Send question' }).click();
    await page.getByRole('button', { name: 'Confirm starter cart' }).click();
    await expect(page.getByText('Starter cart confirmed')).toBeVisible();

    fixture.useDraftVerification();
    await page.goto('/verification');
    await expect(page.getByRole('heading', { name: 'Get verified' })).toBeVisible();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByRole('heading', { name: 'Your verification request is under review' })).toBeVisible();
    await expect(page.getByText('Simulation — no live-provider approval')).toBeVisible();
    await expectNoHorizontalOverflow(page, `${viewport.name} verification`);

    await page.goto('/catalog');
    const liveListingCard = page.locator('article').filter({ hasText: listing.title });
    await expect(liveListingCard.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
    await expect(liveListingCard.getByText('Complete marketplace verification to use this action.')).toBeVisible();
    await expect(liveListingCard.getByRole('button', { name: 'Open verification' })).toBeVisible();
    const demoListingCard = page.locator('article').filter({ hasText: demoListing.title });
    await expect(demoListingCard.getByText('Demo', { exact: true })).toBeVisible();
    await expect(demoListingCard.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
    await expect(
      demoListingCard.getByText(
        'This is synthetic preview data. Browse it freely; transactions and engagement are disabled.',
      ),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, `${viewport.name} progressive catalog`);

    fixture.useVerifiedVerification();
    await page.goto('/requests');
    await expect(page.getByText(seller.displayName)).toBeVisible();
    const chooseOffer = page.getByRole('button', { name: 'Choose offer' });
    await chooseOffer.focus();
    await chooseOffer.click();
    const dialog = page.getByRole('dialog');
    const confirmOffer = dialog.getByRole('button', { name: 'Choose this offer' });
    await expect(confirmOffer).toBeFocused();
    await expect(page.locator('header.dh-header')).toHaveAttribute('aria-hidden', 'true');
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(confirmOffer).toBeFocused();
    await confirmOffer.click();
    await expect(page).toHaveURL(`/contracts/${selectedContractId}`);
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(page.getByText('No generated contract artifact is available yet.')).toBeVisible();

    await page.goto(`/contracts/${contractId}`);

    await expect(page.getByRole('heading', { name: listing.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Document and dispute actions' })).toBeVisible();
    await expect(page.getByText('deterministic-artifact-store')).toBeVisible();
    await expect(page.getByText('Simulation — no external provider action occurred').first()).toBeVisible();
    await expect(page.getByText('The generated artifact carries a simulation watermark.')).toBeVisible();
    const downloadStarted = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toBe(`dehqonhub-contract-${contractId}.pdf`);
    await page.getByRole('button', { name: 'Advance mock lifecycle' }).click();
    await page.getByLabel('Dispute reason').selectOption('quality_issue');
    await page.getByRole('button', { name: 'Open dispute' }).click();
    await page.getByLabel('PDF, JPG or PNG evidence').setInputFiles({
      buffer: Buffer.from('quality photo'),
      mimeType: 'image/png',
      name: 'quality-photo.png',
    });
    await page.getByRole('button', { name: 'Upload evidence' }).click();
    await expect(page.getByText(/quality-photo\.png/u)).toBeVisible();
    await expectNoHorizontalOverflow(page, `${viewport.name} contract`);

    const requiredCommands = [
      '/marketplace/ai/consultations',
      `/marketplace/ai/consultations/${aiConsultation.id}/starter-cart`,
      `/marketplace/contracts/${contractId}/dispute`,
      `/marketplace/contracts/${contractId}/dispute-evidence`,
      `/marketplace/contracts/${contractId}/settlement/events`,
      '/marketplace/promotions',
      '/marketplace/publications/listings',
      `/marketplace/requests/${requestId}/offers/${offerId}/choose`,
      '/marketplace/verification/submit',
    ];
    for (const path of requiredCommands) {
      const command = fixture.commands.find((item) => item.path === path);
      expect(command, `${path} should be issued by the browser journey`).toBeDefined();
      expect(command?.idempotencyKey, `${path} should carry a valid command key`).toMatch(/^[A-Za-z0-9:_-]{8,100}$/u);
    }
    expect(fixture.artifactDownloadRequests).toBe(1);
    expect([...fixture.unhandledApiPaths]).toEqual([]);
  });
}

test('account recovery requests and confirms single-use credentials without exposing server detail', async ({
  page,
}) => {
  const commands: string[] = [];
  await page.setViewportSize({ height: 760, width: 375 });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/auth/me') {
      await route.fulfill({
        body: JSON.stringify({ detail: 'Authentication is required.', status: 401, title: 'Unauthorized' }),
        contentType: 'application/problem+json',
        status: 401,
      });
      return;
    }
    if (request.method() === 'GET' && path === '/auth/problem-presentations') {
      await route.fulfill({ body: JSON.stringify({ data: { items: [] } }), contentType: 'application/json' });
      return;
    }
    if (
      request.method() === 'POST' &&
      [
        '/auth/email-verification-token',
        '/auth/email-verification/confirm',
        '/auth/password-reset-token',
        '/auth/password-reset/confirm',
      ].includes(path)
    ) {
      commands.push(path);
      await route.fulfill({
        body: JSON.stringify({ data: { accepted: true, confirmed: true } }),
        contentType: 'application/json',
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/auth');
  const verification = page.getByRole('heading', { name: 'Email verification' }).locator('..');
  await verification.getByLabel('Email').fill('member@example.com');
  await verification.getByRole('button', { name: 'Send verification code' }).click();
  await expect(page.getByText('If the account exists, a verification code has been sent.')).toBeVisible();
  await verification.getByLabel('Single-use code').fill('verification-code-1234567890');
  await verification.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByText('Your email is verified.')).toBeVisible();

  const reset = page.getByRole('heading', { name: 'Password reset' }).locator('..');
  await reset.getByLabel('Email').fill('member@example.com');
  await reset.getByRole('button', { name: 'Send reset code' }).click();
  await expect(page.getByText('If the account exists, a password reset code has been sent.')).toBeVisible();
  await reset.getByLabel('Single-use code').fill('password-reset-code-1234567890');
  await reset.getByLabel('New password').fill('correct-horse-battery-staple');
  await reset.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('Your password has been updated. Sign in again on other devices.')).toBeVisible();
  expect(commands).toEqual([
    '/auth/email-verification-token',
    '/auth/email-verification/confirm',
    '/auth/password-reset-token',
    '/auth/password-reset/confirm',
  ]);
  await expectNoHorizontalOverflow(page, '375 recovery');
});
