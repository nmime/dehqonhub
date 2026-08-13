import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type {
  BuyerRequestViewDto,
  CartViewDto,
  ContractDeliveryQuoteDto,
  ContractLifecycleDto,
  ContractViewDto,
  CreateRequestDto,
  FulfillmentCommandDto,
  MarketplaceRoleDashboardDto,
  MarketplaceProviderReadinessDto,
  MarketplaceSampleDto,
  OfferViewDto,
  RequestOfferDto,
  SettlementCommandDto,
  VerificationDocumentInputDto,
  VerificationViewDto,
} from '@app/frontend-api-client';
import type { Resource, ResourceStatus } from '../model/use-marketplace-data';
import { MarketplaceIcon, type MarketplaceIconName } from './marketplace-icon';
import { ProductMedia } from './marketplace-product-card';
import { MarketplaceEmpty, MarketplaceSkeleton } from './marketplace-discovery';
import {
  formatDate,
  formatMoney,
  localizedProductName,
  type MarketplaceListing,
  type MarketplaceNavigate,
  type MarketplaceRequestFeedItem,
  type MarketplaceTranslate,
} from './marketplace-ui';

type DeliveryTerms = 'by_agreement' | 'pickup' | 'seller_delivery';
type MarketplaceVerificationRole = VerificationViewDto['role'];
type MarketplaceVerificationDocumentKind = VerificationDocumentInputDto['kind'];
type DisputeReason = 'delivery_issue' | 'other' | 'quality_issue' | 'quantity_issue';
export type MarketplaceCreateRequestInput = Omit<CreateRequestDto, 'actingPartnerId'>;
export type MarketplaceOfferInput = Omit<RequestOfferDto, 'actingPartnerId'>;
export type MarketplaceContractDeliveryQuoteInput = Omit<ContractDeliveryQuoteDto, 'expectedRevision'>;
export type MarketplaceContractLifecycleAction =
  | { kind: 'factoring-consent' }
  | { body: SettlementCommandDto; kind: 'settlement' }
  | { body: FulfillmentCommandDto; kind: 'fulfillment' };

const deliveryTranslationKeys: Record<DeliveryTerms, string> = {
  by_agreement: 'agritech.marketplace.product.byAgreement',
  pickup: 'agritech.marketplace.product.pickup',
  seller_delivery: 'agritech.marketplace.product.sellerDelivery',
};

const verificationRoleIcons: Record<MarketplaceVerificationRole, MarketplaceIconName> = {
  buyer: 'account',
  farmer: 'seeds',
  seller: 'equipment',
};

const verificationDocumentsByRole: Record<MarketplaceVerificationRole, MarketplaceVerificationDocumentKind[]> = {
  buyer: ['id', 'business'],
  farmer: ['id', 'land', 'lease', 'cadastre', 'farm'],
  seller: ['id', 'business', 'warehouse'],
};

interface CartProps {
  canCheckout?: boolean;
  checkoutActionLabel?: string;
  checkoutHint?: string;
  carts: Resource<CartViewDto[]>;
  locale: Locale;
  navigate: MarketplaceNavigate;
  onCheckout: (cart: CartViewDto, deliveryTerms: DeliveryTerms) => void;
  onCheckoutAction?: () => void;
  onUpdate: (cartId: string, listingPublicationId: string, quantity: number) => void;
  pendingAction?: string;
  products: MarketplaceListing[];
  t: MarketplaceTranslate;
}

export function MarketplaceCart({
  canCheckout = true,
  checkoutActionLabel,
  checkoutHint,
  carts,
  locale,
  navigate,
  onCheckout,
  onCheckoutAction,
  onUpdate,
  pendingAction,
  products,
  t,
}: Readonly<CartProps>) {
  const [activeId, setActiveId] = useState<string>();
  const [delivery, setDelivery] = useState<Record<string, DeliveryTerms>>({});
  const selected = carts.data.find((cart) => cart.id === activeId) ?? carts.data[0];
  const checkoutHintId = 'marketplace-cart-checkout-hint';
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const sellerNameFor = (cart: CartViewDto): string => cart.seller.displayName;
  const estimatedTotal =
    selected?.items.reduce(
      (total, item) => total + (productById.get(item.listingPublicationId)?.priceUzs ?? 0) * item.quantity,
      0,
    ) ?? 0;
  const heading = (
    <div className="dh-page-heading">
      <div>
        <p className="dh-eyebrow">{t('agritech.marketplace.account')}</p>
        <h1>{t('agritech.marketplace.cart.title')}</h1>
        <p>{t('agritech.marketplace.cart.separateSellers')}</p>
      </div>
    </div>
  );

  if (carts.status === 'loading' || carts.status === 'idle') {
    return (
      <div className="dh-page-stack">
        {heading}
        <MarketplaceSkeleton count={3} />
      </div>
    );
  }
  if (carts.status === 'error') {
    return (
      <div className="dh-page-stack">
        {heading}
        <MarketplaceEmpty
          actionLabel={t('ui.runtime.retry')}
          icon="produce"
          message={t('agritech.marketplace.cart.unavailableDescription')}
          onAction={() => {
            globalThis.location.reload();
          }}
          title={t('agritech.marketplace.cart.unavailable')}
        />
      </div>
    );
  }
  if (!selected) {
    return (
      <div className="dh-page-stack">
        {heading}
        <MarketplaceEmpty
          actionLabel={t('agritech.marketplace.hero.cta')}
          icon="produce"
          message={t('agritech.marketplace.cart.emptyDescription')}
          onAction={() => {
            navigate('/catalog');
          }}
          title={t('agritech.marketplace.cart.empty')}
        />
      </div>
    );
  }

  const selectedDelivery = delivery[selected.id] ?? 'by_agreement';
  return (
    <div className="dh-page-stack">
      {heading}
      <div aria-label={t('agritech.marketplace.cart.sellerCarts')} className="dh-cart-tabs" role="tablist">
        {carts.data.map((cart) => (
          <button
            aria-selected={cart.id === selected.id}
            className={cart.id === selected.id ? 'is-active' : ''}
            key={cart.id}
            onClick={() => {
              setActiveId(cart.id);
            }}
            role="tab"
            type="button"
          >
            <span>{sellerNameFor(cart)}</span>
            <small>{t('agritech.marketplace.cart.itemCountValue', { count: cart.items.length })}</small>
          </button>
        ))}
      </div>
      <div className="dh-cart-layout">
        <section aria-labelledby="dh-cart-seller" className="dh-panel dh-cart-lines">
          <div className="dh-panel__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.cart.seller')}</p>
              <h2 id="dh-cart-seller">{sellerNameFor(selected)}</h2>
            </div>
            <span className="dh-badge dh-badge--soft">{t('agritech.marketplace.cart.oneSeller')}</span>
          </div>
          {selected.items.map((item) => {
            const product = productById.get(item.listingPublicationId);
            return (
              <article className="dh-cart-line" key={item.listingPublicationId}>
                {product ? (
                  <ProductMedia compact locale={locale} product={product} t={t} />
                ) : (
                  <span className="dh-cart-line__missing">
                    <MarketplaceIcon name="produce" />
                  </span>
                )}
                <div className="dh-cart-line__content">
                  <strong>
                    {product ? localizedProductName(product, locale) : t('agritech.marketplace.product.unavailable')}
                  </strong>
                  <span>
                    {product ? `${formatMoney(product.priceUzs, locale)} / ${product.unit}` : item.listingPublicationId}
                  </span>
                </div>
                <div aria-label={t('agritech.marketplace.product.quantity')} className="dh-stepper">
                  <button
                    aria-label={t('agritech.marketplace.cart.decrease')}
                    disabled={pendingAction === `cart-update:${item.listingPublicationId}`}
                    onClick={() => {
                      onUpdate(selected.id, item.listingPublicationId, item.quantity - 1);
                    }}
                    type="button"
                  >
                    <MarketplaceIcon name="minus" />
                  </button>
                  <output>{item.quantity}</output>
                  <button
                    aria-label={t('agritech.marketplace.cart.increase')}
                    disabled={pendingAction === `cart-update:${item.listingPublicationId}`}
                    onClick={() => {
                      onUpdate(selected.id, item.listingPublicationId, item.quantity + 1);
                    }}
                    type="button"
                  >
                    <MarketplaceIcon name="plus" />
                  </button>
                </div>
                <strong>{product ? formatMoney(product.priceUzs * item.quantity, locale) : '—'}</strong>
              </article>
            );
          })}
        </section>
        <aside className="dh-panel dh-cart-summary">
          <p className="dh-eyebrow">{t('agritech.marketplace.cart.summary')}</p>
          <h2>{t('agritech.marketplace.cart.estimatedTotal')}</h2>
          <strong className="dh-cart-summary__total">{formatMoney(estimatedTotal, locale)}</strong>
          <p className="dh-muted">{t('agritech.marketplace.cart.serverPricingNotice')}</p>
          <fieldset className="dh-choice-group">
            <legend>{t('agritech.marketplace.product.delivery')}</legend>
            {(['pickup', 'seller_delivery', 'by_agreement'] as const).map((term) => (
              <label key={term}>
                <input
                  checked={selectedDelivery === term}
                  name={`delivery-${selected.id}`}
                  onChange={() => {
                    setDelivery((value) => ({ ...value, [selected.id]: term }));
                  }}
                  type="radio"
                />
                <span>{t(deliveryTranslationKeys[term])}</span>
              </label>
            ))}
          </fieldset>
          <button
            aria-describedby={!canCheckout && checkoutHint ? checkoutHintId : undefined}
            className="dh-button dh-button--primary dh-button--block"
            disabled={!canCheckout || pendingAction === `checkout:${selected.id}`}
            onClick={() => {
              onCheckout(selected, selectedDelivery);
            }}
            type="button"
          >
            <MarketplaceIcon name="contract" />
            {t('agritech.marketplace.cart.reviewContract')}
          </button>
          {!canCheckout && checkoutHint ? (
            <div className="dh-state-inline" id={checkoutHintId}>
              <span>{checkoutHint}</span>
              {checkoutActionLabel && onCheckoutAction ? (
                <button className="dh-text-button" onClick={onCheckoutAction} type="button">
                  {checkoutActionLabel}
                </button>
              ) : null}
            </div>
          ) : null}
          <p className="dh-fine-print">{t('agritech.marketplace.cart.contractBoundary')}</p>
        </aside>
      </div>
    </div>
  );
}

