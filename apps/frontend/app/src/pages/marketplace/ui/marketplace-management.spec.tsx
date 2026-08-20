// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-ONBOARDING-023
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MarketplaceAiConsultationDto,
  MarketplaceContractNotificationRecipientDto,
  MarketplaceListingPromotionDto,
  MarketplaceOwnedListingPublicationDto,
  MarketplaceOwnedRequestPublicationDto,
  ProduceListingViewDto,
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
        canCreateListing
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
    const onBuyerAccessAction = vi.fn();
    const onSellerAccessAction = vi.fn();
    const view = render(
      <MarketplaceUserManagement
        buyerAccessActionLabel="agritech.marketplace.access.action.organization"
        buyerAccessHint="agritech.marketplace.access.organization"
        aiConsultations={empty}
        canActivatePromotions={false}
        canCreateListing={false}
        canPublishListings={false}
        canPublishRequests={false}
        listingPublications={empty}
        locale="en"
        myRequests={empty}
        navigate={vi.fn()}
        notifications={empty}
        onBuyerAccessAction={onBuyerAccessAction}
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
        sellerAccessActionLabel="agritech.marketplace.access.action.organization"
        sellerAccessHint="agritech.marketplace.access.sellerOrganization"
        onSellerAccessAction={onSellerAccessAction}
        supplierProducts={empty}
        t={t}
      />,
    );

    expect(screen.getByText('agritech.marketplace.access.organization')).toBeTruthy();
    expect(screen.getAllByText('agritech.marketplace.access.sellerOrganization').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.publication.publish' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'agritech.marketplace.promotion.title' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'agritech.marketplace.promotion.activate' }).hasAttribute('disabled'),
    ).toBe(true);
    const accessActions = screen.getAllByRole('button', {
      name: 'agritech.marketplace.access.action.organization',
    });
    fireEvent.click(accessActions[0]);
    fireEvent.click(accessActions[1]);
    expect(onSellerAccessAction).toHaveBeenCalledOnce();
    expect(onBuyerAccessAction).toHaveBeenCalledOnce();

    view.rerender(
      <MarketplaceUserManagement
        aiConsultations={empty}
        canActivatePromotions={false}
        canCreateListing={false}
        canPublishListings={false}
        canPublishRequests={false}
        listingPublications={empty}
        locale="en"
        myRequests={{ data: [ownedRequest], status: 'ready' }}
        navigate={vi.fn()}
        notifications={empty}
        onActivatePromotion={vi.fn()}
        onLoadPromotion={vi.fn()}
        onPublishListing={vi.fn()}
        onPublishRequest={vi.fn()}
        onRetry={vi.fn()}
        onSampleFeedback={vi.fn()}
        onSampleTransition={vi.fn()}
        produceListings={{
          data: [
            {
              availableFrom: now,
              crop: 'Tomatoes',
              grade: 'A',
              id: 'produce-restricted',
              partnerId: 'internal-partner-1',
              pricePerUnitUzs: 9_000,
              quantity: 100,
              region: 'Samarqand',
              status: 'available',
              unit: 'kg',
            },
          ],
          status: 'ready',
        }}
        promotionDetail={{ data: null, status: 'empty' }}
        promotionPlans={empty}
        promotions={empty}
        requestPublications={empty}
        samples={empty}
        supplierProducts={{ data: [sourceProduct], status: 'ready' }}
        t={t}
      />,
    );
    expect(screen.getAllByText('agritech.marketplace.management.verificationRequired').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.access.action.organization' })).toBeNull();
  });

  it('renders source and activity failures as recoverable errors instead of empty states', () => {
    const onRetry = vi.fn();
    const failed = { data: [], status: 'error' as const };

    render(
      <MarketplaceUserManagement
        aiConsultations={failed}
        canActivatePromotions
        canCreateListing
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

  it('keeps loading and empty workspaces explicit while exercising localized publication, source, plan, and sample commands', () => {
    const loading = { data: [], status: 'loading' as const };
    const onActivatePromotion = vi.fn();
    const onPublishListing = vi.fn();
    const onSampleFeedback = vi.fn();
    const onSampleTransition = vi.fn();
    const produce: ProduceListingViewDto = {
      availableFrom: now,
      crop: 'Tomatoes',
      grade: 'A',
      id: 'produce-source-1',
      partnerId: 'internal-partner-1',
      pricePerUnitUzs: 9_000,
      quantity: 100,
      region: 'Samarqand',
      status: 'available',
      unit: 'kg',
    };
    const actionSamples: MarketplaceSampleDto[] = [
      { ...samples[0]!, id: 'seller-approved', status: 'approved' },
      { ...samples[1]!, id: 'requester-requested', status: 'requested' },
      { ...samples[1]!, id: 'requester-shipped', status: 'shipped' },
      { ...samples[1]!, id: 'requester-received' },
      {
        ...samples[1]!,
        feedback: { comment: 'Useful sample', createdAt: now, rating: 5 },
        id: 'requester-feedback-recorded',
      },
    ];
    const equipmentProduct: SupplierProductViewDto = {
      ...sourceProduct,
      category: 'equipment',
      id: 'source-equipment-1',
      name: 'Irrigation pump',
    };
    const baseProps = {
      aiConsultations: loading,
      canActivatePromotions: true,
      canCreateListing: true,
      canPublishListings: true,
      canPublishRequests: true,
      listingPublications: loading,
      locale: 'en' as const,
      myRequests: loading,
      navigate: vi.fn(),
      notifications: loading,
      onActivatePromotion,
      onLoadPromotion: vi.fn(),
      onPublishListing,
      onPublishRequest: vi.fn(),
      onRetry: vi.fn(),
      onSampleFeedback,
      onSampleTransition,
      produceListings: loading,
      promotionDetail: { data: null, status: 'loading' as const },
      promotionPlans: loading,
      promotions: loading,
      requestPublications: loading,
      samples: loading,
      supplierProducts: loading,
      t,
    };
    const view = render(<MarketplaceUserManagement {...baseProps} />);
    expect(document.querySelectorAll('.dh-skeleton-grid').length).toBeGreaterThan(3);

    const emptyProps = {
      ...baseProps,
      aiConsultations: empty,
      listingPublications: empty,
      myRequests: empty,
      notifications: empty,
      produceListings: empty,
      promotionDetail: { data: null, status: 'empty' as const },
      promotionPlans: empty,
      promotions: empty,
      requestPublications: empty,
      samples: empty,
      supplierProducts: empty,
    };
    view.rerender(<MarketplaceUserManagement {...emptyProps} />);
    expect(screen.getByText('agritech.marketplace.publication.productsEmpty')).toBeTruthy();
    expect(screen.getAllByText('agritech.marketplace.publication.historyEmpty').length).toBeGreaterThan(0);

    const localizedListing = {
      ...ownedListing,
      titleUz: 'Makkajo\u02bbxori urug\u02bbi',
      titleUzCyrl: '\u041c\u0430\u043a\u043a\u0430\u0436\u045e\u0445\u043e\u0440\u0438 \u0443\u0440\u0443\u0493\u0438',
    };
    const titleFallbackListing: MarketplaceOwnedListingPublicationDto = {
      ...ownedListing,
      id: 'listing-title-fallback',
      title: 'Fallback title',
      titleRu: undefined,
      titleUz: undefined,
      titleUzCyrl: undefined,
    };
    const cyrillicFallbackListing: MarketplaceOwnedListingPublicationDto = {
      ...ownedListing,
      id: 'listing-cyrillic-fallback',
      title: 'Second fallback title',
      titleUz: 'Ozbekcha fallback',
      titleUzCyrl: undefined,
    };
    const readyProps = {
      ...emptyProps,
      aiConsultations: { data: [consultation], status: 'ready' as const },
      listingPublications: {
        data: [localizedListing, titleFallbackListing, cyrillicFallbackListing],
        status: 'ready' as const,
      },
      notifications: {
        data: [notification, { ...notification, id: 'notification-live', simulation: false }],
        status: 'ready' as const,
      },
      produceListings: { data: [produce], status: 'ready' as const },
      promotionPlans: {
        data: [
          { code: 'catalog_7d' as const, currency: 'UZS' as const, durationDays: 7, priceUzs: 100_000 },
          { code: 'catalog_14d' as const, currency: 'UZS' as const, durationDays: 14, priceUzs: 180_000 },
        ],
        status: 'ready' as const,
      },
      requestPublications: { data: [ownedRequest], status: 'ready' as const },
      samples: { data: actionSamples, status: 'ready' as const },
      supplierProducts: { data: [sourceProduct, equipmentProduct], status: 'ready' as const },
    };
    view.rerender(<MarketplaceUserManagement {...readyProps} locale="ru" />);
    expect(screen.getAllByText(localizedListing.titleRu!).length).toBeGreaterThan(0);
    view.rerender(<MarketplaceUserManagement {...readyProps} locale="uz" />);
    expect(screen.getAllByText(localizedListing.titleUz).length).toBeGreaterThan(0);
    view.rerender(<MarketplaceUserManagement {...readyProps} locale="uz-cyrl" />);
    expect(screen.getAllByText(localizedListing.titleUzCyrl).length).toBeGreaterThan(0);
    expect(screen.getAllByText(cyrillicFallbackListing.titleUz!).length).toBeGreaterThan(0);
    expect(screen.getAllByText(titleFallbackListing.title).length).toBeGreaterThan(0);

    const sourceArticle = screen.getByText(sourceProduct.name).closest('article')!;
    fireEvent.change(within(sourceArticle).getByLabelText('agritech.marketplace.publication.section'), {
      target: { value: 'equipment' },
    });
    fireEvent.click(within(sourceArticle).getByRole('button', { name: 'agritech.marketplace.publication.publish' }));
    expect(onPublishListing).toHaveBeenCalledWith(sourceProduct.id, 'product', 'equipment');
    expect(screen.getByText(equipmentProduct.name)).toBeTruthy();
    const produceArticle = screen.getByText(produce.crop).closest('article')!;
    fireEvent.click(within(produceArticle).getByRole('button', { name: 'agritech.marketplace.publication.publish' }));
    expect(onPublishListing).toHaveBeenCalledWith(produce.id, 'produce', 'produce');

    const promotionForm = screen.getByLabelText('agritech.marketplace.promotion.listing').closest('form')!;
    fireEvent.submit(promotionForm);
    expect(onActivatePromotion).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('agritech.marketplace.promotion.listing'), {
      target: { value: localizedListing.id },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.promotion.plan'), {
      target: { value: 'catalog_14d' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.promotion.activate' }));
    expect(onActivatePromotion).toHaveBeenCalledWith(localizedListing.id, 'catalog_14d');

    // A paid action the server cannot charge is explained and never offered.
    onActivatePromotion.mockClear();
    view.rerender(<MarketplaceUserManagement {...readyProps} locale="ru" promotionBillingReady={false} />);
    expect(screen.getByText('agritech.marketplace.promotion.billingUnavailable')).toBeTruthy();
    const unbillableActivate = screen.getByRole('button', { name: 'agritech.marketplace.promotion.activate' });
    expect(unbillableActivate.hasAttribute('disabled')).toBe(true);
    expect(unbillableActivate.getAttribute('aria-describedby')).toBe('marketplace-promotion-billing');
    fireEvent.submit(document.querySelector('form.dh-inline-form') as HTMLFormElement);
    expect(onActivatePromotion).not.toHaveBeenCalled();
    view.rerender(<MarketplaceUserManagement {...readyProps} locale="ru" />);
    expect(screen.queryByText('agritech.marketplace.promotion.billingUnavailable')).toBeNull();

    for (const action of ['ship', 'cancel', 'receive'] as const) {
      fireEvent.click(screen.getByRole('button', { name: `agritech.marketplace.samples.action.${action}` }));
    }
    expect(onSampleTransition).toHaveBeenCalledWith(actionSamples[0], 'ship');
    expect(onSampleTransition).toHaveBeenCalledWith(actionSamples[1], 'cancel');
    expect(onSampleTransition).toHaveBeenCalledWith(actionSamples[2], 'receive');

    const feedbackButton = screen.getByRole('button', { name: 'agritech.marketplace.samples.feedback' });
    fireEvent.click(feedbackButton);
    fireEvent.click(feedbackButton);
    fireEvent.click(feedbackButton);
    const feedbackForm = screen
      .getByRole('button', { name: 'agritech.marketplace.samples.feedbackSubmit' })
      .closest('form')!;
    fireEvent.submit(feedbackForm);
    expect(onSampleFeedback).toHaveBeenLastCalledWith(actionSamples[3], 5, undefined);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.samples.feedback' }));
    class FormDataWithFileValue {
      get(field: string) {
        return field === 'rating' ? '4' : new File(['comment'], 'comment.txt');
      }
    }
    vi.stubGlobal('FormData', FormDataWithFileValue);
    fireEvent.submit(
      screen.getByRole('button', { name: 'agritech.marketplace.samples.feedbackSubmit' }).closest('form')!,
    );
    vi.unstubAllGlobals();
    expect(onSampleFeedback).toHaveBeenLastCalledWith(actionSamples[3], 4, undefined);
  });

  it('offers the way to create a listing only to a role that may create one', () => {
    const navigate = vi.fn();
    const props = {
      aiConsultations: empty,
      canActivatePromotions: false,
      canCreateListing: true,
      canPublishListings: true,
      canPublishRequests: false,
      listingPublications: empty,
      locale: 'en' as const,
      myRequests: empty,
      navigate,
      notifications: empty,
      onActivatePromotion: vi.fn(),
      onLoadPromotion: vi.fn(),
      onPublishListing: vi.fn(),
      onPublishRequest: vi.fn(),
      onRetry: vi.fn(),
      onSampleFeedback: vi.fn(),
      onSampleTransition: vi.fn(),
      produceListings: empty,
      promotionDetail: { data: null, status: 'empty' as const },
      promotionPlans: empty,
      promotions: empty,
      requestPublications: empty,
      samples: empty,
      supplierProducts: empty,
      t,
    };

    // The cabinet has to carry this entry, not only the header: the header
    // navigation is hidden below 56rem, so on a phone this panel is the only
    // place a producer can reach the form from.
    const view = render(<MarketplaceUserManagement {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /agritech.marketplace.newListing.title/u }));
    expect(navigate).toHaveBeenCalledWith('/listings/new');

    view.rerender(<MarketplaceUserManagement {...props} canCreateListing={false} />);
    expect(screen.queryByRole('button', { name: /agritech.marketplace.newListing.title/u })).toBeNull();
    view.unmount();
  });
});
