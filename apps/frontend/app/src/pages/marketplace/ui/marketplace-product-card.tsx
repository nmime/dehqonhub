import { useEffect, useState } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type { ProductViewDto } from '@app/frontend-api-client';
import { MarketplaceIcon, type MarketplaceIconName } from './marketplace-icon';
import { formatMoney, localizedProductName, type MarketplaceTranslate } from './marketplace-ui';

interface ProductMediaProps {
  compact?: boolean;
  locale: Locale;
  product: ProductViewDto;
  t: MarketplaceTranslate;
}

const productCategoryIcons: Record<ProductViewDto['category'], MarketplaceIconName> = {
  equipment: 'equipment',
  fertilizer: 'produce',
  irrigation: 'equipment',
  other: 'produce',
  pesticide: 'produce',
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
  favorite: boolean;
  locale: Locale;
  onAdd: (product: ProductViewDto) => void;
  onFavorite: (product: ProductViewDto) => void;
  onOpen: (product: ProductViewDto) => void;
  pendingAction?: string;
  product: ProductViewDto;
  t: MarketplaceTranslate;
}

export function MarketplaceProductCard({
  favorite,
  locale,
  onAdd,
  onFavorite,
  onOpen,
  pendingAction,
  product,
  t,
}: Readonly<ProductCardProps>) {
  const name = localizedProductName(product, locale);
  const outOfStock = product.status !== 'active' || product.stockQuantity <= 0;
  const favoritePending = pendingAction === `favorite:${product.id}`;
  const cartPending = pendingAction === `cart:${product.id}`;

  return (
    <article className="dh-product-card">
      <ProductMedia locale={locale} product={product} t={t} />
      <button
        aria-label={
          favorite ? t('agritech.marketplace.product.removeFavorite') : t('agritech.marketplace.product.addFavorite')
        }
        aria-pressed={favorite}
        className={`dh-icon-button dh-product-card__favorite${favorite ? ' is-active' : ''}`}
        disabled={favoritePending}
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
          className="dh-button dh-button--primary dh-button--block"
          disabled={outOfStock || cartPending}
          onClick={() => {
            onAdd(product);
          }}
          type="button"
        >
          <MarketplaceIcon name={cartPending ? 'check' : 'cart'} />
          {cartPending ? t('agritech.marketplace.loading') : t('agritech.marketplace.product.addToCart')}
        </button>
      </div>
    </article>
  );
}