interface RequestProps {
  buyerAccessActionLabel?: string;
  buyerAccessHint?: string;
  isVerified: boolean;
  locale: Locale;
  myRequests: Resource<BuyerRequestViewDto[]>;
  navigate: MarketplaceNavigate;
  offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  onBuyerAccessAction?: () => void;
  onChoose: (request: BuyerRequestViewDto, offer: OfferViewDto) => void;
  onCreate: (input: MarketplaceCreateRequestInput) => void;
  onOffer: (request: MarketplaceRequestFeedItem, input: MarketplaceOfferInput) => void;
  onRetry: () => void;
  onSellerAccessAction?: () => void;
  pendingAction?: string;
  requests: Resource<MarketplaceRequestFeedItem[]>;
  role?: string;
  sellerAccessActionLabel?: string;
  sellerAccessHint?: string;
  t: MarketplaceTranslate;
}

const emptyRequest: MarketplaceCreateRequestInput = { region: '', title: '' };

// eslint-disable-next-line sonarjs/cognitive-complexity -- one explicit renderer keeps buyer and seller eligibility, loading, empty, and offer states visibly aligned
export function MarketplaceRequests({
  buyerAccessActionLabel,
  buyerAccessHint,
  isVerified,
  locale,
  myRequests,
  navigate,
  offersByRequest,
  onBuyerAccessAction,
  onChoose,
  onCreate,
  onOffer,
  onRetry,
  onSellerAccessAction,
  pendingAction,
  requests,
  role,
  sellerAccessActionLabel,
  sellerAccessHint,
  t,
}: Readonly<RequestProps>) {
  const eligibleBuyer = isVerified && (role === 'buyer' || role === 'farmer');
  const eligibleSeller = isVerified && (role === 'farmer' || role === 'seller');
  const [creating, setCreating] = useState(
    () =>
      eligibleBuyer &&
      typeof globalThis.location !== 'undefined' &&
      new URLSearchParams(globalThis.location.search).get('create') === '1',
  );
  const [requestInput, setRequestInput] = useState<MarketplaceCreateRequestInput>(emptyRequest);
  const [offeringId, setOfferingId] = useState<string>();
  const [offerInput, setOfferInput] = useState<MarketplaceOfferInput>({
    deliveryTerms: 'by_agreement',
    priceUzs: 0,
  });
  const myIds = useMemo(() => new Set(myRequests.data.map((request) => request.id)), [myRequests.data]);
  const buyerAccessId = 'marketplace-request-buyer-access';
  const sellerAccessId = 'marketplace-request-seller-access';

  const submitRequest = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eligibleBuyer) {
      navigate('/verification');
      return;
    }
    const formDeadline = new FormData(event.currentTarget).get('deadline');
    onCreate({
      ...requestInput,
      deadline: typeof formDeadline === 'string' && formDeadline.length > 0 ? formDeadline : undefined,
    });
  };
  const submitOffer = (event: SyntheticEvent<HTMLFormElement>, request: MarketplaceRequestFeedItem) => {
    event.preventDefault();
    onOffer(request, offerInput);
  };

  const toggleCreating = () => {
    if (eligibleBuyer) {
      setCreating((value) => !value);
    } else {
      navigate('/verification');
    }
  };

  const sellerRequests = requests.data.filter((request) => !myIds.has(request.id));
  let sellerFeed: ReactNode;
  if (requests.status === 'loading') {
    sellerFeed = <MarketplaceSkeleton count={3} />;
  } else if (requests.status === 'error') {
    sellerFeed = (
      <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.orders.unavailable')}</p>
    );
  } else if (sellerRequests.length > 0) {
    sellerFeed = (
      <div className="dh-request-list">
        {sellerRequests.map((request) => (
          <article className="dh-request-card" key={request.id}>
            <div className="dh-request-card__head">
              <div>
                <span className="dh-badge dh-badge--soft">{t(`agritech.marketplace.orders.${request.status}`)}</span>
                <h3>{request.title}</h3>
              </div>
              {request.budgetUzs && <strong>{formatMoney(request.budgetUzs, locale)}</strong>}
            </div>
            <dl>
              <div>
                <dt>{t('agritech.marketplace.orders.product')}</dt>
                <dd>{request.product ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('agritech.marketplace.orders.volume')}</dt>
                <dd>{request.volume ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('agritech.marketplace.orders.region')}</dt>
                <dd>{request.region}</dd>
              </div>
              <div>
                <dt>{t('agritech.marketplace.orders.deadline')}</dt>
                <dd>{request.deadline ?? '—'}</dd>
              </div>
            </dl>
            {request.requirements && <p>{request.requirements}</p>}
            {offeringId === request.id && eligibleSeller ? (
              <form
                className="dh-inline-form"
                onSubmit={(event) => {
                  submitOffer(event, request);
                }}
              >
                <label>
                  <span>{t('agritech.marketplace.orders.price')}</span>
                  <input
                    min="1"
                    onChange={(event) => {
                      setOfferInput((value) => ({ ...value, priceUzs: Number(event.target.value) }));
                    }}
                    required
                    type="number"
                    value={offerInput.priceUzs || ''}
                  />
                </label>
                <label>
                  <span>{t('agritech.marketplace.product.delivery')}</span>
                  <select
                    onChange={(event) => {
                      const deliveryTerms = event.target.value as DeliveryTerms;
                      setOfferInput((value) => ({
                        ...value,
                        deliveryPriceUzs: undefined,
                        deliveryTerms,
                      }));
                    }}
                    value={offerInput.deliveryTerms}
                  >
                    {(Object.keys(deliveryTranslationKeys) as DeliveryTerms[]).map((term) => (
                      <option key={term} value={term}>
                        {t(deliveryTranslationKeys[term])}
                      </option>
                    ))}
                  </select>
                </label>
                {offerInput.deliveryTerms === 'seller_delivery' ? (
                  <label>
                    <span>{t('agritech.marketplace.contract.deliveryPrice')}</span>
                    <input
                      min="1"
                      onChange={(event) => {
                        setOfferInput((value) => ({
                          ...value,
                          deliveryPriceUzs: Number(event.target.value),
                        }));
                      }}
                      required
                      type="number"
                      value={offerInput.deliveryPriceUzs ?? ''}
                    />
                  </label>
                ) : null}
                <label>
                  <span>{t('agritech.marketplace.orders.timing')}</span>
                  <input
                    min="1"
                    onChange={(event) => {
                      setOfferInput((value) => ({
                        ...value,
                        deliveryDays: event.target.value ? Number(event.target.value) : undefined,
                      }));
                    }}
                    type="number"
                    value={offerInput.deliveryDays ?? ''}
                  />
                </label>
                <label>
                  <span>{t('agritech.marketplace.orders.deliveryNote')}</span>
                  <input
                    onChange={(event) => {
                      setOfferInput((value) => ({ ...value, deliveryNote: event.target.value || undefined }));
                    }}
                    value={offerInput.deliveryNote ?? ''}
                  />
                </label>
                <div>
                  <button
                    className="dh-button dh-button--secondary"
                    onClick={() => {
                      setOfferingId(undefined);
                    }}
                    type="button"
                  >
                    {t('agritech.marketplace.cancel')}
                  </button>
                  <button
                    className="dh-button dh-button--primary"
                    disabled={pendingAction === `offer:${request.id}`}
                    type="submit"
                  >
                    {t('agritech.marketplace.orders.submitOffer')}
                  </button>
                </div>
              </form>
            ) : (
              <button
                aria-describedby={!eligibleSeller ? sellerAccessId : undefined}
                className="dh-button dh-button--secondary"
                disabled={!eligibleSeller}
                onClick={() => {
                  setOfferingId(request.id);
                  setOfferInput({ deliveryTerms: 'by_agreement', priceUzs: 0 });
                }}
                type="button"
              >
                {t('agritech.marketplace.orders.makeOffer')}
              </button>
            )}
          </article>
        ))}
      </div>
    );
  } else {
    sellerFeed = (
      <MarketplaceEmpty
        icon="search"
        message={t('agritech.marketplace.orders.feedEmptyDescription')}
        title={t('agritech.marketplace.orders.feedEmpty')}
      />
    );
  }

  let myRequestContent: ReactNode;
  if (myRequests.status === 'loading') {
    myRequestContent = <MarketplaceSkeleton count={2} />;
  } else if (myRequests.status === 'error') {
    myRequestContent = (
      <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.orders.unavailable')}</p>
    );
  } else if (myRequests.data.length > 0) {
    myRequestContent = (
      <div className="dh-request-list">
        {myRequests.data.map((request) => {
          const requestOffers = offersByRequest.data[request.id];
          const offers = [...(requestOffers ?? [])].sort((left, right) => left.priceUzs - right.priceUzs);
          const offersUnavailable = offersByRequest.status === 'error' && requestOffers === undefined;
          let offerContent: ReactNode;
          if (offersUnavailable) {
            offerContent = (
              <div>
                <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.orders.unavailable')}</p>
                <button className="dh-text-button" onClick={onRetry} type="button">
                  {t('ui.runtime.retry')}
                </button>
              </div>
            );
          } else if (offers.length > 0) {
            offerContent = (
              <div className="dh-offer-list">
                {offers.map((offer, index) => (
                  <div className={index === 0 ? 'is-best' : ''} key={offer.id}>
                    <div>
                      <span>{index === 0 && t('agritech.marketplace.orders.bestOffer')}</span>
                      <span>
                        {offer.seller.displayName} · {offer.seller.region}
                      </span>
                      <strong>{formatMoney(offer.priceUzs, locale)}</strong>
                      <small>
                        {t(deliveryTranslationKeys[offer.deliveryTerms])}
                        {offer.deliveryPriceUzs === undefined
                          ? ''
                          : ` · ${formatMoney(offer.deliveryPriceUzs, locale)}`}
                        {offer.deliveryDays
                          ? ` · ${t('agritech.marketplace.orders.deliveryDays', { count: offer.deliveryDays })}`
                          : ''}
                      </small>
                    </div>
                    <button
                      aria-describedby={!eligibleBuyer ? buyerAccessId : undefined}
                      className="dh-button dh-button--secondary"
                      disabled={!eligibleBuyer || offer.status !== 'pending' || pendingAction === `choose:${offer.id}`}
                      onClick={() => {
                        onChoose(request, offer);
                      }}
                      type="button"
                    >
                      {offer.status === 'pending'
                        ? t('agritech.marketplace.orders.choose')
                        : t(`agritech.marketplace.orders.offerStatus.${offer.status}`)}
                    </button>
                  </div>
                ))}
              </div>
            );
          } else {
            offerContent = <p className="dh-muted">{t('agritech.marketplace.orders.noOffers')}</p>;
          }
          return (
            <article className="dh-request-card dh-request-card--mine" key={request.id}>
              <div className="dh-request-card__head">
                <div>
                  <span className="dh-badge dh-badge--soft">{t(`agritech.marketplace.orders.${request.status}`)}</span>
                  <h3>{request.title}</h3>
                </div>
                <span>{t('agritech.marketplace.orders.offerCount', { count: offers.length })}</span>
              </div>
              {offerContent}
            </article>
          );
        })}
      </div>
    );
  } else {
    myRequestContent = (
      <MarketplaceEmpty
        {...(eligibleBuyer ? { actionLabel: t('agritech.marketplace.orders.create') } : {})}
        icon="search"
        message={t('agritech.marketplace.orders.emptyDescription')}
        {...(eligibleBuyer
          ? {
              onAction: () => {
                setCreating(true);
              },
            }
          : {})}
        title={t('agritech.marketplace.orders.empty')}
      />
    );
  }

  return (
    <div className="dh-page-stack">
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.orders.reverseAuction')}</p>
          <h1>{t('agritech.marketplace.orders.title')}</h1>
          <p>{t('agritech.marketplace.orders.description')}</p>
        </div>
        <button
          aria-describedby={!eligibleBuyer ? buyerAccessId : undefined}
          className="dh-button dh-button--primary"
          disabled={!eligibleBuyer}
          onClick={toggleCreating}
          type="button"
        >
          <MarketplaceIcon name="plus" />
          {t('agritech.marketplace.orders.create')}
        </button>
      </div>

      {!eligibleBuyer && buyerAccessHint ? (
        <div className="dh-state-inline" id={buyerAccessId}>
          <span>{buyerAccessHint}</span>
          {buyerAccessActionLabel && onBuyerAccessAction ? (
            <button className="dh-text-button" onClick={onBuyerAccessAction} type="button">
              {buyerAccessActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {creating && (
        <form className="dh-panel dh-form" onSubmit={submitRequest}>
          <div className="dh-panel__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.orders.newRequest')}</p>
              <h2>{t('agritech.marketplace.orders.create')}</h2>
            </div>
            <button
              aria-label={t('agritech.marketplace.close')}
              className="dh-icon-button"
              onClick={() => {
                setCreating(false);
              }}
              type="button"
            >
              <MarketplaceIcon name="close" />
            </button>
          </div>
          <div className="dh-form-grid">
            <label>
              <span>{t('agritech.marketplace.orders.requestTitle')}</span>
              <input
                onChange={(event) => {
                  setRequestInput((value) => ({ ...value, title: event.target.value }));
                }}
                required
                value={requestInput.title}
              />
            </label>
            <label>
              <span>{t('agritech.marketplace.orders.product')}</span>
              <input
                onChange={(event) => {
                  setRequestInput((value) => ({ ...value, product: event.target.value || undefined }));
                }}
                value={requestInput.product ?? ''}
              />
            </label>
            <label>
              <span>{t('agritech.marketplace.orders.volume')}</span>
              <input
                onChange={(event) => {
                  setRequestInput((value) => ({ ...value, volume: event.target.value || undefined }));
                }}
                value={requestInput.volume ?? ''}
              />
            </label>
            <label>
              <span>{t('agritech.marketplace.orders.region')}</span>
              <input
                onChange={(event) => {
                  setRequestInput((value) => ({ ...value, region: event.target.value }));
                }}
                required
                value={requestInput.region}
              />
            </label>
            <label>
              <span>{t('agritech.marketplace.orders.deadline')}</span>
              <input
                name="deadline"
                onChange={(event) => {
                  setRequestInput((value) => ({ ...value, deadline: event.target.value || undefined }));
                }}
                type="date"
                value={requestInput.deadline ?? ''}
              />
            </label>
            <label>
              <span>{t('agritech.marketplace.orders.budget')}</span>
              <input
                min="1"
                onChange={(event) => {
                  setRequestInput((value) => ({
                    ...value,
                    budgetUzs: event.target.value ? Number(event.target.value) : undefined,
                  }));
                }}
                type="number"
                value={requestInput.budgetUzs ?? ''}
              />
            </label>
            <label className="dh-form-grid__wide">
              <span>{t('agritech.marketplace.orders.requirements')}</span>
              <textarea
                onChange={(event) => {
                  setRequestInput((value) => ({ ...value, requirements: event.target.value || undefined }));
                }}
                value={requestInput.requirements ?? ''}
              />
            </label>
          </div>
          <div className="dh-form__actions">
            <button
              className="dh-button dh-button--secondary"
              onClick={() => {
                setCreating(false);
              }}
              type="button"
            >
              {t('agritech.marketplace.cancel')}
            </button>
            <button
              className="dh-button dh-button--primary"
              disabled={pendingAction === 'request:create'}
              type="submit"
            >
              {t('agritech.marketplace.orders.publish')}
            </button>
          </div>
        </form>
      )}

      <div className="dh-request-layout">
        <section aria-labelledby="dh-request-feed">
          <div className="dh-section__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.orders.forSellers')}</p>
              <h2 id="dh-request-feed">{t('agritech.marketplace.orders.feed')}</h2>
            </div>
          </div>
          {!eligibleSeller && sellerAccessHint ? (
            <div className="dh-state-inline" id={sellerAccessId}>
              <span>{sellerAccessHint}</span>
              {sellerAccessActionLabel && onSellerAccessAction ? (
                <button className="dh-text-button" onClick={onSellerAccessAction} type="button">
                  {sellerAccessActionLabel}
                </button>
              ) : null}
            </div>
          ) : null}
          {sellerFeed}
        </section>

        <section aria-labelledby="dh-my-requests">
          <div className="dh-section__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.account')}</p>
              <h2 id="dh-my-requests">{t('agritech.marketplace.orders.my')}</h2>
            </div>
          </div>
          {myRequestContent}
        </section>
      </div>
    </div>
  );
}

interface VerificationProps {
  navigate: MarketplaceNavigate;
  onLinkIdentity: (verification: VerificationViewDto) => void;
  onRetry: () => void;
  onStart: (role: MarketplaceVerificationRole) => void;
  onSubmit: (verification: VerificationViewDto) => void;
  onUploadDocument: (verification: VerificationViewDto, kind: MarketplaceVerificationDocumentKind, file: File) => void;
  pendingAction?: string;
  readiness: Resource<MarketplaceProviderReadinessDto | null>;
  t: MarketplaceTranslate;
  verification: Resource<VerificationViewDto | null>;
}

function VerificationTerminalStatus({
  current,
  navigate,
  t,
}: Readonly<{
  current: VerificationViewDto;
  navigate: MarketplaceNavigate;
  t: MarketplaceTranslate;
}>): ReactNode | null {
  if (current.status === 'verified') {
    return (
      <MarketplaceStatus
        icon="shield"
        message={t('agritech.marketplace.verify.success')}
        title={t('agritech.marketplace.verify.verified')}
      >
        <span className="dh-badge dh-badge--soft">
          {t(`agritech.marketplace.verify.providerMode.${current.providerMode}`)}
          {current.simulation ? ` · ${t('agritech.marketplace.verify.simulationDisclosure')}` : ''}
        </span>
        <button
          className="dh-button dh-button--primary"
          onClick={() => {
            navigate('/account');
          }}
          type="button"
        >
          {t('agritech.marketplace.account.title')}
        </button>
      </MarketplaceStatus>
    );
  }
  if (current.status === 'pending') {
    return (
      <MarketplaceStatus
        icon="contract"
        message={t('agritech.marketplace.verify.pendingDescription')}
        title={t('agritech.marketplace.verify.pending')}
      >
        <span className="dh-badge dh-badge--neutral">
          {t(`agritech.marketplace.verify.providerMode.${current.providerMode}`)}
          {current.simulation ? ` · ${t('agritech.marketplace.verify.simulationDisclosure')}` : ''}
        </span>
        <p className="dh-fine-print">{t('agritech.marketplace.verify.noFixedReviewTime')}</p>
      </MarketplaceStatus>
    );
  }
  return null;
}

function VerificationActions({
  canSubmit,
  current,
  onLinkIdentity,
  onStart,
  onSubmit,
  pendingAction,
  readiness,
  role,
  t,
}: Readonly<{
  canSubmit: boolean;
  current: VerificationViewDto | null;
  onLinkIdentity: (verification: VerificationViewDto) => void;
  onStart: (role: MarketplaceVerificationRole) => void;
  onSubmit: (verification: VerificationViewDto) => void;
  pendingAction?: string;
  readiness: Resource<MarketplaceProviderReadinessDto | null>;
  role: MarketplaceVerificationRole;
  t: MarketplaceTranslate;
}>) {
  if (!current) {
    return (
      <button
        className="dh-button dh-button--primary"
        disabled={pendingAction === 'verification:start'}
        onClick={() => {
          onStart(role);
        }}
        type="button"
      >
        {t('agritech.marketplace.verify.start')}
      </button>
    );
  }
  if (current.status === 'rejected') {
    return (
      <button
        className="dh-button dh-button--primary"
        disabled={pendingAction === 'verification:start'}
        onClick={() => {
          onStart(current.role);
        }}
        type="button"
      >
        {t('agritech.marketplace.verify.resume')}
      </button>
    );
  }
  return (
    <div className="dh-management-actions">
      {!current.oneIdLinked ? (
        <button
          className="dh-button dh-button--secondary"
          disabled={!readiness.data?.oneId.ready || pendingAction === 'verification:identity'}
          onClick={() => {
            onLinkIdentity(current);
          }}
          type="button"
        >
          {t('agritech.marketplace.verify.linkIdentity')}
        </button>
      ) : (
        <span className="dh-badge dh-badge--soft">{t('agritech.marketplace.verify.identityLinked')}</span>
      )}
      <button
        className="dh-button dh-button--primary"
        disabled={!canSubmit || pendingAction === 'verification:submit'}
        onClick={() => {
          onSubmit(current);
        }}
        type="button"
      >
        {t('agritech.marketplace.verify.submit')}
      </button>
    </div>
  );
}

function VerificationEvidenceList({
  current,
  onUploadDocument,
  pendingAction,
  readiness,
  requiredDocuments,
  storedDocumentByKind,
  t,
}: Readonly<{
  current: VerificationViewDto | null;
  onUploadDocument: VerificationProps['onUploadDocument'];
  pendingAction?: string;
  readiness: Resource<MarketplaceProviderReadinessDto | null>;
  requiredDocuments: MarketplaceVerificationDocumentKind[];
  storedDocumentByKind: Map<string, VerificationViewDto['documents'][number]>;
  t: MarketplaceTranslate;
}>) {
  return (
    <ul className="dh-document-list">
      {requiredDocuments.map((kind) => {
        const stored = storedDocumentByKind.get(kind);
        const documentLabel = t(`agritech.marketplace.verify.doc.${kind}`);
        const uploadLabel = t(
          stored ? 'agritech.marketplace.verify.replaceDocument' : 'agritech.marketplace.verify.uploadDocument',
          { document: documentLabel },
        );
        return (
          <li key={kind}>
            <MarketplaceIcon name={stored ? 'check' : 'contract'} />
            <span>{stored?.fileName ?? documentLabel}</span>
            {current ? (
              <label className="dh-document-upload">
                <span>{uploadLabel}</span>
                <input
                  accept="application/pdf,image/jpeg,image/png"
                  aria-label={uploadLabel}
                  disabled={
                    current.status === 'rejected' ||
                    !readiness.data?.verificationDocuments.ready ||
                    pendingAction === `verification:document:${kind}`
                  }
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onUploadDocument(current, kind, file);
                      event.target.value = '';
                    }
                  }}
                  type="file"
                />
              </label>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function VerificationRejection({
  current,
  t,
}: Readonly<{ current: VerificationViewDto | null; t: MarketplaceTranslate }>) {
  if (current?.status !== 'rejected') {
    return null;
  }
  return (
    <div className="dh-state-inline dh-state-inline--error" role="alert">
      <strong>{t('agritech.marketplace.verify.rejected')}</strong>
      <p>
        {current.rejectionReason
          ? t(`agritech.marketplace.verify.rejection.${current.rejectionReason}`)
          : t('agritech.marketplace.verify.rejectedDescription')}
      </p>
      <span className="dh-badge dh-badge--neutral">
        {t(`agritech.marketplace.verify.providerMode.${current.providerMode}`)}
        {current.simulation ? ` · ${t('agritech.marketplace.verify.simulationDisclosure')}` : ''}
      </span>
    </div>
  );
}

export function MarketplaceVerification({
  navigate,
  onLinkIdentity,
  onRetry,
  onStart,
  onSubmit,
  onUploadDocument,
  pendingAction,
  readiness,
  t,
  verification,
}: Readonly<VerificationProps>) {
  const [role, setRole] = useState<'buyer' | 'farmer' | 'seller'>('farmer');
  if (verification.status === 'loading' || verification.status === 'idle') {
    return <MarketplaceSkeleton count={3} />;
  }
  if (verification.status === 'error') {
    return (
      <MarketplaceEmpty
        actionLabel={t('ui.runtime.retry')}
        icon="produce"
        message={t('agritech.marketplace.verify.unavailableDescription')}
        onAction={onRetry}
        title={t('agritech.marketplace.verify.unavailable')}
      />
    );
  }
  const current = verification.data;
  if (current) {
    const terminalStatus = <VerificationTerminalStatus current={current} navigate={navigate} t={t} />;
    if (current.status === 'verified' || current.status === 'pending') {
      return terminalStatus;
    }
  }
  const activeRole = current?.role ?? role;
  const requiredDocuments = verificationDocumentsByRole[activeRole];
  const storedDocumentByKind = new Map(current?.documents.map((document) => [document.kind, document]));
  const providerReady = Boolean(readiness.data?.oneId.ready && readiness.data.verificationDocuments.ready);
  const documentsReady = requiredDocuments.every((kind) => storedDocumentByKind.has(kind));
  const canSubmit = Boolean(current?.oneIdLinked && documentsReady && providerReady);
  return (
    <div className="dh-verification-page">
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.verify.identity')}</p>
          <h1>{t('agritech.marketplace.verify.title')}</h1>
          <p>{t('agritech.marketplace.verify.reason')}</p>
        </div>
      </div>
      <div className="dh-verification-layout">
        <section className="dh-panel">
          <VerificationRejection current={current} t={t} />
          <div className="dh-panel__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.verify.step.role')}</p>
              <h2>{t('agritech.marketplace.account.role.none')}</h2>
            </div>
            <span className="dh-seal">
              <MarketplaceIcon name="shield" />
            </span>
          </div>
          <div className="dh-role-grid">
            {(['farmer', 'seller', 'buyer'] as const).map((value) => (
              <button
                aria-pressed={activeRole === value}
                className={activeRole === value ? 'is-active' : ''}
                disabled={Boolean(current)}
                key={value}
                onClick={() => {
                  setRole(value);
                }}
                type="button"
              >
                <MarketplaceIcon name={verificationRoleIcons[value]} />
                <strong>{t(`agritech.marketplace.account.role.${value}`)}</strong>
                <span>{t(`agritech.marketplace.verify.role.${value}Description`)}</span>
              </button>
            ))}
          </div>
          <h3>{t('agritech.marketplace.verify.requiredDocuments')}</h3>
          <VerificationEvidenceList
            current={current}
            onUploadDocument={onUploadDocument}
            pendingAction={pendingAction}
            readiness={readiness}
            requiredDocuments={requiredDocuments}
            storedDocumentByKind={storedDocumentByKind}
            t={t}
          />
        </section>
        <aside className="dh-panel dh-provider-state">
          <span className="dh-provider-state__icon">
            <MarketplaceIcon name="shield" />
          </span>
          <p className="dh-eyebrow">{t('agritech.marketplace.verify.provider')}</p>
          <h2>{t('agritech.marketplace.verify.identity')}</h2>
          <p>{t('agritech.marketplace.verify.reason')}</p>
          {readiness.status === 'loading' || readiness.status === 'idle' ? (
            <p aria-live="polite" className="dh-state-inline" role="status">
              {t('agritech.marketplace.verify.providerChecking')}
            </p>
          ) : null}
          {readiness.status === 'error' ? (
            <div>
              <p className="dh-state-inline dh-state-inline--error">
                {t('agritech.marketplace.verify.providerUnavailableDescription')}
              </p>
              <button className="dh-text-button" onClick={onRetry} type="button">
                {t('ui.runtime.retry')}
              </button>
            </div>
          ) : null}
          {readiness.data ? (
            <ul className="dh-document-list">
              {(['oneId', 'verificationDocuments'] as const).map((capability) => (
                <li key={capability}>
                  <MarketplaceIcon name={readiness.data?.[capability].ready ? 'check' : 'shield'} />
                  <span>
                    {t(`agritech.marketplace.verify.capability.${capability}`)} ·{' '}
                    {t(`agritech.marketplace.verify.providerMode.${readiness.data?.[capability].mode}`)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="dh-fine-print">{t('agritech.marketplace.verify.storageNotice')}</p>
          <VerificationActions
            canSubmit={canSubmit}
            current={current}
            onLinkIdentity={onLinkIdentity}
            onStart={onStart}
            onSubmit={onSubmit}
            pendingAction={pendingAction}
            readiness={readiness}
            role={activeRole}
            t={t}
          />
          {current && !canSubmit ? (
            <p className="dh-fine-print">{t('agritech.marketplace.verify.completeRequiredSteps')}</p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MarketplaceStatus({
  children,
  icon,
  message,
  title,
}: Readonly<{ children?: ReactNode; icon: 'contract' | 'shield'; message: string; title: string }>) {
  return (
    <div className="dh-status-page">
      <span className="dh-seal">
        <MarketplaceIcon name={icon} />
      </span>
      <p className="dh-eyebrow">{title}</p>
      <h1>{title}</h1>
      <p>{message}</p>
      {children}
    </div>
  );
}

interface AccountProps {
  contracts: Resource<ContractViewDto[]>;
  dashboard: Resource<MarketplaceRoleDashboardDto | null>;
  locale: Locale;
  management?: ReactNode;
  navigate: MarketplaceNavigate;
  onRetry: () => void;
  samples: Resource<MarketplaceSampleDto[]>;
  t: MarketplaceTranslate;
  verification: Resource<VerificationViewDto | null>;
}

const contractCountForDashboard = (dashboard: MarketplaceRoleDashboardDto): number => {
  if (dashboard.buyer) {
    return dashboard.buyer.activeDeals + dashboard.buyer.completedDeals;
  }
  if (dashboard.seller) {
    return dashboard.seller.activeDeals + dashboard.seller.completedDeals;
  }
  return 0;
};

export function MarketplaceAccount({
  contracts,
  dashboard,
  locale,
  management,
  navigate,
  onRetry,
  samples,
  t,
  verification,
}: Readonly<AccountProps>) {
  const current = verification.data;
  const roleDashboard = dashboard.data;
  let dashboardContent: ReactNode;
  if (dashboard.status === 'loading' || dashboard.status === 'idle') {
    dashboardContent = <MarketplaceSkeleton count={2} />;
  } else if (dashboard.status === 'error') {
    dashboardContent = (
      <div>
        <p className="dh-state-inline dh-state-inline--error">
          {t('agritech.marketplace.account.dashboardUnavailable')}
        </p>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  } else if (!roleDashboard) {
    dashboardContent = <p className="dh-muted">{t('agritech.marketplace.account.dashboardEmpty')}</p>;
  } else {
    const dashboardOrderCount = roleDashboard.buyer?.openPurchaseRequests ?? roleDashboard.seller?.pendingOffers ?? 0;
    const stats = [
      [dashboardOrderCount, 'agritech.marketplace.account.stat.orders'],
      [contractCountForDashboard(roleDashboard), 'agritech.marketplace.account.stat.contracts'],
    ] as const;
    dashboardContent = (
      <section aria-label={t('agritech.marketplace.account.dashboard')} className="dh-stat-grid">
        {stats.map(([value, key]) => (
          <div key={key}>
            <strong>{value}</strong>
            <span>{t(key)}</span>
          </div>
        ))}
      </section>
    );
  }
  let contractContent: ReactNode;
  if (contracts.status === 'loading' || contracts.status === 'idle') {
    contractContent = <MarketplaceSkeleton count={2} />;
  } else if (contracts.status === 'error') {
    contractContent = (
      <div>
        <p className="dh-state-inline dh-state-inline--error">
          {t('agritech.marketplace.account.contractsUnavailable')}
        </p>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  } else if (contracts.data.length > 0) {
    contractContent = (
      <div className="dh-compact-list">
        {contracts.data.map((contract) => (
          <button
            key={contract.id}
            onClick={() => {
              navigate(`/contracts/${contract.id}`);
            }}
            type="button"
          >
            <span>
              <strong>{contract.subject}</strong>
              <small>{formatDate(contract.updatedAt, locale)}</small>
            </span>
            <span>
              <b>{formatMoney(contract.amountUzs, locale)}</b>
              <em>{t(`agritech.marketplace.contract.status.${contract.status}`)}</em>
            </span>
            <MarketplaceIcon name="arrow" />
          </button>
        ))}
      </div>
    );
  } else {
    contractContent = <p className="dh-muted">{t('agritech.marketplace.empty')}</p>;
  }

  let sampleContent: ReactNode;
  if (samples.status === 'loading' || samples.status === 'idle') {
    sampleContent = <MarketplaceSkeleton count={2} />;
  } else if (samples.status === 'error') {
    sampleContent = (
      <div>
        <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.samples.unavailable')}</p>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  } else if (samples.data.length > 0) {
    sampleContent = (
      <div className="dh-sample-list">
        {samples.data.map((sample) => (
          <div key={sample.id}>
            <MarketplaceIcon name="seeds" />
            <span>
              <strong>{sample.listing.title}</strong>
              <small>{formatDate(sample.createdAt, locale)}</small>
            </span>
            <em>{t(`agritech.marketplace.samples.status.${sample.status}`)}</em>
          </div>
        ))}
      </div>
    );
  } else {
    sampleContent = <p className="dh-muted">{t('agritech.marketplace.samples.empty')}</p>;
  }
  return (
    <div className="dh-page-stack">
      <div className="dh-account-hero">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.account.dashboard')}</p>
          <h1>{t('agritech.marketplace.account.title')}</h1>
          <p>
            {(roleDashboard ?? current)
              ? t(`agritech.marketplace.account.role.${roleDashboard?.role ?? current?.role}`)
              : t('agritech.marketplace.account.role.none')}
          </p>
        </div>
        <div className={`dh-verification-chip dh-verification-chip--${current?.status ?? 'none'}`}>
          <MarketplaceIcon name="shield" />
          <span>
            {current ? t(`agritech.marketplace.verify.${current.status}`) : t('agritech.marketplace.verify.notStarted')}
          </span>
        </div>
      </div>
      {dashboardContent}
      {!current || current.status !== 'verified' ? (
        <div className="dh-callout">
          <div>
            <MarketplaceIcon name="shield" />
            <span>
              <strong>{t('agritech.marketplace.verify.title')}</strong>
              <p>{t('agritech.marketplace.verify.reason')}</p>
            </span>
          </div>
          <button
            className="dh-button dh-button--secondary"
            onClick={() => {
              navigate('/verification');
            }}
            type="button"
          >
            {t('agritech.marketplace.verification')}
          </button>
        </div>
      ) : null}
      <div className="dh-account-grid">
        <section className="dh-panel">
          <div className="dh-panel__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.account.contracts')}</p>
              <h2>{t('agritech.marketplace.contract.title')}</h2>
            </div>
          </div>
          {contractContent}
        </section>
        <section className="dh-panel">
          <div className="dh-panel__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.samples.title')}</p>
              <h2>{t('agritech.marketplace.account.samples')}</h2>
            </div>
          </div>
          {sampleContent}
          <p className="dh-fine-print">{t('agritech.marketplace.samples.deliveryDisclaimer')}</p>
        </section>
      </div>
      {management}
    </div>
  );
}

type ContractIdentityStatus = ResourceStatus | VerificationViewDto['status'];

interface ContractProps {
  contract?: ContractViewDto;
  identityStatus: ContractIdentityStatus;
  lifecycle: Resource<ContractLifecycleDto | null>;
  locale: Locale;
  navigate: MarketplaceNavigate;
  onDownloadArtifact: (contract: ContractViewDto) => void;
  onOpenDispute: (contract: ContractViewDto, reason: DisputeReason) => void;
  onQuote: (contract: ContractViewDto, input: MarketplaceContractDeliveryQuoteInput) => void;
  onRefreshArtifact: (contract: ContractViewDto) => void;
  onRetry: () => void;
  onSign: (contract: ContractViewDto) => void;
  onUploadDisputeEvidence: (contract: ContractViewDto, evidence: File) => void;
  onAdvanceLifecycle: (contract: ContractViewDto, action: MarketplaceContractLifecycleAction) => void;
  pendingAction?: string;
  status: ResourceStatus;
  t: MarketplaceTranslate;
}

function ContractEvidencePanel({
  canMutate,
  contract,
  lifecycle,
  onDownloadArtifact,
  onOpenDispute,
  onRefreshArtifact,
  onUploadDisputeEvidence,
  pendingAction,
  t,
}: Readonly<{
  canMutate: boolean;
  contract: ContractViewDto;
  lifecycle: ContractLifecycleDto;
  onDownloadArtifact: () => void;
  onOpenDispute: (reason: DisputeReason) => void;
  onRefreshArtifact: () => void;
  onUploadDisputeEvidence: (evidence: File) => void;
  pendingAction?: string;
  t: MarketplaceTranslate;
}>) {
  const [disputeReason, setDisputeReason] = useState<DisputeReason>('delivery_issue');
  const [evidence, setEvidence] = useState<File>();
  const disputeOpen = lifecycle.dispute?.status === 'open';
  return (
    <section className="dh-panel dh-contract-evidence">
      <p className="dh-eyebrow">{t('agritech.marketplace.contract.artifact')}</p>
      <h2>{t('agritech.marketplace.contract.documentsAndDispute')}</h2>
      {lifecycle.artifact ? (
        <dl className="dh-facts">
          <div>
            <dt>{t('agritech.marketplace.contract.artifactVersion')}</dt>
            <dd>{lifecycle.artifact.templateVersion}</dd>
          </div>
          <div>
            <dt>{t('agritech.marketplace.contract.artifactSize')}</dt>
            <dd>{lifecycle.artifact.byteSize}</dd>
          </div>
          <div>
            <dt>{t('agritech.marketplace.contract.provider')}</dt>
            <dd>{lifecycle.artifact.providerName}</dd>
          </div>
          <div>
            <dt>{t('agritech.marketplace.contract.providerMode')}</dt>
            <dd>{t(`agritech.marketplace.contract.providerMode.${lifecycle.artifact.providerMode}`)}</dd>
          </div>
        </dl>
      ) : (
        <p className="dh-muted">{t('agritech.marketplace.contract.artifactUnavailable')}</p>
      )}
      {lifecycle.artifact?.simulation ? (
        <span className="dh-badge dh-badge--neutral">{t('agritech.marketplace.contract.simulationDisclosure')}</span>
      ) : null}
      {lifecycle.artifact?.watermark ? (
        <p className="dh-fine-print">{t('agritech.marketplace.contract.simulationWatermark')}</p>
      ) : null}
      {canMutate ? (
        <div className="dh-management-actions">
          <button
            className="dh-button dh-button--secondary"
            disabled={pendingAction === `artifact:${contract.id}`}
            onClick={onRefreshArtifact}
            type="button"
          >
            {t('agritech.marketplace.contract.refreshArtifact')}
          </button>
          {lifecycle.artifact ? (
            <button
              className="dh-button dh-button--secondary"
              disabled={pendingAction === `artifact-download:${contract.id}`}
              onClick={onDownloadArtifact}
              type="button"
            >
              {t('agritech.marketplace.contract.downloadArtifact')}
            </button>
          ) : null}
        </div>
      ) : null}
      <hr />
      <h3>{t('agritech.marketplace.contract.dispute')}</h3>
      {lifecycle.dispute ? (
        <p className="dh-state-inline">
          {t(`agritech.marketplace.contract.disputeStatus.${lifecycle.dispute.status}`)} ·{' '}
          {t(`agritech.marketplace.contract.disputeReason.${lifecycle.dispute.reason}`)}
        </p>
      ) : null}
      {!lifecycle.dispute && canMutate ? (
        <form
          className="dh-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            onOpenDispute(disputeReason);
          }}
        >
          <label>
            <span>{t('agritech.marketplace.contract.disputeReason')}</span>
            <select
              onChange={(event) => {
                setDisputeReason(event.target.value as DisputeReason);
              }}
              value={disputeReason}
            >
              {(['delivery_issue', 'quality_issue', 'quantity_issue', 'other'] as const).map((reason) => (
                <option key={reason} value={reason}>
                  {t(`agritech.marketplace.contract.disputeReason.${reason}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="dh-button dh-button--secondary"
            disabled={pendingAction === `dispute:${contract.id}`}
            type="submit"
          >
            {t('agritech.marketplace.contract.openDispute')}
          </button>
        </form>
      ) : null}
      {!lifecycle.dispute && !canMutate ? (
        <p className="dh-muted">{t('agritech.marketplace.cart.verifyRequired')}</p>
      ) : null}
      {disputeOpen && canMutate ? (
        <form
          className="dh-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (evidence) {
              onUploadDisputeEvidence(evidence);
            }
          }}
        >
          <label>
            <span>{t('agritech.marketplace.contract.disputeEvidence')}</span>
            <input
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => {
                setEvidence(event.target.files?.[0]);
              }}
              required
              type="file"
            />
          </label>
          <button
            className="dh-button dh-button--secondary"
            disabled={!evidence || pendingAction === `dispute-evidence:${contract.id}`}
            type="submit"
          >
            {t('agritech.marketplace.contract.uploadEvidence')}
          </button>
        </form>
      ) : null}
      {lifecycle.disputeEvidence.length > 0 ? (
        <ul className="dh-document-list">
          {lifecycle.disputeEvidence.map((item) => (
            <li key={item.id}>
              <MarketplaceIcon name="contract" />
              <span>
                {item.fileName} · {item.byteSize}
                {item.simulation ? ` · ${t('agritech.marketplace.contract.simulationDisclosure')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const lifecycleEventTranslationKeys: Record<string, string> = {
  artifact_stored: 'marketplace.contract.notification.artifactStored',
  buyer_consented: 'marketplace.contract.notification.buyerConsented',
  buyer_payment_confirmed: 'marketplace.contract.notification.buyerPaymentConfirmed',
  buyer_repaid: 'marketplace.contract.notification.buyerRepaid',
  contract_completed: 'marketplace.contract.notification.contractCompleted',
  factoring_approved: 'marketplace.contract.notification.factoringApproved',
  factoring_closed: 'marketplace.contract.notification.factoringClosed',
  factoring_rejected: 'marketplace.contract.notification.factoringRejected',
  factoring_requested: 'marketplace.contract.notification.factoringRequested',
  fulfillment_delivered: 'marketplace.contract.notification.fulfillmentDelivered',
  fulfillment_ready: 'marketplace.contract.notification.fulfillmentReady',
  fulfillment_started: 'marketplace.contract.notification.fulfillmentStarted',
  seller_consented: 'marketplace.contract.notification.sellerConsented',
  seller_paid: 'marketplace.contract.notification.sellerPaid',
  seller_receipt_confirmed: 'marketplace.contract.notification.sellerReceiptConfirmed',
  signature_recorded: 'marketplace.contract.notification.signatureRecorded',
};

function nextFulfillmentAction(
  contract: ContractViewDto,
  lifecycle: ContractLifecycleDto,
): MarketplaceContractLifecycleAction | undefined {
  if (lifecycle.fulfillment.status === 'ready' && contract.actorParty === 'seller') {
    return { body: { command: 'start' }, kind: 'fulfillment' };
  }
  if (lifecycle.fulfillment.status === 'in_progress' && contract.actorParty === 'seller') {
    return { body: { command: 'mark_delivered' }, kind: 'fulfillment' };
  }
  if (lifecycle.fulfillment.status === 'delivered' && contract.actorParty === 'buyer') {
    return { body: { command: 'accept_delivery' }, kind: 'fulfillment' };
  }
  return undefined;
}

function nextDirectSettlementAction(
  contract: ContractViewDto,
  lifecycle: ContractLifecycleDto,
): MarketplaceContractLifecycleAction | undefined {
  if (lifecycle.settlement.status === 'awaiting_buyer_confirmation' && contract.actorParty === 'buyer') {
    return { body: { command: 'confirm_buyer_payment' }, kind: 'settlement' };
  }
  if (lifecycle.settlement.status === 'buyer_confirmed' && contract.actorParty === 'seller') {
    return { body: { command: 'confirm_seller_receipt' }, kind: 'settlement' };
  }
  return undefined;
}

function nextFactoringSettlementAction(
  contract: ContractViewDto,
  lifecycle: ContractLifecycleDto,
): MarketplaceContractLifecycleAction | undefined {
  const { settlement } = lifecycle;
  if (settlement.status === 'awaiting_consents') {
    const alreadyConsented =
      contract.actorParty === 'buyer'
        ? 'buyerConsentedAt' in settlement && Boolean(settlement.buyerConsentedAt)
        : 'sellerConsentedAt' in settlement && Boolean(settlement.sellerConsentedAt);
    return alreadyConsented ? undefined : { kind: 'factoring-consent' };
  }
  if (settlement.status === 'ready_to_request' && contract.actorParty === 'buyer') {
    return { body: { command: 'request_decision' }, kind: 'settlement' };
  }
  if (settlement.status === 'approved' && contract.actorParty === 'seller') {
    return { body: { command: 'record_seller_payout' }, kind: 'settlement' };
  }
  if (settlement.status === 'seller_paid' && contract.actorParty === 'buyer') {
    return { body: { command: 'record_buyer_repayment' }, kind: 'settlement' };
  }
  if (settlement.status === 'buyer_repaid' && contract.actorParty === 'buyer') {
    return { body: { command: 'close' }, kind: 'settlement' };
  }
  return undefined;
}

function nextLifecycleAction(
  contract: ContractViewDto,
  lifecycle: ContractLifecycleDto,
): MarketplaceContractLifecycleAction | undefined {
  if (contract.status !== 'active' || lifecycle.dispute?.status === 'open') {
    return undefined;
  }
  const fulfillmentAction = nextFulfillmentAction(contract, lifecycle);
  if (fulfillmentAction) {
    return fulfillmentAction;
  }
  return contract.factoringEnabled
    ? nextFactoringSettlementAction(contract, lifecycle)
    : nextDirectSettlementAction(contract, lifecycle);
}

function ContractLifecyclePanel({
  canAdvance,
  contract,
  lifecycle,
  onAdvance,
  onRetry,
  pending,
  t,
}: Readonly<{
  canAdvance: boolean;
  contract: ContractViewDto;
  lifecycle: Resource<ContractLifecycleDto | null>;
  onAdvance: (action: MarketplaceContractLifecycleAction) => void;
  onRetry: () => void;
  pending: boolean;
  t: MarketplaceTranslate;
}>) {
  const current = lifecycle.data;
  if (lifecycle.status === 'loading' || lifecycle.status === 'idle') {
    return <MarketplaceSkeleton count={1} />;
  }
  if (lifecycle.status === 'empty') {
    return <p className="dh-muted">{t('agritech.marketplace.contract.artifactUnavailable')}</p>;
  }
  if (lifecycle.status === 'error' || !current) {
    return (
      <div>
        <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.error')}</p>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  }
  const latestEvent = current.timeline.at(-1);
  const statusKey = latestEvent
    ? (lifecycleEventTranslationKeys[latestEvent.eventType] ?? 'marketplace.contract.notification.updated')
    : 'agritech.marketplace.contract.settlement.awaiting';
  const action = canAdvance ? nextLifecycleAction(contract, current) : undefined;
  return (
    <>
      <h2>
        {t(
          contract.factoringEnabled
            ? 'agritech.marketplace.contract.settlement.factoring'
            : 'agritech.marketplace.contract.settlement.direct',
        )}
      </h2>
      <p>{t('agritech.marketplace.contract.settlement.description')}</p>
      <span className="dh-badge dh-badge--neutral">{t(statusKey)}</span>
      {current.settlement.simulation || latestEvent?.simulation ? (
        <span className="dh-badge dh-badge--neutral">{t('agritech.marketplace.contract.simulationDisclosure')}</span>
      ) : null}
      {action ? (
        <button
          className="dh-button dh-button--secondary"
          disabled={pending}
          onClick={() => {
            onAdvance(action);
          }}
          type="button"
        >
          {t('agritech.marketplace.contract.settlement.advance')}
        </button>
      ) : null}
    </>
  );
}

function hasCurrentPartySigned(contract: ContractViewDto): boolean {
  if (contract.actorParty === 'buyer') {
    return Boolean(contract.buyerSignedAt);
  }
  return Boolean(contract.sellerSignedAt);
}

interface ContractConsentState {
  canSign: boolean;
  icon: MarketplaceIconName;
  messageKey: string;
}

function contractConsentState(contract: ContractViewDto, identityStatus: ContractIdentityStatus): ContractConsentState {
  if (identityStatus === 'error') {
    return {
      canSign: false,
      icon: 'shield',
      messageKey: 'agritech.marketplace.verify.unavailableDescription',
    };
  }
  if (identityStatus !== 'verified') {
    return {
      canSign: false,
      icon: 'shield',
      messageKey: 'agritech.marketplace.cart.verifyRequired',
    };
  }
  if (contract.status === 'legacy_review_required') {
    return {
      canSign: false,
      icon: 'shield',
      messageKey: 'agritech.marketplace.contract.legacyReviewRequiredDescription',
    };
  }
  if (contract.deliveryTerms === 'seller_delivery' && contract.deliveryPriceUzs === undefined) {
    return {
      canSign: false,
      icon: 'produce',
      messageKey: 'agritech.marketplace.contract.deliveryQuoteRequired',
    };
  }
  if (hasCurrentPartySigned(contract)) {
    return {
      canSign: false,
      icon: 'check',
      messageKey: 'agritech.marketplace.contract.yourSignatureRecorded',
    };
  }
  const isSignable = contract.status === 'draft' || contract.status === 'signed';
  return {
    canSign: isSignable,
    icon: 'shield',
    messageKey: 'agritech.marketplace.contract.notYourContract',
  };
}

const canActorQuoteDelivery = (contract: ContractViewDto, quotePending: boolean): boolean =>
  quotePending &&
  contract.actorParty === 'seller' &&
  contract.status === 'draft' &&
  !contract.buyerSignedAt &&
  !contract.sellerSignedAt;

function ContractConsentAction({
  consent,
  contract,
  identityStatus,
  onRetry,
  onSign,
  pendingAction,
  t,
}: Readonly<{
  consent: ContractConsentState;
  contract: ContractViewDto;
  identityStatus: ContractIdentityStatus;
  onRetry: () => void;
  onSign: (contract: ContractViewDto) => void;
  pendingAction?: string;
  t: MarketplaceTranslate;
}>) {
  if (identityStatus === 'error') {
    return (
      <div>
        <span className="dh-state-inline dh-state-inline--error">
          <MarketplaceIcon name={consent.icon} />
          {t(consent.messageKey)}
        </span>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  }
  if (consent.canSign) {
    return (
      <button
        className="dh-button dh-button--primary"
        disabled={pendingAction === `sign:${contract.id}`}
        onClick={() => {
          onSign(contract);
        }}
        type="button"
      >
        <MarketplaceIcon name="contract" />
        {t('agritech.marketplace.contract.signOwnParty')}
      </button>
    );
  }
  return (
    <span className="dh-state-inline">
      <MarketplaceIcon name={consent.icon} />
      {t(consent.messageKey)}
    </span>
  );
}

export function MarketplaceContract({
  contract,
  identityStatus,
  lifecycle,
  locale,
  navigate,
  onDownloadArtifact,
  onAdvanceLifecycle,
  onOpenDispute,
  onQuote,
  onRefreshArtifact,
  onRetry,
  onSign,
  onUploadDisputeEvidence,
  pendingAction,
  status,
  t,
}: Readonly<ContractProps>) {
  const [quoteInput, setQuoteInput] = useState<MarketplaceContractDeliveryQuoteInput>({ deliveryPriceUzs: 0 });
  if (status === 'loading' || status === 'idle') {
    return <MarketplaceSkeleton count={3} />;
  }
  if (!contract) {
    return (
      <MarketplaceEmpty
        actionLabel={t('agritech.marketplace.back')}
        icon="produce"
        message={t('agritech.marketplace.contract.notFoundDescription')}
        onAction={() => {
          navigate('/account');
        }}
        title={t('agritech.marketplace.contract.notFound')}
      />
    );
  }
  const consent = contractConsentState(contract, identityStatus);
  const canMutate = identityStatus === 'verified';
  const deliveryQuotePending = contract.deliveryTerms === 'seller_delivery' && contract.deliveryPriceUzs === undefined;
  const canQuoteDelivery = canMutate && canActorQuoteDelivery(contract, deliveryQuotePending);
  const timeline = [
    ['generated', contract.createdAt, true],
    ['buyerSigned', contract.buyerSignedAt, Boolean(contract.buyerSignedAt)],
    ['sellerSigned', contract.sellerSignedAt, Boolean(contract.sellerSignedAt)],
    ['active', contract.status === 'active' ? contract.updatedAt : undefined, contract.status === 'active'],
  ] as const;
  const payableTotal = deliveryQuotePending ? undefined : contract.amountUzs + (contract.deliveryPriceUzs ?? 0);
  let deliveryPriceLabel = t('agritech.marketplace.product.byAgreement');
  if (deliveryQuotePending) {
    deliveryPriceLabel = t('agritech.marketplace.contract.deliveryQuoteRequired');
  } else if (contract.deliveryPriceUzs !== undefined) {
    deliveryPriceLabel = formatMoney(contract.deliveryPriceUzs, locale);
  }
  return (
    <div className="dh-contract-page">
      <button
        className="dh-text-button dh-back"
        onClick={() => {
          navigate('/account');
        }}
        type="button"
      >
        <MarketplaceIcon name="arrow" />
        {t('agritech.marketplace.back')}
      </button>
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">
            {t('agritech.marketplace.contract.title')} · {contract.id}
          </p>
          <h1>{contract.subject}</h1>
          <p>{t(`agritech.marketplace.contract.status.${contract.status}`)}</p>
        </div>
        <span className="dh-seal">
          <MarketplaceIcon name="contract" />
        </span>
      </div>
      <div className="dh-contract-layout">
        <article className="dh-panel dh-contract-document">
          <div className="dh-contract-parties">
            <div>
              <span>{t('agritech.marketplace.contract.buyer')}</span>
              <strong>{contract.buyerPartySnapshot.legalName}</strong>
              <small>{contract.buyerPartySnapshot.region}</small>
              {contract.buyerSignedAt && (
                <small>
                  <MarketplaceIcon name="check" />
                  {t('agritech.marketplace.contract.signedAt', { date: formatDate(contract.buyerSignedAt, locale) })}
                </small>
              )}
            </div>
            <div>
              <span>{t('agritech.marketplace.contract.seller')}</span>
              <strong>{contract.sellerPartySnapshot.legalName}</strong>
              <small>{contract.sellerPartySnapshot.region}</small>
              {contract.sellerSignedAt && (
                <small>
                  <MarketplaceIcon name="check" />
                  {t('agritech.marketplace.contract.signedAt', { date: formatDate(contract.sellerSignedAt, locale) })}
                </small>
              )}
            </div>
          </div>
          <dl className="dh-contract-terms">
            <div>
              <dt>{t('agritech.marketplace.contract.subject')}</dt>
              <dd>{contract.subject}</dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.contract.amount')}</dt>
              <dd>{formatMoney(contract.amountUzs, locale)}</dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.product.delivery')}</dt>
              <dd>{t(deliveryTranslationKeys[contract.deliveryTerms])}</dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.contract.deliveryPrice')}</dt>
              <dd>{deliveryPriceLabel}</dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.contract.deliveryDays')}</dt>
              <dd>
                {contract.deliveryDays
                  ? t('agritech.marketplace.orders.deliveryDays', { count: contract.deliveryDays })
                  : t('agritech.marketplace.product.byAgreement')}
              </dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.contract.deliveryNote')}</dt>
              <dd>{contract.deliveryNote ?? t('agritech.marketplace.product.byAgreement')}</dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.contract.total')}</dt>
              <dd>
                {payableTotal === undefined
                  ? t('agritech.marketplace.contract.deliveryQuoteRequired')
                  : formatMoney(payableTotal, locale)}
              </dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.contract.source')}</dt>
              <dd>
                {contract.sourceType
                  ? t(`agritech.marketplace.contract.source.${contract.sourceType}`)
                  : t('agritech.marketplace.contract.source.direct')}
              </dd>
            </div>
          </dl>
          {contract.lines.length > 0 && (
            <div className="dh-contract-lines">
              <h2>{t('agritech.marketplace.contract.lines')}</h2>
              {contract.lines.map((item) => (
                <div key={item.sourcePublicationId}>
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <strong>{formatMoney(item.lineTotalUzs, locale)}</strong>
                </div>
              ))}
            </div>
          )}
          {canQuoteDelivery ? (
            <form
              className="dh-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                onQuote(contract, quoteInput);
              }}
            >
              <p>{t('agritech.marketplace.contract.deliveryQuoteDescription')}</p>
              <label>
                <span>{t('agritech.marketplace.contract.deliveryPrice')}</span>
                <input
                  min="1"
                  onChange={(event) => {
                    setQuoteInput((value) => ({ ...value, deliveryPriceUzs: Number(event.target.value) }));
                  }}
                  required
                  type="number"
                  value={quoteInput.deliveryPriceUzs || ''}
                />
              </label>
              <label>
                <span>{t('agritech.marketplace.orders.timing')}</span>
                <input
                  min="1"
                  onChange={(event) => {
                    setQuoteInput((value) => ({
                      ...value,
                      deliveryDays: event.target.value ? Number(event.target.value) : undefined,
                    }));
                  }}
                  type="number"
                  value={quoteInput.deliveryDays ?? ''}
                />
              </label>
              <label>
                <span>{t('agritech.marketplace.orders.deliveryNote')}</span>
                <input
                  maxLength={500}
                  onChange={(event) => {
                    setQuoteInput((value) => ({ ...value, deliveryNote: event.target.value || undefined }));
                  }}
                  value={quoteInput.deliveryNote ?? ''}
                />
              </label>
              <button
                className="dh-button dh-button--primary"
                disabled={pendingAction === `quote:${contract.id}`}
                type="submit"
              >
                {t('agritech.marketplace.contract.saveDeliveryQuote')}
              </button>
            </form>
          ) : null}
          <div className="dh-contract-consent">
            <p>{t('agritech.marketplace.contract.consent')}</p>
            <ContractConsentAction
              consent={consent}
              contract={contract}
              identityStatus={identityStatus}
              onRetry={onRetry}
              onSign={onSign}
              pendingAction={pendingAction}
              t={t}
            />
          </div>
        </article>
        <aside className="dh-contract-sidebar">
          <section className="dh-panel">
            <p className="dh-eyebrow">{t('agritech.marketplace.contract.timeline')}</p>
            <ol className="dh-timeline">
              {timeline.map(([key, value, done]) => (
                <li className={done ? 'is-done' : ''} key={key}>
                  <span>{done ? <MarketplaceIcon name="check" /> : null}</span>
                  <div>
                    <strong>{t(`agritech.marketplace.contract.timeline.${key}`)}</strong>
                    <small>{value ? formatDate(value, locale) : t('agritech.marketplace.contract.awaiting')}</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="dh-panel dh-provider-state">
            <span className="dh-provider-state__icon">
              <MarketplaceIcon name="shield" />
            </span>
            <p className="dh-eyebrow">{t('agritech.marketplace.contract.payment')}</p>
            <ContractLifecyclePanel
              canAdvance={canMutate}
              contract={contract}
              lifecycle={lifecycle}
              onAdvance={(action) => {
                onAdvanceLifecycle(contract, action);
              }}
              onRetry={onRetry}
              pending={pendingAction === `lifecycle:${contract.id}`}
              t={t}
            />
          </section>
          {lifecycle.data ? (
            <ContractEvidencePanel
              canMutate={canMutate}
              contract={contract}
              lifecycle={lifecycle.data}
              onDownloadArtifact={() => {
                onDownloadArtifact(contract);
              }}
              onOpenDispute={(reason) => {
                onOpenDispute(contract, reason);
              }}
              onRefreshArtifact={() => {
                onRefreshArtifact(contract);
              }}
              onUploadDisputeEvidence={(evidence) => {
                onUploadDisputeEvidence(contract, evidence);
              }}
              pendingAction={pendingAction}
              t={t}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
