// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-NOTIFICATION-022 REQ-AGRITECH-ROUTING-015
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@app/frontend-api-client';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { createAdminAccess } from '../../entities/admin-session';
import { MarketplaceAdminPage, type MarketplaceAdminView } from './marketplace-admin-page';

const ok = <T,>(data: T) => ({ data, error: undefined, response: new Response(null, { status: 200 }) });
const timestamp = '2030-01-01T00:00:00.000Z';
const adminCommandKey = /^admin-[0-9a-f-]{36}$/u;

const fullAccess = createAdminAccess({
  permissions: ['admin:agritech:approve', 'admin:agritech:read', 'admin:agritech:write', 'admin:feature-flags:read'],
  roles: ['admin'],
  subject: 'operator-1',
});
const readAccess = createAdminAccess({
  permissions: ['admin:agritech:read'],
  roles: ['admin'],
  subject: 'operator-read-only',
});

const renderView = (view: MarketplaceAdminView, access = fullAccess) =>
  render(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={adminFrontendTranslations}>
        <MarketplaceAdminPage access={access} requestOptions={{}} view={view} />
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

const mockOverview = () => {
  vi.spyOn(adminApi, 'agriTechAdminControllerListVerifications').mockResolvedValue(
    ok({ items: [{ id: 'verification-1', status: 'pending' }] }) as never,
  );
  vi.spyOn(adminApi, 'agriTechAdminControllerListPendingMarketplacePublications').mockResolvedValue(
    ok({ listings: [{ publication: { id: 'listing-1' } }], requests: [], sellerProfiles: [] }) as never,
  );
  vi.spyOn(adminApi, 'agriTechAdminControllerListContracts').mockResolvedValue(
    ok({
      items: [
        { id: 'contract-1', status: 'active' },
        { id: 'contract-2', status: 'completed' },
      ],
    }) as never,
  );
  vi.spyOn(adminApi, 'marketplaceContractNotificationAdminControllerList').mockResolvedValue(
    ok({ items: [{ id: 'notification-1', status: 'reconciliation_required' }] }) as never,
  );
  vi.spyOn(adminApi, 'marketplaceContractLifecycleAdminControllerListCommissionPolicies').mockResolvedValue(
    ok({ items: [{ status: 'active', version: 'rates-2030' }] }) as never,
  );
  vi.spyOn(adminApi, 'marketplaceEngagementAdminControllerListReviewReports').mockResolvedValue(
    ok({ items: [{ reportId: 'report-1' }] }) as never,
  );
};

describe('Marketplace admin workspace', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('summarizes every operator queue and links to governed demo controls', async () => {
    mockOverview();
    renderView('overview');

    expect(await screen.findByRole('heading', { name: 'Marketplace overview' })).toBeTruthy();
    expect(screen.getByText('rates-2030')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage feature flags' }).getAttribute('href')).toBe(
      '/admin/settings/feature-flags',
    );
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(4);
  });

  it('keeps read-only contract context visible without mutation controls', async () => {
    vi.spyOn(adminApi, 'agriTechAdminControllerListContracts').mockResolvedValue(
      ok({
        items: [
          {
            amountUzs: 1_200_000,
            id: 'contract-read-only',
            revision: 2,
            status: 'active',
            subject: 'Visible contract',
          },
        ],
      }) as never,
    );
    vi.spyOn(adminApi, 'marketplaceContractLifecycleAdminControllerListCommissionPolicies').mockResolvedValue(
      ok({
        items: [{ rates: { produce: 200, product: 250, request: 300 }, status: 'active', version: 'rates-visible' }],
      }) as never,
    );

    renderView('commerce', readAccess);

    expect(await screen.findByText('Visible contract')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inspect lifecycle' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Activate policy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resolve dispute' })).toBeNull();
  });

  it('refreshes authoritative policy state after a revision conflict', async () => {
    vi.spyOn(adminApi, 'agriTechAdminControllerListContracts').mockResolvedValue(ok({ items: [] }) as never);
    const policies = vi
      .spyOn(adminApi, 'marketplaceContractLifecycleAdminControllerListCommissionPolicies')
      .mockResolvedValue(
        ok({
          items: [{ rates: { produce: 200, product: 250, request: 300 }, status: 'active', version: 'rates-current' }],
        }) as never,
      );
    vi.spyOn(adminApi, 'marketplaceContractLifecycleAdminControllerActivateCommissionPolicy').mockResolvedValue({
      data: undefined,
      error: { status: 409, title: 'Conflict' },
      response: new Response(null, { status: 409 }),
    } as never);

    renderView('commerce');
    expect(await screen.findByText('rates-current')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Activate policy' }));

    expect(await screen.findByText('This record changed. Refresh the queue before deciding again.')).toBeTruthy();
    await waitFor(() => {
      expect(policies).toHaveBeenCalledTimes(2);
    });
  });

  it('submits verification and publication decisions with persisted revisions and command keys', async () => {
    vi.spyOn(adminApi, 'agriTechAdminControllerListVerifications').mockResolvedValue(
      ok({
        items: [
          {
            createdAt: timestamp,
            documents: [{ fileName: 'passport.pdf', kind: 'identity', simulation: true }],
            id: 'verification-1',
            identityAssurance: 'mock',
            level: 'basic',
            oneIdLinked: true,
            providerMode: 'mock',
            revision: 3,
            role: 'seller',
            simulation: true,
            status: 'pending',
            step: 'review',
            tenantId: 'tenant-1',
            updatedAt: timestamp,
            userId: 'seller-user',
          },
        ],
      }) as never,
    );
    const listing = {
      content: { description: 'Certified seed', images: [], region: 'Samarqand', title: 'Samarqand corn', unit: 'kg' },
      publication: {
        id: 'listing-1',
        moderationStatus: 'pending',
        revision: 4,
        section: 'seeds',
        sellerPublicId: 'seller-public-1',
        sourceId: 'source-1',
        sourceKind: 'product',
        status: 'published',
        updatedAt: timestamp,
      },
      seller: {
        contentFingerprint: 'a'.repeat(64),
        contentRevision: 2,
        displayName: 'Seed cooperative',
        id: 'seller-public-1',
        moderationStatus: 'approved',
        region: 'Samarqand',
      },
    };
    vi.spyOn(adminApi, 'agriTechAdminControllerListPendingMarketplacePublications').mockResolvedValue(
      ok({ listings: [listing], requests: [], sellerProfiles: [] }) as never,
    );
    const verify = vi
      .spyOn(adminApi, 'agriTechAdminControllerReviewVerification')
      .mockResolvedValue(ok({ id: 'verification-1' }) as never);
    const reviewListing = vi
      .spyOn(adminApi, 'agriTechAdminControllerReviewMarketplaceListingPublication')
      .mockResolvedValue(ok({ id: 'listing-1' }) as never);

    renderView('moderation');
    expect(await screen.findByText('seller-user')).toBeTruthy();
    fireEvent.click(
      within(screen.getByText('seller-user').closest('article')!).getByRole('button', { name: 'Approve' }),
    );
    await waitFor(() => {
      expect(verify).toHaveBeenCalledWith(
        'verification-1',
        { decision: 'verified', expectedRevision: 3 },
        expect.stringMatching(adminCommandKey),
        expect.any(Object),
      );
    });

    const listingCard = screen.getByText('Samarqand corn').closest('article')!;
    fireEvent.click(within(listingCard).getByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      expect(reviewListing).toHaveBeenCalledWith(
        'listing-1',
        {
          decision: 'approved',
          expectedRevision: 4,
          expectedSellerContentFingerprint: 'a'.repeat(64),
          expectedSellerContentRevision: 2,
        },
        expect.stringMatching(adminCommandKey),
        expect.any(Object),
      );
    });
  });

  it('inspects a tenant lifecycle, resolves its evidence revision, and activates commission policy', async () => {
    const contract = {
      actorParty: 'buyer',
      amountUzs: 1_200_000,
      buyerPartySnapshot: { displayName: 'Buyer', region: 'Tashkent' },
      createdAt: timestamp,
      deliveryTerms: 'pickup',
      factoringEnabled: false,
      id: 'contract-1',
      lines: [],
      revision: 2,
      sellerPartySnapshot: { displayName: 'Seller', region: 'Samarqand' },
      status: 'active',
      subject: 'Seed order',
      updatedAt: timestamp,
    };
    vi.spyOn(adminApi, 'agriTechAdminControllerListContracts').mockResolvedValue(ok({ items: [contract] }) as never);
    vi.spyOn(adminApi, 'marketplaceContractLifecycleAdminControllerListCommissionPolicies').mockResolvedValue(
      ok({
        items: [
          {
            createdAt: timestamp,
            rates: { produce: 200, product: 250, request: 300 },
            status: 'active',
            version: 'rates-v1',
          },
        ],
      }) as never,
    );
    vi.spyOn(adminApi, 'marketplaceContractLifecycleAdminControllerGetContractLifecycle').mockResolvedValue(
      ok({
        contractId: 'contract-1',
        dispute: { createdAt: timestamp, openedByParty: 'buyer', reason: 'quality_issue', status: 'open' },
        disputeEvidence: [
          {
            byteSize: 1024,
            checksumSha256: 'b'.repeat(64),
            createdAt: timestamp,
            fileName: 'quality.jpg',
            id: 'evidence-1',
            mediaType: 'image/jpeg',
            providerMode: 'mock',
            providerName: 'mock-evidence',
            revision: 2,
            simulation: true,
            uploadedByParty: 'buyer',
          },
        ],
        fulfillment: { createdAt: timestamp, revision: 2, status: 'disputed', updatedAt: timestamp },
        notificationIntents: [],
        reputationSignals: [],
        reviewEligibility: { eligible: false, sourceCount: 0 },
        settlement: {
          amountUzs: 1_200_000,
          createdAt: timestamp,
          currency: 'UZS',
          kind: 'direct_payment',
          latestProviderMode: 'mock',
          reconciliationState: 'clear',
          revision: 2,
          simulation: true,
          status: 'buyer_confirmed',
          updatedAt: timestamp,
        },
        settlementEvents: [],
        signatures: [],
        timeline: [],
      }) as never,
    );
    const resolve = vi
      .spyOn(adminApi, 'marketplaceContractLifecycleAdminControllerResolveDispute')
      .mockResolvedValue(ok({ contractId: 'contract-1', status: 'resolved' }) as never);
    const activate = vi
      .spyOn(adminApi, 'marketplaceContractLifecycleAdminControllerActivateCommissionPolicy')
      .mockResolvedValue(ok({ status: 'active', version: 'marketplace-v1' }) as never);

    renderView('commerce');
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect lifecycle' }));
    expect(await screen.findByText('quality.jpg')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Outcome note'), { target: { value: 'Evidence reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve dispute' }));
    await waitFor(() => {
      expect(resolve).toHaveBeenCalledWith(
        'contract-1',
        {
          decision: 'dismissed',
          evidenceIds: ['evidence-1'],
          evidenceRevision: 2,
          outcomeNote: 'Evidence reviewed',
        },
        expect.stringMatching(adminCommandKey),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Activate policy' }));
    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith(
        { rates: { produce: 250, product: 250, request: 250 }, version: 'marketplace-v1' },
        expect.stringMatching(adminCommandKey),
        expect.any(Object),
      );
    });
  });

  it('updates sample policy, moderates reports, and discloses simulated notification delivery', async () => {
    vi.spyOn(adminApi, 'marketplaceEngagementAdminControllerGetSamplePolicy').mockResolvedValue(
      ok({ activeFrom: timestamp, monthlyLimit: 5, version: 2 }) as never,
    );
    vi.spyOn(adminApi, 'marketplaceEngagementAdminControllerListReviewReports').mockResolvedValue(
      ok({
        items: [
          {
            expectedRevision: 3,
            reason: 'spam',
            reportComment: 'Repeated promotion',
            reportId: 'report-1',
            review: {
              assetReferences: [],
              comment: 'Buy from this link',
              createdAt: timestamp,
              id: 'review-1',
              listingPublicationId: 'listing-1',
              rating: 1,
              revision: 3,
              updatedAt: timestamp,
              verifiedDeal: true,
            },
            submittedAt: timestamp,
          },
        ],
      }) as never,
    );
    vi.spyOn(adminApi, 'marketplaceContractNotificationAdminControllerList').mockResolvedValue(
      ok({
        items: [
          {
            attempts: 1,
            channelAttempts: 1,
            contractId: 'contract-1',
            createdAt: timestamp,
            deliveryChannel: 'telegram',
            event: 'contract.signed',
            id: 'notification-1',
            locale: 'en',
            message: 'Contract signed',
            nextAttemptAt: timestamp,
            providerMode: 'mock',
            recipientLocale: 'ru',
            recipientParty: 'seller',
            simulation: true,
            status: 'simulated',
            surface: 'in-app',
            templateKey: 'contract.signed',
            timelineEventId: 'event-1',
            updatedAt: timestamp,
          },
        ],
      }) as never,
    );
    const activate = vi
      .spyOn(adminApi, 'marketplaceEngagementAdminControllerActivateSamplePolicy')
      .mockResolvedValue(ok({ monthlyLimit: 8, version: 3 }) as never);
    const moderate = vi
      .spyOn(adminApi, 'marketplaceEngagementAdminControllerModerateReviewReport')
      .mockResolvedValue(ok({ decision: 'hidden' }) as never);

    renderView('engagement');
    expect(await screen.findByText('Contract signed')).toBeTruthy();
    expect(screen.getByText(/Simulated provider result/u)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Monthly sample limit'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate sample policy' }));
    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith(
        { expectedVersion: 2, monthlyLimit: 8 },
        expect.stringMatching(adminCommandKey),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hide review' }));
    await waitFor(() => {
      expect(moderate).toHaveBeenCalledWith(
        'report-1',
        { decision: 'hidden', expectedRevision: 3 },
        expect.stringMatching(adminCommandKey),
        expect.any(Object),
      );
    });
  });
});
