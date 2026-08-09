// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer, useI18n } from '@app/frontend-runtime';
import {
  throwOnOpenApiErrorData,
  useUserApiClient,
  type AddToCartDto,
  type AiConsultationViewDto,
  type BuyerRequestViewDto,
  type CartViewDto,
  type ContractViewDto,
  type OfferViewDto,
  type ProductViewDto,
  type RequestOfferDto,
  type SampleViewDto,
  type SampleUsageViewDto,
  type SubmitVerificationDto,
  type VerificationViewDto,
} from '@app/frontend-api-client';

type LoadState = 'loading' | 'ready' | 'error';
type View = 'home' | 'catalog' | 'orders' | 'cart' | 'account' | 'verify';

type Section = 'equipment' | 'seeds' | 'produce' | 'all';

interface CatalogItem {
  id: string;
  name: string;
  category: Section | string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  region: string;
  status: string;
  description: string;
  supplierName?: string;
  images?: string[];
}

function fmt(n: number | undefined | null): string {
  if (n == null) return '';
  return n.toLocaleString('ru-RU').replace(/,/g, ' ');
}

function formatUzs(n: number | undefined | null): string {
  return `${fmt(n)} UZS`;
}

export const MarketplacePage = observer(function MarketplacePage() {
  const { t } = useI18n();
  const translate = useCallback(((key: string) => t(key as never)) as (key: string) => string, [t]);
  const { api, requestOptions } = useUserApiClient();

  const [state, setState] = useState<LoadState>('loading');
  const [view, setView] = useState<View>('home');
  const [section, setSection] = useState<Section>('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');

  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [verification, setVerification] = useState<VerificationViewDto | undefined>();
  const [carts, setCarts] = useState<CartViewDto[]>([]);
  const [requests, setRequests] = useState<BuyerRequestViewDto[]>([]);
  const [myRequests, setMyRequests] = useState<BuyerRequestViewDto[]>([]);
  const [offersByRequest, setOffersByRequest] = useState<Record<string, OfferViewDto[]>>({});
  const [contracts, setContracts] = useState<ContractViewDto[]>([]);
  const [samples, setSamples] = useState<SampleViewDto[]>([]);
  const [sampleUsage, setSampleUsage] = useState<SampleUsageViewDto>({ used: 0, limit: 5, remaining: 5 });
  const [aiChat, setAiChat] = useState<{ open: boolean; messages: { role: 'user' | 'bot'; text: string }[] }>({
    open: false,
    messages: [],
  });

  // Catalog data is the existing supplier products + produce mapped into 3 sections.
  const load = useCallback(async () => {
    setState('loading');
    try {
      const [productData, verificationData, cartData, requestData, myRequestData, contractData, sampleData, usageData] =
        await Promise.all([
          throwOnOpenApiErrorData(api.productControllerList(requestOptions)),
          throwOnOpenApiErrorData(api.marketplaceControllerGetVerification(requestOptions)).catch(() => undefined),
          throwOnOpenApiErrorData(api.marketplaceControllerListCarts(requestOptions)).catch(() => undefined),
          throwOnOpenApiErrorData(api.marketplaceControllerListRequests(requestOptions)).catch(() => undefined),
          throwOnOpenApiErrorData(api.marketplaceControllerListMyRequests(requestOptions)).catch(() => undefined),
          throwOnOpenApiErrorData(api.marketplaceControllerListContracts(requestOptions)).catch(() => undefined),
          throwOnOpenApiErrorData(api.marketplaceControllerListSamples(requestOptions)).catch(() => undefined),
          throwOnOpenApiErrorData(api.marketplaceControllerSampleUsage(requestOptions)).catch(() => undefined),
        ]);

      const mapped: CatalogItem[] = productData.items.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priceUzs: p.priceUzs,
        unit: p.unit,
        stockQuantity: p.stockQuantity,
        region: p.region,
        status: p.status,
        description: p.description,
        supplierName: p.supplierName,
        images: p.images,
      }));
      setProducts(mapped);
      setVerification(verificationData);
      setCarts(cartData?.items ?? []);
      setRequests(requestData?.items ?? []);
      setMyRequests(myRequestData?.items ?? []);
      setContracts(contractData?.items ?? []);
      setSamples(sampleData?.items ?? []);
      setSampleUsage(usageData ?? { used: 0, limit: 5, remaining: 5 });

      // load offers for each open request
      const offers: Record<string, OfferViewDto[]> = {};
      for (const req of [...(requestData?.items ?? []), ...(myRequestData?.items ?? [])]) {
        try {
          const list = await throwOnOpenApiErrorData(api.marketplaceControllerListOffers(req.id, requestOptions));
          offers[req.id] = list.items;
        } catch {
          offers[req.id] = [];
        }
      }
      setOffersByRequest(offers);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [api, requestOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const isVerified = verification?.status === 'verified';

  // ---- catalog filtering ----
  const sectionProducts = useMemo(() => {
    let list = products;
    if (section !== 'all') {
      const keyword = section === 'equipment' ? 'equipment' : section === 'seeds' ? 'seed' : 'produce';
      list = list.filter((p) => p.category === keyword || p.name.toLowerCase().includes(keyword));
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.region.toLowerCase().includes(q) || p.supplierName?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, section, query]);

  const shelf = (sectionName: Section, count = 4) =>
    sectionProducts.filter((p) => p.category === sectionName || sectionName === 'all').slice(0, count);

  // ---- cart helpers ----
  const cartTotal = (cart: CartViewDto) => {
    let total = 0;
    for (const item of cart.items) {
      const p = products.find((prod) => prod.id === item.productId);
      if (p) total += p.priceUzs * item.quantity;
    }
    return total;
  };

  const addToCart = async (sellerId: string, productId: string, quantity = 1) => {
    const body: AddToCartDto = { sellerId, productId, quantity };
    await throwOnOpenApiErrorData(api.marketplaceControllerAddToCart(body, requestOptions));
    flash(t('agritech.marketplace.saved'));
    refresh();
  };

  const updateCartItem = async (cartId: string, productId: string, quantity: number) => {
    if (quantity <= 0) {
      await throwOnOpenApiErrorData(api.marketplaceControllerRemoveCartItem(cartId, productId, requestOptions));
    } else {
      await throwOnOpenApiErrorData(
        api.marketplaceControllerUpdateCartItem(cartId, productId, { quantity }, requestOptions),
      );
    }
    refresh();
  };

  const checkout = async (cartId: string) => {
    if (!isVerified) {
      setView('verify');
      flash(t('agritech.marketplace.cart.verifyRequired'));
      return;
    }
    await throwOnOpenApiErrorData(api.marketplaceControllerCheckoutCart(cartId, requestOptions));
    flash(t('agritech.marketplace.orders.created'));
    refresh();
  };

  const requestSample = async (productId: string, sellerId: string) => {
    if (!isVerified) {
      setView('verify');
      flash(t('agritech.marketplace.cart.verifyRequired'));
      return;
    }
    await throwOnOpenApiErrorData(
      api.marketplaceControllerRequestSample({ productId, sellerId }, requestOptions),
    );
    flash(t('agritech.marketplace.samples.requested'));
    refresh();
  };

  const sellerFor = (product: CatalogItem): string => {
    // supplierName doubles as the seller identity for cart grouping.
    return product.supplierName ?? 'seller';
  };

  const makeOffer = async (requestId: string) => {
    const price = window.prompt(t('agritech.marketplace.orders.price'));
    if (!price) return;
    const body: RequestOfferDto = { priceUzs: Number(price) };
    await throwOnOpenApiErrorData(api.marketplaceControllerMakeOffer(requestId, body, requestOptions));
    flash(t('agritech.marketplace.orders.offerSent'));
    refresh();
  };

  const chooseOffer = async (requestId: string, offerId: string) => {
    await throwOnOpenApiErrorData(api.marketplaceControllerChooseOffer(requestId, offerId, requestOptions));
    flash(t('agritech.marketplace.orders.chosen'));
    refresh();
  };

  const signContract = async (contractId: string) => {
    await throwOnOpenApiErrorData(api.marketplaceControllerSignContract(contractId, requestOptions));
    flash(t('agritech.marketplace.contract.sign'));
    refresh();
  };

  const askAi = async (question: string, kind: 'recommendation' | 'find_cheaper' | 'season_advice' | 'generic' = 'generic') => {
    const msgs = [...aiChat.messages, { role: 'user' as const, text: question }];
    setAiChat((c) => ({ ...c, messages: msgs }));
    try {
      const res = await throwOnOpenApiErrorData(
        api.marketplaceControllerAskAi({ kind, question }, requestOptions),
      );
      const answer: AiConsultationViewDto = res;
      setAiChat((c) => ({ ...c, messages: [...c.messages, { role: 'bot', text: answer.answer }] }));
    } catch {
      setAiChat((c) => ({
        ...c,
        messages: [...c.messages, { role: 'bot', text: t('agritech.marketplace.error') }],
      }));
    }
  };

  if (state === 'loading') {
    return (
      <div className="xr-agritech">
        <div className="ag-container">
          <div className="ag-grid--products">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="ag-skeleton" style={{ height: 280 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="xr-agritech">
        <div className="ag-container ag-empty">
          <div className="ag-seal ag-seal--accent ag-empty__seal">!</div>
          <p>{t('agritech.marketplace.error')}</p>
          <button className="ag-btn ag-btn--primary" onClick={refresh}>
            {t('ui.runtime.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="xr-agritech">
      {/* Header */}
      <header className="ag-header">
        <div className="ag-header__row">
          <span className="ag-logo">{t('agritech.brand')}</span>
          <button className="ag-btn ag-btn--primary" onClick={() => setView('catalog')}>
            {t('agritech.marketplace.catalog')}
          </button>
          <div className="ag-search">
            <input
              type="search"
              placeholder={t('agritech.marketplace.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="ag-search__icon" aria-label={t('agritech.marketplace.search')}>
              🔍
            </button>
          </div>
          <nav className="ag-nav">
            <button className="ag-btn ag-btn--ghost" onClick={() => setView('orders')}>
              {t('agritech.marketplace.orders')}
            </button>
            <button className="ag-btn ag-btn--ghost" onClick={() => setView('account')}>
              {t('agritech.marketplace.favorites')}
            </button>
            <button className="ag-btn ag-btn--ghost" onClick={() => setView('cart')}>
              {t('agritech.marketplace.cart')} •{carts.reduce((s, c) => s + c.items.length, 0)}
            </button>
            {isVerified ? (
              <button className="ag-btn ag-btn--ghost" onClick={() => setView('account')}>
                {t('agritech.marketplace.account')}
              </button>
            ) : (
              <button className="ag-btn ag-btn--outline" onClick={() => setView('verify')}>
                <span className="ag-status__dot" style={{ background: 'var(--warning)' }} />
                {t('agritech.marketplace.verification')}
              </button>
            )}
          </nav>
        </div>
        {/* Category chips */}
        <div className="ag-header__row" style={{ marginTop: '.5rem' }}>
          <div className="ag-tabs">
            <button className={`ag-tab ${section === 'all' ? 'ag-tab--on' : ''}`} onClick={() => setSection('all')}>
              {t('agritech.marketplace.section.all')}
            </button>
            <button
              className={`ag-tab ${section === 'equipment' ? 'ag-tab--on' : ''}`}
              onClick={() => setSection('equipment')}
            >
              {t('agritech.marketplace.section.equipment')}
            </button>
            <button className={`ag-tab ${section === 'seeds' ? 'ag-tab--on' : ''}`} onClick={() => setSection('seeds')}>
              {t('agritech.marketplace.section.seeds')}
            </button>
            <button
              className={`ag-tab ${section === 'produce' ? 'ag-tab--on' : ''}`}
              onClick={() => setSection('produce')}
            >
              {t('agritech.marketplace.section.produce')}
            </button>
          </div>
        </div>
      </header>

      {notice && (
        <div className="ag-container" style={{ marginTop: 12 }}>
          <div className="ag-card ag-card--cream" style={{ borderLeft: `4px solid var(--green-primary)` }}>
            {notice}
          </div>
        </div>
      )}

      <main className="ag-container">
        {view === 'home' && (
          <HomeView
            t={translate}
            products={products}
            shelf={shelf}
            setView={setView}
            setSection={setSection}
            addToCart={addToCart}
            sellerFor={sellerFor}
            isVerified={isVerified}
            formatUzs={formatUzs}
          />
        )}
        {view === 'catalog' && (
          <CatalogView
            t={translate}
            products={sectionProducts}
            section={section}
            setSection={setSection}
            addToCart={addToCart}
            requestSample={requestSample}
            sellerFor={sellerFor}
            formatUzs={formatUzs}
            sampleUsage={sampleUsage}
            isVerified={isVerified}
            onFav={() => undefined}
          />
        )}
        {view === 'orders' && (
          <OrdersView
            t={translate}
            requests={requests}
            myRequests={myRequests}
            offersByRequest={offersByRequest}
            makeOffer={makeOffer}
            chooseOffer={chooseOffer}
            formatUzs={formatUzs}
            onCreate={() => flash(t('agritech.marketplace.orders.created'))}
          />
        )}
        {view === 'cart' && (
          <CartView
            t={translate}
            carts={carts}
            products={products}
            updateCartItem={updateCartItem}
            checkout={checkout}
            requestSample={requestSample}
            cartTotal={cartTotal}
            formatUzs={formatUzs}
            isVerified={isVerified}
          />
        )}
        {view === 'account' && (
          <AccountView
            t={translate}
            verification={verification}
            contracts={contracts}
            samples={samples}
            requests={myRequests}
            setView={setView}
            signContract={signContract}
            formatUzs={formatUzs}
          />
        )}
        {view === 'verify' && (
          <VerifyView
            t={translate}
            verification={verification}
            api={api as unknown as { marketplaceControllerSubmitVerification: (body: SubmitVerificationDto, options?: unknown) => Promise<unknown> }}
            requestOptions={requestOptions}
            onDone={refresh}
          />
        )}
      </main>

      {/* AI consultant floating button + chat */}
      <button className="ag-fab" aria-label={t('agritech.marketplace.ai.title')} onClick={() => setAiChat((c) => ({ ...c, open: !c.open }))}>
        🌱
      </button>
      {aiChat.open && (
        <div className="ag-chat">
          <div className="ag-chat__head">{t('agritech.marketplace.ai.title')}</div>
          <div className="ag-chat__body">
            <div className="ag-chip ag-chip--tint" onClick={() => void askAi(t('agritech.marketplace.ai.q.recommend'), 'recommendation')}>
              {t('agritech.marketplace.ai.q.recommend')}
            </div>
            <div className="ag-chip ag-chip--tint" onClick={() => void askAi(t('agritech.marketplace.ai.q.beginner'), 'recommendation')}>
              {t('agritech.marketplace.ai.q.beginner')}
            </div>
            <div className="ag-chip ag-chip--tint" onClick={() => void askAi(t('agritech.marketplace.ai.q.cheaper'), 'find_cheaper')}>
              {t('agritech.marketplace.ai.q.cheaper')}
            </div>
            {aiChat.messages.map((m, i) => (
              <div key={i} className={`ag-chat__bubble ${m.role === 'bot' ? 'ag-chat__bubble--bot' : 'ag-chat__bubble--user'}`}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="ag-chat__foot">
            <input
              type="text"
              placeholder={t('agritech.marketplace.ai.placeholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  const q = e.currentTarget.value.trim();
                  e.currentTarget.value = '';
                  void askAi(q);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="ag-footer">
        <div className="ag-footer__cols">
          <div>
            <h3>{t('agritech.marketplace.footer.forBuyers')}</h3>
            <p className="ag-caption">{t('agritech.marketplace.footer.buyersList')}</p>
          </div>
          <div>
            <h3>{t('agritech.marketplace.footer.forSellers')}</h3>
            <p className="ag-caption">{t('agritech.marketplace.footer.sellersList')}</p>
          </div>
          <div>
            <h3>{t('agritech.marketplace.footer.company')}</h3>
            <p className="ag-caption">{t('agritech.marketplace.footer.companyList')}</p>
          </div>
          <div>
            <h3>{t('agritech.marketplace.footer.help')}</h3>
            <p className="ag-caption">{t('agritech.marketplace.footer.helpList')}</p>
          </div>
        </div>
        <div className="ag-footer__legal">{t('agritech.marketplace.footer.legal')}</div>
      </footer>
    </div>
  );
});

/* ---------------- Home ---------------- */
type T = (key: string) => string;

function HomeView(props: {
  t: T;
  products: CatalogItem[];
  shelf: (s: Section) => CatalogItem[];
  setView: (v: View) => void;
  setSection: (s: Section) => void;
  addToCart: (sellerId: string, productId: string, qty?: number) => Promise<void>;
  sellerFor: (p: CatalogItem) => string;
  isVerified: boolean;
  formatUzs: (n?: number | null) => string;
}) {
  const { t, shelf, setView, setSection, addToCart, sellerFor, formatUzs } = props;
  return (
    <div className="ag-grid" style={{ gap: '2.5rem' }}>
      <div className="ag-grad">
        <div style={{ maxWidth: '34rem' }}>
          <span className="ag-chip ag-chip--tint">{t('agritech.marketplace.hero.badge')}</span>
          <h1>{t('agritech.marketplace.hero.title')}</h1>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.6 }}>{t('agritech.marketplace.hero.subtitle')}</p>
          <button className="ag-btn ag-btn--primary" onClick={() => setView('catalog')}>
            {t('agritech.marketplace.hero.cta')}
          </button>
        </div>
      </div>

      <div className="ag-grid--4">
        {[
          ['scenario.createOrder', 'createOrder', 'orders'],
          ['scenario.sample', 'sample', 'catalog'],
          ['scenario.sell', 'sell', 'account'],
          ['scenario.verify', 'verify', 'verify'],
        ].map(([labelKey, seal, target]) => (
          <div key={seal} className="ag-card ag-card--hover ag-grid" style={{ gap: '.75rem', alignItems: 'center' }}>
            <div className="ag-seal ag-seal--accent ag-seal--small">✓</div>
            <strong>{t(`agritech.marketplace.${labelKey}`)}</strong>
            <button className="ag-btn ag-btn--outline" onClick={() => setView(target as View)}>
              {t('agritech.marketplace.orders.create')}
            </button>
          </div>
        ))}
      </div>

      <SectionShelf
        title={t('agritech.marketplace.shelf.seeds')}
        items={shelf('seeds')}
        addToCart={addToCart}
        sellerFor={sellerFor}
        formatUzs={formatUzs}
        onSeeAll={() => setSection('seeds')}
        seeAllLabel={t('agritech.marketplace.shelf.seeAll')}
      />
      <SectionShelf
        title={t('agritech.marketplace.shelf.equipment')}
        items={shelf('equipment')}
        addToCart={addToCart}
        sellerFor={sellerFor}
        formatUzs={formatUzs}
        onSeeAll={() => setSection('equipment')}
        seeAllLabel={t('agritech.marketplace.shelf.seeAll')}
      />
      <SectionShelf
        title={t('agritech.marketplace.shelf.produce')}
        items={shelf('produce')}
        addToCart={addToCart}
        sellerFor={sellerFor}
        formatUzs={formatUzs}
        onSeeAll={() => setSection('produce')}
        seeAllLabel={t('agritech.marketplace.shelf.seeAll')}
      />

      <div className="ag-grad">
        <h2>{t('agritech.marketplace.how.title')}</h2>
        <div className="ag-grid--3" style={{ marginTop: '1rem' }}>
          {[
            ['how.step1', 'how.step1Desc'],
            ['how.step2', 'how.step2Desc'],
            ['how.step3', 'how.step3Desc'],
          ].map(([titleKey, descKey], i) => (
            <div key={titleKey} className="ag-card ag-card--cream" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
              <div className="ag-seal ag-seal--line" style={{ margin: '0 auto .75rem' }}>{i + 1}</div>
              <strong>{t(`agritech.marketplace.${titleKey}`)}</strong>
              <p className="ag-caption" style={{ marginTop: '.5rem' }}>
                {t(`agritech.marketplace.${descKey}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionShelf(props: {
  title: string;
  items: CatalogItem[];
  addToCart: (s: string, p: string, q?: number) => Promise<void>;
  sellerFor: (p: CatalogItem) => string;
  formatUzs: (n?: number | null) => string;
  onSeeAll: () => void;
  seeAllLabel: string;
}) {
  const { title, items, addToCart, sellerFor, formatUzs, onSeeAll, seeAllLabel } = props;
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2>{title}</h2>
        <button className="ag-btn ag-btn--ghost" onClick={onSeeAll}>
          {seeAllLabel} →
        </button>
      </div>
      <div className="ag-grid--products">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} addToCart={addToCart} sellerFor={sellerFor} formatUzs={formatUzs} />
        ))}
        {items.length === 0 && <div className="ag-caption">{title}</div>}
      </div>
    </section>
  );
}

function ProductCard(props: {
  product: CatalogItem;
  addToCart: (s: string, p: string, q?: number) => Promise<void>;
  sellerFor: (p: CatalogItem) => string;
  formatUzs: (n?: number | null) => string;
}) {
  const { product, addToCart, sellerFor, formatUzs } = props;
  return (
    <article className="ag-product">
      <div className="ag-product__img">🌾</div>
      <button className="ag-btn ag-btn--ghost ag-product__fav" aria-label="fav" style={{ padding: '.3rem .6rem' }}>
        ♡
      </button>
      <div className="ag-product__body">
        <div className="ag-product__tags">
          {product.status === 'active' && <span className="ag-chip ag-chip--tint">{product.region}</span>}
        </div>
        <strong className="ag-price">{formatUzs(product.priceUzs)}</strong>
        <span className="ag-caption">{product.unit}</span>
        <h3 className="ag-product__title">{product.name}</h3>
        <span className="ag-caption">{sellerFor(product)}</span>
        <div className="ag-product__footer">
          <button className="ag-btn ag-btn--primary ag-btn--block" onClick={() => void addToCart(sellerFor(product), product.id)}>
            {formatUzs(0) && '+'} {product.priceUzs > 0 ? 'Add to cart' : 'Add to cart'}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------------- Catalog ---------------- */
function CatalogView(props: {
  t: T;
  products: CatalogItem[];
  section: Section;
  setSection: (s: Section) => void;
  addToCart: (s: string, p: string, q?: number) => Promise<void>;
  requestSample: (p: string, s: string) => Promise<void>;
  sellerFor: (p: CatalogItem) => string;
  formatUzs: (n?: number | null) => string;
  sampleUsage: SampleUsageViewDto;
  isVerified: boolean;
  onFav: () => void;
}) {
  const { t, products, section, setSection, addToCart, requestSample, sellerFor, formatUzs, sampleUsage, isVerified } = props;
  return (
    <div className="ag-grid" style={{ gridTemplateColumns: '260px 1fr', gap: '1.5rem' }}>
      <aside className="ag-card ag-filters">
        <div className="ag-filter">
          <span className="ag-filter__label">{t('agritech.marketplace.filter.price')}</span>
          <div className="ag-grid--2">
            <input type="number" placeholder="0" />
            <input type="number" placeholder="∞" />
          </div>
        </div>
        <div className="ag-filter">
          <span className="ag-filter__label">{t('agritech.marketplace.filter.region')}</span>
          <select>
            <option>{t('agritech.marketplace.section.all')}</option>
          </select>
        </div>
        <label className="ag-check">
          <input type="checkbox" /> {t('agritech.marketplace.filter.verifiedOnly')}
        </label>
        <label className="ag-check">
          <input type="checkbox" /> {t('agritech.marketplace.filter.sampleAvailable')}
        </label>
        <button className="ag-btn ag-btn--primary ag-btn--block">{t('agritech.marketplace.filter.apply')}</button>
        <button className="ag-btn ag-btn--ghost">{t('agritech.marketplace.filter.reset')}</button>
      </aside>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h1>
            {section === 'equipment'
              ? t('agritech.marketplace.section.equipment')
              : section === 'seeds'
                ? t('agritech.marketplace.section.seeds')
                : section === 'produce'
                  ? t('agritech.marketplace.section.produce')
                  : t('agritech.marketplace.catalog')}
          </h1>
          <span className="ag-caption">{products.length}</span>
        </div>
        <div className="ag-grid--products">
          {products.map((p) => (
            <article className="ag-product" key={p.id}>
              <div className="ag-product__img">🌾</div>
              <div className="ag-product__body">
                <div className="ag-product__tags">
                  {isVerified && <span className="ag-chip ag-chip--tint">{t('agritech.marketplace.product.verified')}</span>}
                  {sampleUsage.remaining > 0 && (
                    <span className="ag-chip ag-chip--tint">{t('agritech.marketplace.product.tags.sample')}</span>
                  )}
                </div>
                <strong className="ag-price">{formatUzs(p.priceUzs)}</strong>
                <span className="ag-caption">{p.unit}</span>
                <h3 className="ag-product__title">{p.name}</h3>
                <span className="ag-caption">
                  {sellerFor(p)} · {p.region}
                </span>
                <div className="ag-product__footer" style={{ gap: '.4rem' }}>
                  <button className="ag-btn ag-btn--primary ag-btn--block" onClick={() => void addToCart(sellerFor(p), p.id)}>
                    {t('agritech.marketplace.product.addToCart')}
                  </button>
                  <button
                    className="ag-btn ag-btn--outline ag-btn--block"
                    onClick={() => void requestSample(p.id, sellerFor(p))}
                  >
                    {t('agritech.marketplace.product.sample')}
                  </button>
                </div>
              </div>
            </article>
          ))}
          {products.length === 0 && (
            <div className="ag-empty" style={{ gridColumn: '1/-1' }}>
              <div className="ag-seal ag-seal--accent ag-empty__seal">🌾</div>
              <p>{t('agritech.marketplace.empty')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Orders ---------------- */
function OrdersView(props: {
  t: T;
  requests: BuyerRequestViewDto[];
  myRequests: BuyerRequestViewDto[];
  offersByRequest: Record<string, OfferViewDto[]>;
  makeOffer: (id: string) => Promise<void>;
  chooseOffer: (id: string, offerId: string) => Promise<void>;
  formatUzs: (n?: number | null) => string;
  onCreate: () => void;
}) {
  const { t, requests, myRequests, offersByRequest, makeOffer, chooseOffer, formatUzs, onCreate } = props;
  const statusLabel = (s: string) =>
    t(`agritech.marketplace.orders.${s}`) || s;
  return (
    <div className="ag-grid" style={{ gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t('agritech.marketplace.orders.feed')}</h1>
        <button className="ag-btn ag-btn--primary" onClick={onCreate}>
          {t('agritech.marketplace.orders.create')}
        </button>
      </div>

      <div>
        <h2>{t('agritech.marketplace.orders.feed')}</h2>
        <div className="ag-grid">
          {requests.map((r) => (
            <div className="ag-card ag-card--hover" key={r.id}>
              <div className="ag-grid--3" style={{ gap: '1rem', alignItems: 'center' }}>
                <div>
                  <strong>{r.title}</strong>
                  <div className="ag-caption">
                    {r.product} · {r.volume}
                  </div>
                </div>
                <div className="ag-caption">
                  {t('agritech.marketplace.orders.region')}: {r.region}
                  <br />
                  {t('agritech.marketplace.orders.deadline')}: {r.deadline}
                  <br />
                  {t('agritech.marketplace.orders.budget')}: {formatUzs(r.budgetUzs)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'flex-end' }}>
                  <span className={`ag-chip ${r.status === 'open' ? 'ag-chip--primary' : 'ag-chip--accent'}`}>
                    {statusLabel(r.status)}
                  </span>
                  <button className="ag-btn ag-btn--outline" onClick={() => void makeOffer(r.id)}>
                    {t('agritech.marketplace.orders.makeOffer')}
                  </button>
                </div>
              </div>
              {(() => {
                const offers = offersByRequest[r.id];
                if (!offers || offers.length === 0) return null;
                return (
                  <div className="ag-mt">
                    {offers.map((o) => (
                      <div key={o.id} className="ag-card ag-card--cream" style={{ marginTop: '.5rem' }}>
                        <div className="ag-grid--3" style={{ gap: '1rem', alignItems: 'center' }}>
                          <span className="ag-price">{formatUzs(o.priceUzs)}</span>
                          <span className="ag-caption">
                            {o.deliveryDays ? `${o.deliveryDays}d` : ''} {o.deliveryNote}
                          </span>
                          <button className="ag-btn ag-btn--primary" onClick={() => void chooseOffer(r.id, o.id)}>
                            {t('agritech.marketplace.orders.choose')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ))}
          {requests.length === 0 && <div className="ag-empty">{t('agritech.marketplace.orders.empty')}</div>}
        </div>
      </div>

      <div>
        <h2>{t('agritech.marketplace.orders.my')}</h2>
        <div className="ag-grid">
          {myRequests.map((r) => (
            <div className="ag-card" key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{r.title}</strong>
                <span className={`ag-chip ${r.status === 'open' ? 'ag-chip--primary' : 'ag-chip--accent'}`}>
                  {statusLabel(r.status)}
                </span>
              </div>
              <div className="ag-caption ag-mt">
                {t('agritech.marketplace.orders.volume')}: {r.volume} · {t('agritech.marketplace.orders.region')}: {r.region} ·{' '}
                {t('agritech.marketplace.orders.budget')}: {formatUzs(r.budgetUzs)}
              </div>
            </div>
          ))}
          {myRequests.length === 0 && <div className="ag-empty">{t('agritech.marketplace.orders.empty')}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Cart ---------------- */
function CartView(props: {
  t: T;
  carts: CartViewDto[];
  products: CatalogItem[];
  updateCartItem: (c: string, p: string, q: number) => Promise<void>;
  checkout: (c: string) => Promise<void>;
  requestSample: (p: string, s: string) => Promise<void>;
  cartTotal: (c: CartViewDto) => number;
  formatUzs: (n?: number | null) => string;
  isVerified: boolean;
}) {
  const { t, carts, products, updateCartItem, checkout, cartTotal, formatUzs } = props;
  if (carts.length === 0) {
    return (
      <div className="ag-empty">
        <div className="ag-seal ag-seal--accent ag-empty__seal">🛒</div>
        <p>{t('agritech.marketplace.cart.empty')}</p>
      </div>
    );
  }
  return (
    <div>
      <h1>{t('agritech.marketplace.cart.title')}</h1>
      <div className="ag-cart-tabs ag-mb">
        {carts.map((c) => (
          <button key={c.id} className="ag-tab ag-tab--on">
            {c.sellerId} · {c.items.length} {t('agritech.marketplace.cart.itemCount')}
          </button>
        ))}
      </div>
      {carts.map((c) => (
        <div className="ag-card ag-mb" key={c.id}>
          <div className="ag-grid" style={{ gridTemplateColumns: '1fr 260px', gap: '1.5rem' }}>
            <div>
              {c.items.map((item) => {
                const p = products.find((pr) => pr.id === item.productId);
                return (
                  <div className="ag-cart-item" key={item.productId}>
                    <div className="ag-product__img" style={{ width: 64, height: 64, margin: 0 }}>
                      🌾
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong>{p?.name ?? item.productId}</strong>
                      <div className="ag-caption">{p ? formatUzs(p.priceUzs) : ''}</div>
                    </div>
                    <div className="ag-qty">
                      <button onClick={() => void updateCartItem(c.id, item.productId, item.quantity - 1)}>−</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => void updateCartItem(c.id, item.productId, item.quantity + 1)}>+</button>
                    </div>
                    <strong>{p ? formatUzs(p.priceUzs * item.quantity) : ''}</strong>
                  </div>
                );
              })}
            </div>
            <div className="ag-card ag-card--cream" style={{ alignSelf: 'start' }}>
              <div className="ag-caption">{t('agritech.marketplace.cart.seller')}: {c.sellerId}</div>
              <div className="ag-price ag-mt">
                {t('agritech.marketplace.cart.total')}: {formatUzs(cartTotal(c))}
              </div>
              <button className="ag-btn ag-btn--primary ag-btn--block ag-mt" onClick={() => void checkout(c.id)}>
                {t('agritech.marketplace.cart.checkout')}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Account ---------------- */
function AccountView(props: {
  t: T;
  verification?: VerificationViewDto;
  contracts: ContractViewDto[];
  samples: SampleViewDto[];
  requests: BuyerRequestViewDto[];
  setView: (v: View) => void;
  signContract: (id: string) => Promise<void>;
  formatUzs: (n?: number | null) => string;
}) {
  const { t, verification, contracts, samples, requests, setView, signContract, formatUzs } = props;
  const verified = verification?.status === 'verified';
  return (
    <div>
      <h1>{t('agritech.marketplace.account.title')}</h1>
      <div className="ag-grid--4 ag-mb">
        <div className="ag-stat">
          <div className="ag-stat__num">{requests.length}</div>
          <div className="ag-stat__label">{t('agritech.marketplace.account.stat.orders')}</div>
        </div>
        <div className="ag-stat">
          <div className="ag-stat__num">{contracts.length}</div>
          <div className="ag-stat__label">{t('agritech.marketplace.account.stat.contracts')}</div>
        </div>
        <div className="ag-stat">
          <div className="ag-stat__num">{samples.length}</div>
          <div className="ag-stat__label">{t('agritech.marketplace.account.samples')}</div>
        </div>
        <div className="ag-stat">
          <div className="ag-stat__num">{verified ? '✓' : '—'}</div>
          <div className="ag-stat__label">{t('agritech.marketplace.account.stat.verified')}</div>
        </div>
      </div>

      {!verified && (
        <div className="ag-grad ag-mb" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>{t('agritech.marketplace.verify.title')}</h3>
            <p className="ag-caption">{t('agritech.marketplace.verify.reason')}</p>
          </div>
          <button className="ag-btn ag-btn--primary" onClick={() => setView('verify')}>
            {t('agritech.marketplace.verification')}
          </button>
        </div>
      )}

      <h2 className="ag-mb">{t('agritech.marketplace.account.contracts')}</h2>
      <div className="ag-grid ag-mb">
        {contracts.map((c) => (
          <div className="ag-card" key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{c.subject}</strong>
              <span className={`ag-chip ${c.status === 'active' ? 'ag-chip--primary' : c.status === 'draft' ? 'ag-chip--warning' : 'ag-chip--tint'}`}>
                {t(`agritech.marketplace.contract.status.${c.status}`)}
              </span>
            </div>
            <div className="ag-caption ag-mt">
              {t('agritech.marketplace.contract.amount')}: {formatUzs(c.amountUzs)} ·{' '}
              {t('agritech.marketplace.contract.subject')}: {c.deliveryTerms}
            </div>
            {c.status === 'draft' && (
              <button className="ag-btn ag-btn--primary ag-mt" onClick={() => void signContract(c.id)}>
                {t('agritech.marketplace.contract.sign')}
              </button>
            )}
          </div>
        ))}
        {contracts.length === 0 && <div className="ag-empty">{t('agritech.marketplace.empty')}</div>}
      </div>
    </div>
  );
}

/* ---------------- Verification wizard ---------------- */
function VerifyView(props: {
  t: T;
  verification?: VerificationViewDto;
  api: {
    marketplaceControllerSubmitVerification: (
      body: SubmitVerificationDto,
      options?: unknown,
    ) => Promise<unknown>;
  };
  requestOptions: unknown;
  onDone: () => void;
}) {
  const { t, verification } = props;
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<'farmer' | 'seller' | 'buyer'>('farmer');
  const [oneId, setOneId] = useState(false);

  const currentStatus = verification?.status ?? 'none';
  if (currentStatus === 'pending') {
    return (
      <div className="ag-card ag-card--panel ag-empty">
        <div className="ag-seal ag-seal--small">{t('agritech.marketplace.verify.pending')}</div>
        <p>{t('agritech.marketplace.verify.pending')}</p>
      </div>
    );
  }
  if (currentStatus === 'verified') {
    return (
      <div className="ag-card ag-card--panel ag-empty">
        <div className="ag-seal">{t('agritech.marketplace.verify.verified')}</div>
        <p>{t('agritech.marketplace.verify.success')}</p>
      </div>
    );
  }

  const steps = [
    t('agritech.marketplace.verify.step.oneId'),
    t('agritech.marketplace.verify.step.role'),
    t('agritech.marketplace.verify.step.documents'),
  ];

  const submit = async () => {
    try {
      await props.api.marketplaceControllerSubmitVerification(
        {
          role,
          level: 'verified',
          oneIdLinked: oneId,
          documents: [
            { kind: 'id', fileName: 'id.png', storageKey: 'id.png' },
            { kind: 'farm', fileName: 'farm.png', storageKey: 'farm.png', optional: true },
          ],
        },
        props.requestOptions,
      );
      props.onDone();
    } catch {
      // no-op: surfaced via reload state
    }
  };

  return (
    <div className="ag-card ag-card--panel" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1>{t('agritech.marketplace.verify.title')}</h1>
      <div className="ag-steps ag-mb">
        {steps.map((s, i) => (
          <div key={s} className={`ag-step ${i <= step ? 'ag-step--on' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="ag-grid">
          <button className="ag-btn ag-btn--outline" onClick={() => { setOneId(true); setStep(1); }}>
            {oneId ? `${t('agritech.marketplace.verify.oneIdLinked')} ✓` : t('agritech.marketplace.verify.oneIdLink')}
          </button>
          <button className="ag-btn ag-btn--ghost" onClick={() => setStep(1)}>
            {t('agritech.marketplace.cancel')}
          </button>
        </div>
      )}
      {step === 1 && (
        <div className="ag-grid">
          {(['farmer', 'seller', 'buyer'] as const).map((r) => (
            <button key={r} className={`ag-btn ${role === r ? 'ag-btn--primary' : 'ag-btn--outline'}`} onClick={() => setRole(r)}>
              {t(`agritech.marketplace.account.role.${r}`)}
            </button>
          ))}
          <button className="ag-btn ag-btn--primary" onClick={() => setStep(2)}>
            {t('agritech.marketplace.confirm')}
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="ag-grid">
          {(
            [
              ['land', false],
              ['lease', false],
              ['cadastre', false],
              ['farm', false],
              ['machinery', true],
              ['warehouse', true],
            ] as const
          ).map(([kind, optional]) => (
            <div className="ag-upload" key={kind}>
              {t(`agritech.marketplace.verify.doc.${kind}`)}
              {optional && <span className="ag-caption"> · {t('agritech.marketplace.verify.optional')}</span>}
            </div>
          ))}
          <button className="ag-btn ag-btn--primary" onClick={() => void submit()}>
            {t('agritech.marketplace.verify.submit')}
          </button>
        </div>
      )}
    </div>
  );
}
