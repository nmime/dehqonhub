// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-ONBOARDING-023
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type {
  BuyerRequestViewDto,
  MarketplaceAiConsultationDto,
  MarketplaceContractNotificationRecipientDto,
  MarketplaceListingPromotionDto,
  MarketplaceOwnedListingPublicationDto,
  MarketplaceOwnedRequestPublicationDto,
  MarketplacePromotionPlanDto,
  MarketplaceSampleDto,
  ProduceListingViewDto,
  SupplierProductViewDto,
} from '@app/frontend-api-client';
import type { Resource } from '../model/use-marketplace-data';
import {
  MarketplaceBusyButton,
  MarketplaceFactsSkeleton,
  MarketplaceListSkeleton,
  MarketplaceLoadingStatus,
} from './marketplace-loading';
import { formatDate, formatMoney, type MarketplaceNavigate, type MarketplaceTranslate } from './marketplace-ui';

type PromotionPlanCode = MarketplacePromotionPlanDto['code'];
type SampleAction = 'approve' | 'cancel' | 'decline' | 'receive' | 'ship';
type ListingSection = 'equipment' | 'produce' | 'seeds';

const formText = (form: FormData, field: string): string => {
  const value = form.get(field);
  return typeof value === 'string' ? value.trim() : '';
};

interface MarketplaceManagementProps {
  readonly buyerAccessActionLabel?: string;
  readonly buyerAccessHint?: string;
  readonly aiConsultations: Resource<MarketplaceAiConsultationDto[]>;
  readonly canActivatePromotions: boolean;
  readonly canPublishListings: boolean;
  readonly canPublishRequests: boolean;
  readonly listingPublications: Resource<MarketplaceOwnedListingPublicationDto[]>;
  readonly locale: Locale;
  readonly myRequests: Resource<BuyerRequestViewDto[]>;
  readonly navigate: MarketplaceNavigate;
  readonly notifications: Resource<MarketplaceContractNotificationRecipientDto[]>;
  readonly onBuyerAccessAction?: () => void;
  readonly onActivatePromotion: (listingPublicId: string, planCode: PromotionPlanCode) => void;
  readonly onLoadPromotion: (promotionId: string) => void;
  readonly onPublishListing: (sourceId: string, sourceKind: 'produce' | 'product', section: ListingSection) => void;
  readonly onPublishRequest: (requestId: string) => void;
  readonly onRetry: () => void;
  readonly onSampleFeedback: (sample: MarketplaceSampleDto, rating: number, comment?: string) => void;
  readonly onSampleTransition: (sample: MarketplaceSampleDto, action: SampleAction, deliveryQuoteUzs?: number) => void;
  readonly pendingAction?: string;
  readonly produceListings: Resource<ProduceListingViewDto[]>;
  readonly promotionDetail: Resource<MarketplaceListingPromotionDto | null>;
  readonly promotionPlans: Resource<MarketplacePromotionPlanDto[]>;
  readonly promotions: Resource<MarketplaceListingPromotionDto[]>;
  readonly requestPublications: Resource<MarketplaceOwnedRequestPublicationDto[]>;
  readonly samples: Resource<MarketplaceSampleDto[]>;
  readonly sellerAccessActionLabel?: string;
  readonly sellerAccessHint?: string;
  readonly onSellerAccessAction?: () => void;
  readonly supplierProducts: Resource<SupplierProductViewDto[]>;
  readonly t: MarketplaceTranslate;
}

const sourceSection = (product: SupplierProductViewDto): Exclude<ListingSection, 'produce'> =>
  product.category === 'equipment' || product.category === 'irrigation' ? 'equipment' : 'seeds';

const localizedPublicationTitle = (publication: MarketplaceOwnedListingPublicationDto, locale: Locale): string => {
  if (locale === 'ru') {
    return publication.titleRu ?? publication.title;
  }
  if (locale === 'uz') {
    return publication.titleUz ?? publication.title;
  }
  if (locale === 'uz-cyrl') {
    return publication.titleUzCyrl ?? publication.titleUz ?? publication.title;
  }
  return publication.title;
};

