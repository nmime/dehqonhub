import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type { ProductViewDto, ReviewViewDto, SampleUsageViewDto } from '@app/frontend-api-client';
import type { Resource, ResourceStatus } from '../model/use-marketplace-data';
import { MarketplaceIcon, type MarketplaceIconName } from './marketplace-icon';
import { MarketplaceProductCard, ProductMedia } from './marketplace-product-card';
import {
  formatDate,
  formatMoney,
  localizedProductName,
  querySearch,
  querySection,
  sectionForProduct,
  type MarketplaceNavigate,
  type MarketplaceSection,
  type MarketplaceTranslate,
} from './marketplace-ui';

interface ProductActions {
  favoriteIds: ReadonlySet<string>;
  onAdd: (product: ProductViewDto, quantity?: number) => void;
  onFavorite: (product: ProductViewDto) => void;
  onOpen: (product: ProductViewDto) => void;
  pendingAction?: string;
}

interface SharedDiscoveryProps extends ProductActions {
  locale: Locale;
  navigate: MarketplaceNavigate;
  products: ProductViewDto[];
  t: MarketplaceTranslate;
}

const sectionCards: Array<{ icon: 'equipment' | 'produce' | 'seeds'; section: Exclude<MarketplaceSection, 'all'> }> = [
  { icon: 'equipment', section: 'equipment' },
  { icon: 'seeds', section: 'seeds' },
  { icon: 'produce', section: 'produce' },
];

const quickActions: ReadonlyArray<readonly [MarketplaceIconName, string, string]> = [
  ['orders', 'agritech.marketplace.scenario.createOrder', '/requests?create=1'],
  ['seeds', 'agritech.marketplace.scenario.sample', '/catalog?section=seeds'],
  ['shield', 'agritech.marketplace.scenario.verify', '/verification'],
  ['account', 'agritech.marketplace.scenario.sell', '/account'],
];

const sectionIcons: Record<Exclude<MarketplaceSection, 'all'>, MarketplaceIconName> = {
  equipment: 'equipment',
  produce: 'produce',
  seeds: 'seeds',
};

function Shelf({
  actions,
  locale,
  navigate,
  products,
  section,
  t,
}: Readonly<{
  actions: ProductActions;
  locale: Locale;
  navigate: MarketplaceNavigate;
  products: ProductViewDto[];
  section: Exclude<MarketplaceSection, 'all'>;
  t: MarketplaceTranslate;
}>) {
  const sectionProducts = products.filter((product) => sectionForProduct(product) === section).slice(0, 4);
  return (
    <section aria-labelledby={`dh-shelf-${section}`} className="dh-section">
      <div className="dh-section__head">
        <div>
          <p className="dh-eyebrow">{t(`agritech.marketplace.section.${section}`)}</p>
          <h2 id={`dh-shelf-${section}`}>{t(`agritech.marketplace.shelf.${section}`)}</h2>
        </div>
        <button
          className="dh-text-button"
          onClick={() => {
            navigate(`/catalog?section=${section}`);
          }}
          type="button"
        >
          {t('agritech.marketplace.shelf.seeAll')}
          <MarketplaceIcon name="arrow" />
        </button>
      </div>
      {sectionProducts.length > 0 ? (
        <div className="dh-product-grid">
          {sectionProducts.map((product) => (
            <MarketplaceProductCard
              favorite={actions.favoriteIds.has(product.id)}
              key={product.id}
              locale={locale}
              onAdd={actions.onAdd}
              onFavorite={actions.onFavorite}
              onOpen={actions.onOpen}
              pendingAction={actions.pendingAction}
              product={product}
              t={t}
            />
          ))}
        </div>
      ) : (
        <div className="dh-inline-empty">
          <MarketplaceIcon name={sectionIcons[section]} />
          <div>
            <strong>{t('agritech.marketplace.catalog.noBranchRecords')}</strong>
            <p>{t('agritech.marketplace.catalog.noBranchRecordsDescription')}</p>
          </div>
          <button
            className="dh-button dh-button--secondary"
            onClick={() => {
              navigate('/requests?create=1');
            }}
            type="button"
          >
            {t('agritech.marketplace.orders.create')}
          </button>
        </div>
      )}
    </section>
  );
}

