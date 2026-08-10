// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MarketplaceAiConsultationDto,
  MarketplaceContractNotificationRecipientDto,
  MarketplaceListingPromotionDto,
  MarketplaceOwnedListingPublicationDto,
  MarketplaceOwnedRequestPublicationDto,
  MarketplaceSampleDto,
  SupplierProductViewDto,
} from '@app/frontend-api-client';
import { MarketplaceUserManagement } from './marketplace-management';
import type { MarketplaceTranslate } from './marketplace-ui';

const t: MarketplaceTranslate = (key) => key;
const empty = { data: [], status: 'empty' as const };
const now = '2026-08-09T10:00:00.000Z';

const ownedListing: MarketplaceOwnedListingPublicationDto = {
  id: 'listing-publication-1',
  kind: 'listing',
  moderationStatus: 'approved',
  revision: 3,
  section: 'seeds',
  sellerPublicId: 'seller-public-1',
  sourceKind: 'product',
  status: 'published',
  title: 'Owned corn seed',
  titleRu: 'Семена кукурузы',
  updatedAt: now,
};

const ownedRequest: MarketplaceOwnedRequestPublicationDto = {
  buyerDisplayName: 'Regional buyer',
  id: 'request-publication-1',
  kind: 'request',
  moderationStatus: 'pending',
  revision: 1,
  status: 'published',
  title: 'Need seed for spring',
  updatedAt: now,
};

const pendingOwnedListing: MarketplaceOwnedListingPublicationDto = {
  ...ownedListing,
  id: 'listing-publication-pending',
  moderationStatus: 'pending',
  title: 'Pending corn seed',
};

const rejectedOwnedListing: MarketplaceOwnedListingPublicationDto = {
  ...ownedListing,
  id: 'listing-publication-rejected',
  moderationStatus: 'rejected',
  status: 'rejected',
  title: 'Rejected corn seed',
};

const sourceProduct: SupplierProductViewDto = {
  category: 'seed',
  description: 'Certified corn seed',
  id: 'source-product-1',
  name: 'Corn seed source',
  partnerId: 'internal-partner-1',
  priceUzs: 1_250_000,
  region: 'Samarqand',
  sampleAvailable: true,
  status: 'active',
  stockQuantity: 20,
  unit: 't',
};

const sampleListing = {
  id: ownedListing.id,
  kind: 'product' as const,
  sampleAvailable: true,
  seller: { displayName: 'Seed cooperative', id: 'seller-public-1' },
  title: ownedListing.title,
};

const samples: MarketplaceSampleDto[] = [
  {
    actorRole: 'seller',
    createdAt: now,
    delivery: { itemPriceUzs: 0, method: 'pickup', requesterPays: true },
    id: 'sample-seller-1',
    listing: sampleListing,
    policyVersion: 1,
    revision: 1,
    seasonKey: '2026-Q1',
    status: 'requested',
    updatedAt: now,
  },
  {
    actorRole: 'requester',
    createdAt: now,
    delivery: { itemPriceUzs: 0, method: 'pickup', requesterPays: true },
    id: 'sample-requester-1',
    listing: sampleListing,
    policyVersion: 1,
    revision: 4,
    seasonKey: '2026-Q1',
    status: 'received',
    updatedAt: now,
  },
];

const promotion: MarketplaceListingPromotionDto = {
  activatedAt: now,
  activationReference: 'activation-audit-1',
  createdAt: now,
  currency: 'UZS',
  endsAt: '2026-08-16T10:00:00.000Z',
  id: 'promotion-1',
  listingPublicId: ownedListing.id,
  planCode: 'catalog_7d',
  priceUzs: 100_000,
  revision: 1,
  sellerPartnerId: 'internal-partner-1',
  startsAt: now,
  status: 'active',
  updatedAt: now,
};