/**
 * The loading, error and empty account of one management list. Every management
 * list is a column of `.dh-management-list article` rows, so its placeholder is a
 * column of rows of that height rather than a grid of catalog tiles.
 *
 * The component stays mounted across the whole transition — the parent renders
 * it in every state — so the same status element announces the region as loading
 * and then as ready instead of disappearing without a word.
 */
function ResourceMessage({
  emptyKey,
  errorKey,
  labelKey,
  onRetry,
  resource,
  rows = 2,
  t,
}: Readonly<{
  emptyKey: string;
  errorKey: string;
  labelKey: string;
  onRetry: () => void;
  resource: Resource<unknown[]>;
  rows?: number;
  t: MarketplaceTranslate;
}>) {
  const busy = resource.status === 'loading' || resource.status === 'idle';
  return (
    <>
      <MarketplaceLoadingStatus busy={busy} label={t(labelKey)} t={t} />
      {busy ? <MarketplaceListSkeleton count={rows} /> : null}
      {!busy && resource.status === 'error' ? (
        <div>
          <p className="dh-state-inline dh-state-inline--error">{t(errorKey)}</p>
          <button className="dh-text-button" onClick={onRetry} type="button">
            {t('ui.runtime.retry')}
          </button>
        </div>
      ) : null}
      {!busy && resource.status !== 'error' && resource.data.length === 0 ? (
        <p className="dh-muted">{t(emptyKey)}</p>
      ) : null}
    </>
  );
}

function SourceResourceMessage({
  onRetry,
  produceListings,
  supplierProducts,
  t,
}: Readonly<Pick<MarketplaceManagementProps, 'onRetry' | 'produceListings' | 'supplierProducts' | 't'>>) {
  const busy =
    supplierProducts.status === 'loading' ||
    supplierProducts.status === 'idle' ||
    produceListings.status === 'loading' ||
    produceListings.status === 'idle';
  const failed = supplierProducts.status === 'error' || produceListings.status === 'error';
  return (
    <>
      <MarketplaceLoadingStatus busy={busy} label={t('agritech.marketplace.publication.products')} t={t} />
      {busy ? <MarketplaceListSkeleton count={2} /> : null}
      {!busy && failed ? (
        <div>
          <p className="dh-state-inline dh-state-inline--error">
            {t('agritech.marketplace.publication.sourcesUnavailable')}
          </p>
          <button className="dh-text-button" onClick={onRetry} type="button">
            {t('ui.runtime.retry')}
          </button>
        </div>
      ) : null}
      {!busy && !failed && supplierProducts.data.length + produceListings.data.length === 0 ? (
        <p className="dh-muted">{t('agritech.marketplace.publication.productsEmpty')}</p>
      ) : null}
    </>
  );
}

