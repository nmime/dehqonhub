import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type {
  BuyerRequestViewDto,
  CartViewDto,
  ContractDeliveryQuoteDto,
  ContractViewDto,
  CreateRequestDto,
  OfferViewDto,
  ProductViewDto,
  RequestOfferDto,
  SampleViewDto,
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
  type MarketplaceNavigate,
  type MarketplaceTranslate,
} from './marketplace-ui';

type DeliveryTerms = 'by_agreement' | 'pickup' | 'seller_delivery';

const deliveryTranslationKeys: Record<DeliveryTerms, string> = {
  by_agreement: 'agritech.marketplace.product.byAgreement',
  pickup: 'agritech.marketplace.product.pickup',
  seller_delivery: 'agritech.marketplace.product.sellerDelivery',
};

const verificationRoleIcons: Record<'buyer' | 'farmer' | 'seller', MarketplaceIconName> = {
  buyer: 'account',
  farmer: 'seeds',
  seller: 'equipment',
};

interface CartProps {
  carts: Resource<CartViewDto[]>;
  locale: Locale;
  navigate: MarketplaceNavigate;
  onCheckout: (cart: CartViewDto, deliveryTerms: DeliveryTerms) => void;
  onUpdate: (cart: CartViewDto, productId: string, quantity: number) => void;
  pendingAction?: string;
  products: ProductViewDto[];
  t: MarketplaceTranslate;
}