export function MarketplaceHome(props: Readonly<SharedDiscoveryProps>) {
  const { locale, navigate, products, t, ...actions } = props;
  return (
    <div className="dh-home">
      <section className="dh-hero">
        <div className="dh-hero__content">
          <p className="dh-eyebrow">{t('agritech.marketplace.hero.eyebrow')}</p>
          <h1>{t('agritech.marketplace.hero.title')}</h1>
          <p>{t('agritech.marketplace.hero.subtitle')}</p>
          <div className="dh-hero__actions">
            <button
              className="dh-button dh-button--surface"
              onClick={() => {
                navigate('/catalog');
              }}
              type="button"
            >
              {t('agritech.marketplace.hero.cta')}
              <MarketplaceIcon name="arrow" />
            </button>
            <button
              className="dh-button dh-button--glass"
              onClick={() => {
                navigate('/requests?create=1');
              }}
              type="button"
            >
              {t('agritech.marketplace.orders.create')}
            </button>
          </div>
        </div>
        <div aria-hidden="true" className="dh-hero__illustration">
          <div className="dh-hero__sun" />
          <MarketplaceIcon name="equipment" />
          <span className="dh-hero__furrow dh-hero__furrow--one" />
          <span className="dh-hero__furrow dh-hero__furrow--two" />
          <span className="dh-hero__furrow dh-hero__furrow--three" />
        </div>
      </section>

      <section aria-label={t('agritech.marketplace.catalog')} className="dh-category-grid">
        {sectionCards.map(({ icon, section }) => (
          <button
            className="dh-category-card"
            key={section}
            onClick={() => {
              navigate(`/catalog?section=${section}`);
            }}
            type="button"
          >
            <span className="dh-category-card__icon">
              <MarketplaceIcon name={icon} />
            </span>
            <span>
              <strong>{t(`agritech.marketplace.section.${section}`)}</strong>
              <small>{t(`agritech.marketplace.section.${section}Description`)}</small>
            </span>
            <MarketplaceIcon className="dh-category-card__arrow" name="arrow" />
          </button>
        ))}
      </section>

      <section aria-labelledby="dh-quick-actions" className="dh-scenario-grid">
        <h2 className="dh-sr-only" id="dh-quick-actions">
          {t('agritech.marketplace.quickActions')}
        </h2>
        {quickActions.map(([icon, key, href]) => (
          <button
            className="dh-scenario-card"
            key={key}
            onClick={() => {
              navigate(href);
            }}
            type="button"
          >
            <span className="dh-scenario-card__icon">
              <MarketplaceIcon name={icon} />
            </span>
            <strong>{t(key)}</strong>
            <MarketplaceIcon className="dh-scenario-card__arrow" name="arrow" />
          </button>
        ))}
      </section>

      <Shelf actions={actions} locale={locale} navigate={navigate} products={products} section="seeds" t={t} />
      <Shelf actions={actions} locale={locale} navigate={navigate} products={products} section="equipment" t={t} />
      <Shelf actions={actions} locale={locale} navigate={navigate} products={products} section="produce" t={t} />

      <section aria-labelledby="dh-how-title" className="dh-how">
        <div className="dh-how__intro">
          <p className="dh-eyebrow">{t('agritech.marketplace.orders')}</p>
          <h2 id="dh-how-title">{t('agritech.marketplace.how.title')}</h2>
          <p>{t('agritech.marketplace.how.description')}</p>
        </div>
        <ol className="dh-how__steps">
          {[1, 2, 3].map((step) => (
            <li key={step}>
              <span>{String(step).padStart(2, '0')}</span>
              <strong>{t(`agritech.marketplace.how.step${step}`)}</strong>
              <p>{t(`agritech.marketplace.how.step${step}Desc`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

type SortMode = 'name' | 'priceAsc' | 'priceDesc';

interface CatalogFilters {
  inStock: boolean;
  maxPrice: string;
  minPrice: string;
  query: string;
  region: string;
  section: MarketplaceSection;
  sort: SortMode;
}

const initialFilters = (locationSearch?: string): CatalogFilters => ({
  inStock: false,
  maxPrice: '',
  minPrice: '',
  query: querySearch(locationSearch),
  region: '',
  section: querySection(locationSearch),
  sort: 'name',
});

export function MarketplaceCatalog(props: Readonly<SharedDiscoveryProps & { locationSearch: string }>) {
  const { locale, locationSearch, products, t, ...actions } = props;
  const [filters, setFilters] = useState<CatalogFilters>(() => initialFilters(locationSearch));
  useEffect(() => {
    setFilters((current) => ({
      ...current,
      query: querySearch(locationSearch),
      section: querySection(locationSearch),
    }));
  }, [locationSearch]);
  const regions = useMemo(
    () =>
      [...new Set(products.map((product) => product.region))].sort((left, right) => left.localeCompare(right, locale)),
    [locale, products],
  );
  const filtered = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase(locale);
    const minimum = filters.minPrice ? Number(filters.minPrice) : undefined;
    const maximum = filters.maxPrice ? Number(filters.maxPrice) : undefined;
    const result = products.filter((product) => {
      if (filters.section !== 'all' && sectionForProduct(product) !== filters.section) {
        return false;
      }
      if (
        query &&
        !`${localizedProductName(product, locale)} ${product.supplierName} ${product.region}`
          .toLocaleLowerCase(locale)
          .includes(query)
      ) {
        return false;
      }
      if (filters.region && product.region !== filters.region) {
        return false;
      }
      if (filters.inStock && (product.status !== 'active' || product.stockQuantity <= 0)) {
        return false;
      }
      if (minimum !== undefined && product.priceUzs < minimum) {
        return false;
      }
      if (maximum !== undefined && product.priceUzs > maximum) {
        return false;
      }
      return true;
    });
    return result.sort((left, right) => {
      if (filters.sort === 'priceAsc') {
        return left.priceUzs - right.priceUzs;
      }
      if (filters.sort === 'priceDesc') {
        return right.priceUzs - left.priceUzs;
      }
      return localizedProductName(left, locale).localeCompare(localizedProductName(right, locale), locale);
    });
  }, [filters, locale, products]);

  const reset = () => {
    setFilters({ ...initialFilters(locationSearch), query: '', section: 'all' });
  };
  const filterControls = (
    <div className="dh-filter-fields">
      <label>
        <span>{t('agritech.marketplace.search')}</span>
        <input
          onChange={(event) => {
            setFilters((value) => ({ ...value, query: event.target.value }));
          }}
          type="search"
          value={filters.query}
        />
      </label>
      <fieldset>
        <legend>{t('agritech.marketplace.filter.price')}</legend>
        <div className="dh-field-row">
          <label>
            <span>{t('agritech.marketplace.filter.from')}</span>
            <input
              inputMode="numeric"
              min="0"
              onChange={(event) => {
                setFilters((value) => ({ ...value, minPrice: event.target.value }));
              }}
              type="number"
              value={filters.minPrice}
            />
          </label>
          <label>
            <span>{t('agritech.marketplace.filter.to')}</span>
            <input
              inputMode="numeric"
              min="0"
              onChange={(event) => {
                setFilters((value) => ({ ...value, maxPrice: event.target.value }));
              }}
              type="number"
              value={filters.maxPrice}
            />
          </label>
        </div>
      </fieldset>
      <label>
        <span>{t('agritech.marketplace.filter.region')}</span>
        <select
          onChange={(event) => {
            setFilters((value) => ({ ...value, region: event.target.value }));
          }}
          value={filters.region}
        >
          <option value="">{t('agritech.marketplace.section.all')}</option>
          {regions.map((region) => (
            <option key={region}>{region}</option>
          ))}
        </select>
      </label>
      <label className="dh-check">
        <input
          checked={filters.inStock}
          onChange={(event) => {
            setFilters((value) => ({ ...value, inStock: event.target.checked }));
          }}
          type="checkbox"
        />
        <span>{t('agritech.marketplace.filter.inStock')}</span>
      </label>
      <button className="dh-button dh-button--secondary dh-button--block" onClick={reset} type="button">
        {t('agritech.marketplace.filter.reset')}
      </button>
    </div>
  );

  return (
    <div className="dh-catalog-page">
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.catalog')}</p>
          <h1>
            {filters.section === 'all'
              ? t('agritech.marketplace.catalog')
              : t(`agritech.marketplace.section.${filters.section}`)}
          </h1>
          <p>{t('agritech.marketplace.catalog.description')}</p>
        </div>
        <label className="dh-sort">
          <span>{t('agritech.marketplace.sort')}</span>
          <select
            onChange={(event) => {
              setFilters((value) => ({ ...value, sort: event.target.value as SortMode }));
            }}
            value={filters.sort}
          >
            <option value="name">{t('agritech.marketplace.sort.name')}</option>
            <option value="priceAsc">{t('agritech.marketplace.sort.priceAsc')}</option>
            <option value="priceDesc">{t('agritech.marketplace.sort.priceDesc')}</option>
          </select>
        </label>
      </div>
      <div aria-label={t('agritech.marketplace.catalog.categories')} className="dh-tabs" role="group">
        {(['all', 'equipment', 'seeds', 'produce'] as const).map((section) => (
          <button
            aria-pressed={filters.section === section}
            className={filters.section === section ? 'is-active' : ''}
            key={section}
            onClick={() => {
              setFilters((value) => ({ ...value, section }));
            }}
            type="button"
          >
            {t(`agritech.marketplace.section.${section}`)}
          </button>
        ))}
      </div>
      <details className="dh-mobile-filters">
        <summary>
          <MarketplaceIcon name="search" />
          {t('agritech.marketplace.filter.open')}
        </summary>
        {filterControls}
      </details>
      <div className="dh-catalog-layout">
        <aside aria-label={t('agritech.marketplace.filter.title')} className="dh-filter-panel">
          {filterControls}
        </aside>
        <section aria-labelledby="dh-results-title">
          <div className="dh-results-head">
            <h2 id="dh-results-title">{t('agritech.marketplace.catalog.results')}</h2>
            <span>{t('agritech.marketplace.catalog.resultCount', { count: filtered.length })}</span>
          </div>
          {filtered.length > 0 ? (
            <div className="dh-product-grid">
              {filtered.map((product) => (
                <MarketplaceProductCard
                  favorite={actions.favoriteIds.has(product.id)}
                  key={product.id}
                  locale={locale}
                  onAdd={actions.onAdd}
                  onFavorite={actions.onFavorite}
                  onOpen={actions.onOpen}
                  pendingAction={actions.pendingAction}
                  product={product}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <MarketplaceEmpty
              actionLabel={t('agritech.marketplace.filter.reset')}
              icon="search"
              message={t('agritech.marketplace.catalog.noResultsDescription')}
              onAction={reset}
              title={t('agritech.marketplace.catalog.noResults')}
            />
          )}
        </section>
      </div>
    </div>
  );
}

interface ProductDetailProps extends Omit<SharedDiscoveryProps, 'products'> {
  product?: ProductViewDto;
  reviews: Resource<ReviewViewDto[]>;
  sampleUsage: Resource<SampleUsageViewDto>;
  similar: ProductViewDto[];
  onRetry: () => void;
  onSample: (product: ProductViewDto) => void;
}

export function MarketplaceProductDetail({
  favoriteIds,
  locale,
  navigate,
  onAdd,
  onFavorite,
  onOpen,
  onRetry,
  onSample,
  pendingAction,
  product,
  reviews,
  sampleUsage,
  similar,
  t,
}: Readonly<ProductDetailProps>) {
  const [quantity, setQuantity] = useState(1);
  if (!product) {
    return (
      <MarketplaceEmpty
        actionLabel={t('agritech.marketplace.back')}
        icon="produce"
        message={t('agritech.marketplace.product.notFoundDescription')}
        onAction={() => {
          navigate('/catalog');
        }}
        title={t('agritech.marketplace.product.notFound')}
      />
    );
  }
  const name = localizedProductName(product, locale);
  const productSection = sectionForProduct(product);
  const outOfStock = product.status !== 'active' || product.stockQuantity <= 0;
  const sampleAvailable = sampleUsage.status === 'ready' && sampleUsage.data.remaining > 0;
  let reviewsContent: ReactNode;
  if (reviews.status === 'loading') {
    reviewsContent = <MarketplaceSkeleton count={2} />;
  } else if (reviews.data.length > 0) {
    reviewsContent = (
      <div className="dh-review-list">
        {reviews.data.map((review) => (
          <article key={review.id}>
            <div>
              <strong>{review.rating}/5</strong>
              <span>{formatDate(review.createdAt, locale)}</span>
            </div>
            {review.comment && <p>{review.comment}</p>}
          </article>
        ))}
      </div>
    );
  } else {
    const emptyReviewKey =
      reviews.status === 'error' ? 'agritech.marketplace.reviews.unavailable' : 'agritech.marketplace.reviews.empty';
    reviewsContent = <p className="dh-muted">{t(emptyReviewKey)}</p>;
  }

  return (
    <div className="dh-product-page">
      <button
        className="dh-text-button dh-back"
        onClick={() => {
          navigate('/catalog');
        }}
        type="button"
      >
        <MarketplaceIcon name="arrow" />
        {t('agritech.marketplace.back')}
      </button>
      <div className="dh-product-detail">
        <div className="dh-product-detail__visual">
          <ProductMedia locale={locale} product={product} t={t} />
        </div>
        <section className="dh-product-detail__content">
          <div className="dh-product-detail__heading">
            <div>
              <p className="dh-eyebrow">
                {productSection === 'all'
                  ? t('agritech.marketplace.catalog')
                  : t(`agritech.marketplace.section.${productSection}`)}
              </p>
              <h1>{name}</h1>
              <p>
                {product.region} · {product.supplierName}
              </p>
            </div>
            <button
              aria-label={
                favoriteIds.has(product.id)
                  ? t('agritech.marketplace.product.removeFavorite')
                  : t('agritech.marketplace.product.addFavorite')
              }
              aria-pressed={favoriteIds.has(product.id)}
              className={`dh-icon-button${favoriteIds.has(product.id) ? ' is-active' : ''}`}
              onClick={() => {
                onFavorite(product);
              }}
              type="button"
            >
              <MarketplaceIcon name="heart" />
            </button>
          </div>
          <div className="dh-product-detail__price">
            <strong>{formatMoney(product.priceUzs, locale)}</strong>
            <span>/ {product.unit}</span>
          </div>
          <p className="dh-product-detail__description">{product.description}</p>
          <dl className="dh-facts">
            <div>
              <dt>{t('agritech.marketplace.product.seller')}</dt>
              <dd>{product.supplierName}</dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.filter.region')}</dt>
              <dd>{product.region}</dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.product.stock')}</dt>
              <dd>
                {product.stockQuantity} {product.unit}
              </dd>
            </div>
            <div>
              <dt>{t('agritech.marketplace.product.sku')}</dt>
              <dd>{product.id}</dd>
            </div>
          </dl>
          <div className="dh-buy-row">
            <label className="dh-quantity">
              <span>{t('agritech.marketplace.product.quantity')}</span>
              <input
                min="1"
                onChange={(event) => {
                  setQuantity(Math.max(1, Number(event.target.value) || 1));
                }}
                type="number"
                value={quantity}
              />
            </label>
            <button
              className="dh-button dh-button--primary"
              disabled={outOfStock || pendingAction === `cart:${product.id}`}
              onClick={() => {
                onAdd(product, quantity);
              }}
              type="button"
            >
              <MarketplaceIcon name="cart" />
              {t('agritech.marketplace.product.addToCart')}
            </button>
          </div>
          <div className="dh-sample-callout">
            <MarketplaceIcon name="seeds" />
            <div>
              <strong>{t('agritech.marketplace.product.sample')}</strong>
              <p>{t('agritech.marketplace.samples.deliveryDisclaimer')}</p>
            </div>
            {sampleUsage.status === 'error' ? (
              <div>
                <p className="dh-state-inline dh-state-inline--error">
                  {t('agritech.marketplace.samples.usageUnavailable')}
                </p>
                <button className="dh-button dh-button--secondary" onClick={onRetry} type="button">
                  {t('agritech.marketplace.samples.retry')}
                </button>
              </div>
            ) : (
              <button
                className="dh-button dh-button--secondary"
                disabled={!sampleAvailable || pendingAction === `sample:${product.id}`}
                onClick={() => {
                  onSample(product);
                }}
                type="button"
              >
                {sampleAvailable
                  ? t('agritech.marketplace.product.sample')
                  : t('agritech.marketplace.samples.unavailable')}
              </button>
            )}
          </div>
        </section>
      </div>
      <section aria-labelledby="dh-reviews-title" className="dh-detail-section">
        <div className="dh-section__head">
          <h2 id="dh-reviews-title">{t('agritech.marketplace.product.reviewsTab')}</h2>
        </div>
        {reviewsContent}
      </section>
      {similar.length > 0 && (
        <section aria-labelledby="dh-similar-title" className="dh-section">
          <div className="dh-section__head">
            <h2 id="dh-similar-title">{t('agritech.marketplace.product.similar')}</h2>
          </div>
          <div className="dh-product-grid">
            {similar.slice(0, 4).map((item) => (
              <MarketplaceProductCard
                favorite={favoriteIds.has(item.id)}
                key={item.id}
                locale={locale}
                onAdd={onAdd}
                onFavorite={onFavorite}
                onOpen={onOpen}
                pendingAction={pendingAction}
                product={item}
                t={t}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface FavoritesProps extends SharedDiscoveryProps {
  status: ResourceStatus;
}

export function MarketplaceFavorites({ status, ...props }: Readonly<FavoritesProps>) {
  const favorites = props.products.filter((product) => props.favoriteIds.has(product.id));
  let content: ReactNode;
  if (status === 'loading') {
    content = <MarketplaceSkeleton count={4} />;
  } else if (status === 'error') {
    content = (
      <MarketplaceEmpty
        actionLabel={props.t('ui.runtime.retry')}
        icon="heart"
        message={props.t('agritech.marketplace.favorites.unavailableDescription')}
        onAction={() => {
          globalThis.location.reload();
        }}
        title={props.t('agritech.marketplace.favorites.unavailable')}
      />
    );
  } else if (favorites.length > 0) {
    content = (
      <div className="dh-product-grid">
        {favorites.map((product) => (
          <MarketplaceProductCard
            favorite
            key={product.id}
            locale={props.locale}
            onAdd={props.onAdd}
            onFavorite={props.onFavorite}
            onOpen={props.onOpen}
            pendingAction={props.pendingAction}
            product={product}
            t={props.t}
          />
        ))}
      </div>
    );
  } else {
    content = (
      <MarketplaceEmpty
        actionLabel={props.t('agritech.marketplace.hero.cta')}
        icon="heart"
        message={props.t('agritech.marketplace.favorites.emptyDescription')}
        onAction={() => {
          props.navigate('/catalog');
        }}
        title={props.t('agritech.marketplace.favorites.empty')}
      />
    );
  }
  return (
    <div className="dh-page-stack">
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">{props.t('agritech.marketplace.account')}</p>
          <h1>{props.t('agritech.marketplace.favorites')}</h1>
          <p>{props.t('agritech.marketplace.favorites.description')}</p>
        </div>
      </div>
      {content}
    </div>
  );
}

export function MarketplaceSkeleton({ count = 4 }: Readonly<{ count?: number }>) {
  return (
    <div aria-busy="true" className="dh-skeleton-grid">
      {Array.from({ length: count }, (_, index) => (
        <div className="dh-skeleton" key={index} />
      ))}
    </div>
  );
}

export function MarketplaceEmpty({
  actionLabel,
  icon,
  message,
  onAction,
  title,
}: Readonly<{
  actionLabel?: string;
  icon: 'heart' | 'produce' | 'search';
  message: string;
  onAction?: () => void;
  title: string;
}>) {
  return (
    <div className="dh-empty">
      <span>
        <MarketplaceIcon name={icon} />
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && onAction && (
        <button className="dh-button dh-button--secondary" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