function PublicationWorkspace({
  canPublishListings,
  canPublishRequests,
  listingPublications,
  locale,
  myRequests,
  onRetry,
  onPublishListing,
  onPublishRequest,
  pendingAction,
  produceListings,
  requestPublications,
  supplierProducts,
  t,
  buyerAccessActionLabel,
  buyerAccessHint,
  onBuyerAccessAction,
  sellerAccessActionLabel,
  sellerAccessHint,
  onSellerAccessAction,
}: Pick<
  MarketplaceManagementProps,
  | 'canPublishListings'
  | 'canPublishRequests'
  | 'listingPublications'
  | 'locale'
  | 'myRequests'
  | 'onRetry'
  | 'onPublishListing'
  | 'onPublishRequest'
  | 'pendingAction'
  | 'produceListings'
  | 'requestPublications'
  | 'supplierProducts'
  | 't'
  | 'buyerAccessActionLabel'
  | 'buyerAccessHint'
  | 'onBuyerAccessAction'
  | 'sellerAccessActionLabel'
  | 'sellerAccessHint'
  | 'onSellerAccessAction'
>) {
  const [sections, setSections] = useState<Record<string, Exclude<ListingSection, 'produce'>>>({});

  return (
    <section aria-labelledby="dh-publication-title" className="dh-panel dh-management-section">
      <div className="dh-panel__head">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.management.seller')}</p>
          <h2 id="dh-publication-title">{t('agritech.marketplace.publication.title')}</h2>
        </div>
      </div>
      <div className="dh-management-grid">
        <div>
          <h3>{t('agritech.marketplace.publication.products')}</h3>
          {!canPublishListings ? (
            <div className="dh-state-inline" id="marketplace-listing-publication-access">
              <span>{sellerAccessHint ?? t('agritech.marketplace.management.verificationRequired')}</span>
              {sellerAccessActionLabel && onSellerAccessAction ? (
                <button className="dh-text-button" onClick={onSellerAccessAction} type="button">
                  {sellerAccessActionLabel}
                </button>
              ) : null}
            </div>
          ) : null}
          <SourceResourceMessage
            onRetry={onRetry}
            produceListings={produceListings}
            supplierProducts={supplierProducts}
            t={t}
          />
          <div className="dh-management-list">
            {supplierProducts.data.map((product) => {
              const section = sections[product.id] ?? sourceSection(product);
              return (
                <article key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <small>{t(`agritech.marketplace.publication.sourceStatus.${product.status}`)}</small>
                  </div>
                  <select
                    aria-label={t('agritech.marketplace.publication.section')}
                    disabled={!canPublishListings}
                    onChange={(event) => {
                      setSections((value) => ({
                        ...value,
                        [product.id]: event.target.value as Exclude<ListingSection, 'produce'>,
                      }));
                    }}
                    value={section}
                  >
                    <option value="seeds">{t('agritech.marketplace.section.seeds')}</option>
                    <option value="equipment">{t('agritech.marketplace.section.equipment')}</option>
                  </select>
                  <MarketplaceBusyButton
                    aria-describedby={!canPublishListings ? 'marketplace-listing-publication-access' : undefined}
                    busy={pendingAction === `publish-listing:${product.id}`}
                    busyLabel={t('agritech.marketplace.loading')}
                    className="dh-button dh-button--secondary"
                    disabled={!canPublishListings}
                    onClick={() => {
                      onPublishListing(product.id, 'product', section);
                    }}
                    type="button"
                  >
                    {t('agritech.marketplace.publication.publish')}
                  </MarketplaceBusyButton>
                </article>
              );
            })}
            {produceListings.data.map((produce) => {
              return (
                <article key={produce.id}>
                  <div>
                    <strong>{produce.crop}</strong>
                    <small>
                      {produce.region} · {produce.grade}
                    </small>
                  </div>
                  <span className="dh-badge dh-badge--soft">{t('agritech.marketplace.section.produce')}</span>
                  <MarketplaceBusyButton
                    aria-describedby={!canPublishListings ? 'marketplace-listing-publication-access' : undefined}
                    busy={pendingAction === `publish-listing:${produce.id}`}
                    busyLabel={t('agritech.marketplace.loading')}
                    className="dh-button dh-button--secondary"
                    disabled={!canPublishListings}
                    onClick={() => {
                      onPublishListing(produce.id, 'produce', 'produce');
                    }}
                    type="button"
                  >
                    {t('agritech.marketplace.publication.publish')}
                  </MarketplaceBusyButton>
                </article>
              );
            })}
          </div>
        </div>
        <PublicationReceipts listings={listingPublications} locale={locale} requests={requestPublications} t={t} />
      </div>
      <div>
        <h3>{t('agritech.marketplace.publication.requests')}</h3>
        {!canPublishRequests ? (
          <div className="dh-state-inline" id="marketplace-request-publication-access">
            <span>{buyerAccessHint ?? t('agritech.marketplace.management.verificationRequired')}</span>
            {buyerAccessActionLabel && onBuyerAccessAction ? (
              <button className="dh-text-button" onClick={onBuyerAccessAction} type="button">
                {buyerAccessActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
        <ResourceMessage
          emptyKey="agritech.marketplace.orders.empty"
          errorKey="agritech.marketplace.orders.unavailable"
          labelKey="agritech.marketplace.publication.requests"
          onRetry={onRetry}
          resource={myRequests}
          t={t}
        />
        <div className="dh-management-list">
          {myRequests.data.map((request) => {
            return (
              <article key={request.id}>
                <div>
                  <strong>{request.title}</strong>
                  <small>{t(`agritech.marketplace.orders.${request.status}`)}</small>
                </div>
                <MarketplaceBusyButton
                  aria-describedby={!canPublishRequests ? 'marketplace-request-publication-access' : undefined}
                  busy={pendingAction === `publish-request:${request.id}`}
                  busyLabel={t('agritech.marketplace.loading')}
                  className="dh-button dh-button--secondary"
                  disabled={!canPublishRequests}
                  onClick={() => {
                    onPublishRequest(request.id);
                  }}
                  type="button"
                >
                  {t('agritech.marketplace.publication.publish')}
                </MarketplaceBusyButton>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PublicationReceipts({
  listings,
  locale,
  requests,
  t,
}: Readonly<{
  listings: Resource<MarketplaceOwnedListingPublicationDto[]>;
  locale: Locale;
  requests: Resource<MarketplaceOwnedRequestPublicationDto[]>;
  t: MarketplaceTranslate;
}>) {
  if (listings.status === 'loading' || requests.status === 'loading') {
    return (
      <>
        <MarketplaceLoadingStatus busy label={t('agritech.marketplace.publication.status')} t={t} />
        <MarketplaceListSkeleton count={2} />
      </>
    );
  }
  if (listings.status === 'error' || requests.status === 'error') {
    return (
      <p className="dh-state-inline dh-state-inline--error">
        {t('agritech.marketplace.publication.historyUnavailable')}
      </p>
    );
  }
  if (listings.data.length + requests.data.length === 0) {
    return <p className="dh-muted">{t('agritech.marketplace.publication.historyEmpty')}</p>;
  }
  return (
    <div>
      <h3>{t('agritech.marketplace.publication.status')}</h3>
      <div className="dh-management-list">
        {[...listings.data, ...requests.data].map((publication) => (
          <article key={publication.id}>
            <div>
              <strong>
                {publication.kind === 'listing' ? localizedPublicationTitle(publication, locale) : publication.title}
              </strong>
              <small>
                {t(`agritech.marketplace.publication.moderation.${publication.moderationStatus}`)} ·{' '}
                {formatDate(publication.updatedAt, locale)}
              </small>
            </div>
            <span className={`dh-badge dh-badge--${publication.status === 'published' ? 'soft' : 'neutral'}`}>
              {t(`agritech.marketplace.publication.status.${publication.status}`)}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}

function PromotionWorkspace({
  canActivatePromotions,
  listingPublications,
  locale,
  onActivatePromotion,
  onLoadPromotion,
  onRetry,
  pendingAction,
  promotionDetail,
  promotionPlans,
  promotions,
  t,
  sellerAccessActionLabel,
  sellerAccessHint,
  onSellerAccessAction,
}: Pick<
  MarketplaceManagementProps,
  | 'canActivatePromotions'
  | 'listingPublications'
  | 'locale'
  | 'onActivatePromotion'
  | 'onLoadPromotion'
  | 'onRetry'
  | 'pendingAction'
  | 'promotionDetail'
  | 'promotionPlans'
  | 'promotions'
  | 't'
  | 'sellerAccessActionLabel'
  | 'sellerAccessHint'
  | 'onSellerAccessAction'
>) {
  const [listingId, setListingId] = useState('');
  const [planCode, setPlanCode] = useState<PromotionPlanCode>('catalog_7d');
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (listingId) {
      onActivatePromotion(listingId, planCode);
    }
  };

  return (
    <section aria-labelledby="dh-promotion-title" className="dh-panel dh-management-section">
      <div className="dh-panel__head">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.management.seller')}</p>
          <h2 id="dh-promotion-title">{t('agritech.marketplace.promotion.title')}</h2>
        </div>
      </div>
      <p>{t('agritech.marketplace.promotion.description')}</p>
      {!canActivatePromotions ? (
        <div className="dh-state-inline" id="marketplace-promotion-access">
          <span>{sellerAccessHint ?? t('agritech.marketplace.management.verificationRequired')}</span>
          {sellerAccessActionLabel && onSellerAccessAction ? (
            <button className="dh-text-button" onClick={onSellerAccessAction} type="button">
              {sellerAccessActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      <ResourceMessage
        emptyKey="agritech.marketplace.publication.historyEmpty"
        errorKey="agritech.marketplace.publication.historyUnavailable"
        labelKey="agritech.marketplace.promotion.listing"
        onRetry={onRetry}
        resource={listingPublications}
        t={t}
      />
      <ResourceMessage
        emptyKey="agritech.marketplace.promotion.plansEmpty"
        errorKey="agritech.marketplace.promotion.plansUnavailable"
        labelKey="agritech.marketplace.promotion.plan"
        onRetry={onRetry}
        resource={promotionPlans}
        t={t}
      />
      <form className="dh-inline-form" onSubmit={submit}>
        <label>
          <span>{t('agritech.marketplace.promotion.listing')}</span>
          <select
            disabled={!canActivatePromotions || listingPublications.status !== 'ready'}
            onChange={(event) => {
              setListingId(event.target.value);
            }}
            required
            value={listingId}
          >
            <option value="">{t('agritech.marketplace.promotion.chooseListing')}</option>
            {listingPublications.data
              .filter(
                (publication) => publication.status === 'published' && publication.moderationStatus === 'approved',
              )
              .map((publication) => (
                <option key={publication.id} value={publication.id}>
                  {localizedPublicationTitle(publication, locale)}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>{t('agritech.marketplace.promotion.plan')}</span>
          <select
            disabled={!canActivatePromotions}
            onChange={(event) => {
              setPlanCode(event.target.value as PromotionPlanCode);
            }}
            value={planCode}
          >
            {promotionPlans.data.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {t(`agritech.marketplace.promotion.plan.${plan.code}`)} · {formatMoney(plan.priceUzs, locale)}
              </option>
            ))}
          </select>
        </label>
        <MarketplaceBusyButton
          aria-describedby={!canActivatePromotions ? 'marketplace-promotion-access' : undefined}
          busy={pendingAction === 'promotion:activate'}
          busyLabel={t('agritech.marketplace.loading')}
          className="dh-button dh-button--primary"
          disabled={!canActivatePromotions || !listingId || promotionPlans.status !== 'ready'}
          type="submit"
        >
          {t('agritech.marketplace.promotion.activate')}
        </MarketplaceBusyButton>
      </form>
      <ResourceMessage
        emptyKey="agritech.marketplace.promotion.empty"
        errorKey="agritech.marketplace.promotion.unavailable"
        labelKey="agritech.marketplace.promotion.title"
        onRetry={onRetry}
        resource={promotions}
        t={t}
      />
      <div className="dh-management-list">
        {promotions.data.map((promotion) => (
          <article key={promotion.id}>
            <div>
              <strong>{t(`agritech.marketplace.promotion.plan.${promotion.planCode}`)}</strong>
              <small>{formatDate(promotion.endsAt, locale)}</small>
            </div>
            <span className="dh-badge dh-badge--soft">
              {t(`agritech.marketplace.promotion.status.${promotion.status}`)}
            </span>
            <button
              className="dh-text-button"
              onClick={() => {
                onLoadPromotion(promotion.id);
              }}
              type="button"
            >
              {t('agritech.marketplace.promotion.details')}
            </button>
          </article>
        ))}
      </div>
      {promotionDetail.status === 'loading' ? (
        <>
          <MarketplaceLoadingStatus busy label={t('agritech.marketplace.promotion.details')} t={t} />
          <MarketplaceFactsSkeleton rows={2} />
        </>
      ) : null}
      {promotionDetail.status === 'error' ? (
        <div>
          <p className="dh-state-inline dh-state-inline--error">
            {t('agritech.marketplace.promotion.detailUnavailable')}
          </p>
          <button className="dh-text-button" onClick={onRetry} type="button">
            {t('ui.runtime.retry')}
          </button>
        </div>
      ) : null}
      {promotionDetail.data ? (
        <dl className="dh-facts">
          <div>
            <dt>{t('agritech.marketplace.promotion.listing')}</dt>
            <dd>{promotionDetail.data.listingPublicId}</dd>
          </div>
          <div>
            <dt>{t('agritech.marketplace.promotion.period')}</dt>
            <dd>
              {formatDate(promotionDetail.data.startsAt, locale)} – {formatDate(promotionDetail.data.endsAt, locale)}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function sampleActions(sample: MarketplaceSampleDto): SampleAction[] {
  if (sample.actorRole === 'seller' && sample.status === 'requested') {
    return ['approve', 'decline'];
  }
  if (sample.actorRole === 'seller' && sample.status === 'approved') {
    return ['ship'];
  }
  if (sample.actorRole === 'requester' && sample.status === 'requested') {
    return ['cancel'];
  }
  if (sample.actorRole === 'requester' && sample.status === 'shipped') {
    return ['receive'];
  }
  return [];
}

function SampleWorkspace({
  locale,
  onRetry,
  onSampleFeedback,
  onSampleTransition,
  pendingAction,
  samples,
  t,
}: Pick<
  MarketplaceManagementProps,
  'locale' | 'onRetry' | 'onSampleFeedback' | 'onSampleTransition' | 'pendingAction' | 'samples' | 't'
>) {
  const [feedbackId, setFeedbackId] = useState<string>();
  return (
    <section aria-labelledby="dh-samples-workspace-title" className="dh-panel dh-management-section">
      <div className="dh-panel__head">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.samples.title')}</p>
          <h2 id="dh-samples-workspace-title">{t('agritech.marketplace.samples.manage')}</h2>
        </div>
      </div>
      <ResourceMessage
        emptyKey="agritech.marketplace.samples.empty"
        errorKey="agritech.marketplace.samples.unavailable"
        labelKey="agritech.marketplace.samples.manage"
        onRetry={onRetry}
        resource={samples}
        t={t}
      />
      <div className="dh-management-list">
        {samples.data.map((sample) => (
          <article key={sample.id}>
            <div>
              <strong>{sample.listing.title}</strong>
              <small>
                {formatDate(sample.updatedAt, locale)} · {t(`agritech.marketplace.samples.status.${sample.status}`)}
              </small>
            </div>
            <div className="dh-management-actions">
              {sampleActions(sample).map((action) => (
                <MarketplaceBusyButton
                  busy={pendingAction === `sample-transition:${sample.id}`}
                  busyLabel={t('agritech.marketplace.loading')}
                  className="dh-button dh-button--secondary"
                  key={action}
                  onClick={() => {
                    onSampleTransition(sample, action);
                  }}
                  type="button"
                >
                  {t(`agritech.marketplace.samples.action.${action}`)}
                </MarketplaceBusyButton>
              ))}
              {sample.actorRole === 'requester' && sample.status === 'received' && !sample.feedback ? (
                <button
                  className="dh-text-button"
                  onClick={() => {
                    setFeedbackId((value) => (value === sample.id ? undefined : sample.id));
                  }}
                  type="button"
                >
                  {t('agritech.marketplace.samples.feedback')}
                </button>
              ) : null}
            </div>
            {sample.feedback ? (
              <p>{t('agritech.marketplace.samples.feedbackRecorded', { rating: sample.feedback.rating })}</p>
            ) : null}
            {feedbackId === sample.id ? (
              <form
                className="dh-inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const rating = Number(form.get('rating'));
                  const comment = formText(form, 'comment');
                  onSampleFeedback(sample, rating, comment || undefined);
                  setFeedbackId(undefined);
                }}
              >
                <label>
                  <span>{t('agritech.marketplace.reviews.rating')}</span>
                  <select defaultValue="5" name="rating">
                    {[5, 4, 3, 2, 1].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}/5
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('agritech.marketplace.reviews.comment')}</span>
                  <textarea maxLength={1000} name="comment" rows={2} />
                </label>
                <button className="dh-button dh-button--primary" type="submit">
                  {t('agritech.marketplace.samples.feedbackSubmit')}
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ActivityWorkspace({
  aiConsultations,
  locale,
  navigate,
  notifications,
  onRetry,
  t,
}: Pick<MarketplaceManagementProps, 'aiConsultations' | 'locale' | 'navigate' | 'notifications' | 'onRetry' | 't'>) {
  const notificationContent: ReactNode = notifications.data.length ? (
    <div className="dh-management-list">
      {notifications.data.map((notification) => (
        <article key={notification.id}>
          <div>
            <strong>{notification.message}</strong>
            <small>
              {formatDate(notification.occurredAt, locale)} ·{' '}
              {t(`agritech.marketplace.notifications.channel.${notification.deliveryChannel}`)} ·{' '}
              {t(`agritech.marketplace.notifications.status.${notification.status}`)}
            </small>
            {notification.simulation ? (
              <span className="dh-badge dh-badge--neutral">
                {t('agritech.marketplace.notifications.simulationDisclosure')}
              </span>
            ) : null}
          </div>
          <button
            className="dh-text-button"
            onClick={() => {
              navigate(notification.contractPath);
            }}
            type="button"
          >
            {t('agritech.marketplace.notifications.openContract')}
          </button>
        </article>
      ))}
    </div>
  ) : (
    <ResourceMessage
      emptyKey="agritech.marketplace.notifications.empty"
      errorKey="agritech.marketplace.notifications.unavailable"
      labelKey="agritech.marketplace.notifications.title"
      onRetry={onRetry}
      resource={notifications}
      t={t}
    />
  );
  return (
    <div className="dh-account-grid">
      <section aria-labelledby="dh-notifications-title" className="dh-panel dh-management-section">
        <div className="dh-panel__head">
          <div>
            <p className="dh-eyebrow">{t('agritech.marketplace.account')}</p>
            <h2 id="dh-notifications-title">{t('agritech.marketplace.notifications.title')}</h2>
          </div>
        </div>
        {notificationContent}
      </section>
      <section aria-labelledby="dh-ai-history-title" className="dh-panel dh-management-section">
        <div className="dh-panel__head">
          <div>
            <p className="dh-eyebrow">{t('agritech.marketplace.ai.shortTitle')}</p>
            <h2 id="dh-ai-history-title">{t('agritech.marketplace.ai.history')}</h2>
          </div>
        </div>
        <ResourceMessage
          emptyKey="agritech.marketplace.ai.historyEmpty"
          errorKey="agritech.marketplace.ai.unavailable"
          labelKey="agritech.marketplace.ai.history"
          onRetry={onRetry}
          resource={aiConsultations}
          t={t}
        />
        <div className="dh-management-list">
          {aiConsultations.data.map((consultation) => (
            <article key={consultation.id}>
              <div>
                <strong>{consultation.question}</strong>
                <small>{formatDate(consultation.createdAt, locale)}</small>
              </div>
              <span className="dh-badge dh-badge--neutral">
                {t(`agritech.marketplace.ai.historyStatus.${consultation.answer}`)}
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MarketplaceUserManagement(props: Readonly<MarketplaceManagementProps>) {
  return (
    <div className="dh-page-stack dh-management">
      <PublicationWorkspace {...props} />
      <PromotionWorkspace {...props} />
      <SampleWorkspace {...props} />
      <ActivityWorkspace {...props} />
    </div>
  );
}