export function MarketplaceCart({
  carts,
  locale,
  navigate,
  onCheckout,
  onUpdate,
  pendingAction,
  products,
  t,
}: Readonly<CartProps>) {
  const [activeId, setActiveId] = useState<string>();
  const [delivery, setDelivery] = useState<Record<string, DeliveryTerms>>({});
  const selected = carts.data.find((cart) => cart.id === activeId) ?? carts.data[0];
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const sellerNameFor = (cart: CartViewDto): string =>
    cart.items.map((item) => productById.get(item.productId)).find((product) => product?.supplierId === cart.sellerId)
      ?.supplierName ?? cart.sellerId;
  const estimatedTotal =
    selected?.items.reduce(
      (total, item) => total + (productById.get(item.productId)?.priceUzs ?? 0) * item.quantity,
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
            const product = productById.get(item.productId);
            return (
              <article className="dh-cart-line" key={item.productId}>
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
                  <span>{product ? `${formatMoney(product.priceUzs, locale)} / ${product.unit}` : item.productId}</span>
                </div>
                <div aria-label={t('agritech.marketplace.product.quantity')} className="dh-stepper">
                  <button
                    aria-label={t('agritech.marketplace.cart.decrease')}
                    disabled={pendingAction === `cart-update:${item.productId}`}
                    onClick={() => {
                      onUpdate(selected, item.productId, item.quantity - 1);
                    }}
                    type="button"
                  >
                    <MarketplaceIcon name="minus" />
                  </button>
                  <output>{item.quantity}</output>
                  <button
                    aria-label={t('agritech.marketplace.cart.increase')}
                    disabled={pendingAction === `cart-update:${item.productId}`}
                    onClick={() => {
                      onUpdate(selected, item.productId, item.quantity + 1);
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
            className="dh-button dh-button--primary dh-button--block"
            disabled={pendingAction === `checkout:${selected.id}`}
            onClick={() => {
              onCheckout(selected, selectedDelivery);
            }}
            type="button"
          >
            <MarketplaceIcon name="contract" />
            {t('agritech.marketplace.cart.reviewContract')}
          </button>
          <p className="dh-fine-print">{t('agritech.marketplace.cart.contractBoundary')}</p>
        </aside>
      </div>
    </div>
  );
}

interface RequestProps {
  isVerified: boolean;
  locale: Locale;
  myRequests: Resource<BuyerRequestViewDto[]>;
  navigate: MarketplaceNavigate;
  offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  onChoose: (request: BuyerRequestViewDto, offer: OfferViewDto) => void;
  onCreate: (input: CreateRequestDto) => void;
  onOffer: (request: BuyerRequestViewDto, input: RequestOfferDto) => void;
  onRetry: () => void;
  pendingAction?: string;
  requests: Resource<BuyerRequestViewDto[]>;
  role?: string;
  t: MarketplaceTranslate;
}

const emptyRequest: CreateRequestDto = { region: '', title: '' };

export function MarketplaceRequests({
  isVerified,
  locale,
  myRequests,
  navigate,
  offersByRequest,
  onChoose,
  onCreate,
  onOffer,
  onRetry,
  pendingAction,
  requests,
  role,
  t,
}: Readonly<RequestProps>) {
  const [creating, setCreating] = useState(
    () =>
      typeof globalThis.location !== 'undefined' &&
      new URLSearchParams(globalThis.location.search).get('create') === '1',
  );
  const [requestInput, setRequestInput] = useState<CreateRequestDto>(emptyRequest);
  const [offeringId, setOfferingId] = useState<string>();
  const [offerInput, setOfferInput] = useState<RequestOfferDto>({
    deliveryTerms: 'by_agreement',
    priceUzs: 0,
  });
  const myIds = useMemo(() => new Set(myRequests.data.map((request) => request.id)), [myRequests.data]);
  const eligibleSeller = isVerified && (role === 'farmer' || role === 'seller');

  const submitRequest = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isVerified) {
      navigate('/verification');
      return;
    }
    const formDeadline = new FormData(event.currentTarget).get('deadline');
    onCreate({
      ...requestInput,
      deadline: typeof formDeadline === 'string' && formDeadline.length > 0 ? formDeadline : undefined,
    });
  };
  const submitOffer = (event: SyntheticEvent<HTMLFormElement>, request: BuyerRequestViewDto) => {
    event.preventDefault();
    onOffer(request, offerInput);
  };

  const toggleCreating = () => {
    if (isVerified) {
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
            {eligibleSeller &&
              (request.status === 'open' || request.status === 'offering') &&
              (offeringId === request.id ? (
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
                  className="dh-button dh-button--secondary"
                  onClick={() => {
                    setOfferingId(request.id);
                    setOfferInput({ deliveryTerms: 'by_agreement', priceUzs: 0 });
                  }}
                  type="button"
                >
                  {t('agritech.marketplace.orders.makeOffer')}
                </button>
              ))}
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
                      className="dh-button dh-button--secondary"
                      disabled={offer.status !== 'pending' || pendingAction === `choose:${offer.id}`}
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
        actionLabel={t('agritech.marketplace.orders.create')}
        icon="search"
        message={t('agritech.marketplace.orders.emptyDescription')}
        onAction={() => {
          setCreating(true);
        }}
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
        <button className="dh-button dh-button--primary" onClick={toggleCreating} type="button">
          <MarketplaceIcon name="plus" />
          {t('agritech.marketplace.orders.create')}
        </button>
      </div>

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
  onRetry: () => void;
  t: MarketplaceTranslate;
  verification: Resource<VerificationViewDto | null>;
}

export function MarketplaceVerification({ navigate, onRetry, t, verification }: Readonly<VerificationProps>) {
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
  if (current?.status === 'verified') {
    return (
      <MarketplaceStatus
        icon="shield"
        message={t('agritech.marketplace.verify.success')}
        title={t('agritech.marketplace.verify.verified')}
      >
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
  if (current?.status === 'pending') {
    return (
      <MarketplaceStatus
        icon="contract"
        message={t('agritech.marketplace.verify.pendingDescription')}
        title={t('agritech.marketplace.verify.pending')}
      >
        <p className="dh-fine-print">{t('agritech.marketplace.verify.noFixedReviewTime')}</p>
      </MarketplaceStatus>
    );
  }
  if (current?.status === 'rejected') {
    return (
      <MarketplaceStatus
        icon="shield"
        message={
          current.rejectionReason
            ? t(`agritech.marketplace.verify.rejection.${current.rejectionReason}`)
            : t('agritech.marketplace.verify.rejectedDescription')
        }
        title={t('agritech.marketplace.verify.rejected')}
      >
        <p className="dh-fine-print">{t('agritech.marketplace.verify.correctionUnavailable')}</p>
      </MarketplaceStatus>
    );
  }

  const documents: Record<typeof role, string[]> = {
    buyer: ['id', 'business'],
    farmer: ['id', 'land', 'lease', 'cadastre', 'farm'],
    seller: ['id', 'business', 'warehouse'],
  };
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
                aria-pressed={role === value}
                className={role === value ? 'is-active' : ''}
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
          <ul className="dh-document-list">
            {documents[role].map((document) => (
              <li key={document}>
                <MarketplaceIcon name="contract" />
                <span>{t(`agritech.marketplace.verify.doc.${document}`)}</span>
              </li>
            ))}
          </ul>
        </section>
        <aside className="dh-panel dh-provider-state">
          <span className="dh-provider-state__icon">
            <MarketplaceIcon name="shield" />
          </span>
          <p className="dh-eyebrow">{t('agritech.marketplace.verify.provider')}</p>
          <h2>{t('agritech.marketplace.verify.providerUnavailable')}</h2>
          <p>{t('agritech.marketplace.verify.providerUnavailableDescription')}</p>
          <div className="dh-state-inline">
            <MarketplaceIcon name="check" />
            {t('agritech.marketplace.verify.noPlaceholderSubmission')}
          </div>
          <button
            className="dh-button dh-button--secondary"
            onClick={() => {
              navigate('/account');
            }}
            type="button"
          >
            {t('agritech.marketplace.account.title')}
          </button>
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
  locale: Locale;
  myRequests: Resource<BuyerRequestViewDto[]>;
  navigate: MarketplaceNavigate;
  samples: Resource<SampleViewDto[]>;
  t: MarketplaceTranslate;
  verification: Resource<VerificationViewDto | null>;
}

export function MarketplaceAccount({
  contracts,
  locale,
  myRequests,
  navigate,
  samples,
  t,
  verification,
}: Readonly<AccountProps>) {
  const current = verification.data;
  const stats = [
    [myRequests.data.length, 'agritech.marketplace.account.stat.orders'],
    [contracts.data.length, 'agritech.marketplace.account.stat.contracts'],
    [samples.data.length, 'agritech.marketplace.account.samples'],
  ] as const;
  let contractContent: ReactNode;
  if (contracts.status === 'loading') {
    contractContent = <MarketplaceSkeleton count={2} />;
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
  if (samples.status === 'loading') {
    sampleContent = <MarketplaceSkeleton count={2} />;
  } else if (samples.data.length > 0) {
    sampleContent = (
      <div className="dh-sample-list">
        {samples.data.map((sample) => (
          <div key={sample.id}>
            <MarketplaceIcon name="seeds" />
            <span>
              <strong>{sample.productId}</strong>
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
            {current
              ? t(`agritech.marketplace.account.role.${current.role}`)
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
      <section aria-label={t('agritech.marketplace.account.dashboard')} className="dh-stat-grid">
        {stats.map(([value, key]) => (
          <div key={key}>
            <strong>{value}</strong>
            <span>{t(key)}</span>
          </div>
        ))}
      </section>
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
    </div>
  );
}

interface ContractProps {
  contract?: ContractViewDto;
  currentUserId?: string;
  identityStatus: ResourceStatus;
  locale: Locale;
  navigate: MarketplaceNavigate;
  onQuote: (contract: ContractViewDto, input: ContractDeliveryQuoteDto) => void;
  onRetry: () => void;
  onSign: (contract: ContractViewDto) => void;
  pendingAction?: string;
  status: ResourceStatus;
  t: MarketplaceTranslate;
}

function hasCurrentPartySigned(contract: ContractViewDto, currentUserId: string | undefined): boolean {
  if (!currentUserId) {
    return false;
  }
  if (currentUserId === contract.buyerUserId) {
    return Boolean(contract.buyerSignedAt);
  }
  if (currentUserId === contract.sellerUserId) {
    return Boolean(contract.sellerSignedAt);
  }
  return false;
}

interface ContractConsentState {
  canSign: boolean;
  icon: MarketplaceIconName;
  messageKey: string;
}

function contractConsentState(
  contract: ContractViewDto,
  currentUserId: string | undefined,
  identityStatus: ResourceStatus,
): ContractConsentState {
  if (identityStatus === 'error') {
    return {
      canSign: false,
      icon: 'shield',
      messageKey: 'agritech.marketplace.verify.unavailableDescription',
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
  if (hasCurrentPartySigned(contract, currentUserId)) {
    return {
      canSign: false,
      icon: 'check',
      messageKey: 'agritech.marketplace.contract.yourSignatureRecorded',
    };
  }
  const isCurrentParty = currentUserId === contract.buyerUserId || currentUserId === contract.sellerUserId;
  const isSignable = contract.status === 'draft' || contract.status === 'signed';
  return {
    canSign: isCurrentParty && isSignable,
    icon: 'shield',
    messageKey: 'agritech.marketplace.contract.notYourContract',
  };
}

export function MarketplaceContract({
  contract,
  currentUserId,
  identityStatus,
  locale,
  navigate,
  onQuote,
  onRetry,
  onSign,
  pendingAction,
  status,
  t,
}: Readonly<ContractProps>) {
  const [quoteInput, setQuoteInput] = useState<ContractDeliveryQuoteDto>({ deliveryPriceUzs: 0 });
  if (status === 'loading' || status === 'idle') {
    return <MarketplaceSkeleton count={3} />;
  }
  if (!contract) {
    return (
      <MarketplaceEmpty
        actionLabel={t('agritech.marketplace.back')}
        headingLevel={1}
        icon="produce"
        message={t('agritech.marketplace.contract.notFoundDescription')}
        onAction={() => {
          navigate('/account');
        }}
        title={t('agritech.marketplace.contract.notFound')}
      />
    );
  }
  const consent = contractConsentState(contract, currentUserId, identityStatus);
  const deliveryQuotePending = contract.deliveryTerms === 'seller_delivery' && contract.deliveryPriceUzs === undefined;
  const canQuoteDelivery =
    deliveryQuotePending &&
    currentUserId === contract.sellerUserId &&
    contract.status === 'draft' &&
    !contract.buyerSignedAt &&
    !contract.sellerSignedAt;
  let consentAction: ReactNode;
  if (identityStatus === 'error') {
    consentAction = (
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
  } else if (consent.canSign) {
    consentAction = (
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
  } else {
    consentAction = (
      <span className="dh-state-inline">
        <MarketplaceIcon name={consent.icon} />
        {t(consent.messageKey)}
      </span>
    );
  }
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
              <strong>{contract.buyerUserId}</strong>
              {contract.buyerSignedAt && (
                <small>
                  <MarketplaceIcon name="check" />
                  {t('agritech.marketplace.contract.signedAt', { date: formatDate(contract.buyerSignedAt, locale) })}
                </small>
              )}
            </div>
            <div>
              <span>{t('agritech.marketplace.contract.seller')}</span>
              <strong>{contract.sellerUserId}</strong>
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
                <div key={item.productId}>
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
            {consentAction}
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
            <h2>{t('agritech.marketplace.contract.paymentUnavailable')}</h2>
            <p>{t('agritech.marketplace.contract.paymentUnavailableDescription')}</p>
            <span className="dh-badge dh-badge--neutral">
              {t('agritech.marketplace.contract.factoringUnavailable')}
            </span>
          </section>
        </aside>
      </div>
    </div>
  );
}