const notification: MarketplaceContractNotificationRecipientDto = {
  attempts: 0,
  contractId: 'contract-1',
  contractPath: '/contracts/contract-1',
  deliveryChannel: 'telegram',
  event: 'artifact_stored',
  id: 'notification-1',
  locale: 'en',
  message: 'Contract document is ready',
  occurredAt: now,
  recipientParty: 'buyer',
  simulation: true,
  status: 'simulated',
  surface: 'in-app',
};

const consultation: MarketplaceAiConsultationDto = {
  answer: 'catalog_match',
  createdAt: now,
  id: 'consultation-1',
  kind: 'recommendation',
  listingPublicationIds: [ownedListing.id],
  question: 'Which seed is available?',
  response: {
    explanationCodes: ['grounded_at_consultation_time'],
    recommendations: [],
    starterCartPreview: { sellerPartitions: [], status: 'unavailable' },
  },
  updatedAt: now,
};

afterEach(cleanup);

describe('Marketplace user management', () => {
  it('renders privacy-safe status/activity and runs the available user commands', () => {
    const navigate = vi.fn();
    const onActivatePromotion = vi.fn();
    const onLoadPromotion = vi.fn();
    const onPublishListing = vi.fn();
    const onPublishRequest = vi.fn();
    const onSampleFeedback = vi.fn();
    const onSampleTransition = vi.fn();

    render(
      <MarketplaceUserManagement
        aiConsultations={{ data: [consultation], status: 'ready' }}
        canActivatePromotions
        canPublishListings
        canPublishRequests
        listingPublications={{
          data: [ownedListing, pendingOwnedListing, rejectedOwnedListing],
          status: 'ready',
        }}
        locale="en"
        myRequests={{
          data: [
            {
              createdAt: now,
              id: 'owned-request-1',
              region: 'Samarqand',
              status: 'open',
              title: ownedRequest.title,
              updatedAt: now,
            },
          ],
          status: 'ready',
        }}
        navigate={navigate}
        notifications={{ data: [notification], status: 'ready' }}
        onActivatePromotion={onActivatePromotion}
        onLoadPromotion={onLoadPromotion}
        onPublishListing={onPublishListing}
        onPublishRequest={onPublishRequest}
        onRetry={vi.fn()}
        onSampleFeedback={onSampleFeedback}
        onSampleTransition={onSampleTransition}
        produceListings={empty}
        promotionDetail={{ data: promotion, status: 'ready' }}
        promotionPlans={{
          data: [{ code: 'catalog_7d', currency: 'UZS', durationDays: 7, priceUzs: 100_000 }],
          status: 'ready',
        }}
        promotions={{ data: [promotion], status: 'ready' }}
        requestPublications={{ data: [ownedRequest], status: 'ready' }}
        samples={{ data: samples, status: 'ready' }}
        supplierProducts={{ data: [sourceProduct], status: 'ready' }}
        t={t}
      />,
    );

    expect(screen.getAllByText(ownedListing.title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ownedRequest.title).length).toBeGreaterThan(0);
    expect(screen.getByText(notification.message)).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.notifications.simulationDisclosure')).toBeTruthy();
    expect(screen.getByText(/agritech\.marketplace\.notifications\.channel\.telegram/u)).toBeTruthy();
    expect(screen.getByText(/agritech\.marketplace\.notifications\.status\.simulated/u)).toBeTruthy();
    expect(screen.getByText(consultation.question)).toBeTruthy();
    expect(screen.queryByText(sourceProduct.partnerId)).toBeNull();
    expect(screen.queryByText(ownedListing.sellerPublicId)).toBeNull();

    const promotionListing = screen.getByLabelText('agritech.marketplace.promotion.listing');
    expect(within(promotionListing).getByRole('option', { name: ownedListing.title })).toBeTruthy();
    expect(within(promotionListing).queryByRole('option', { name: pendingOwnedListing.title })).toBeNull();
    expect(within(promotionListing).queryByRole('option', { name: rejectedOwnedListing.title })).toBeNull();

    const sourceArticle = screen.getByText(sourceProduct.name).closest('article');
    expect(sourceArticle).toBeTruthy();
    fireEvent.click(within(sourceArticle!).getByRole('button', { name: 'agritech.marketplace.publication.publish' }));
    expect(onPublishListing).toHaveBeenCalledWith(sourceProduct.id, 'product', 'seeds');

    const requestArticle = screen
      .getAllByText(ownedRequest.title)
      .map((element) => element.closest('article'))
      .find((article) => article?.querySelector('button'));
    expect(requestArticle).toBeTruthy();
    fireEvent.click(within(requestArticle!).getByRole('button', { name: 'agritech.marketplace.publication.publish' }));
    expect(onPublishRequest).toHaveBeenCalledWith('owned-request-1');

    fireEvent.change(screen.getByLabelText('agritech.marketplace.promotion.listing'), {
      target: { value: ownedListing.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.promotion.activate' }));
    expect(onActivatePromotion).toHaveBeenCalledWith(ownedListing.id, 'catalog_7d');
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.promotion.details' }));
    expect(onLoadPromotion).toHaveBeenCalledWith(promotion.id);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.samples.action.approve' }));
    expect(onSampleTransition).toHaveBeenCalledWith(samples[0], 'approve');
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.samples.feedback' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.rating'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.comment'), {
      target: { value: 'Useful sample' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.samples.feedbackSubmit' }));
    expect(onSampleFeedback).toHaveBeenCalledWith(samples[1], 4, 'Useful sample');

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.notifications.openContract' }));
    expect(navigate).toHaveBeenCalledWith(notification.contractPath);
  });

  it('fails closed when the account has no actor-authorized organization', () => {
    render(
      <MarketplaceUserManagement
        aiConsultations={empty}
        canActivatePromotions={false}
        canPublishListings={false}
        canPublishRequests={false}
        listingPublications={empty}
        locale="en"
        myRequests={empty}
        navigate={vi.fn()}
        notifications={empty}
        onActivatePromotion={vi.fn()}
        onLoadPromotion={vi.fn()}
        onPublishListing={vi.fn()}
        onPublishRequest={vi.fn()}
        onRetry={vi.fn()}
        onSampleFeedback={vi.fn()}
        onSampleTransition={vi.fn()}
        produceListings={empty}
        promotionDetail={{ data: null, status: 'empty' }}
        promotionPlans={empty}
        promotions={empty}
        requestPublications={empty}
        samples={empty}
        supplierProducts={empty}
        t={t}
      />,
    );

    expect(screen.getByText('agritech.marketplace.management.verificationRequired')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.publication.publish' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'agritech.marketplace.promotion.title' })).toBeNull();
  });

  it('renders source and activity failures as recoverable errors instead of empty states', () => {
    const onRetry = vi.fn();
    const failed = { data: [], status: 'error' as const };

    render(
      <MarketplaceUserManagement
        aiConsultations={failed}
        canActivatePromotions
        canPublishListings
        canPublishRequests
        listingPublications={failed}
        locale="en"
        myRequests={failed}
        navigate={vi.fn()}
        notifications={failed}
        onActivatePromotion={vi.fn()}
        onLoadPromotion={vi.fn()}
        onPublishListing={vi.fn()}
        onPublishRequest={vi.fn()}
        onRetry={onRetry}
        onSampleFeedback={vi.fn()}
        onSampleTransition={vi.fn()}
        produceListings={failed}
        promotionDetail={{ data: null, status: 'error' }}
        promotionPlans={failed}
        promotions={failed}
        requestPublications={failed}
        samples={failed}
        supplierProducts={failed}
        t={t}
      />,
    );

    expect(screen.getByText('agritech.marketplace.publication.sourcesUnavailable')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.promotion.plansUnavailable')).toBeTruthy();
    expect(screen.getByText('agritech.marketplace.notifications.unavailable')).toBeTruthy();
    expect(screen.queryByText('agritech.marketplace.publication.productsEmpty')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'ui.runtime.retry' })[0]!);
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
