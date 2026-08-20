import { useMemo, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type {
  BuyerRequestViewDto,
  CartViewDto,
  ContractDeliveryQuoteDto,
  ContractLifecycleDto,
  ContractViewDto,
  CreateRequestDto,
  FulfillmentCommandDto,
  MarketplaceOwnedListingPublicationDto,
  MarketplaceOwnedRequestPublicationDto,
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
import { useActiveSellerCart } from '../model/use-active-seller-cart';
import { MarketplaceIcon, type MarketplaceIconName } from './marketplace-icon';
import { ProductMedia } from './marketplace-product-card';
import { marketplacePartyProfileHref } from './marketplace-public-profile';
import { MarketplaceEmpty, MarketplaceSkeleton } from './marketplace-discovery';
import {
  MarketplaceCabinet,
  marketplaceCabinetSectionFromLocation,
  type MarketplaceCabinetSection,
} from './marketplace-cabinet';
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

/* MarketplaceCart helpers: one order is one cart and one cart is one seller, so the
   cart route lists every seller sub-cart in one switcher and renders exactly one of
   them — the active cart — with its lines, delivery choice and checkout. */

interface SellerCartLine {
  lineTotal: number;
  listingPublicationId: string;
  product: MarketplaceListing | undefined;
  quantity: number;
  /** The listing left the authoritative catalog projection or sold out, so it holds no total. */
  unavailable: boolean;
}

export interface SellerCart {
  /** The server (or versioned local preview) cart this group stands for. */
  cart: CartViewDto;
  id: string;
  /** Total pieces across the group's lines, not the number of lines. */
  itemCount: number;
  lines: SellerCartLine[];
  region: string;
  sellerName: string;
  total: number;
  verified: boolean;
}

/**
 * Projects the seller-separated carts onto view groups with their own counts and
 * totals. Grouping is not a re-bucketing: an open cart already belongs to exactly
 * one server-derived seller, so each cart is one prospective order.
 */
export const groupCartsBySeller = (
  carts: readonly CartViewDto[],
  products: readonly MarketplaceListing[],
): SellerCart[] => {
  const productById = new Map(products.map((product) => [product.id, product]));
  return carts.map((cart) => {
    const lines: SellerCartLine[] = cart.items.map((item) => {
      const product = productById.get(item.listingPublicationId);
      const unavailable = product === undefined || product.status === 'out_of_stock';
      return {
        lineTotal: unavailable ? 0 : product.priceUzs * item.quantity,
        listingPublicationId: item.listingPublicationId,
        product,
        quantity: item.quantity,
        unavailable,
      };
    });
    return {
      cart,
      id: cart.id,
      itemCount: lines.reduce((count, line) => count + line.quantity, 0),
      lines,
      region: cart.seller.region,
      sellerName: cart.seller.displayName,
      total: lines.reduce((total, line) => total + line.lineTotal, 0),
      verified: lines.some((line) => line.product?.supplierVerified === true),
    };
  });
};

const cartTabId = (cartId: string): string => `dh-cart-tab-${cartId}`;
const cartPanelId = (cartId: string): string => `dh-cart-panel-${cartId}`;

function SellerSeal({ t }: Readonly<{ t: MarketplaceTranslate }>) {
  return (
    <span aria-label={t('agritech.marketplace.product.sellerVerified')} className="dh-vseal" role="img">
      <MarketplaceIcon name="check" />
    </span>
  );
}

interface CartSwitcherProps {
  locale: Locale;
  onSelect: (cartId: string) => void;
  selectedId: string;
  sellerCarts: readonly SellerCart[];
  t: MarketplaceTranslate;
}

/**
 * A tablist, not a radiogroup: the control swaps which seller sub-cart panel is
 * shown rather than submitting a value, which is exactly the ARIA tabs pattern.
 * Roving tabindex plus arrow/Home/End keys keep it keyboard operable.
 *
 * This strip is the cart route's only switching affordance. Every sub-cart is
 * already listed here with its seller, region, item count and total, so an
 * inactive cart is never repeated below as a second summary row with its own
 * swap button.
 */
function CartSwitcher({ locale, onSelect, selectedId, sellerCarts, t }: Readonly<CartSwitcherProps>) {
  const move = (index: number) => {
    const target = sellerCarts[(index + sellerCarts.length) % sellerCarts.length];
    if (!target) {
      return;
    }
    onSelect(target.id);
    const element = globalThis.document.getElementById(cartTabId(target.id));
    if (element) {
      element.focus();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    const offset = offsets[event.key];
    if (offset !== undefined) {
      event.preventDefault();
      move(index + offset);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      move(event.key === 'Home' ? 0 : sellerCarts.length - 1);
    }
  };
  return (
    <div className="dh-cart-switcher">
      <div aria-label={t('agritech.marketplace.cart.sellerCarts')} className="dh-cart-tabs" role="tablist">
        {sellerCarts.map((sellerCart, index) => (
          <button
            aria-controls={cartPanelId(sellerCart.id)}
            aria-selected={sellerCart.id === selectedId}
            className={sellerCart.id === selectedId ? 'is-active' : ''}
            id={cartTabId(sellerCart.id)}
            key={sellerCart.id}
            onClick={() => {
              onSelect(sellerCart.id);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            role="tab"
            tabIndex={sellerCart.id === selectedId ? 0 : -1}
            type="button"
          >
            <span className="dh-cart-tabs__seller">
              <span className="dh-cart-tabs__name">{sellerCart.sellerName}</span>
              {sellerCart.verified ? <SellerSeal t={t} /> : null}
            </span>
            <small>
              {sellerCart.region} · {t('agritech.marketplace.cart.itemCountValue', { count: sellerCart.itemCount })}
            </small>
            <strong className="dh-cart-tabs__total">{formatMoney(sellerCart.total, locale)}</strong>
          </button>
        ))}
      </div>
      <p className="dh-muted dh-cart-switcher__hint">{t('agritech.marketplace.cart.switcherHint')}</p>
    </div>
  );
}

interface CartLinesProps {
  locale: Locale;
  onUpdate: (cartId: string, listingPublicationId: string, quantity: number) => void;
  pendingAction: string | undefined;
  sellerCart: SellerCart;
  t: MarketplaceTranslate;
}

/** The active seller cart's line items. Quantity changes only touch this sub-cart. */
function CartLines({ locale, onUpdate, pendingAction, sellerCart, t }: Readonly<CartLinesProps>) {
  return (
    <section aria-labelledby="dh-cart-seller" className="dh-panel dh-cart-lines">
      <div className="dh-panel__head">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.cart.seller')}</p>
          <h2 className="dh-cart-lines__seller" id="dh-cart-seller">
            {sellerCart.sellerName}
            {sellerCart.verified ? <SellerSeal t={t} /> : null}
          </h2>
          <p className="dh-muted">{sellerCart.region}</p>
        </div>
        <span className="dh-badge dh-badge--soft">{t('agritech.marketplace.cart.oneSeller')}</span>
      </div>
      {sellerCart.lines.map((line) => (
        <article className="dh-cart-line" key={line.listingPublicationId}>
          {line.product ? (
            <ProductMedia compact locale={locale} product={line.product} t={t} />
          ) : (
            <span className="dh-cart-line__missing">
              <MarketplaceIcon name="produce" />
            </span>
          )}
          <div className="dh-cart-line__content">
            <strong>
              {line.product
                ? localizedProductName(line.product, locale)
                : t('agritech.marketplace.product.unavailable')}
            </strong>
            <span>
              {line.product
                ? `${formatMoney(line.product.priceUzs, locale)} / ${line.product.unit}`
                : line.listingPublicationId}
            </span>
            {line.unavailable ? (
              <em className="dh-cart-line__flag">{t('agritech.marketplace.cart.lineUnavailable')}</em>
            ) : null}
          </div>
          <div aria-label={t('agritech.marketplace.product.quantity')} className="dh-stepper">
            <button
              aria-label={t('agritech.marketplace.cart.decrease')}
              disabled={pendingAction === `cart-update:${line.listingPublicationId}`}
              onClick={() => {
                onUpdate(sellerCart.id, line.listingPublicationId, line.quantity - 1);
              }}
              type="button"
            >
              <MarketplaceIcon name="minus" />
            </button>
            <output>{line.quantity}</output>
            <button
              aria-label={t('agritech.marketplace.cart.increase')}
              disabled={pendingAction === `cart-update:${line.listingPublicationId}`}
              onClick={() => {
                onUpdate(sellerCart.id, line.listingPublicationId, line.quantity + 1);
              }}
              type="button"
            >
              <MarketplaceIcon name="plus" />
            </button>
          </div>
          <strong>{line.unavailable ? '—' : formatMoney(line.lineTotal, locale)}</strong>
        </article>
      ))}
    </section>
  );
}

interface ActiveSellerCartPanelProps {
  canCheckout: boolean;
  checkoutActionLabel: string | undefined;
  checkoutHint: string | undefined;
  delivery: DeliveryTerms;
  hasSwitcher: boolean;
  isPreview: boolean;
  locale: Locale;
  onCheckout: (cart: CartViewDto, deliveryTerms: DeliveryTerms) => void;
  onCheckoutAction: (() => void) | undefined;
  onDeliveryChange: (deliveryTerms: DeliveryTerms) => void;
  onUpdate: (cartId: string, listingPublicationId: string, quantity: number) => void;
  pendingAction: string | undefined;
  sellerCart: SellerCart;
  t: MarketplaceTranslate;
}

/**
 * The expanded seller cart: its own lines, its own total and its own checkout.
 * Checkout is scoped to this one cart, so a mixed-seller order cannot be
 * submitted from here even while the buyer's other seller carts stay open in the
 * switcher above.
 */
function ActiveSellerCartPanel({
  canCheckout,
  checkoutActionLabel,
  checkoutHint,
  delivery,
  hasSwitcher,
  isPreview,
  locale,
  onCheckout,
  onCheckoutAction,
  onDeliveryChange,
  onUpdate,
  pendingAction,
  sellerCart,
  t,
}: Readonly<ActiveSellerCartPanelProps>) {
  const checkoutHintId = 'marketplace-cart-checkout-hint';
  const showCheckoutHint = isPreview || (!canCheckout && Boolean(checkoutHint));
  const tabAttributes = hasSwitcher ? ({ role: 'tabpanel', tabIndex: -1 } as const) : {};
  return (
    <section
      aria-labelledby={hasSwitcher ? cartTabId(sellerCart.id) : 'dh-cart-seller'}
      className="dh-cart-group dh-cart-group--active"
      id={cartPanelId(sellerCart.id)}
      {...tabAttributes}
    >
      <div className="dh-cart-layout">
        <CartLines locale={locale} onUpdate={onUpdate} pendingAction={pendingAction} sellerCart={sellerCart} t={t} />
        <aside className="dh-panel dh-cart-summary">
          <p className="dh-eyebrow">{t('agritech.marketplace.cart.summary')}</p>
          <h2>{t('agritech.marketplace.cart.estimatedTotal')}</h2>
          <strong className="dh-cart-summary__total">{formatMoney(sellerCart.total, locale)}</strong>
          <p className="dh-cart-summary__scope">
            <span className="dh-badge dh-badge--soft">{t('agritech.marketplace.cart.activeCart')}</span>
            <span>{t('agritech.marketplace.cart.itemCountValue', { count: sellerCart.itemCount })}</span>
          </p>
          <p className="dh-muted">{t('agritech.marketplace.cart.serverPricingNotice')}</p>
          <fieldset className="dh-choice-group">
            <legend>{t('agritech.marketplace.product.delivery')}</legend>
            {(['pickup', 'seller_delivery', 'by_agreement'] as const).map((term) => (
              <label key={term}>
                <input
                  checked={delivery === term}
                  name={`delivery-${sellerCart.id}`}
                  onChange={() => {
                    onDeliveryChange(term);
                  }}
                  type="radio"
                />
                <span>{t(deliveryTranslationKeys[term])}</span>
              </label>
            ))}
          </fieldset>
          <button
            aria-describedby={showCheckoutHint ? checkoutHintId : undefined}
            className="dh-button dh-button--primary dh-button--block"
            disabled={(!canCheckout && !isPreview) || pendingAction === `checkout:${sellerCart.id}`}
            onClick={() => {
              onCheckout(sellerCart.cart, delivery);
            }}
            type="button"
          >
            <MarketplaceIcon name="contract" />
            {isPreview && !canCheckout
              ? (checkoutActionLabel ?? t('agritech.marketplace.cart.previewCheckout'))
              : t('agritech.marketplace.cart.reviewContract')}
          </button>
          {showCheckoutHint ? (
            <div className="dh-state-inline" id={checkoutHintId}>
              {/* The page names the one missing step (sign in, verification, organization).
                  The generic preview sentence is the fallback only when no step is named. */}
              <span>{checkoutHint ?? t('agritech.marketplace.cart.previewHint')}</span>
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
    </section>
  );
}

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
  previewCartIds?: ReadonlySet<string>;
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
  previewCartIds,
  products,
  t,
}: Readonly<CartProps>) {
  const [delivery, setDelivery] = useState<Record<string, DeliveryTerms>>({});
  const sellerCarts = useMemo(() => groupCartsBySeller(carts.data, products), [carts.data, products]);
  const cartIds = useMemo(() => sellerCarts.map((sellerCart) => sellerCart.id), [sellerCarts]);
  const { activeCartId, select } = useActiveSellerCart(cartIds);
  const selected = sellerCarts.find((sellerCart) => sellerCart.id === activeCartId) ?? sellerCarts[0];
  const selectedIsPreview = selected ? previewCartIds?.has(selected.id) === true : false;
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

  const active = selected;
  const hasSwitcher = sellerCarts.length > 1;
  return (
    <div className="dh-page-stack">
      {heading}
      {hasSwitcher ? (
        <CartSwitcher locale={locale} onSelect={select} selectedId={active.id} sellerCarts={sellerCarts} t={t} />
      ) : null}
      <p aria-live="polite" className="dh-sr-only" role="status">
        {t('agritech.marketplace.cart.activeCartAnnouncement', { seller: active.sellerName })}
      </p>
      {/* Only the active sub-cart has a body. Every other cart stays reachable from the
          switcher above, which already carries its seller, region, count and total. */}
      <div className="dh-cart-groups">
        <ActiveSellerCartPanel
          canCheckout={canCheckout}
          checkoutActionLabel={checkoutActionLabel}
          checkoutHint={checkoutHint}
          delivery={delivery[active.id] ?? 'by_agreement'}
          hasSwitcher={hasSwitcher}
          isPreview={selectedIsPreview}
          key={active.id}
          locale={locale}
          onCheckout={onCheckout}
          onCheckoutAction={onCheckoutAction}
          onDeliveryChange={(deliveryTerms) => {
            setDelivery((value) => ({ ...value, [active.id]: deliveryTerms }));
          }}
          onUpdate={onUpdate}
          pendingAction={pendingAction}
          sellerCart={active}
          t={t}
        />
      </div>
    </div>
  );
}

type MarketplaceRequestsFeed = 'incoming' | 'mine';

interface RequestProps {
  buyerAccessActionLabel?: string;
  buyerAccessHint?: string;
  /**
   * Which panel the route selected. `/requests` reads the buyer's own requests and
   * `/requests/incoming` reads the seller feed; the two are never mixed into one
   * list. Omitted by hosts that do not route, which then fall back to the path.
   */
  feed?: MarketplaceRequestsFeed;
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
  /** Single-request route target, addressed by the buyer's own request id. */
  requestId?: string;
  requests: Resource<MarketplaceRequestFeedItem[]>;
  role?: string;
  sellerAccessActionLabel?: string;
  sellerAccessHint?: string;
  t: MarketplaceTranslate;
}

const emptyRequest: MarketplaceCreateRequestInput = { region: '', title: '' };

/** The five stages a purchase request walks, in order, as the scale renders them. */
const requestStageKeys = ['draft', 'moderation', 'collecting', 'selected', 'contract'] as const;
const requestWizardStepKeys = ['stepBasics', 'stepLogistics', 'stepTerms'] as const;

/**
 * Which stage the request has reached. `publicationId` is the join onto the public
 * request publication: without one the request exists only as a draft row and no
 * seller can see it, which is a different state from "published, no offers yet".
 */
const requestStageIndex = (request: BuyerRequestViewDto): number => {
  if (request.status === 'closed') {
    return 4;
  }
  if (request.status === 'selected') {
    return 3;
  }
  if (request.publicationId === undefined) {
    return 0;
  }
  if (request.moderationStatus !== 'approved' || request.publicationStatus !== 'published') {
    return 1;
  }
  return 2;
};

type RequestPublicationNotice = 'awaiting' | 'paused' | 'rejected' | undefined;

/** The reason, if any, that a request cannot collect offers right now. */
const requestPublicationNotice = (request: BuyerRequestViewDto): RequestPublicationNotice => {
  if (request.publicationId === undefined) {
    return 'awaiting';
  }
  if (request.publicationStatus === 'rejected' || request.moderationStatus === 'rejected') {
    return 'rejected';
  }
  if (request.publicationStatus === 'paused') {
    return 'paused';
  }
  return request.moderationStatus === 'approved' ? undefined : 'awaiting';
};

const publicationNoticeTitleKeys: Record<Exclude<RequestPublicationNotice, undefined>, string> = {
  awaiting: 'agritech.marketplace.orders.awaitingModeration',
  paused: 'agritech.marketplace.orders.publicationPaused',
  rejected: 'agritech.marketplace.orders.publicationRejected',
};

const publicationNoticeHintKeys: Record<Exclude<RequestPublicationNotice, undefined>, string> = {
  awaiting: 'agritech.marketplace.orders.awaitingModerationHint',
  paused: 'agritech.marketplace.orders.awaitingModerationHint',
  rejected: 'agritech.marketplace.orders.publicationRejectedHint',
};

/**
 * The panel and single request the current location asks for. Path segments are the
 * public contract (`/requests`, `/requests/incoming`, `/requests/new`,
 * `/requests/<id>`); explicit props win so a host can address a panel directly.
 */
const withoutTrailingSlash = (value: string): string => (value.endsWith('/') ? value.slice(0, -1) : value);

const requestsRouteFromLocation = (): { feed: MarketplaceRequestsFeed; requestId?: string } => {
  if (typeof globalThis.location === 'undefined') {
    return { feed: 'mine' };
  }
  const path = withoutTrailingSlash(globalThis.location.pathname);
  const segment = path.startsWith('/requests/') ? path.slice('/requests/'.length) : '';
  if (segment === 'incoming') {
    return { feed: 'incoming' };
  }
  if (segment === '' || segment === 'new') {
    return { feed: 'mine' };
  }
  return { feed: 'mine', requestId: decodeURIComponent(segment) };
};

const creatingFromLocation = (): boolean => {
  if (typeof globalThis.location === 'undefined') {
    return false;
  }
  return (
    new URLSearchParams(globalThis.location.search).get('create') === '1' ||
    withoutTrailingSlash(globalThis.location.pathname) === '/requests/new'
  );
};

function RequestStageScale({ request, t }: Readonly<{ request: BuyerRequestViewDto; t: MarketplaceTranslate }>) {
  const reached = requestStageIndex(request);
  return (
    <ol aria-label={t('agritech.marketplace.orders.progress')} className="dh-request-stages">
      {requestStageKeys.map((stage, index) => {
        let state = 'is-next';
        if (index < reached) {
          state = 'is-done';
        } else if (index === reached) {
          state = 'is-current';
        }
        return (
          <li className={`dh-request-stages__step ${state}`} key={stage}>
            <span className="dh-request-stages__dot">{index < reached ? <MarketplaceIcon name="check" /> : null}</span>
            <span className="dh-request-stages__label">{t(`agritech.marketplace.orders.stage.${stage}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RequestPublicationState({ request, t }: Readonly<{ request: BuyerRequestViewDto; t: MarketplaceTranslate }>) {
  const notice = requestPublicationNotice(request);
  if (!notice) {
    return null;
  }
  return (
    <div className={`dh-request-notice dh-request-notice--${notice}`}>
      <strong>
        <MarketplaceIcon name="alert" />
        {t(publicationNoticeTitleKeys[notice])}
      </strong>
      <span>{t(publicationNoticeHintKeys[notice])}</span>
    </div>
  );
}

function RequestFacts({
  locale,
  request,
  t,
}: Readonly<{ locale: Locale; request: BuyerRequestViewDto; t: MarketplaceTranslate }>) {
  const rows: readonly (readonly [string, string])[] = [
    [t('agritech.marketplace.orders.product'), request.product ?? '—'],
    [t('agritech.marketplace.orders.volume'), request.volume ?? '—'],
    [t('agritech.marketplace.orders.region'), request.region],
    [t('agritech.marketplace.orders.deadline'), request.deadline ?? '—'],
    [
      t('agritech.marketplace.orders.budget'),
      request.budgetUzs === undefined ? '—' : formatMoney(request.budgetUzs, locale),
    ],
    [t('agritech.marketplace.orders.requirements'), request.requirements ?? '—'],
  ];
  return (
    <dl className="dh-request-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function OfferCard({
  accessDescribedBy,
  canChoose,
  isBest,
  locale,
  offer,
  onChoose,
  pending,
  t,
}: Readonly<{
  accessDescribedBy?: string;
  canChoose: boolean;
  isBest: boolean;
  locale: Locale;
  offer: OfferViewDto;
  onChoose: () => void;
  pending: boolean;
  t: MarketplaceTranslate;
}>) {
  const deliveryParts = [t(deliveryTranslationKeys[offer.deliveryTerms])];
  if (offer.deliveryPriceUzs !== undefined) {
    deliveryParts.push(formatMoney(offer.deliveryPriceUzs, locale));
  }
  if (offer.deliveryDays) {
    deliveryParts.push(t('agritech.marketplace.orders.deliveryDays', { count: offer.deliveryDays }));
  }
  const total = offer.priceUzs + (offer.deliveryPriceUzs ?? 0);
  return (
    <article className={`dh-offer-card${isBest ? ' dh-offer-card--best' : ''}`}>
      {isBest ? <span className="dh-offer-card__flag">{t('agritech.marketplace.orders.bestOffer')}</span> : null}
      <div className="dh-offer-card__seller">
        <span className="dh-offer-card__seal" title={t('agritech.marketplace.orders.offerVerified')}>
          <MarketplaceIcon name="shield" />
          <span className="dh-sr-only">{t('agritech.marketplace.orders.offerVerified')}</span>
        </span>
        <span className="dh-offer-card__name">
          {offer.seller.displayName} · {offer.seller.region}
        </span>
      </div>
      <ul className="dh-offer-card__meta">
        <li>{deliveryParts.join(' · ')}</li>
        <li>{t('agritech.marketplace.orders.offerReceived', { date: formatDate(offer.createdAt, locale) })}</li>
      </ul>
      <div className="dh-offer-card__price">
        <strong>{formatMoney(offer.priceUzs, locale)}</strong>
        <small>
          {t('agritech.marketplace.orders.offerTotal')}: {formatMoney(total, locale)}
        </small>
      </div>
      <div className="dh-offer-card__action">
        <button
          {...(accessDescribedBy ? { 'aria-describedby': accessDescribedBy } : {})}
          className={`dh-button ${isBest ? 'dh-button--primary' : 'dh-button--secondary'}`}
          disabled={!canChoose || offer.status !== 'pending' || pending}
          onClick={onChoose}
          type="button"
        >
          {offer.status === 'pending'
            ? t('agritech.marketplace.orders.choose')
            : t(`agritech.marketplace.orders.offerStatus.${offer.status}`)}
        </button>
      </div>
    </article>
  );
}

function RequestOffers({
  accessDescribedBy,
  canChoose,
  locale,
  offers,
  offersByRequest,
  onChoose,
  onRetry,
  pendingAction,
  request,
  t,
}: Readonly<{
  accessDescribedBy?: string;
  canChoose: boolean;
  locale: Locale;
  offers: readonly OfferViewDto[] | undefined;
  offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  onChoose: (request: BuyerRequestViewDto, offer: OfferViewDto) => void;
  onRetry: () => void;
  pendingAction?: string;
  request: BuyerRequestViewDto;
  t: MarketplaceTranslate;
}>) {
  if (requestPublicationNotice(request) !== undefined) {
    return <RequestPublicationState request={request} t={t} />;
  }
  if (offersByRequest.status === 'loading' && offers === undefined) {
    return <MarketplaceSkeleton count={2} />;
  }
  if (offers === undefined) {
    return (
      <div className="dh-request-notice dh-request-notice--rejected">
        <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.orders.unavailable')}</p>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  }
  if (offers.length === 0) {
    return <p className="dh-muted">{t('agritech.marketplace.orders.noOffers')}</p>;
  }
  const sorted = [...offers].sort((left, right) => left.priceUzs - right.priceUzs);
  return (
    <div className="dh-offer-cards">
      {sorted.map((offer, index) => (
        <OfferCard
          {...(accessDescribedBy ? { accessDescribedBy } : {})}
          canChoose={canChoose}
          isBest={index === 0}
          key={offer.id}
          locale={locale}
          offer={offer}
          onChoose={() => {
            onChoose(request, offer);
          }}
          pending={pendingAction === `choose:${offer.id}`}
          t={t}
        />
      ))}
    </div>
  );
}

function BuyerRequestCard({
  accessDescribedBy,
  canChoose,
  locale,
  navigate,
  offers,
  offersByRequest,
  onChoose,
  onRetry,
  pendingAction,
  request,
  t,
}: Readonly<{
  accessDescribedBy?: string;
  canChoose: boolean;
  locale: Locale;
  navigate: MarketplaceNavigate;
  offers: readonly OfferViewDto[] | undefined;
  offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  onChoose: (request: BuyerRequestViewDto, offer: OfferViewDto) => void;
  onRetry: () => void;
  pendingAction?: string;
  request: BuyerRequestViewDto;
  t: MarketplaceTranslate;
}>) {
  return (
    <article className="dh-request-card dh-request-card--mine">
      <div className="dh-request-card__head">
        <div>
          <span className="dh-badge dh-badge--soft">{t(`agritech.marketplace.orders.${request.status}`)}</span>
          <h3>{request.title}</h3>
        </div>
        <span>{t('agritech.marketplace.orders.offerCount', { count: offers?.length ?? 0 })}</span>
      </div>
      <RequestStageScale request={request} t={t} />
      <RequestOffers
        {...(accessDescribedBy ? { accessDescribedBy } : {})}
        canChoose={canChoose}
        locale={locale}
        offers={offers}
        offersByRequest={offersByRequest}
        onChoose={onChoose}
        onRetry={onRetry}
        {...(pendingAction ? { pendingAction } : {})}
        request={request}
        t={t}
      />
      <div className="dh-request-card__actions">
        <button
          className="dh-button dh-button--secondary"
          onClick={() => {
            navigate(`/requests/${encodeURIComponent(request.id)}`);
          }}
          type="button"
        >
          {t('agritech.marketplace.orders.viewRequest')}
          <MarketplaceIcon name="arrow" />
        </button>
      </div>
    </article>
  );
}

function RequestPrimaryAction({
  navigate,
  request,
  t,
}: Readonly<{ navigate: MarketplaceNavigate; request: BuyerRequestViewDto; t: MarketplaceTranslate }>) {
  const stage = requestStageIndex(request);
  if (stage === 0 || requestPublicationNotice(request) === 'rejected') {
    return (
      <button
        className="dh-button dh-button--primary"
        onClick={() => {
          navigate('/account');
        }}
        type="button"
      >
        {t('agritech.marketplace.orders.publish')}
      </button>
    );
  }
  if (stage === 1) {
    return <p className="dh-state-inline">{t('agritech.marketplace.orders.awaitingModeration')}</p>;
  }
  if (stage === 2) {
    return <p className="dh-state-inline">{t('agritech.marketplace.orders.reverseAuction')}</p>;
  }
  return (
    <button
      className="dh-button dh-button--primary"
      onClick={() => {
        navigate('/account');
      }}
      type="button"
    >
      {t('agritech.marketplace.orders.openContract')}
    </button>
  );
}

function BuyerRequestDetail({
  accessDescribedBy,
  canChoose,
  locale,
  myRequests,
  navigate,
  offersByRequest,
  onChoose,
  onRetry,
  pendingAction,
  requestId,
  t,
}: Readonly<{
  accessDescribedBy?: string;
  canChoose: boolean;
  locale: Locale;
  myRequests: Resource<BuyerRequestViewDto[]>;
  navigate: MarketplaceNavigate;
  offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  onChoose: (request: BuyerRequestViewDto, offer: OfferViewDto) => void;
  onRetry: () => void;
  pendingAction?: string;
  requestId: string;
  t: MarketplaceTranslate;
}>) {
  const backToMine = (
    <button
      className="dh-text-button"
      onClick={() => {
        navigate('/requests');
      }}
      type="button"
    >
      {t('agritech.marketplace.orders.backToMine')}
    </button>
  );
  if (myRequests.status === 'loading' || myRequests.status === 'idle') {
    return (
      <div className="dh-page-stack">
        {backToMine}
        <MarketplaceSkeleton count={2} />
      </div>
    );
  }
  if (myRequests.status === 'error') {
    return (
      <div className="dh-page-stack">
        {backToMine}
        <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.orders.unavailable')}</p>
        <button className="dh-button dh-button--secondary" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  }
  const request = myRequests.data.find((candidate) => candidate.id === requestId);
  if (!request) {
    return (
      <div className="dh-page-stack">
        {backToMine}
        <MarketplaceEmpty
          icon="search"
          message={t('agritech.marketplace.orders.notFoundDescription')}
          title={t('agritech.marketplace.orders.notFound')}
        />
      </div>
    );
  }
  const offers = offersByRequest.data[request.id];
  return (
    <div className="dh-page-stack dh-request-detail">
      {backToMine}
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.orders.reverseAuction')}</p>
          <h1>{request.title}</h1>
          <p>
            {t(`agritech.marketplace.orders.${request.status}`)} ·{' '}
            {t('agritech.marketplace.orders.offerCount', { count: offers?.length ?? 0 })}
          </p>
        </div>
        <RequestPrimaryAction navigate={navigate} request={request} t={t} />
      </div>
      <RequestStageScale request={request} t={t} />
      <div className="dh-request-detail__columns">
        <aside className="dh-panel">
          <div className="dh-panel__head">
            <h2>{t('agritech.marketplace.orders.details')}</h2>
          </div>
          <RequestFacts locale={locale} request={request} t={t} />
          <div className="dh-request-note">
            <strong>{t('agritech.marketplace.orders.howItWorks')}</strong>
            <span>{t('agritech.marketplace.orders.howItWorksHint')}</span>
          </div>
        </aside>
        <section aria-labelledby="dh-request-detail-offers">
          <div className="dh-section__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.orders.offersSort')}</p>
              <h2 id="dh-request-detail-offers">{t('agritech.marketplace.orders.reverseAuction')}</h2>
            </div>
          </div>
          <RequestOffers
            {...(accessDescribedBy ? { accessDescribedBy } : {})}
            canChoose={canChoose}
            locale={locale}
            offers={offers}
            offersByRequest={offersByRequest}
            onChoose={onChoose}
            onRetry={onRetry}
            {...(pendingAction ? { pendingAction } : {})}
            request={request}
            t={t}
          />
        </section>
      </div>
    </div>
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- one explicit renderer keeps buyer and seller eligibility, loading, empty, and offer states visibly aligned
export function MarketplaceRequests({
  buyerAccessActionLabel,
  buyerAccessHint,
  feed,
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
  requestId,
  requests,
  role,
  sellerAccessActionLabel,
  sellerAccessHint,
  t,
}: Readonly<RequestProps>) {
  const eligibleBuyer = isVerified && (role === 'buyer' || role === 'farmer');
  const eligibleSeller = isVerified && (role === 'farmer' || role === 'seller');
  const route = requestsRouteFromLocation();
  const activeFeed = feed ?? route.feed;
  const activeRequestId = requestId ?? route.requestId;
  const [creating, setCreating] = useState(() => eligibleBuyer && creatingFromLocation());
  const [requestInput, setRequestInput] = useState<MarketplaceCreateRequestInput>(emptyRequest);
  const [wizardStep, setWizardStep] = useState(0);
  const [offeringId, setOfferingId] = useState<string>();
  const [offerInput, setOfferInput] = useState<MarketplaceOfferInput>({
    deliveryTerms: 'by_agreement',
    priceUzs: 0,
  });
  const myIds = useMemo(() => new Set(myRequests.data.map((request) => request.id)), [myRequests.data]);
  const buyerAccessId = 'marketplace-request-buyer-access';
  const sellerAccessId = 'marketplace-request-seller-access';
  const buyerDescribedBy = eligibleBuyer ? undefined : buyerAccessId;

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

  if (activeRequestId !== undefined) {
    return (
      <BuyerRequestDetail
        {...(buyerDescribedBy ? { accessDescribedBy: buyerDescribedBy } : {})}
        canChoose={eligibleBuyer}
        locale={locale}
        myRequests={myRequests}
        navigate={navigate}
        offersByRequest={offersByRequest}
        onChoose={onChoose}
        onRetry={onRetry}
        {...(pendingAction ? { pendingAction } : {})}
        requestId={activeRequestId}
        t={t}
      />
    );
  }

  const sellerRequests = requests.data.filter((request) => !myIds.has(request.id));
  let sellerFeed: ReactNode;
  if (requests.status === 'loading' || requests.status === 'idle') {
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
            <dl className="dh-request-facts">
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
              <div className="dh-request-card__actions">
                <button
                  aria-describedby={eligibleSeller ? undefined : sellerAccessId}
                  className="dh-button dh-button--primary"
                  disabled={!eligibleSeller}
                  onClick={() => {
                    setOfferingId(request.id);
                    setOfferInput({ deliveryTerms: 'by_agreement', priceUzs: 0 });
                  }}
                  type="button"
                >
                  {t('agritech.marketplace.orders.makeOffer')}
                </button>
              </div>
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
  if (myRequests.status === 'loading' || myRequests.status === 'idle') {
    myRequestContent = <MarketplaceSkeleton count={2} />;
  } else if (myRequests.status === 'error') {
    myRequestContent = (
      <>
        <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.orders.unavailable')}</p>
        <button className="dh-button dh-button--secondary" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </>
    );
  } else if (myRequests.data.length > 0) {
    myRequestContent = (
      <div className="dh-request-list">
        {myRequests.data.map((request) => (
          <BuyerRequestCard
            {...(buyerDescribedBy ? { accessDescribedBy: buyerDescribedBy } : {})}
            canChoose={eligibleBuyer}
            key={request.id}
            locale={locale}
            navigate={navigate}
            offers={offersByRequest.data[request.id]}
            offersByRequest={offersByRequest}
            onChoose={onChoose}
            onRetry={onRetry}
            {...(pendingAction ? { pendingAction } : {})}
            request={request}
            t={t}
          />
        ))}
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
                setWizardStep(0);
              },
            }
          : {})}
        title={t('agritech.marketplace.orders.empty')}
      />
    );
  }

  const lastWizardStep = requestWizardStepKeys.length - 1;

  return (
    <div className="dh-page-stack">
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.orders.reverseAuction')}</p>
          <h1>{t('agritech.marketplace.orders.title')}</h1>
          <p>{t('agritech.marketplace.orders.description')}</p>
        </div>
        <button
          aria-describedby={buyerDescribedBy}
          className="dh-button dh-button--primary"
          disabled={!eligibleBuyer}
          onClick={toggleCreating}
          type="button"
        >
          <MarketplaceIcon name="plus" />
          {t('agritech.marketplace.orders.create')}
        </button>
      </div>

      <nav aria-label={t('agritech.marketplace.orders.title')} className="dh-request-tabs">
        <button
          aria-current={activeFeed === 'mine' ? 'page' : undefined}
          className={`dh-request-tabs__tab${activeFeed === 'mine' ? ' is-active' : ''}`}
          onClick={() => {
            navigate('/requests');
          }}
          type="button"
        >
          <MarketplaceIcon name="orders" />
          {t('agritech.marketplace.orders.my')}
        </button>
        <button
          aria-current={activeFeed === 'incoming' ? 'page' : undefined}
          className={`dh-request-tabs__tab${activeFeed === 'incoming' ? ' is-active' : ''}`}
          onClick={() => {
            navigate('/requests/incoming');
          }}
          type="button"
        >
          <MarketplaceIcon name="send" />
          {t('agritech.marketplace.orders.incoming')}
        </button>
      </nav>

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
        <form className="dh-panel dh-form dh-request-wizard" onSubmit={submitRequest}>
          <div className="dh-panel__head">
            <div>
              <p className="dh-eyebrow">
                {t('agritech.marketplace.orders.step', {
                  current: wizardStep + 1,
                  total: requestWizardStepKeys.length,
                })}
              </p>
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
          <ol className="dh-request-wizard__steps">
            {requestWizardStepKeys.map((step, index) => (
              <li key={step}>
                <button
                  aria-current={index === wizardStep ? 'step' : undefined}
                  className={`dh-request-wizard__step${index === wizardStep ? ' is-active' : ''}`}
                  onClick={() => {
                    setWizardStep(index);
                  }}
                  type="button"
                >
                  <span>{index + 1}</span>
                  {t(`agritech.marketplace.orders.${step}`)}
                </button>
              </li>
            ))}
          </ol>
          {/* Every fieldset stays mounted so nothing typed on an earlier step is lost
              and assistive tech keeps one form, not three. */}
          <fieldset className="dh-form-grid" hidden={wizardStep !== 0}>
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
          </fieldset>
          <fieldset className="dh-form-grid" hidden={wizardStep !== 1}>
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
          </fieldset>
          <fieldset className="dh-form-grid" hidden={wizardStep !== 2}>
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
          </fieldset>
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
            {wizardStep > 0 ? (
              <button
                className="dh-button dh-button--secondary"
                onClick={() => {
                  setWizardStep((step) => step - 1);
                }}
                type="button"
              >
                {t('agritech.marketplace.orders.previous')}
              </button>
            ) : null}
            {wizardStep < lastWizardStep ? (
              <button
                className="dh-button dh-button--secondary"
                onClick={() => {
                  setWizardStep((step) => step + 1);
                }}
                type="button"
              >
                {t('agritech.marketplace.orders.next')}
              </button>
            ) : null}
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

      {activeFeed === 'incoming' ? (
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
      ) : (
        <section aria-labelledby="dh-my-requests">
          <div className="dh-section__head">
            <div>
              <p className="dh-eyebrow">{t('agritech.marketplace.account')}</p>
              <h2 id="dh-my-requests">{t('agritech.marketplace.orders.my')}</h2>
            </div>
          </div>
          {myRequestContent}
        </section>
      )}
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

/**
 * The personal cabinet's props.
 *
 * The section panels moved into `marketplace-cabinet`; this stays the account
 * view's entry point so the page keeps one import for the route. Everything the
 * cabinet added is optional and defaults to an empty resource, because a host
 * that renders the account view without a seller feed or a publication queue
 * should get honest empty panels rather than a type error.
 */
interface AccountProps {
  cabinetSection?: MarketplaceCabinetSection;
  contracts: Resource<ContractViewDto[]>;
  dashboard: Resource<MarketplaceRoleDashboardDto | null>;
  listingPublications?: Resource<MarketplaceOwnedListingPublicationDto[]>;
  locale: Locale;
  locationPathname?: string;
  management?: ReactNode;
  myRequests?: Resource<BuyerRequestViewDto[]>;
  navigate: MarketplaceNavigate;
  offersByRequest?: Resource<Record<string, OfferViewDto[]>>;
  onRetry: () => void;
  onSignOut?: () => void;
  publicRequests?: Resource<MarketplaceRequestFeedItem[]>;
  requestPublications?: Resource<MarketplaceOwnedRequestPublicationDto[]>;
  samples: Resource<MarketplaceSampleDto[]>;
  signOutPending?: boolean;
  t: MarketplaceTranslate;
  verification: Resource<VerificationViewDto | null>;
}

const emptyListResource = <T,>(): Resource<T[]> => ({ data: [], status: 'empty' });

export function MarketplaceAccount({
  cabinetSection,
  contracts,
  dashboard,
  listingPublications,
  locale,
  locationPathname,
  management,
  myRequests,
  navigate,
  offersByRequest,
  onRetry,
  onSignOut,
  publicRequests,
  requestPublications,
  samples,
  signOutPending,
  t,
  verification,
}: Readonly<AccountProps>) {
  return (
    <MarketplaceCabinet
      contracts={contracts}
      dashboard={dashboard}
      listingPublications={listingPublications ?? emptyListResource()}
      locale={locale}
      management={management}
      myRequests={myRequests ?? emptyListResource()}
      navigate={navigate}
      offersByRequest={offersByRequest ?? { data: {}, status: 'empty' }}
      onRetry={onRetry}
      {...(onSignOut ? { onSignOut } : {})}
      publicRequests={publicRequests ?? emptyListResource()}
      requestPublications={requestPublications ?? emptyListResource()}
      samples={samples}
      section={cabinetSection ?? marketplaceCabinetSectionFromLocation(locationPathname)}
      signOutPending={signOutPending === true}
      t={t}
      verification={verification}
    />
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
    /*
     * A deal nobody has signed yet has no settlement to show, and that is not a
     * fault: the panel used to print the artifact's "unavailable" line here, and
     * before the API separated the two cases it printed a failure with a retry
     * button that could never succeed. It now says what is true and what unlocks
     * it.
     */
    return (
      <>
        <h2>{t('agritech.marketplace.contract.settlement.notStarted')}</h2>
        <p>{t('agritech.marketplace.contract.settlement.notStartedDescription')}</p>
      </>
    );
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
              <button
                className="dh-text-button"
                onClick={() => {
                  navigate(marketplacePartyProfileHref(contract.buyerProfileId));
                }}
                type="button"
              >
                {t('agritech.marketplace.profile.openBuyer')}
              </button>
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
              <button
                className="dh-text-button"
                onClick={() => {
                  navigate(marketplacePartyProfileHref(contract.sellerProfileId));
                }}
                type="button"
              >
                {t('agritech.marketplace.profile.openSeller')}
              </button>
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
