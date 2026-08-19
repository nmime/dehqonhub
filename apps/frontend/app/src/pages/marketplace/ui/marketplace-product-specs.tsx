import type { ReactNode } from 'react';
import type { Locale } from '@app/frontend-runtime';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceFactsSkeleton, SkeletonGrid, SkeletonPill } from './marketplace-loading';
import { formatDate, type MarketplaceListing, type MarketplaceTranslate } from './marketplace-ui';

interface MarketplaceProductSpecsProps {
  locale: Locale;
  onOpenSeller: () => void;
  product: MarketplaceListing;
  t: MarketplaceTranslate;
}

interface SpecRow {
  id: string;
  label: string;
  value: ReactNode;
}

/**
 * Categories the catalog facets can actually filter on. The API also returns
 * `other`, which the catalog deliberately never offers as a facet, so the detail
 * page stays silent about it rather than inventing a label for it.
 */
const labelledCategories = new Set<MarketplaceListing['category']>([
  'equipment',
  'fertilizer',
  'irrigation',
  'pesticide',
  'seed',
]);

/** Rows that describe the goods themselves, produce facets first. */
const attributeRows = (product: MarketplaceListing, t: MarketplaceTranslate): SpecRow[] => {
  const rows: SpecRow[] = [];
  if (product.crop) {
    rows.push({ id: 'crop', label: t('agritech.marketplace.filter.crop'), value: product.crop });
  }
  if (product.grade) {
    rows.push({
      id: 'grade',
      label: t('agritech.marketplace.filter.grade'),
      value: t('agritech.marketplace.filter.gradeValue', { grade: product.grade }),
    });
  }
  if (product.kind === 'product' && labelledCategories.has(product.category)) {
    rows.push({
      id: 'category',
      label: t('agritech.marketplace.filter.category'),
      value: t(`agritech.marketplace.category.${product.category}`),
    });
  }
  if (product.unit) {
    rows.push({ id: 'unit', label: t('agritech.marketplace.product.unit'), value: product.unit });
  }
  rows.push({
    id: 'stock',
    label: t('agritech.marketplace.product.stock'),
    value: `${product.stockQuantity} ${product.unit}`,
  });
  return rows;
};

/** Rows that describe the offer: who sells it, from where, and how current it is. */
const termRows = (
  product: MarketplaceListing,
  locale: Locale,
  onOpenSeller: () => void,
  t: MarketplaceTranslate,
): SpecRow[] => {
  const rows: SpecRow[] = [
    {
      id: 'seller',
      label: t('agritech.marketplace.product.seller'),
      value: (
        <button className="dh-text-button" onClick={onOpenSeller} type="button">
          {product.supplierName}
        </button>
      ),
    },
  ];
  if (product.region) {
    rows.push({ id: 'region', label: t('agritech.marketplace.filter.region'), value: product.region });
  }
  if (product.publishedAt) {
    rows.push({
      id: 'published',
      label: t('agritech.marketplace.product.published'),
      value: formatDate(product.publishedAt, locale),
    });
  }
  if (product.updatedAt) {
    rows.push({
      id: 'updated',
      label: t('agritech.marketplace.product.updated'),
      value: formatDate(product.updatedAt, locale),
    });
  }
  rows.push({ id: 'sku', label: t('agritech.marketplace.product.sku'), value: product.id });
  return rows;
};

function SpecGroup({ heading, id, rows }: Readonly<{ heading: string; id: string; rows: SpecRow[] }>) {
  return (
    <div aria-labelledby={id} className="dh-spec-group" role="group">
      <h2 id={id}>{heading}</h2>
      <dl className="dh-facts">
        {rows.map((row) => (
          <div key={row.id}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The same tags the catalog card carries, so a filtered result stays legible on its own page. */
function ProductTagChips({ product, t }: Readonly<{ product: MarketplaceListing; t: MarketplaceTranslate }>) {
  const outOfStock = product.status !== 'active' || product.stockQuantity <= 0;
  return (
    <div className="dh-product-tags">
      <span className={`dh-badge ${outOfStock ? 'dh-badge--neutral' : 'dh-badge--soft'}`}>
        {outOfStock ? t('agritech.marketplace.product.outOfStock') : t('agritech.marketplace.product.inStock')}
      </span>
      {product.sampleAvailable ? (
        <span className="dh-badge dh-badge--outline">{t('agritech.marketplace.product.sampleBadge')}</span>
      ) : null}
      {product.promoted ? (
        <span className="dh-badge dh-badge--neutral">{t('agritech.marketplace.product.promoted')}</span>
      ) : null}
      {product.region ? <span className="dh-badge dh-badge--outline">{product.region}</span> : null}
      {product.supplierVerified ? (
        <span className="dh-badge dh-badge--soft dh-badge--seal">
          <MarketplaceIcon name="check" />
          {t('agritech.marketplace.product.sellerVerified')}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The listing's own attributes. A buyer who filtered the catalog by crop, grade,
 * category or availability sees those exact values here; nothing the API does not
 * return is rendered, and empty values are omitted rather than dashed out.
 */
export function MarketplaceProductSpecs({ locale, onOpenSeller, product, t }: Readonly<MarketplaceProductSpecsProps>) {
  return (
    <div className="dh-product-specs">
      <ProductTagChips product={product} t={t} />
      <SpecGroup
        heading={t('agritech.marketplace.product.specs')}
        id={`dh-product-specs-${product.id}`}
        rows={attributeRows(product, t)}
      />
      <SpecGroup
        heading={t('agritech.marketplace.product.terms')}
        id={`dh-product-terms-${product.id}`}
        rows={termRows(product, locale, onOpenSeller, t)}
      />
    </div>
  );
}

/**
 * The spec block's own loading shape: the tag chip row, then the two grouped
 * definition lists. The attribute group reserves five rows because that is the
 * most `attributeRows` can return (crop, grade, category, unit, stock) and the
 * terms group reserves five for the same reason (seller, region, published,
 * updated, SKU), so the block does not grow when the real rows arrive.
 */
export function MarketplaceProductSpecsSkeleton() {
  return (
    <SkeletonGrid shape="plain">
      <span aria-hidden="true" className="dh-sk-chips">
        <SkeletonPill variant="badge" />
        <SkeletonPill variant="badge" />
        <SkeletonPill variant="badge" />
      </span>
      <MarketplaceFactsSkeleton rows={5} />
      <MarketplaceFactsSkeleton rows={5} />
    </SkeletonGrid>
  );
}
