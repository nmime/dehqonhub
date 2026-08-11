// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-NOTIFICATION-022 REQ-AGRITECH-ROUTING-015
import { expect, test, type Page, type Route } from '@playwright/test';
import { adminApi } from '@app/frontend-api-client';

const now = '2030-01-01T00:00:00.000Z';
const verificationId = '11111111-1111-4111-8111-111111111111';
const listingId = '22222222-2222-4222-8222-222222222222';
const contractId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '44444444-4444-4444-8444-444444444444';
const reportId = '55555555-5555-4555-8555-555555555555';

const verification = {
  createdAt: now,
  documents: [{ fileName: 'identity.pdf', kind: 'identity', providerMode: 'mock', simulation: true }],
  id: verificationId,
  identityAssurance: 'mock',
  level: 'basic',
  oneIdLinked: true,
  providerMode: 'mock',
  providerName: 'browser-fixture',
  revision: 3,
  role: 'seller',
  simulation: true,
  status: 'pending',
  step: 'review',
  tenantId: 'tenant-1',
  updatedAt: now,
  userId: 'seller@example.test',
} satisfies adminApi.AdminVerificationViewDto;

const listing = {
  content: {
    description: 'Certified drought-resistant corn seed',
    images: [],
    region: 'Samarqand',
    title: 'Samarqand corn seed',
    unit: 'kg',
  },
  publication: {
    id: listingId,
    moderationStatus: 'pending',
    revision: 4,
    section: 'seeds',
    sellerPublicId: '66666666-6666-4666-8666-666666666666',
    sourceId: '77777777-7777-4777-8777-777777777777',
    sourceKind: 'product',
    status: 'published',
    updatedAt: now,
  },
  seller: {
    contentFingerprint: 'a'.repeat(64),
    contentRevision: 2,
    displayName: 'Seed cooperative',
    id: '66666666-6666-4666-8666-666666666666',
    moderationStatus: 'approved',
    region: 'Samarqand',
  },
} satisfies adminApi.MarketplaceListingModerationItemDto;

const contract = {
  actorParty: 'buyer',
  amountUzs: 1_200_000,
  buyerPartySnapshot: { legalName: 'Regional buyer', region: 'Tashkent' },
  createdAt: now,
  deliveryTerms: 'pickup',
  factoringEnabled: false,
  id: contractId,
  lines: [],
  revision: 2,
  sellerPartySnapshot: { legalName: 'Seed cooperative', region: 'Samarqand' },
  status: 'active',
  subject: 'Seed order',
  updatedAt: now,
} satisfies adminApi.ContractViewDto;

const lifecycle = {
  contractId,
  dispute: { createdAt: now, openedByParty: 'buyer', reason: 'quality_issue', status: 'open' },
  disputeEvidence: [
    {
      byteSize: 2048,
      checksumSha256: 'b'.repeat(64),
      createdAt: now,
      fileName: 'quality-photo.jpg',
      id: evidenceId,
      mediaType: 'image/jpeg',
      providerMode: 'mock',
      providerName: 'browser-fixture',
      revision: 2,
      simulation: true,
      uploadedByParty: 'buyer',
    },
  ],
  fulfillment: { createdAt: now, revision: 2, status: 'disputed', updatedAt: now },
  notificationIntents: [],
  reputationSignals: [],
  reviewEligibility: { eligible: false, sourceCount: 0 },
  settlement: {
    amountUzs: 1_200_000,
    createdAt: now,
    currency: 'UZS',
    kind: 'direct_payment',
    latestProviderMode: 'mock',
    reconciliationState: 'clear',
    revision: 2,
    simulation: true,
    status: 'buyer_confirmed',
    updatedAt: now,
  },
  settlementEvents: [],
  signatures: [],
  timeline: [],
} satisfies adminApi.ContractLifecycleDto;

interface CommandRecord {
  body: unknown;
  idempotencyKey?: string;
  method: string;
  path: string;
}

