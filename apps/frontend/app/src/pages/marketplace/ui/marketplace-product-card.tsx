import { useEffect, useState } from 'react';
import type { Locale } from '@app/frontend-runtime';
import { MarketplaceIcon, type MarketplaceIconName } from './marketplace-icon';
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

const productCategoryIcons: Record<MarketplaceListing['category'], MarketplaceIconName> = {
  equipment: 'equipment',
  fertilizer: 'fertilizer',
  irrigation: 'equipment',
  other: 'input',
  pesticide: 'pesticide',
  seed: 'seeds',
};

export function ProductMedia({ compact = false, locale, product, t }: Readonly<ProductMediaProps>) {
  const [failed, setFailed] = useState(false);
  const source = product.images[0];
  const name = localizedProductName(product, locale);

  useEffect(() => {
    setFailed(false);
  }, [source]);

  return (
    <div className={`dh-product-media${compact ? ' dh-product-media--compact' : ''}`}>
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
    </div>
  );
}

interface ProductCardProps {
  canTransact?: boolean;
  favorite: boolean;
  locale: Locale;
  onAdd: (product: MarketplaceListing) => void;
  onFavorite: (product: MarketplaceListing) => void;
  onOpen: (product: MarketplaceListing) => void;
  pendingAction?: string;
  product: MarketplaceListing;
  t: MarketplaceTranslate;
  transactionActionLabel?: string;
  transactionHint?: string;
  onTransactionAction?: () => void;
}

export function MarketplaceProductCard({
  canTransact = true,
  favorite,
  locale,
  onAdd,
  onFavorite,
  onOpen,
  pendingAction,
  product,
  t,
  transactionActionLabel,
  transactionHint,
  onTransactionAction,
}: Readonly<ProductCardProps>) {
  const name = localizedProductName(product, locale);
  const outOfStock = product.status !== 'active' || product.stockQuantity <= 0;
  const favoritePending = pendingAction === `favorite:${product.id}`;
  const cartPending = pendingAction === `cart:${product.id}`;
  const isDemo = product.provenance === 'demo';
  const transactionRestricted = !canTransact || product.transactional === false;
  const restrictionHint = isDemo ? t('agritech.marketplace.access.demo') : transactionHint;
  const restrictionId = `marketplace-product-${product.id}-restriction`;

  return (
    <article className="dh-product-card">
      <ProductMedia locale={locale} product={product} t={t} />
      <button
        aria-label={
          favorite ? t('agritech.marketplace.product.removeFavorite') : t('agritech.marketplace.product.addFavorite')
        }
        aria-pressed={favorite}
        className={`dh-icon-button dh-product-card__favorite${favorite ? ' is-active' : ''}`}
        aria-describedby={isDemo ? restrictionId : undefined}
        disabled={favoritePending || isDemo}
        onClick={() => {
          onFavorite(product);
        }}
        type="button"
      >
        <MarketplaceIcon name="heart" />
      </button>
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
        <div className="dh-product-card__facts">
          <span className={`dh-badge ${outOfStock ? 'dh-badge--neutral' : 'dh-badge--soft'}`}>
            {outOfStock ? t('agritech.marketplace.product.outOfStock') : t('agritech.marketplace.product.inStock')}
          </span>
          <span className="dh-caption">{product.region}</span>
        </div>
        {isDemo ? (
          <span className="dh-badge dh-badge--neutral dh-product-card__demo">
            {t('agritech.marketplace.access.demoBadge')}
          </span>
        ) : null}
        <button
          className="dh-product-card__title"
          onClick={() => {
            onOpen(product);
          }}
          type="button"
        >
          {name}
        </button>
        <p className="dh-product-card__seller">{product.supplierName}</p>
        <div className="dh-product-card__price">
          <strong>{formatMoney(product.priceUzs, locale)}</strong>
          <span>/ {product.unit}</span>
        </div>
        <button
          aria-describedby={transactionRestricted ? restrictionId : undefined}
          className="dh-button dh-button--primary dh-button--block"
          disabled={transactionRestricted || outOfStock || cartPending}
          onClick={() => {
            onAdd(product);
          }}
          type="button"
        >
          <MarketplaceIcon name={cartPending ? 'check' : 'cart'} />
          {cartPending ? t('agritech.marketplace.loading') : t('agritech.marketplace.product.addToCart')}
        </button>
        {transactionRestricted && restrictionHint ? (
          <div className="dh-state-inline" id={restrictionId}>
            <span>{restrictionHint}</span>
            {!isDemo && transactionActionLabel && onTransactionAction ? (
              <button className="dh-text-button" onClick={onTransactionAction} type="button">
                {transactionActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
