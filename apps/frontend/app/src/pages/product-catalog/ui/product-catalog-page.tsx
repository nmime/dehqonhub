import { observer, useI18n } from '@app/frontend-runtime';
import { UiButton, UiCard, UiSection, UiTextField } from '../../../shared/ui';
import { useState } from 'react';

const CATEGORIES = ['all', 'fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation'];

const SAMPLE_PRODUCTS = [
  { id: 1, name: 'NitroAmmonka 46%', category: 'fertilizer', price: 85000, unit: '50kg bag', stock: 500, supplier: 'AgroHub' },
  { id: 2, name: 'Petrovics Super (Cotton)', category: 'seed', price: 240000, unit: '1kg pack', stock: 120, supplier: 'UFarmer' },
  { id: 3, name: 'Karate Zeon 05CS', category: 'pesticide', price: 155000, unit: '1L bottle', stock: 80, supplier: 'AgroMart' },
  { id: 4, name: 'Drip Irrigation Kit', category: 'irrigation', price: 890000, unit: 'per hectare', stock: 30, supplier: 'Qidirpotizlik' },
  { id: 5, name: 'Urea 46%', category: 'fertilizer', price: 72000, unit: '50kg bag', stock: 350, supplier: 'AgroHub' },
  { id: 6, name: 'Wheat Seed (Lokal)', category: 'seed', price: 180000, unit: '15kg bag', stock: 200, supplier: 'UFarmer' },
];

export const ProductCatalogPage = observer(function ProductCatalogPage() {
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = SAMPLE_PRODUCTS.filter(p => {
    const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <UiSection className="product-catalog" title={t('product.catalog.title')}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <UiTextField label="" placeholder="Search products..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: '200px' }} />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: selectedCategory === cat ? '#22c55e' : '#1e293b',
                color: selectedCategory === cat ? '#000' : '#e5e7eb', textTransform: 'capitalize' }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {filtered.map(product => (
          <UiCard key={product.id}>
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{ background: '#166534', color: '#bbf7d0', padding: '0.15rem 0.5rem',
                borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
                {product.category}
              </span>
            </div>
            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>{product.name}</h4>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Supplier: {product.supplier}
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              Unit: {product.unit}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.1rem' }}>
                {product.price.toLocaleString()} UZS
              </span>
              <span style={{ color: product.stock > 50 ? '#22c55e' : '#f59e0b', fontSize: '0.8rem' }}>
                {product.stock} in stock
              </span>
            </div>
            <UiButton variant="primary" style={{ width: '100%' }}>{t('product.add_to_cart')}</UiButton>
          </UiCard>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</p>
          <p>No products found. Try a different search or category.</p>
        </div>
      )}
    </UiSection>
  );
});