class AdminMarketplaceFixture {
  readonly commands: CommandRecord[] = [];
  readonly unhandled = new Set<string>();

  constructor(private readonly locale: 'en' | 'ru') {}

  async install(page: Page): Promise<void> {
    await page.route('**/*', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const key = `${method} ${path}`;
      if (request.resourceType() === 'document') {
        await route.continue();
        return;
      }
      if (this.isApiPath(path) && method !== 'GET') {
        this.commands.push({
          body: request.postDataJSON(),
          idempotencyKey: request.headers()['idempotency-key'],
          method,
          path,
        });
      }
      const response = this.responses()[key];
      if (response !== undefined) {
        await this.ok(route, response);
        return;
      }
      if (this.isApiPath(path)) {
        this.unhandled.add(key);
        await route.fulfill({
          body: JSON.stringify({ detail: `Unhandled fixture route: ${key}`, status: 501, title: 'Not Implemented' }),
          contentType: 'application/problem+json',
          status: 501,
        });
        return;
      }
      await route.continue();
    });
  }

  private isApiPath(path: string): boolean {
    return path.startsWith('/admin') || path.startsWith('/auth');
  }

  private responses(): Record<string, unknown> {
    return {
      'GET /auth/me': {
        principal: { locale: this.locale, subject: 'operator-1' },
        user: { locale: this.locale },
      },
      'GET /auth/problem-presentations': { items: [] },
      'GET /admin/profile/me': {
        principal: {
          permissions: [
            'admin:agritech:approve',
            'admin:agritech:read',
            'admin:agritech:write',
            'admin:feature-flags:read',
          ],
          roles: ['admin'],
          subject: 'operator-1',
        },
        profile: { displayName: 'Marketplace operator', email: 'operator@example.test', id: 'operator-1' },
      },
      'GET /admin/verifications': { items: [verification] },
      'GET /admin/marketplace/publications/pending': { listings: [listing], requests: [], sellerProfiles: [] },
      'GET /admin/contracts': { items: [contract] },
      [`GET /admin/marketplace/contracts/${contractId}/lifecycle`]: lifecycle,
      'GET /admin/marketplace/commission-policies': {
        items: [
          {
            createdAt: now,
            rates: { produce: 200, product: 250, request: 300 },
            status: 'active',
            version: 'rates-v1',
          },
        ],
      },
      'GET /admin/marketplace/engagement/sample-policy': { activeFrom: now, monthlyLimit: 5, version: 2 },
      'GET /admin/marketplace/engagement/review-reports': {
        items: [
          {
            expectedRevision: 3,
            reason: 'spam',
            reportComment: 'Repeated promotion',
            reportId,
            review: {
              assetReferences: [],
              comment: 'Buy from this link',
              createdAt: now,
              id: '88888888-8888-4888-8888-888888888888',
              listingPublicationId: listingId,
              rating: 1,
              revision: 3,
              updatedAt: now,
              verifiedDeal: true,
            },
            submittedAt: now,
          },
        ],
      },
      'GET /admin/marketplace/notifications': {
        items: [
          {
            attempts: 1,
            channelAttempts: 1,
            contractId,
            createdAt: now,
            deliveryChannel: 'telegram',
            event: 'contract.signed',
            id: '99999999-9999-4999-8999-999999999999',
            locale: 'en',
            message: 'Contract signed',
            nextAttemptAt: now,
            providerMode: 'mock',
            recipientLocale: 'ru',
            recipientParty: 'seller',
            simulation: true,
            status: 'simulated',
            surface: 'in-app',
            templateKey: 'contract.signed',
            timelineEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            updatedAt: now,
          },
        ],
      },
      'GET /admin/partners': { items: [] },
      'GET /admin/farmers': { items: [] },
      'GET /admin/orders': { items: [] },
      'GET /admin/pilots': { items: [] },
      'GET /admin/integrations': { items: [] },
      'GET /admin/analytics': {
        activeInputProducts: 0,
        activeProduceListings: 0,
        activeFarmers: 0,
        approvedBuyers: 0,
        approvedSuppliers: 0,
        commissionBasisPoints: 0,
        deliveredOrders: 0,
        farmers: 0,
        fulfillmentRateBasisPoints: 0,
        gmvUzs: 0,
        inputStockUnits: 0,
        orders: 0,
        paidPayments: 0,
        partnerApplications: 0,
        pendingFarmers: 0,
        pendingPartners: 0,
        platformCommissionUzs: 0,
        produceAvailableKg: 0,
        repeatBuyerRateBasisPoints: 0,
        repeatBuyers: 0,
      },
      [`PATCH /admin/verifications/${verificationId}`]: verification,
      [`PATCH /admin/marketplace/publications/listings/${listingId}`]: listing.publication,
      'POST /admin/marketplace/commission-policies': {
        createdAt: now,
        rates: { produce: 250, product: 250, request: 250 },
        status: 'active',
        version: 'marketplace-v1',
      },
      [`POST /admin/marketplace/contracts/${contractId}/dispute-resolution`]: {
        contractId,
        decision: 'dismissed',
        evidenceRevision: 2,
        fulfillmentStatus: 'in_progress',
        resolvedAt: now,
        status: 'resolved',
      },
      'POST /admin/marketplace/engagement/sample-policy': { activeFrom: now, monthlyLimit: 8, version: 3 },
      [`PATCH /admin/marketplace/engagement/review-reports/${reportId}`]: {
        decision: 'hidden',
        reportId,
        reviewRevision: 4,
        reviewVisibility: 'hidden',
      },
    };
  }

  private async ok(route: Route, data: unknown): Promise<void> {
    await route.fulfill({ body: JSON.stringify({ data }), contentType: 'application/json', status: 200 });
  }
}

const expectNoHorizontalOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} should not overflow horizontally`).toBeLessThanOrEqual(1);
};

for (const viewport of [
  {
    activatePolicy: 'Activate policy',
    activateSample: 'Activate sample policy',
    approve: 'Approve',
    commerceHeading: 'Marketplace commerce',
    engagementHeading: 'Marketplace engagement',
    height: 760,
    hideReview: 'Hide review',
    inspect: 'Inspect lifecycle',
    locale: 'en',
    moderationHeading: 'Marketplace moderation',
    monthlyLimit: 'Monthly sample limit',
    name: '320px',
    operationsHeading: 'AgriTech control center',
    outcomeNote: 'Outcome note',
    overviewHeading: 'Marketplace overview',
    resolve: 'Resolve dispute',
    saved: 'The marketplace operation was saved.',
    simulation: /Simulated provider result/u,
    skip: 'Skip to content',
    width: 320,
  },
  {
    activatePolicy: 'Активировать политику',
    activateSample: 'Активировать политику образцов',
    approve: 'Одобрить',
    commerceHeading: 'Сделки маркетплейса',
    engagementHeading: 'Вовлечение в маркетплейсе',
    height: 812,
    hideReview: 'Скрыть отзыв',
    inspect: 'Открыть жизненный цикл',
    locale: 'ru',
    moderationHeading: 'Модерация маркетплейса',
    monthlyLimit: 'Месячный лимит образцов',
    name: '375px Russian',
    operationsHeading: 'Центр управления AgriTech',
    outcomeNote: 'Комментарий к решению',
    overviewHeading: 'Обзор маркетплейса',
    resolve: 'Разрешить спор',
    saved: 'Операция маркетплейса сохранена.',
    simulation: /Симуляция провайдера/u,
    skip: 'Перейти к содержимому',
    width: 375,
  },
  {
    activatePolicy: 'Activate policy',
    activateSample: 'Activate sample policy',
    approve: 'Approve',
    commerceHeading: 'Marketplace commerce',
    engagementHeading: 'Marketplace engagement',
    height: 900,
    hideReview: 'Hide review',
    inspect: 'Inspect lifecycle',
    locale: 'en',
    moderationHeading: 'Marketplace moderation',
    monthlyLimit: 'Monthly sample limit',
    name: 'desktop',
    operationsHeading: 'AgriTech control center',
    outcomeNote: 'Outcome note',
    overviewHeading: 'Marketplace overview',
    resolve: 'Resolve dispute',
    saved: 'The marketplace operation was saved.',
    simulation: /Simulated provider result/u,
    skip: 'Skip to content',
    width: 1440,
  },
] as const) {
  test(`operates the full marketplace workspace at ${viewport.name}`, async ({ page }) => {
    const fixture = new AdminMarketplaceFixture(viewport.locale);
    await fixture.install(page);
    await page.setViewportSize({ height: viewport.height, width: viewport.width });

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: viewport.overviewHeading })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: viewport.skip })).toBeFocused();
    await expect(page.getByText('rates-v1')).toBeVisible();
    await expectNoHorizontalOverflow(page, `${viewport.name} overview`);

    await page.goto('/admin/marketplace/moderation');
    await expect(page.getByRole('heading', { name: viewport.moderationHeading })).toBeVisible();
    await page
      .getByText('seller@example.test')
      .locator('xpath=ancestor::article[1]')
      .getByRole('button', { name: viewport.approve })
      .click();
    await expect(page.getByText(viewport.saved)).toBeVisible();
    await page
      .getByText('Samarqand corn seed')
      .locator('xpath=ancestor::article[1]')
      .getByRole('button', { name: viewport.approve })
      .click();
    await expectNoHorizontalOverflow(page, `${viewport.name} moderation`);

    await page.goto('/admin/marketplace/commerce');
    await expect(page.getByRole('heading', { name: viewport.commerceHeading })).toBeVisible();
    await page.getByRole('button', { name: viewport.inspect }).click();
    await expect(page.getByText('quality-photo.jpg')).toBeVisible();
    await page.getByLabel(viewport.outcomeNote).fill('Evidence reviewed by operator');
    await page.getByRole('button', { name: viewport.resolve }).click();
    await page.getByRole('button', { name: viewport.activatePolicy }).click();
    await expectNoHorizontalOverflow(page, `${viewport.name} commerce`);

    await page.goto('/admin/marketplace/engagement');
    await expect(page.getByRole('heading', { name: viewport.engagementHeading })).toBeVisible();
    await expect(page.getByText('Contract signed')).toBeVisible();
    await expect(page.getByText(viewport.simulation)).toBeVisible();
    await page.getByLabel(viewport.monthlyLimit).fill('8');
    await page.getByRole('button', { name: viewport.activateSample }).click();
    await page.getByRole('button', { name: viewport.hideReview }).click();
    await expectNoHorizontalOverflow(page, `${viewport.name} engagement`);

    await page.goto('/admin/marketplace/operations');
    await expect(page.getByRole('heading', { name: viewport.operationsHeading })).toBeVisible();
    await expectNoHorizontalOverflow(page, `${viewport.name} operations`);

    const expectedPaths = [
      `/admin/verifications/${verificationId}`,
      `/admin/marketplace/publications/listings/${listingId}`,
      '/admin/marketplace/commission-policies',
      `/admin/marketplace/contracts/${contractId}/dispute-resolution`,
      '/admin/marketplace/engagement/sample-policy',
      `/admin/marketplace/engagement/review-reports/${reportId}`,
    ];
    for (const path of expectedPaths) {
      const command = fixture.commands.find((item) => item.path === path);
      expect(command, `${path} should be called`).toBeDefined();
      expect(command?.idempotencyKey).toMatch(/^[A-Za-z0-9:_-]{8,100}$/u);
    }
    expect([...fixture.unhandled]).toEqual([]);
  });
}
