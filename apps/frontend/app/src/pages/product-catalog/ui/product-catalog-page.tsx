// REQ-AGRITECH-WEB-006: catalog data is loaded through the generated user API boundary.
import { useCallback, useEffect, useState } from 'react';
import { observer, useI18n } from '@app/frontend-runtime';
import { throwOnOpenApiErrorData, useUserApiClient, type ProductViewDto } from '@app/frontend-api-client';
import { UiButton, UiCard, UiSection, UiTextField } from '../../../shared/ui';

const CATEGORIES = ['all', 'fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation'] as const;

export const ProductCatalogPage = observer(function ProductCatalogPage() {
  const { t } = useI18n();
  const { api, requestOptions } = useUserApiClient();
  const [products, setProducts] = useState<ProductViewDto[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const catalog = await throwOnOpenApiErrorData(api.productControllerList(requestOptions));
      setProducts(catalog.items);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [api, requestOptions]);

  useEffect(() => {
    void load();
  }, [load]);
  const filtered = products.filter(
    (product) =>
      (selectedCategory === 'all' || product.category === selectedCategory) &&
      product.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <UiSection className="product-catalog" title={t('product.catalog.title')}>
      {status === 'loading' && <p role="status">{t('common.loading')}</p>}
      {status === 'error' && (
        <UiCard>
          <p role="alert">{t('product.catalog.error')}</p>
          <UiButton onClick={() => void load()}>{t('ui.runtime.retry')}</UiButton>
        </UiCard>
      )}
      {status === 'ready' && (
        <>
          <UiTextField
            label={t('product.catalog.search')}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
          />
          <div>
            {CATEGORIES.map((category) => (
              <UiButton
                key={category}
                onClick={() => {
                  setSelectedCategory(category);
                }}
                variant={selectedCategory === category ? 'primary' : 'secondary'}
              >
                {category}
              </UiButton>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {filtered.map((product) => (
              <UiCard key={product.id}>
                <h4>{product.name}</h4>
                <p>{product.supplierName}</p>
                <p>{product.unit}</p>
                <strong>{product.priceUzs.toLocaleString()} UZS</strong>
                <p>
                  {product.stockQuantity} {t('product.stock')}
                </p>
              </UiCard>
            ))}
          </div>
          {filtered.length === 0 && <p role="status">{t('product.catalog.empty')}</p>}
        </>
      )}
    </UiSection>
  );
});
