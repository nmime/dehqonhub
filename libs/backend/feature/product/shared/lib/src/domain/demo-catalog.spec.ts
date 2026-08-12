// @requirements REQ-AGRITECH-CATALOG-002
import { describe, expect, it } from 'vitest';
import { DemoProducts, filterDemoProducts, findDemoProduct, isDemoProductId } from './demo-catalog';
import { ProductCategories } from './product';

// The marketplace routes parse product ids with a UUID pipe, so a demo row with
// a readable-but-invalid id would 400 the moment someone opened its detail page.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe('demo catalog', () => {
  it('publishes uniquely identified, route-addressable listings', () => {
    const ids = DemoProducts.map((product) => product.id);

    expect(DemoProducts.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => uuidPattern.test(id))).toBe(true);
  });

  it('describes every listing with a category the catalog filter offers', () => {
    expect(DemoProducts.every((product) => ProductCategories.includes(product.category))).toBe(true);
  });

  // Every row is published; a sold-out row keeps its listing active and carries
  // the shortage in its stock count, which is what the out-of-stock badge and
  // the "in stock" filter read.
  it('publishes active listings including one that is sold out', () => {
    expect(DemoProducts.every((product) => product.status === 'active')).toBe(true);
    expect(DemoProducts.some((product) => product.stockQuantity === 0)).toBe(true);
    expect(DemoProducts.some((product) => product.stockQuantity > 0)).toBe(true);
  });

  it('offers more than one region and category so the filters have options', () => {
    expect(new Set(DemoProducts.map((product) => product.region)).size).toBeGreaterThan(1);
    expect(new Set(DemoProducts.map((product) => product.category)).size).toBeGreaterThan(1);
  });

  it('names each listing in all three catalog languages', () => {
    expect(DemoProducts.every((product) => product.name && product.nameRu && product.nameUz)).toBe(true);
  });

  it('narrows by category and region the way the repository filter does', () => {
    const seeds = filterDemoProducts({ category: 'seed' });
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.every((product) => product.category === 'seed')).toBe(true);

    const region = DemoProducts[0]!.region;
    const regional = filterDemoProducts({ region });
    expect(regional.every((product) => product.region === region)).toBe(true);

    expect(filterDemoProducts()).toEqual([...DemoProducts]);
    expect(filterDemoProducts({ region: 'nowhere' })).toEqual([]);
  });

  it('resolves listings by id and reports which ids it owns', () => {
    const first = DemoProducts[0]!;

    expect(findDemoProduct(first.id)).toEqual(first);
    expect(findDemoProduct('dec0de00-0000-4000-8000-000000009999')).toBeUndefined();
    expect(isDemoProductId(first.id)).toBe(true);
    expect(isDemoProductId('product-1')).toBe(false);
  });
});
