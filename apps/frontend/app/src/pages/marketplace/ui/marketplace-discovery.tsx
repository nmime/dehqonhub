// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-WEB-006 REQ-AGRITECH-DEMO-024
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type {
  MarketplacePublicSellerDto,
  MarketplaceReviewDto,
  MarketplaceReviewSelfStateDto,
  MarketplaceSampleUsageDto,
} from '@app/frontend-api-client';
import { isReviewerAccessEnabled } from '../../../shared/config';
import type { Resource, ResourceStatus } from '../model/use-marketplace-data';
import { MarketplaceIcon, type MarketplaceIconName } from './marketplace-icon';
import { MarketplaceTractorSilhouette } from './marketplace-brand';
import { MarketplaceDemoBanner } from './marketplace-demo-banner';
import { MarketplaceGallery, MarketplaceGallerySkeleton } from './marketplace-gallery';
import {
  MarketplaceBusyButton,
  MarketplaceFactsSkeleton,
  MarketplaceListSkeleton,
  MarketplaceLoadingRegion,
  MarketplaceProductGridSkeleton,
  MarketplaceStatsSkeleton,
  SkeletonGrid,
  SkeletonLine,
  SkeletonPill,
} from './marketplace-loading';
import { MarketplaceProductCard } from './marketplace-product-card';
import { MarketplaceProductSpecs, MarketplaceProductSpecsSkeleton } from './marketplace-product-specs';
import type { MarketplacePublicProfileDto } from '@app/frontend-api-client';
import { MarketplacePublicProfile, marketplaceSellerProfileHref } from './marketplace-public-profile';
import { MarketplaceRatingSummary } from './marketplace-rating';
import { MarketplaceReviewsSection } from './marketplace-reviews';
import type { MarketplacePhotoCapability, MarketplacePhotoUploadOutcome } from './marketplace-photo-upload';
import {
  formatMoney,
  localizedProductName,
  querySearch,
  querySection,
  sectionForProduct,
  type MarketplaceNavigate,
  type MarketplaceListing,
  type MarketplaceSection,
  type MarketplaceTranslate,
} from './marketplace-ui';

interface ProductActions {
  canTransact?: boolean;
  favoriteIds: ReadonlySet<string>;
  onAdd: (product: MarketplaceListing, quantity?: number) => void;
  onFavorite: (product: MarketplaceListing) => void;
  onOpen: (product: MarketplaceListing) => void;
  pendingAction?: string;
  onTransactionAction?: () => void;
  transactionActionLabel?: string;
  transactionHint?: string;
}

interface SharedDiscoveryProps extends ProductActions {
  locale: Locale;
  navigate: MarketplaceNavigate;
  products: MarketplaceListing[];
  t: MarketplaceTranslate;
}

