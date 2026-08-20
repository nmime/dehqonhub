import { useEffect, useState } from 'react';
import type { Locale } from '@app/frontend-runtime';
import { MarketplaceIcon, type MarketplaceIconName } from './marketplace-icon';
import { MarketplaceBusyButton } from './marketplace-loading';
import { MarketplaceRatingSummary } from './marketplace-rating';
import {
  formatMoney,
  localizedProductName,
  type MarketplaceListing,
  type MarketplaceTranslate,
} from './marketplace-ui';

interface ProductMediaProps {
  compact?: boolean;
  locale: Locale;
  product: MarketplaceListing;
  t: MarketplaceTranslate;
}

const mediaTintCount = 5;

const mediaTint = (id: string): number => {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100003;
  }
  return hash % mediaTintCount;
};

const productCategoryIcons: Record<MarketplaceListing['category'], MarketplaceIconName> = {
  equipment: 'equipment',
  fertilizer: 'fertilizer',
  irrigation: 'equipment',
  other: 'input',
  pesticide: 'pesticide',
  seed: 'seeds',
};

function ProductFlags({ product, t }: Readonly<{ product: MarketplaceListing; t: MarketplaceTranslate }>) {
  if (product.provenance !== 'demo' && !product.promoted) {
    return null;
  }
  return (
    <div className="dh-product-media__flags">
      {product.provenance === 'demo' ? (
        <span className="dh-badge dh-badge--neutral">{t('agritech.marketplace.access.demoBadge')}</span>
      ) : null}
      {product.promoted ? (
        <span className="dh-badge dh-badge--neutral">{t('agritech.marketplace.product.promoted')}</span>
      ) : null}
    </div>
  );
}

export function ProductMedia({ compact = false, locale, product, t }: Readonly<ProductMediaProps>) {
  const [failed, setFailed] = useState(false);
  const source = product.images[0];
  const name = localizedProductName(product, locale);

  useEffect(() => {
    setFailed(false);
  }, [source]);

  return (
    <div
      className={`dh-product-media dh-product-media--tint-${mediaTint(product.id)}${
        compact ? ' dh-product-media--compact' : ''
      }`}
    >
      {source && !failed ? (
        <img
          alt={name}
          loading="lazy"
          onError={() => {
            setFailed(true);
          }}
          src={source}
        />
      ) : (
        <div
          aria-label={t('agritech.marketplace.product.imageFallback')}
          className="dh-product-media__fallback"
          role="img"
        >
          <MarketplaceIcon name={productCategoryIcons[product.category]} />
        </div>
      )}
      {compact ? null : <ProductFlags product={product} t={t} />}
    </div>
  );
}

function ProductTags({ product, t }: Readonly<{ product: MarketplaceListing; t: MarketplaceTranslate }>) {
  const outOfStock = product.status !== 'active' || product.stockQuantity <= 0;
  return (
    <div className="dh-product-card__facts">
      <span className={`dh-badge ${outOfStock ? 'dh-badge--neutral' : 'dh-badge--soft'}`}>
        {outOfStock ? t('agritech.marketplace.product.outOfStock') : t('agritech.marketplace.product.inStock')}
      </span>
      {product.sampleAvailable ? (
        <span className="dh-badge dh-badge--outline">{t('agritech.marketplace.product.sampleBadge')}</span>
      ) : null}
    </div>
  );
}

/**
 * The seller line on a card.
 *
 * The name is a control when the card is given `onOpenSeller`, because "who am I
 * buying from" is a question a buyer answers before price: one press opens that
 * organization's public profile - its completed-deal record and the reviews it
 * received - from the same place the offer is being weighed. The link carries the
 * public seller address the catalog already returned, never an internal user id.
 * Without the callback the name stays plain text, so no card can render a control
 * that leads nowhere.
 */
function ProductSeller({
  onOpenSeller,
  product,
  t,
}: Readonly<{
  onOpenSeller?: (product: MarketplaceListing) => void;
  product: MarketplaceListing;
  t: MarketplaceTranslate;
}>) {
  return (
    <p className="dh-product-card__seller">
      {onOpenSeller ? (
        <button
          aria-label={t('agritech.marketplace.profile.open', { name: product.supplierName })}
          className="dh-product-card__seller-name dh-profile-link"
          onClick={() => {
            onOpenSeller(product);
          }}
          type="button"
        >
          {product.supplierName}
        </button>
      ) : (
        <span className="dh-product-card__seller-name">{product.supplierName}</span>
      )}
      {product.supplierVerified ? (
        <span aria-label={t('agritech.marketplace.product.sellerVerified')} className="dh-vseal" role="img">
          <MarketplaceIcon name="check" />
        </span>
      ) : null}
      <span className="dh-product-card__seller-region">{product.region}</span>
    </p>
  );
}

