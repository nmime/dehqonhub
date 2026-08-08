// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019
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
import { MarketplaceSkeleton } from './marketplace-discovery';
import { formatDate, formatMoney, type MarketplaceNavigate, type MarketplaceTranslate } from './marketplace-ui';

type PromotionPlanCode = MarketplacePromotionPlanDto['code'];
type SampleAction = 'approve' | 'cancel' | 'decline' | 'receive' | 'ship';
type ListingSection = 'equipment' | 'produce' | 'seeds';

const formText = (form: FormData, field: string): string => {
  const value = form.get(field);
  return typeof value === 'string' ? value.trim() : '';
};

interface MarketplaceManagementProps {
  readonly aiConsultations: Resource<MarketplaceAiConsultationDto[]>;
  readonly canActivatePromotions: boolean;
  readonly canPublishListings: boolean;
  readonly canPublishRequests: boolean;
  readonly listingPublications: Resource<MarketplaceOwnedListingPublicationDto[]>;
  readonly locale: Locale;
  readonly myRequests: Resource<BuyerRequestViewDto[]>;
  readonly navigate: MarketplaceNavigate;
  readonly notifications: Resource<MarketplaceContractNotificationRecipientDto[]>;
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

function ResourceMessage({
  emptyKey,
  errorKey,
  onRetry,
  resource,
  t,
}: Readonly<{
  emptyKey: string;
  errorKey: string;
  onRetry: () => void;
  resource: Resource<unknown[]>;
  t: MarketplaceTranslate;
}>) {
  if (resource.status === 'loading' || resource.status === 'idle') {
    return <MarketplaceSkeleton count={2} />;
  }
  if (resource.status === 'error') {
    return (
      <div>
        <p className="dh-state-inline dh-state-inline--error">{t(errorKey)}</p>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  }
  if (resource.data.length === 0) {
    return <p className="dh-muted">{t(emptyKey)}</p>;
  }
  return null;
}

function SourceResourceMessage({
  onRetry,
  produceListings,
  supplierProducts,
  t,
}: Readonly<Pick<MarketplaceManagementProps, 'onRetry' | 'produceListings' | 'supplierProducts' | 't'>>) {
  if (
    supplierProducts.status === 'loading' ||
    supplierProducts.status === 'idle' ||
    produceListings.status === 'loading' ||
    produceListings.status === 'idle'
  ) {
    return <MarketplaceSkeleton count={2} />;
  }
  if (supplierProducts.status === 'error' || produceListings.status === 'error') {
    return (
      <div>
        <p className="dh-state-inline dh-state-inline--error">
          {t('agritech.marketplace.publication.sourcesUnavailable')}
        </p>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  }
  if (supplierProducts.data.length + produceListings.data.length === 0) {
    return <p className="dh-muted">{t('agritech.marketplace.publication.productsEmpty')}</p>;
  }
  return null;
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
      {!canPublishListings && !canPublishRequests ? (
        <p className="dh-muted">{t('agritech.marketplace.management.verificationRequired')}</p>
      ) : null}
      {canPublishListings ? (
        <div className="dh-management-grid">
          <div>
            <h3>{t('agritech.marketplace.publication.products')}</h3>
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
                    <button
                      className="dh-button dh-button--secondary"
                      disabled={pendingAction === `publish-listing:${product.id}`}
                      onClick={() => {
                        onPublishListing(product.id, 'product', section);
                      }}
                      type="button"
                    >
                      {t('agritech.marketplace.publication.publish')}
                    </button>
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
                    <button
                      className="dh-button dh-button--secondary"
                      disabled={pendingAction === `publish-listing:${produce.id}`}
                      onClick={() => {
                        onPublishListing(produce.id, 'produce', 'produce');
                      }}
                      type="button"
                    >
                      {t('agritech.marketplace.publication.publish')}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
          <PublicationReceipts listings={listingPublications} locale={locale} requests={requestPublications} t={t} />
        </div>
      ) : null}
      {canPublishRequests ? (
        <div>
          <h3>{t('agritech.marketplace.publication.requests')}</h3>
          <ResourceMessage
            emptyKey="agritech.marketplace.orders.empty"
            errorKey="agritech.marketplace.orders.unavailable"
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
                  <button
                    className="dh-button dh-button--secondary"
                    disabled={pendingAction === `publish-request:${request.id}`}
                    onClick={() => {
                      onPublishRequest(request.id);
                    }}
                    type="button"
                  >
                    {t('agritech.marketplace.publication.publish')}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
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
    return <MarketplaceSkeleton count={2} />;
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
>) {
  const [listingId, setListingId] = useState('');
  const [planCode, setPlanCode] = useState<PromotionPlanCode>('catalog_7d');
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (listingId) {
      onActivatePromotion(listingId, planCode);
    }
  };

  if (!canActivatePromotions) {
    return null;
  }
  return (
    <section aria-labelledby="dh-promotion-title" className="dh-panel dh-management-section">
      <div className="dh-panel__head">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.management.seller')}</p>
          <h2 id="dh-promotion-title">{t('agritech.marketplace.promotion.title')}</h2>
        </div>
      </div>
      <p>{t('agritech.marketplace.promotion.description')}</p>
      <ResourceMessage
        emptyKey="agritech.marketplace.publication.historyEmpty"
        errorKey="agritech.marketplace.publication.historyUnavailable"
        onRetry={onRetry}
        resource={listingPublications}
        t={t}
      />
      <ResourceMessage
        emptyKey="agritech.marketplace.promotion.plansEmpty"
        errorKey="agritech.marketplace.promotion.plansUnavailable"
        onRetry={onRetry}
        resource={promotionPlans}
        t={t}
      />
      <form className="dh-inline-form" onSubmit={submit}>
        <label>
          <span>{t('agritech.marketplace.promotion.listing')}</span>
          <select
            disabled={listingPublications.status !== 'ready'}
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
        <button
          className="dh-button dh-button--primary"
          disabled={!listingId || promotionPlans.status !== 'ready' || pendingAction === 'promotion:activate'}
          type="submit"
        >
          {t('agritech.marketplace.promotion.activate')}
        </button>
      </form>
      <ResourceMessage
        emptyKey="agritech.marketplace.promotion.empty"
        errorKey="agritech.marketplace.promotion.unavailable"
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
      {promotionDetail.status === 'loading' ? <MarketplaceSkeleton count={1} /> : null}
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
                <button
                  className="dh-button dh-button--secondary"
                  disabled={pendingAction === `sample-transition:${sample.id}`}
                  key={action}
                  onClick={() => {
                    onSampleTransition(sample, action);
                  }}
                  type="button"
                >
                  {t(`agritech.marketplace.samples.action.${action}`)}
                </button>
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