const quickActions: ReadonlyArray<readonly [MarketplaceIconName, string, string, string]> = [
  [
    'orders',
    'agritech.marketplace.scenario.createOrder',
    'agritech.marketplace.scenario.createOrderDescription',
    '/requests?create=1',
  ],
  [
    'seeds',
    'agritech.marketplace.scenario.sample',
    'agritech.marketplace.scenario.sampleDescription',
    '/catalog?section=seeds',
  ],
  [
    'shield',
    'agritech.marketplace.scenario.verify',
    'agritech.marketplace.scenario.verifyDescription',
    '/verification',
  ],
  [
    'contract',
    'agritech.marketplace.scenario.contracts',
    'agritech.marketplace.scenario.contractsDescription',
    '/account',
  ],
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
  products: MarketplaceListing[];
  section: Exclude<MarketplaceSection, 'all'>;
  t: MarketplaceTranslate;
}>) {
  const sectionProducts = products.filter((product) => sectionForProduct(product) === section).slice(0, 5);
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
              canTransact={actions.canTransact}
              favorite={actions.favoriteIds.has(product.id)}
              key={product.id}
              locale={locale}
              onAdd={actions.onAdd}
              onFavorite={actions.onFavorite}
              onOpen={actions.onOpen}
              onOpenSeller={(item) => {
                navigate(marketplaceSellerProfileHref(item.supplierId));
              }}
              pendingAction={actions.pendingAction}
              product={product}
              t={t}
              transactionHint={actions.transactionHint}
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
  // Reviewer entry is a deployment decision, not a property of the catalog: the
  // live catalog carries real transactional listings and no demo provenance.
  const showsReviewerAccess = isReviewerAccessEnabled();
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
          <span className="dh-hero__raster">
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          <MarketplaceTractorSilhouette className="dh-hero__silhouette" />
        </div>
      </section>

      <section aria-labelledby="dh-quick-actions" className="dh-scenario-grid">
        <h2 className="dh-sr-only" id="dh-quick-actions">
          {t('agritech.marketplace.quickActions')}
        </h2>
        {quickActions.map(([icon, key, descriptionKey, href]) => (
          <button
            aria-label={t(key)}
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
            <span className="dh-scenario-card__copy">
              <strong>{t(key)}</strong>
              <small>{t(descriptionKey)}</small>
            </span>
            <MarketplaceIcon className="dh-scenario-card__arrow" name="arrow" />
          </button>
        ))}
      </section>

      {showsReviewerAccess ? <MarketplaceDemoBanner navigate={navigate} t={t} /> : null}

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
              <span className="dh-how__step-copy">
                <strong>{t(`agritech.marketplace.how.step${step}`)}</strong>
                <span>{t(`agritech.marketplace.how.step${step}Desc`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

type SortMode = 'name' | 'newest' | 'priceAsc' | 'priceDesc';

interface CatalogFilters {
  /** Input categories, multi-select: a shopper looks for seed *and* fertiliser. */
  categories: readonly string[];
  crops: readonly string[];
  grades: readonly string[];
  inStock: boolean;
  maxPrice: string;
  minPrice: string;
  query: string;
  region: string;
  sampleAvailable: boolean;
  section: MarketplaceSection;
  sort: SortMode;
  verifiedOnly: boolean;
}

const initialFilters = (locationSearch?: string): CatalogFilters => ({
  categories: [],
  crops: [],
  grades: [],
  inStock: false,
  maxPrice: '',
  minPrice: '',
  query: querySearch(locationSearch),
  region: '',
  sampleAvailable: false,
  section: querySection(locationSearch),
  sort: 'name',
  verifiedOnly: false,
});

/**
 * Which input categories a section offers, mirroring the server's own taxonomy.
 * Produce has none: a harvest is chosen by crop and grade, not by category.
 */
const categoriesBySection: Record<MarketplaceSection, readonly string[]> = {
  all: ['equipment', 'irrigation', 'seed', 'fertilizer', 'pesticide'],
  equipment: ['equipment', 'irrigation'],
  produce: [],
  seeds: ['seed', 'fertilizer', 'pesticide'],
};

/** Toggles one value of a multi-select facet. */
const toggleFacet = (values: readonly string[], value: string): readonly string[] =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

const matchesText = (product: MarketplaceListing, query: string, locale: Locale): boolean =>
  !query ||
  `${localizedProductName(product, locale)} ${product.supplierName} ${product.region}`
    .toLocaleLowerCase(locale)
    .includes(query);

const matchesFacets = (product: MarketplaceListing, filters: CatalogFilters): boolean => {
  if (filters.region && product.region !== filters.region) {
    return false;
  }
  if (filters.categories.length > 0 && !filters.categories.includes(product.category)) {
    return false;
  }
  if (filters.crops.length > 0 && !(product.crop && filters.crops.includes(product.crop))) {
    return false;
  }
  return filters.grades.length === 0 || Boolean(product.grade && filters.grades.includes(product.grade));
};

const matchesAvailability = (product: MarketplaceListing, filters: CatalogFilters): boolean => {
  if (filters.verifiedOnly && !product.supplierVerified) {
    return false;
  }
  if (filters.inStock && (product.status !== 'active' || product.stockQuantity <= 0)) {
    return false;
  }
  return !filters.sampleAvailable || product.sampleAvailable;
};

const matchesPrice = (product: MarketplaceListing, filters: CatalogFilters): boolean => {
  const minimum = filters.minPrice ? Number(filters.minPrice) : undefined;
  const maximum = filters.maxPrice ? Number(filters.maxPrice) : undefined;
  if (minimum !== undefined && product.priceUzs < minimum) {
    return false;
  }
  return maximum === undefined || product.priceUzs <= maximum;
};

/**
 * Sorting order. Promoted listings lead every ordering except an explicit price
 * sort, which is what a seller's promotion plan actually pays for — before this
 * the screen sorted by name and a paid placement changed nothing.
 */
const compareListings = (
  left: MarketplaceListing,
  right: MarketplaceListing,
  sort: SortMode,
  locale: Locale,
): number => {
  if (sort !== 'priceAsc' && sort !== 'priceDesc' && left.promoted !== right.promoted) {
    return left.promoted ? -1 : 1;
  }
  if (sort === 'priceAsc') {
    return left.priceUzs - right.priceUzs;
  }
  if (sort === 'priceDesc') {
    return right.priceUzs - left.priceUzs;
  }
  if (sort === 'newest') {
    return right.publishedAt.localeCompare(left.publishedAt);
  }
  return localizedProductName(left, locale).localeCompare(localizedProductName(right, locale), locale);
};

function CatalogCrumbs({
  navigate,
  section,
  t,
}: Readonly<{ navigate: MarketplaceNavigate; section: MarketplaceSection; t: MarketplaceTranslate }>) {
  return (
    <nav aria-label={t('agritech.marketplace.accessibility.breadcrumbs')} className="dh-crumbs">
      <button
        onClick={() => {
          navigate('/');
        }}
        type="button"
      >
        {t('agritech.marketplace.home')}
      </button>
      <span aria-hidden="true">·</span>
      {section === 'all' ? (
        <span>{t('agritech.marketplace.catalog')}</span>
      ) : (
        <>
          <button
            onClick={() => {
              navigate('/catalog');
            }}
            type="button"
          >
            {t('agritech.marketplace.catalog')}
          </button>
          <span aria-hidden="true">·</span>
          <span>{t(`agritech.marketplace.section.${section}`)}</span>
        </>
      )}
    </nav>
  );
}

interface CatalogFilterPanelProps {
  crops: readonly string[];
  filters: CatalogFilters;
  grades: readonly string[];
  matchCount: number;
  onClose: () => void;
  onReset: () => void;
  regions: readonly string[];
  sectionCategories: readonly string[];
  setFilters: Dispatch<SetStateAction<CatalogFilters>>;
  t: MarketplaceTranslate;
}

/** Every question the catalog can ask about a listing, grouped as the reference does. */
function CatalogFilterPanel({
  crops,
  filters,
  grades,
  matchCount,
  onClose,
  onReset,
  regions,
  sectionCategories,
  setFilters,
  t,
}: Readonly<CatalogFilterPanelProps>) {
  return (
    <div className="dh-filter-fields">
      <div className="dh-filter-group">
        <h4>{t('agritech.marketplace.filter.query')}</h4>
        <label>
          <span className="dh-sr-only">{t('agritech.marketplace.filter.query')}</span>
          <input
            onChange={(event) => {
              setFilters((value) => ({ ...value, query: event.target.value }));
            }}
            placeholder={t('agritech.marketplace.filter.queryPlaceholder')}
            type="search"
            value={filters.query}
          />
        </label>
      </div>
      <div className="dh-filter-group">
        <h4>{t('agritech.marketplace.filter.price')}</h4>
        <div className="dh-field-row">
          <label>
            <span className="dh-sr-only">{t('agritech.marketplace.filter.from')}</span>
            <input
              inputMode="numeric"
              min="0"
              onChange={(event) => {
                setFilters((value) => ({ ...value, minPrice: event.target.value }));
              }}
              placeholder={t('agritech.marketplace.filter.fromPlaceholder')}
              type="number"
              value={filters.minPrice}
            />
          </label>
          <label>
            <span className="dh-sr-only">{t('agritech.marketplace.filter.to')}</span>
            <input
              inputMode="numeric"
              min="0"
              onChange={(event) => {
                setFilters((value) => ({ ...value, maxPrice: event.target.value }));
              }}
              placeholder={t('agritech.marketplace.filter.toPlaceholder')}
              type="number"
              value={filters.maxPrice}
            />
          </label>
        </div>
      </div>
      <div className="dh-filter-group">
        <h4>{t('agritech.marketplace.filter.trust')}</h4>
        <label className="dh-check dh-check--toggle">
          <input
            checked={filters.verifiedOnly}
            onChange={(event) => {
              setFilters((value) => ({ ...value, verifiedOnly: event.target.checked }));
            }}
            type="checkbox"
          />
          <span>{t('agritech.marketplace.filter.verifiedOnly')}</span>
        </label>
        <label className="dh-check dh-check--toggle">
          <input
            checked={filters.sampleAvailable}
            onChange={(event) => {
              setFilters((value) => ({ ...value, sampleAvailable: event.target.checked }));
            }}
            type="checkbox"
          />
          <span>{t('agritech.marketplace.filter.sampleAvailable')}</span>
        </label>
        <label className="dh-check dh-check--toggle">
          <input
            checked={filters.inStock}
            onChange={(event) => {
              setFilters((value) => ({ ...value, inStock: event.target.checked }));
            }}
            type="checkbox"
          />
          <span>{t('agritech.marketplace.filter.inStock')}</span>
        </label>
      </div>
      {/* Each section asks its own questions: inputs are chosen by category, a
            harvest by crop and grade. Facets are built from the results in hand, so
            a box is only offered when something behind it exists. */}
      {sectionCategories.length > 0 ? (
        <div className="dh-filter-group">
          <h4>{t('agritech.marketplace.filter.category')}</h4>
          {sectionCategories.map((category) => (
            <label className="dh-check" key={category}>
              <input
                checked={filters.categories.includes(category)}
                onChange={() => {
                  setFilters((value) => ({ ...value, categories: toggleFacet(value.categories, category) }));
                }}
                type="checkbox"
              />
              <span>{t(`agritech.marketplace.category.${category}`)}</span>
            </label>
          ))}
        </div>
      ) : null}
      {crops.length > 0 ? (
        <div className="dh-filter-group">
          <h4>{t('agritech.marketplace.filter.crop')}</h4>
          {crops.map((crop) => (
            <label className="dh-check" key={crop}>
              <input
                checked={filters.crops.includes(crop)}
                onChange={() => {
                  setFilters((value) => ({ ...value, crops: toggleFacet(value.crops, crop) }));
                }}
                type="checkbox"
              />
              <span>{crop}</span>
            </label>
          ))}
        </div>
      ) : null}
      {grades.length > 0 ? (
        <div className="dh-filter-group">
          <h4>{t('agritech.marketplace.filter.grade')}</h4>
          {grades.map((grade) => (
            <label className="dh-check" key={grade}>
              <input
                checked={filters.grades.includes(grade)}
                onChange={() => {
                  setFilters((value) => ({ ...value, grades: toggleFacet(value.grades, grade) }));
                }}
                type="checkbox"
              />
              <span>{t('agritech.marketplace.filter.gradeValue', { grade })}</span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="dh-filter-group">
        <h4>{t('agritech.marketplace.filter.region')}</h4>
        <label>
          <span className="dh-sr-only">{t('agritech.marketplace.filter.region')}</span>
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
      </div>
      <button
        className="dh-button dh-button--primary dh-button--block"
        onClick={() => {
          onClose();
          document.getElementById('dh-results-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        type="button"
      >
        {matchCount === 1
          ? t('agritech.marketplace.filter.showOne')
          : t('agritech.marketplace.filter.show', { count: matchCount })}
      </button>
      <button className="dh-filter-reset" onClick={onReset} type="button">
        {t('agritech.marketplace.filter.reset')}
      </button>
    </div>
  );
}

export function MarketplaceCatalog(props: Readonly<SharedDiscoveryProps & { locationSearch: string }>) {
  const { locale, locationSearch, navigate, products, t, ...actions } = props;
  const [filters, setFilters] = useState<CatalogFilters>(() => initialFilters(locationSearch));
  const mobileFiltersDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') {
      return undefined;
    }
    const desktopViewport = globalThis.matchMedia('(min-width: 56.001rem)');
    const closeOnDesktop = () => {
      const dialog = mobileFiltersDialog.current;
      if (!desktopViewport.matches || !dialog?.open) {
        return;
      }
      if (typeof dialog.close === 'function') {
        dialog.close();
        return;
      }
      dialog.removeAttribute('open');
    };
    closeOnDesktop();
    desktopViewport.addEventListener('change', closeOnDesktop);
    return () => {
      desktopViewport.removeEventListener('change', closeOnDesktop);
    };
  }, []);

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
  /** Listings of the open section, which is what the section facets are drawn from. */
  const sectionProducts = useMemo(
    () =>
      filters.section === 'all'
        ? products
        : products.filter((product) => sectionForProduct(product) === filters.section),
    [filters.section, products],
  );
  const sectionCategories = useMemo(() => {
    const offered = new Set<string>(sectionProducts.map((product) => product.category));
    return categoriesBySection[filters.section].filter((category) => offered.has(category));
  }, [filters.section, sectionProducts]);
  const crops = useMemo(
    () =>
      [...new Set(sectionProducts.flatMap((product) => (product.crop ? [product.crop] : [])))].sort((left, right) =>
        left.localeCompare(right, locale),
      ),
    [locale, sectionProducts],
  );
  const grades = useMemo(
    () =>
      [...new Set(sectionProducts.flatMap((product) => (product.grade ? [product.grade] : [])))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [sectionProducts],
  );
  const filtered = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase(locale);
    return products
      .filter(
        (product) =>
          (filters.section === 'all' || sectionForProduct(product) === filters.section) &&
          matchesText(product, query, locale) &&
          matchesFacets(product, filters) &&
          matchesAvailability(product, filters) &&
          matchesPrice(product, filters),
      )
      .sort((left, right) => compareListings(left, right, filters.sort, locale));
  }, [filters, locale, products]);

  const reset = () => {
    setFilters({ ...initialFilters(locationSearch), query: '', section: 'all' });
  };
  const closeMobileFilters = () => {
    const dialog = mobileFiltersDialog.current;
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === 'function') {
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
  };
  const openMobileFilters = () => {
    const dialog = mobileFiltersDialog.current;
    if (!dialog || dialog.open) {
      return;
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      return;
    }
    dialog.setAttribute('open', '');
  };
  const hasActiveFilters = Boolean(
    filters.query ||
    filters.region ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.inStock ||
    filters.sampleAvailable,
  );

  return (
    <div className="dh-catalog-page">
      <CatalogCrumbs navigate={navigate} section={filters.section} t={t} />
      <div className="dh-page-heading">
        <div>
          <h1>
            {filters.section === 'all'
              ? t('agritech.marketplace.catalog')
              : t(`agritech.marketplace.section.${filters.section}`)}
          </h1>
          <p className="dh-page-heading__count">
            {filtered.length === 1
              ? t('agritech.marketplace.catalog.resultCountOne')
              : t('agritech.marketplace.catalog.resultCount', { count: filtered.length })}
          </p>
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
            <option value="newest">{t('agritech.marketplace.sort.newest')}</option>
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
      {hasActiveFilters ? (
        <div aria-label={t('agritech.marketplace.filter.active')} className="dh-active-filters">
          {filters.query ? (
            <button
              onClick={() => {
                setFilters((value) => ({ ...value, query: '' }));
              }}
              type="button"
            >
              {t('agritech.marketplace.filter.queryChip', { value: filters.query })}
              <MarketplaceIcon name="close" />
            </button>
          ) : null}
          {filters.region ? (
            <button
              onClick={() => {
                setFilters((value) => ({ ...value, region: '' }));
              }}
              type="button"
            >
              {t('agritech.marketplace.filter.regionChip', { value: filters.region })}
              <MarketplaceIcon name="close" />
            </button>
          ) : null}
          {filters.minPrice || filters.maxPrice ? (
            <button
              onClick={() => {
                setFilters((value) => ({ ...value, maxPrice: '', minPrice: '' }));
              }}
              type="button"
            >
              {t('agritech.marketplace.filter.priceChip')}
              <MarketplaceIcon name="close" />
            </button>
          ) : null}
          {filters.inStock ? (
            <button
              onClick={() => {
                setFilters((value) => ({ ...value, inStock: false }));
              }}
              type="button"
            >
              {t('agritech.marketplace.filter.inStock')}
              <MarketplaceIcon name="close" />
            </button>
          ) : null}
          {filters.sampleAvailable ? (
            <button
              onClick={() => {
                setFilters((value) => ({ ...value, sampleAvailable: false }));
              }}
              type="button"
            >
              {t('agritech.marketplace.filter.sampleAvailable')}
              <MarketplaceIcon name="close" />
            </button>
          ) : null}
          <button className="dh-active-filters__reset" onClick={reset} type="button">
            {t('agritech.marketplace.filter.reset')}
          </button>
        </div>
      ) : null}
      <button className="dh-mobile-filter-trigger" onClick={openMobileFilters} type="button">
        <MarketplaceIcon name="search" />
        {t('agritech.marketplace.filter.open')}
      </button>
      <dialog
        aria-labelledby="dh-mobile-filter-title"
        className="dh-mobile-filter-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeMobileFilters();
        }}
        ref={mobileFiltersDialog}
      >
        <section className="dh-mobile-filter-sheet">
          <header>
            <h2 id="dh-mobile-filter-title">{t('agritech.marketplace.filter.title')}</h2>
            <button aria-label={t('agritech.marketplace.close')} onClick={closeMobileFilters} type="button">
              <MarketplaceIcon name="close" />
            </button>
          </header>
          <CatalogFilterPanel
            crops={crops}
            filters={filters}
            grades={grades}
            matchCount={filtered.length}
            onClose={closeMobileFilters}
            onReset={reset}
            regions={regions}
            sectionCategories={sectionCategories}
            setFilters={setFilters}
            t={t}
          />
        </section>
      </dialog>
      <div className="dh-catalog-layout">
        <aside aria-label={t('agritech.marketplace.filter.title')} className="dh-filter-panel">
          <CatalogFilterPanel
            crops={crops}
            filters={filters}
            grades={grades}
            matchCount={filtered.length}
            onClose={closeMobileFilters}
            onReset={reset}
            regions={regions}
            sectionCategories={sectionCategories}
            setFilters={setFilters}
            t={t}
          />
        </aside>
        <section aria-labelledby="dh-results-title">
          <h2 className="dh-sr-only" id="dh-results-title">
            {t('agritech.marketplace.catalog.results')}
          </h2>
          {filtered.length > 0 ? (
            <div className="dh-product-grid">
              {filtered.map((product) => (
                <MarketplaceProductCard
                  canTransact={actions.canTransact}
                  favorite={actions.favoriteIds.has(product.id)}
                  key={product.id}
                  locale={locale}
                  onAdd={actions.onAdd}
                  onFavorite={actions.onFavorite}
                  onOpen={actions.onOpen}
                  onOpenSeller={(item) => {
                    navigate(marketplaceSellerProfileHref(item.supplierId));
                  }}
                  pendingAction={actions.pendingAction}
                  product={product}
                  t={t}
                  transactionHint={actions.transactionHint}
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
  canReview: boolean;
  canReplyToReviews: boolean;
  canReportReviews: boolean;
  product?: MarketplaceListing;
  reviews: Resource<MarketplaceReviewDto[]>;
  sampleUsage: Resource<MarketplaceSampleUsageDto>;
  similar: MarketplaceListing[];
  onReview: (
    product: MarketplaceListing,
    rating: number,
    comment?: string,
    assetReferences?: readonly string[],
  ) => Promise<boolean>;
  /** Sends one review photograph, when the shell can store one. */
  onUploadPhoto?: (file: File) => Promise<MarketplacePhotoUploadOutcome>;
  photoCapability?: MarketplacePhotoCapability;
  onReplyToReview: (review: MarketplaceReviewDto, comment: string) => Promise<boolean>;
  onReportReview: (
    review: MarketplaceReviewDto,
    reason: 'abuse' | 'off_topic' | 'privacy' | 'spam',
    comment?: string,
  ) => Promise<boolean>;
  onRetry: () => void;
  onSample: (product: MarketplaceListing) => void;
  /**
   * The server's answer to whether this caller may still rate this listing, and
   * the review they already left. The public review projection carries no author,
   * so nothing else on this page can tell "you already rated this" apart from
   * "you never could"; until the shell has read it, the ratings block falls back
   * to `canReview`.
   */
  reviewSelfState?: MarketplaceReviewSelfStateDto;
  reviewSelfStateStatus?: ResourceStatus;
}

function ProductSampleAction({
  restrictionId,
  transactionRestricted,
  onRetry,
  onSample,
  pendingAction,
  product,
  sampleAvailable,
  sampleUsageStatus,
  t,
}: Readonly<{
  restrictionId: string;
  transactionRestricted: boolean;
  onRetry: () => void;
  onSample: (product: MarketplaceListing) => void;
  pendingAction?: string;
  product: MarketplaceListing;
  sampleAvailable: boolean;
  sampleUsageStatus: ResourceStatus;
  t: MarketplaceTranslate;
}>) {
  if (transactionRestricted) {
    return (
      <button aria-describedby={restrictionId} className="dh-button dh-button--secondary" disabled type="button">
        {t('agritech.marketplace.product.sample')}
      </button>
    );
  }
  if (sampleUsageStatus === 'error') {
    return (
      <div>
        <p className="dh-state-inline dh-state-inline--error">{t('agritech.marketplace.samples.usageUnavailable')}</p>
        <button className="dh-button dh-button--secondary" onClick={onRetry} type="button">
          {t('agritech.marketplace.samples.retry')}
        </button>
      </div>
    );
  }
  return (
    <MarketplaceBusyButton
      busy={pendingAction === `sample:${product.id}`}
      busyLabel={t('agritech.marketplace.loading')}
      className="dh-button dh-button--secondary"
      disabled={!sampleAvailable}
      onClick={() => {
        onSample(product);
      }}
      type="button"
    >
      {sampleAvailable ? t('agritech.marketplace.product.sample') : t('agritech.marketplace.samples.unavailable')}
    </MarketplaceBusyButton>
  );
}

export function MarketplaceProductDetail({
  canTransact = true,
  canReview,
  canReplyToReviews,
  canReportReviews,
  favoriteIds,
  locale,
  navigate,
  onAdd,
  onFavorite,
  onOpen,
  onReview,
  onUploadPhoto,
  photoCapability,
  onReplyToReview,
  onReportReview,
  onRetry,
  onSample,
  onTransactionAction,
  pendingAction,
  product,
  reviews,
  reviewSelfState,
  reviewSelfStateStatus,
  sampleUsage,
  similar,
  t,
  transactionActionLabel,
  transactionHint,
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
  const isDemo = product.provenance === 'demo';
  const transactionRestricted = !canTransact || product.transactional === false;
  const restrictionHint = isDemo ? t('agritech.marketplace.access.demo') : transactionHint;
  const restrictionId = `marketplace-product-${product.id}-detail-restriction`;

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
          <MarketplaceGallery locale={locale} product={product} t={t} />
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
              {product.provenance === 'demo' ? (
                <span className="dh-badge dh-badge--neutral">{t('agritech.marketplace.access.demoBadge')}</span>
              ) : null}
              <p>
                {product.region} · {product.supplierName}
              </p>
              {/* The same aggregate the catalog card carries, so opening a listing
                  never changes the score it was chosen on. */}
              <MarketplaceRatingSummary layout="detail" locale={locale} rating={product.rating} t={t} />
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
          <MarketplaceProductSpecs
            locale={locale}
            onOpenSeller={() => {
              navigate(marketplaceSellerProfileHref(product.supplierId));
            }}
            product={product}
            t={t}
          />
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
            <MarketplaceBusyButton
              aria-describedby={transactionRestricted ? restrictionId : undefined}
              busy={pendingAction === `cart:${product.id}`}
              busyLabel={t('agritech.marketplace.loading')}
              className="dh-button dh-button--primary"
              disabled={outOfStock}
              icon="cart"
              onClick={() => {
                onAdd(product, quantity);
              }}
              type="button"
            >
              {t(
                transactionRestricted
                  ? 'agritech.marketplace.product.addToPreviewCart'
                  : 'agritech.marketplace.product.addToCart',
              )}
            </MarketplaceBusyButton>
          </div>
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
          <div className="dh-sample-callout">
            <MarketplaceIcon name="seeds" />
            <div>
              <strong>{t('agritech.marketplace.product.sample')}</strong>
              <p>{t('agritech.marketplace.samples.deliveryDisclaimer')}</p>
            </div>
            <ProductSampleAction
              restrictionId={restrictionId}
              transactionRestricted={transactionRestricted}
              onRetry={onRetry}
              onSample={onSample}
              pendingAction={pendingAction}
              product={product}
              sampleAvailable={sampleAvailable}
              sampleUsageStatus={sampleUsage.status}
              t={t}
            />
          </div>
        </section>
      </div>
      <MarketplaceReviewsSection
        canReplyToReviews={canReplyToReviews}
        canReportReviews={canReportReviews}
        canReview={canReview}
        listing={product}
        locale={locale}
        onReplyToReview={onReplyToReview}
        onReportReview={onReportReview}
        onReview={onReview}
        onUploadPhoto={onUploadPhoto}
        pendingAction={pendingAction}
        photoCapability={photoCapability}
        reviews={reviews}
        selfState={reviewSelfState}
        selfStateStatus={reviewSelfStateStatus}
        t={t}
      />
      {similar.length > 0 && (
        <section aria-labelledby="dh-similar-title" className="dh-section">
          <div className="dh-section__head">
            <h2 id="dh-similar-title">{t('agritech.marketplace.product.similar')}</h2>
          </div>
          <div className="dh-product-grid">
            {similar.slice(0, 5).map((item) => (
              <MarketplaceProductCard
                canTransact={canTransact}
                favorite={favoriteIds.has(item.id)}
                key={item.id}
                locale={locale}
                onAdd={onAdd}
                onFavorite={onFavorite}
                onOpen={onOpen}
                onOpenSeller={(entry) => {
                  navigate(marketplaceSellerProfileHref(entry.supplierId));
                }}
                pendingAction={pendingAction}
                product={item}
                t={t}
                transactionHint={transactionHint}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface SellerProfileProps extends ProductActions {
  catalog: Resource<MarketplaceListing[]>;
  locale: Locale;
  navigate: MarketplaceNavigate;
  /** Supplied by the page; absent in a bare render, where the block is skipped. */
  publicProfile?: Resource<MarketplacePublicProfileDto | null>;
  seller: Resource<MarketplacePublicSellerDto | null>;
  t: MarketplaceTranslate;
}

/**
 * The seller route. The loading region persists across the transition, so the
 * same status that announced the route as loading announces it as ready instead
 * of unmounting silently.
 */
export function MarketplaceSellerProfile(props: Readonly<SellerProfileProps>) {
  return (
    <MarketplaceLoadingRegion
      busy={props.seller.status === 'loading' || props.seller.status === 'idle'}
      label={props.t('agritech.marketplace.seller.title')}
      skeleton={
        <div className="dh-page-stack">
          <MarketplaceSellerProfileSkeleton />
        </div>
      }
      t={props.t}
    >
      <SellerProfileContent {...props} />
    </MarketplaceLoadingRegion>
  );
}

function SellerProfileContent({
  canTransact = true,
  catalog,
  favoriteIds,
  locale,
  navigate,
  onAdd,
  onFavorite,
  onOpen,
  pendingAction,
  publicProfile,
  seller,
  t,
  transactionHint,
}: Readonly<SellerProfileProps>) {
  if (seller.status === 'error' || !seller.data) {
    return (
      <MarketplaceEmpty
        actionLabel={t('agritech.marketplace.back')}
        headingLevel={1}
        icon="produce"
        message={t('agritech.marketplace.seller.notFoundDescription')}
        onAction={() => {
          navigate('/catalog');
        }}
        title={t('agritech.marketplace.seller.notFound')}
      />
    );
  }

  return (
    <div className="dh-page-stack">
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
      <div className="dh-account-hero">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.seller.title')}</p>
          <h1>{seller.data.displayName}</h1>
          <p>{seller.data.description ?? t('agritech.marketplace.seller.noDescription')}</p>
          <small>{seller.data.region}</small>
        </div>
        <div className={`dh-verification-chip${seller.data.verified ? ' dh-verification-chip--verified' : ''}`}>
          <MarketplaceIcon name="shield" />
          <span>
            {seller.data.provenance === 'demo'
              ? t('agritech.marketplace.access.demoBadge')
              : t('agritech.marketplace.seller.verified')}
          </span>
        </div>
      </div>
      {/* The public reputation record of the same organization: completed-deal
          counts, the reviews it received, and the reviews it wrote. The page reads
          it by the public seller address the catalog already links to, so no second
          identifier reaches the browser. */}
      {publicProfile ? (
        <MarketplacePublicProfile identity={false} locale={locale} navigate={navigate} profile={publicProfile} t={t} />
      ) : null}
      <section aria-labelledby="dh-seller-catalog" className="dh-detail-section">
        <div className="dh-section__head">
          <h2 id="dh-seller-catalog">{t('agritech.marketplace.seller.catalog')}</h2>
        </div>
        <MarketplaceLoadingRegion
          busy={catalog.status === 'loading' || catalog.status === 'idle'}
          label={t('agritech.marketplace.seller.catalog')}
          skeleton={<MarketplaceProductGridSkeleton count={4} />}
          t={t}
        >
          {catalog.status === 'error' ? (
            <p className="dh-state-inline dh-state-inline--error">
              {t('agritech.marketplace.catalog.unavailableDescription')}
            </p>
          ) : null}
          {catalog.status === 'empty' ? (
            <MarketplaceEmpty
              icon="produce"
              message={t('agritech.marketplace.seller.emptyDescription')}
              title={t('agritech.marketplace.seller.empty')}
            />
          ) : null}
          {catalog.data.length > 0 ? (
            <div className="dh-product-grid">
              {catalog.data.map((product) => (
                <MarketplaceProductCard
                  canTransact={canTransact}
                  favorite={favoriteIds.has(product.id)}
                  key={product.id}
                  locale={locale}
                  onAdd={onAdd}
                  onFavorite={onFavorite}
                  onOpen={onOpen}
                  pendingAction={pendingAction}
                  product={product}
                  t={t}
                  transactionHint={transactionHint}
                />
              ))}
            </div>
          ) : null}
        </MarketplaceLoadingRegion>
      </section>
    </div>
  );
}

interface FavoritesProps extends SharedDiscoveryProps {
  localOnly: boolean;
  status: ResourceStatus;
}

export function MarketplaceFavorites({ localOnly, status, ...props }: Readonly<FavoritesProps>) {
  const favorites = props.products.filter((product) => props.favoriteIds.has(product.id));
  let settled: ReactNode;
  if (status === 'error') {
    settled = (
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
    settled = (
      <div className="dh-product-grid">
        {favorites.map((product) => (
          <MarketplaceProductCard
            canTransact={props.canTransact}
            favorite
            key={product.id}
            locale={props.locale}
            onAdd={props.onAdd}
            onFavorite={props.onFavorite}
            onOpen={props.onOpen}
            onOpenSeller={(item) => {
              props.navigate(marketplaceSellerProfileHref(item.supplierId));
            }}
            pendingAction={props.pendingAction}
            product={product}
            t={props.t}
            transactionHint={props.transactionHint}
          />
        ))}
      </div>
    );
  } else {
    settled = (
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
  const content = (
    <MarketplaceLoadingRegion
      busy={status === 'loading'}
      label={props.t('agritech.marketplace.favorites')}
      skeleton={<MarketplaceProductGridSkeleton count={4} />}
      t={props.t}
    >
      {settled}
    </MarketplaceLoadingRegion>
  );
  return (
    <div className="dh-page-stack">
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">{props.t('agritech.marketplace.account')}</p>
          <h1>{props.t('agritech.marketplace.favorites')}</h1>
          <p>{props.t('agritech.marketplace.favorites.description')}</p>
        </div>
      </div>
      {localOnly ? (
        <div className="dh-local-favorites-note" role="note">
          <MarketplaceIcon name="heart" />
          <span>{props.t('agritech.marketplace.favorites.localOnly')}</span>
        </div>
      ) : null}
      {content}
    </div>
  );
}

/**
 * The marketplace's shared skeleton. Every renderer in this page imports it by
 * this name, so `count` keeps its meaning and its default; `shape` is an added
 * optional prop that lets a caller ask for the shape of the content it stands in
 * for instead of always getting a grid of catalog cards. A cart line, an offer
 * or a publication row is a row, not a 3:4 tile.
 */
export function MarketplaceSkeleton({
  count = 4,
  shape = 'cards',
}: Readonly<{ count?: number; shape?: 'cards' | 'facts' | 'rows' | 'stats' }>) {
  if (shape === 'rows') {
    return <MarketplaceListSkeleton count={count} />;
  }
  if (shape === 'facts') {
    return <MarketplaceFactsSkeleton rows={count} />;
  }
  if (shape === 'stats') {
    return <MarketplaceStatsSkeleton count={count} />;
  }
  return <MarketplaceProductGridSkeleton count={count} />;
}

/**
 * The product route's own loading shape: the gallery frame and its thumbnail
 * strip in the visual column, and the eyebrow, title, price, description,
 * grouped specs and buy action in the content column, laid out on
 * `.dh-product-detail`'s own two-track grid.
 */
export function MarketplaceProductDetailSkeleton() {
  return (
    <SkeletonGrid shape="detail">
      <MarketplaceGallerySkeleton />
      <span aria-hidden="true" className="dh-sk-detail">
        <SkeletonLine width="quarter" />
        <SkeletonLine size="title" width="wide" />
        <SkeletonLine size="title" width="third" />
        <SkeletonLine />
        <SkeletonLine width="wide" />
        <MarketplaceProductSpecsSkeleton />
        <SkeletonPill />
      </span>
    </SkeletonGrid>
  );
}

/**
 * The seller route's own loading shape: the account hero the seller's name and
 * description fill, then the catalog grid under its section heading.
 */
export function MarketplaceSellerProfileSkeleton() {
  return (
    <SkeletonGrid shape="plain">
      <span aria-hidden="true" className="dh-sk-hero">
        <span className="dh-sk-hero__copy">
          <SkeletonLine width="quarter" />
          <SkeletonLine size="title" width="half" />
          <SkeletonLine width="wide" />
          <SkeletonLine width="third" />
        </span>
        <SkeletonPill />
      </span>
      <SkeletonLine size="lead" width="third" />
      <MarketplaceProductGridSkeleton count={4} />
    </SkeletonGrid>
  );
}

export function MarketplaceEmpty({
  actionLabel,
  headingLevel = 2,
  icon,
  message,
  onAction,
  title,
}: Readonly<{
  actionLabel?: string;
  headingLevel?: 1 | 2;
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
      {headingLevel === 1 ? <h1>{title}</h1> : <h2>{title}</h2>}
      <p>{message}</p>
      {actionLabel && onAction && (
        <button className="dh-button dh-button--secondary" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