interface ProductCardProps {
  canTransact?: boolean;
  favorite: boolean;
  locale: Locale;
  onAdd: (product: MarketplaceListing) => void;
  onFavorite: (product: MarketplaceListing) => void;
  onOpen: (product: MarketplaceListing) => void;
  /** Opens the seller's public profile. Omitted where no profile route exists. */
  onOpenSeller?: (product: MarketplaceListing) => void;
  pendingAction?: string;
  product: MarketplaceListing;
  t: MarketplaceTranslate;
  transactionHint?: string;
}

/* The label stays put while the request is in flight: swapping it for "Loading…"
   changed the control's accessible name mid-action, so a screen-reader user lost
   the control they were standing on. The busy state is carried by the spinner and
   `aria-busy` instead. */
const cartActionLabel = (transactionRestricted: boolean, t: MarketplaceTranslate): string =>
  t(transactionRestricted ? 'agritech.marketplace.product.addToPreviewCart' : 'agritech.marketplace.product.addToCart');

export function MarketplaceProductCard({
  canTransact = true,
  favorite,
  locale,
  onAdd,
  onFavorite,
  onOpen,
  onOpenSeller,
  pendingAction,
  product,
  t,
  transactionHint,
}: Readonly<ProductCardProps>) {
  const name = localizedProductName(product, locale);
  const outOfStock = product.status !== 'active' || product.stockQuantity <= 0;
  const favoritePending = pendingAction === `favorite:${product.id}`;
  const cartPending = pendingAction === `cart:${product.id}`;
  const isDemo = product.provenance === 'demo';
  const transactionRestricted = !canTransact || product.transactional === false;
  const restrictionHint = isDemo ? t('agritech.marketplace.access.demo') : transactionHint;
  // The reason is announced on the action instead of printed under every card.
  const describedById =
    transactionRestricted && restrictionHint ? `marketplace-product-${product.id}-restriction` : undefined;

  return (
    <article className="dh-product-card">
      <ProductMedia locale={locale} product={product} t={t} />
      <MarketplaceBusyButton
        aria-label={
          favorite ? t('agritech.marketplace.product.removeFavorite') : t('agritech.marketplace.product.addFavorite')
        }
        aria-pressed={favorite}
        busy={favoritePending}
        busyLabel={t('agritech.marketplace.loading')}
        className={`dh-icon-button dh-product-card__favorite${favorite ? ' is-active' : ''}`}
        icon="heart"
        onClick={() => {
          onFavorite(product);
        }}
        type="button"
      />
      <button
        className="dh-product-card__open"
        onClick={() => {
          onOpen(product);
        }}
        type="button"
      >
        <span className="dh-sr-only">{t('agritech.marketplace.product.openDetails', { product: name })}</span>
      </button>
      <div className="dh-product-card__body">
        <ProductTags product={product} t={t} />
        <div className="dh-product-card__price">
          <strong>{formatMoney(product.priceUzs, locale)}</strong>
          <span>/ {product.unit}</span>
        </div>
        <button
          className="dh-product-card__title"
          onClick={() => {
            onOpen(product);
          }}
          type="button"
        >
          {name}
        </button>
        <ProductSeller onOpenSeller={onOpenSeller} product={product} t={t} />
        {/* The aggregate travels with the listing everywhere it is shown, and an
            unrated listing says so rather than borrowing a score. */}
        <MarketplaceRatingSummary locale={locale} rating={product.rating} t={t} />
        <MarketplaceBusyButton
          aria-describedby={describedById}
          busy={cartPending}
          busyLabel={t('agritech.marketplace.loading')}
          className="dh-button dh-button--primary dh-button--block"
          disabled={outOfStock}
          icon="cart"
          onClick={() => {
            onAdd(product);
          }}
          type="button"
        >
          {cartActionLabel(transactionRestricted, t)}
        </MarketplaceBusyButton>
        {describedById ? (
          <span className="dh-sr-only" id={describedById}>
            {restrictionHint}
          </span>
        ) : null}
      </div>
    </article>
  );
}
