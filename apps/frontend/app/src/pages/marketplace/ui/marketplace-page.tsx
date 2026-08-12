// @requirements REQ-AGRITECH-MARKETPLACE-016
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import './marketplace.css';
import { observer, useI18n } from '@app/frontend-runtime';
import {
  isApiClientError,
  throwOnOpenApiErrorData,
  useUserApiClient,
  type AiConsultationViewDto,
  type BuyerRequestViewDto,
  type CartViewDto,
  type ContractDeliveryQuoteDto,
  type ContractViewDto,
  type CreateRequestDto,
  type OfferViewDto,
  type ProductViewDto,
  type RequestOfferDto,
  type ReviewViewDto,
} from '@app/frontend-api-client';
import { LanguageSwitcher } from '../../../shared/ui';
import { useMarketplaceData, type Resource } from '../model/use-marketplace-data';
import { MarketplaceAi } from './marketplace-ai';
import { MarketplaceBrandLockup } from './marketplace-brand';
import { MarketplaceDemoBanner } from './marketplace-demo-banner';
import {
  MarketplaceAccount,
  MarketplaceCart,
  MarketplaceContract,
  MarketplaceRequests,
  MarketplaceVerification,
} from './marketplace-commerce';
import {
  MarketplaceCatalog,
  MarketplaceFavorites,
  MarketplaceHome,
  MarketplaceProductDetail,
  MarketplaceSkeleton,
} from './marketplace-discovery';
import { MarketplaceIcon } from './marketplace-icon';
import {
  type MarketplaceNavigate,
  type MarketplaceNotice,
  type MarketplaceTranslate,
  type MarketplaceView,
} from './marketplace-ui';

export interface MarketplacePageProps {
  /** Route content rendered inside the site chrome when `view` is `embedded`. */
  children?: ReactNode;
  contractId?: string;
  locationSearch?: string;
  navigate?: MarketplaceNavigate;
  productId?: string;
  view?: MarketplaceView;
}

interface Confirmation {
  confirmLabel: string;
  description: string;
  onConfirm: () => Promise<void> | void;
  title: string;
}

type AiKind = 'find_cheaper' | 'generic' | 'recommendation' | 'season_advice';
type DeliveryTerms = 'by_agreement' | 'pickup' | 'seller_delivery';

const defaultNavigate: MarketplaceNavigate = (to) => {
  globalThis.location.assign(to);
};

/**
 * Views that show a person's own identity, documents or agreements. Everything
 * else stays browsable without an account; these three have nothing to show
 * without one, and a placeholder would read as a session that does not exist.
 */
const requiresOwnSession = (view: MarketplaceView): boolean =>
  view === 'account' || view === 'contract' || view === 'verification';

export const MarketplacePage = observer(function MarketplacePage({
  children,
  contractId,
  locationSearch = '',
  navigate = defaultNavigate,
  productId,
  view = 'home',
}: Readonly<MarketplacePageProps>) {
  const { locale, t } = useI18n();
  const translate = useCallback(
    (key: string, params?: Record<string, number | string>) => t(key as never, params as never),
    [t],
  );
  const { api, requestOptions } = useUserApiClient();
  const data = useMarketplaceData();
  const [notice, setNotice] = useState<MarketplaceNotice>();
  const [pendingAction, setPendingAction] = useState<string>();
  const [search, setSearch] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [reviews, setReviews] = useState<Resource<ReviewViewDto[]>>({ data: [], status: 'idle' });
  const noticeTimer = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);
  const closeConfirmation = useCallback(() => {
    setConfirmation(undefined);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'DehqonHub';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const flash = useCallback((message: string, kind: MarketplaceNotice['kind'] = 'success') => {
    if (noticeTimer.current) {
      globalThis.clearTimeout(noticeTimer.current);
    }
    setNotice({ kind, message });
    noticeTimer.current = globalThis.setTimeout(() => {
      setNotice(undefined);
    }, 5000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) {
        globalThis.clearTimeout(noticeTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (view !== 'product' || !productId) {
      setReviews({ data: [], status: 'idle' });
      return undefined;
    }
    // Ratings are a public read, so they load for a visitor with no account too:
    // nobody decides to register in order to find out whether a seller is any good.
    let active = true;
    setReviews((resource) => ({ ...resource, status: 'loading' }));
    void throwOnOpenApiErrorData(api.marketplaceControllerListReviews(productId, requestOptions))
      .then((response) => {
        if (active) {
          setReviews({ data: response.items, status: response.items.length > 0 ? 'ready' : 'empty' });
        }
      })
      .catch(() => {
        if (active) {
          setReviews({ data: [], status: 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [api, productId, requestOptions, view]);

  const favoriteIds = useMemo(
    () => new Set(data.favorites.data.map((favorite) => favorite.productId)),
    [data.favorites.data],
  );
  const selectedProduct = data.catalog.data.find((product) => product.id === productId);
  const selectedContract = data.contracts.data.find((contract) => contract.id === contractId);
  const currentUserId = data.verification.data?.userId;
  const isVerified = data.verification.data?.status === 'verified';
  /** No session behind the page: writes that need one are explained, not attempted. */
  const guestOnly = data.local;
  const requiresAccount = useCallback((): boolean => {
    if (!guestOnly) {
      return false;
    }
    // Letting the request through would 401 at the fetch layer and bounce the
    // visitor to the sign-in form mid-flow, which reads as a random redirect.
    flash(translate('agritech.marketplace.demo.signInRequired'), 'info');
    return true;
  }, [guestOnly, flash, translate]);
  const canReviewSelectedProduct = Boolean(
    selectedProduct &&
    currentUserId &&
    !reviews.data.some((review) => review.userId === currentUserId) &&
    data.contracts.data.some(
      (contract) =>
        contract.buyerUserId === currentUserId &&
        (contract.status === 'active' || contract.status === 'completed') &&
        contract.lines.some((line) => line.productId === selectedProduct.id),
    ),
  );

  const mutationError = useCallback(
    (error: unknown) => {
      if (isApiClientError(error)) {
        if (error.status === 401) {
          return translate('agritech.marketplace.auth.required');
        }
        if (error.status === 403) {
          return translate('agritech.marketplace.cart.verifyRequired');
        }
        if (error.status === 404) {
          return translate('agritech.marketplace.action.notFound');
        }
        if (error.status === 409) {
          return translate('agritech.marketplace.action.conflict');
        }
      }
      return translate('agritech.marketplace.error');
    },
    [translate],
  );

  const runMutation = useCallback(
    async function runMarketplaceMutation<T>(
      key: string,
      action: () => Promise<T>,
      success: string,
      after?: (result: T) => void,
    ): Promise<boolean> {
      setPendingAction(key);
      try {
        const result = await action();
        flash(success);
        after?.(result);
        data.refresh();
        return true;
      } catch (error) {
        if (isApiClientError(error) && (error.status === 404 || error.status === 409)) {
          data.refresh();
        }
        flash(mutationError(error), 'error');
        return false;
      } finally {
        setPendingAction(undefined);
      }
    },
    [data, flash, mutationError],
  );

  const openProduct = (product: ProductViewDto) => {
    navigate(`/products/${encodeURIComponent(product.id)}`);
  };

  const addToCart = (product: ProductViewDto, quantity = 1) => {
    const success = translate('agritech.marketplace.cart.addedToSellerCart', { seller: product.supplierName });
    if (data.local) {
      data.localActions.addToCart(product, quantity);
      flash(success);
      return;
    }
    void runMutation(
      `cart:${product.id}`,
      () =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerAddToCart({ productId: product.id, quantity }, requestOptions),
        ),
      success,
    );
  };

  const toggleFavorite = (product: ProductViewDto) => {
    const favorite = favoriteIds.has(product.id);
    const success = favorite
      ? translate('agritech.marketplace.favorites.removed')
      : translate('agritech.marketplace.favorites.added');
    if (data.local) {
      data.localActions.toggleFavorite(product.id);
      flash(success);
      return;
    }
    void runMutation(
      `favorite:${product.id}`,
      () =>
        throwOnOpenApiErrorData(
          favorite
            ? api.marketplaceControllerRemoveFavorite(product.id, requestOptions)
            : api.marketplaceControllerAddFavorite(product.id, requestOptions),
        ),
      success,
    );
  };

  const addReview = (product: ProductViewDto, rating: number, comment?: string) => {
    if (requiresAccount()) {
      return Promise.resolve(false);
    }
    return runMutation(
      `review:${product.id}`,
      () =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerAddReview(
            product.id,
            {
              ...(comment ? { comment } : {}),
              rating,
            },
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.reviews.submitted'),
      (result) => {
        setReviews((resource) => ({ data: [result, ...resource.data], status: 'ready' }));
      },
    );
  };

  const updateCart = (cart: CartViewDto, productIdToUpdate: string, quantity: number) => {
    if (data.local) {
      data.localActions.updateCart(productIdToUpdate, quantity);
      flash(translate('agritech.marketplace.cart.updated'));
      return;
    }
    void runMutation(
      `cart-update:${productIdToUpdate}`,
      () =>
        throwOnOpenApiErrorData(
          quantity <= 0
            ? api.marketplaceControllerRemoveCartItem(cart.id, productIdToUpdate, requestOptions)
            : api.marketplaceControllerUpdateCartItem(cart.id, productIdToUpdate, { quantity }, requestOptions),
        ),
      translate('agritech.marketplace.cart.updated'),
    );
  };

  const requestSample = (product: ProductViewDto) => {
    if (requiresAccount()) {
      return;
    }
    if (!isVerified) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    setConfirmation({
      confirmLabel: translate('agritech.marketplace.samples.confirm'),
      description: translate('agritech.marketplace.samples.confirmDescription', { product: product.name }),
      onConfirm: async () => {
        await runMutation(
          `sample:${product.id}`,
          () =>
            throwOnOpenApiErrorData(api.marketplaceControllerRequestSample({ productId: product.id }, requestOptions)),
          translate('agritech.marketplace.samples.requested'),
        );
      },
      title: translate('agritech.marketplace.product.sample'),
    });
  };

  const checkout = (cart: CartViewDto, deliveryTerms: DeliveryTerms) => {
    // Identity checks belong to accounts. Sending a guest to /verification would
    // land them on the sign-in wall instead of telling them what checkout needs,
    // so their basket runs to the confirmation and stops there with a note.
    if (!data.local && !isVerified) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    const sellerName =
      cart.items
        .map((item) => data.catalog.data.find((product) => product.id === item.productId))
        .find((product) => product?.supplierId === cart.sellerId)?.supplierName ?? cart.sellerId;
    setConfirmation({
      confirmLabel: translate('agritech.marketplace.cart.reviewContract'),
      description: translate('agritech.marketplace.cart.checkoutConfirmation', { seller: sellerName }),
      onConfirm: async () => {
        if (data.local) {
          // No contract can be drafted without a session, so a guest run ends at
          // an emptied cart plus an explicit note about what signing needs.
          data.localActions.checkout(cart.id);
          flash(translate('agritech.marketplace.demo.checkoutDone'), 'info');
          return;
        }
        await runMutation(
          `checkout:${cart.id}`,
          () =>
            throwOnOpenApiErrorData(api.marketplaceControllerCheckoutCart(cart.id, { deliveryTerms }, requestOptions)),
          translate('agritech.marketplace.contract.draftCreated'),
          (result) => {
            navigate(`/contracts/${result.contractId}`);
          },
        );
      },
      title: translate('agritech.marketplace.cart.checkout'),
    });
  };

  const createRequest = (input: CreateRequestDto) => {
    if (requiresAccount()) {
      return;
    }
    void runMutation(
      'request:create',
      () => throwOnOpenApiErrorData(api.marketplaceControllerCreateRequest(input, requestOptions)),
      translate('agritech.marketplace.orders.created'),
    );
  };

  const makeOffer = (request: BuyerRequestViewDto, input: RequestOfferDto) => {
    if (requiresAccount()) {
      return;
    }
    void runMutation(
      `offer:${request.id}`,
      () => throwOnOpenApiErrorData(api.marketplaceControllerMakeOffer(request.id, input, requestOptions)),
      translate('agritech.marketplace.orders.offerSent'),
    );
  };

  const chooseOffer = (request: BuyerRequestViewDto, offer: OfferViewDto) => {
    if (requiresAccount()) {
      return;
    }
    setConfirmation({
      confirmLabel: translate('agritech.marketplace.orders.confirmOffer'),
      description: translate('agritech.marketplace.orders.confirmOfferDescription'),
      onConfirm: async () => {
        await runMutation(
          `choose:${offer.id}`,
          () => throwOnOpenApiErrorData(api.marketplaceControllerChooseOffer(request.id, offer.id, requestOptions)),
          translate('agritech.marketplace.contract.draftCreated'),
          (result) => {
            navigate(`/contracts/${result.contractId}`);
          },
        );
      },
      title: translate('agritech.marketplace.orders.choose'),
    });
  };

  const signContract = (contract: ContractViewDto) => {
    setConfirmation({
      confirmLabel: translate('agritech.marketplace.contract.signOwnParty'),
      description: translate('agritech.marketplace.contract.signConfirmation'),
      onConfirm: async () => {
        await runMutation(
          `sign:${contract.id}`,
          () => throwOnOpenApiErrorData(api.marketplaceControllerSignContract(contract.id, requestOptions)),
          translate('agritech.marketplace.contract.signatureRecorded'),
        );
      },
      title: translate('agritech.marketplace.contract.sign'),
    });
  };

  const quoteContractDelivery = (contract: ContractViewDto, input: ContractDeliveryQuoteDto) => {
    void runMutation(
      `quote:${contract.id}`,
      () =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerUpdateContractDeliveryQuote(contract.id, input, requestOptions),
        ),
      translate('agritech.marketplace.contract.deliveryQuoteSaved'),
    );
  };

  const askAi = (question: string, kind: AiKind): Promise<AiConsultationViewDto> =>
    throwOnOpenApiErrorData(api.marketplaceControllerAskAi({ kind, question }, requestOptions));

  const submitSearch = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(search.trim() ? `/catalog?q=${encodeURIComponent(search.trim())}` : '/catalog');
  };

  const productActions = {
    favoriteIds,
    locale,
    navigate,
    onAdd: addToCart,
    onFavorite: toggleFavorite,
    onOpen: openProduct,
    pendingAction,
    products: data.catalog.data,
    t: translate,
  };

  // Rendered inside the home page just below the hero, and above the content on
  // every other view: the hero is the first thing a visitor should see, so the
  // credential card follows it instead of pushing it off the first screen.
  const demoBanner =
    data.demo === 'none' ? null : (
      <MarketplaceDemoBanner
        navigate={navigate}
        onRetry={data.refresh}
        reason={data.demo}
        t={translate}
        variant={view === 'home' ? 'full' : 'compact'}
      />
    );

  let content: ReactNode;
  if (view === 'embedded') {
    // Route content owns its own loading and empty states, so the chrome must not
    // hold it behind a catalog request it does not read.
    content = children;
  } else if (data.auth === 'checking') {
    content = <MarketplaceLoading t={translate} />;
  } else if (data.catalog.status === 'loading' || data.catalog.status === 'idle') {
    content = <MarketplaceLoading t={translate} />;
  } else if (guestOnly && requiresOwnSession(view)) {
    content = <MarketplaceSignedOut navigate={navigate} t={translate} />;
  } else {
    switch (view) {
      case 'catalog':
        content = <MarketplaceCatalog {...productActions} locationSearch={locationSearch} />;
        break;
      case 'product':
        content = (
          <MarketplaceProductDetail
            {...productActions}
            canReview={canReviewSelectedProduct}
            onReview={addReview}
            onRetry={data.refresh}
            onSample={requestSample}
            product={selectedProduct}
            reviews={reviews}
            sampleUsage={data.sampleUsage}
            similar={data.catalog.data.filter(
              (product) => product.id !== productId && selectedProduct && product.category === selectedProduct.category,
            )}
          />
        );
        break;
      case 'favorites':
        content = <MarketplaceFavorites {...productActions} status={data.favorites.status} />;
        break;
      case 'cart':
        content = (
          <MarketplaceCart
            carts={data.carts}
            locale={locale}
            navigate={navigate}
            onCheckout={checkout}
            onUpdate={updateCart}
            pendingAction={pendingAction}
            products={data.catalog.data}
            t={translate}
          />
        );
        break;
      case 'requests':
        content = (
          <MarketplaceRequests
            isVerified={isVerified}
            locale={locale}
            myRequests={data.myRequests}
            navigate={navigate}
            offersByRequest={data.offersByRequest}
            onChoose={chooseOffer}
            onCreate={createRequest}
            onOffer={makeOffer}
            onRetry={data.refresh}
            pendingAction={pendingAction}
            requests={data.requests}
            role={data.verification.data?.role}
            t={translate}
          />
        );
        break;
      case 'verification':
        content = (
          <MarketplaceVerification
            navigate={navigate}
            onRetry={data.refresh}
            t={translate}
            verification={data.verification}
          />
        );
        break;
      case 'account':
        content = (
          <MarketplaceAccount
            contracts={data.contracts}
            locale={locale}
            myRequests={data.myRequests}
            navigate={navigate}
            samples={data.samples}
            t={translate}
            verification={data.verification}
          />
        );
        break;
      case 'contract':
        content = (
          <MarketplaceContract
            contract={selectedContract}
            currentUserId={currentUserId}
            identityStatus={data.verification.status}
            locale={locale}
            navigate={navigate}
            onQuote={quoteContractDelivery}
            onRetry={data.refresh}
            onSign={signContract}
            pendingAction={pendingAction}
            status={data.contracts.status}
            t={translate}
          />
        );
        break;
      default:
        content = <MarketplaceHome {...productActions} banner={demoBanner} />;
    }
  }

  return (
    <div className="dh-marketplace">
      <a className="dh-skip-link" href="#dh-main">
        {translate('agritech.marketplace.accessibility.skipToContent')}
      </a>
      <MarketplaceHeader
        cartCount={data.carts.data.reduce((count, cart) => count + cart.items.length, 0)}
        favoriteCount={favoriteIds.size}
        navigate={navigate}
        onSearch={submitSearch}
        search={search}
        setSearch={setSearch}
        t={translate}
        verificationStatus={data.verification.data?.status}
        view={view}
      />
      <MarketplaceNoticeBar
        notice={notice}
        onClose={() => {
          setNotice(undefined);
        }}
        t={translate}
      />
      <main className="dh-main" id="dh-main">
        {view === 'home' ? null : demoBanner}
        {content}
      </main>
      <div className="dh-mobile-preferences">
        <LanguageSwitcher variant="menu" />
      </div>
      <MarketplaceFooter navigate={navigate} t={translate} />
      {data.auth === 'signed-in' && (
        <MarketplaceAi
          locale={locale}
          onAsk={askAi}
          onOpenProduct={openProduct}
          products={data.catalog.data}
          t={translate}
        />
      )}
      <MarketplaceMobileNav
        cartCount={data.carts.data.reduce((count, cart) => count + cart.items.length, 0)}
        navigate={navigate}
        t={translate}
        view={view}
      />
      {confirmation && (
        <MarketplaceConfirmation
          confirmation={confirmation}
          onClose={closeConfirmation}
          pending={Boolean(pendingAction)}
          t={translate}
        />
      )}
    </div>
  );
});

interface HeaderProps {
  cartCount: number;
  favoriteCount: number;
  navigate: MarketplaceNavigate;
  onSearch: (event: SyntheticEvent<HTMLFormElement>) => void;
  search: string;
  setSearch: (value: string) => void;
  t: MarketplaceTranslate;
  verificationStatus?: string;
  view: MarketplaceView;
}

function MarketplaceHeader({
  cartCount,
  favoriteCount,
  navigate,
  onSearch,
  search,
  setSearch,
  t,
  verificationStatus,
  view,
}: Readonly<HeaderProps>) {
  return (
    <header className="dh-header">
      <div className="dh-header__main">
        <button
          aria-label={t('agritech.marketplace.brand')}
          className="dh-brand"
          onClick={() => {
            navigate('/');
          }}
          type="button"
        >
          <MarketplaceBrandLockup t={t} />
        </button>
        <button
          className={`dh-button dh-button--catalog${view === 'catalog' ? ' is-active' : ''}`}
          onClick={() => {
            navigate('/catalog');
          }}
          type="button"
        >
          <MarketplaceIcon name="produce" />
          {t('agritech.marketplace.catalog')}
        </button>
        <form className="dh-search" onSubmit={onSearch} role="search">
          <label className="dh-sr-only" htmlFor="dh-search">
            {t('agritech.marketplace.search')}
          </label>
          <input
            id="dh-search"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder={t('agritech.marketplace.search.placeholder')}
            type="search"
            value={search}
          />
          <button aria-label={t('agritech.marketplace.search')} type="submit">
            <MarketplaceIcon name="search" />
          </button>
        </form>
        <nav aria-label={t('agritech.marketplace.accessibility.primaryNavigation')} className="dh-header__nav">
          <HeaderAction
            active={view === 'requests'}
            icon="orders"
            label={t('agritech.marketplace.orders')}
            onClick={() => {
              navigate('/requests');
            }}
          />
          <HeaderAction
            active={view === 'favorites'}
            badge={favoriteCount}
            icon="heart"
            label={t('agritech.marketplace.favorites')}
            onClick={() => {
              navigate('/favorites');
            }}
          />
          <HeaderAction
            active={view === 'cart'}
            badge={cartCount}
            icon="cart"
            label={t('agritech.marketplace.cart')}
            onClick={() => {
              navigate('/cart');
            }}
          />
          <HeaderAction
            active={view === 'account' || view === 'verification'}
            icon={verificationStatus === 'verified' ? 'shield' : 'account'}
            label={
              verificationStatus === 'verified'
                ? t('agritech.marketplace.account')
                : t('agritech.marketplace.verification')
            }
            onClick={() => {
              navigate(verificationStatus === 'verified' ? '/account' : '/verification');
            }}
          />
        </nav>
        <div className="dh-header__preferences">
          {/* Code, not language name: the header already carries a brand lockup, a
              catalog button, the search field and four actions. */}
          <LanguageSwitcher compact variant="menu" />
        </div>
      </div>
      <nav aria-label={t('agritech.marketplace.catalog.categories')} className="dh-header__categories">
        {(['all', 'equipment', 'seeds', 'produce'] as const).map((section) => (
          <button
            key={section}
            onClick={() => {
              navigate(section === 'all' ? '/catalog' : `/catalog?section=${section}`);
            }}
            type="button"
          >
            {t(`agritech.marketplace.section.${section}`)}
          </button>
        ))}
      </nav>
    </header>
  );
}

function HeaderAction({
  active,
  badge,
  icon,
  label,
  onClick,
}: Readonly<{
  active: boolean;
  badge?: number;
  icon: 'account' | 'cart' | 'heart' | 'orders' | 'shield';
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={active ? 'is-active' : ''}
      onClick={onClick}
      type="button"
    >
      <span>
        <MarketplaceIcon name={icon} />
        {badge ? <em>{badge}</em> : null}
      </span>
      <small>{label}</small>
    </button>
  );
}

/** Transient result of an action: an error speaks up, anything else reports. */
function MarketplaceNoticeBar({
  notice,
  onClose,
  t,
}: Readonly<{ notice: MarketplaceNotice | undefined; onClose: () => void; t: MarketplaceTranslate }>) {
  if (!notice) {
    return null;
  }

  const isError = notice.kind === 'error';

  return (
    <div aria-live="polite" className={`dh-notice dh-notice--${notice.kind}`} role={isError ? 'alert' : 'status'}>
      <MarketplaceIcon name={isError ? 'alert' : 'check'} />
      <span>{notice.message}</span>
      <button aria-label={t('agritech.marketplace.close')} onClick={onClose} type="button">
        <MarketplaceIcon name="close" />
      </button>
    </div>
  );
}

function MarketplaceLoading({ t }: Readonly<{ t: MarketplaceTranslate }>) {
  return (
    <div aria-busy="true" aria-label={t('agritech.marketplace.loading')} className="dh-loading">
      <div className="dh-skeleton dh-skeleton--hero" />
      <MarketplaceSkeleton count={8} />
    </div>
  );
}

function MarketplaceSignedOut({ navigate, t }: Readonly<{ navigate: MarketplaceNavigate; t: MarketplaceTranslate }>) {
  const returnUrl =
    typeof globalThis.location === 'undefined' ? '/' : `${globalThis.location.pathname}${globalThis.location.search}`;
  return (
    <section className="dh-signed-out">
      <span className="dh-seal">
        <MarketplaceIcon name="account" />
      </span>
      <p className="dh-eyebrow">{t('agritech.marketplace.title')}</p>
      <h1>{t('agritech.marketplace.auth.title')}</h1>
      <p>{t('agritech.marketplace.auth.description')}</p>
      <button
        className="dh-button dh-button--primary"
        onClick={() => {
          navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
        }}
        type="button"
      >
        {t('agritech.marketplace.signIn')}
        <MarketplaceIcon name="arrow" />
      </button>
      <small>{t('agritech.marketplace.auth.noPublicTenant')}</small>
    </section>
  );
}

function MarketplaceConfirmation({
  confirmation,
  onClose,
  pending,
  t,
}: Readonly<{ confirmation: Confirmation; onClose: () => void; pending: boolean; t: MarketplaceTranslate }>) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        onClose();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="dh-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !pending) {
          onClose();
        }
      }}
    >
      <section
        aria-describedby="dh-confirm-description"
        aria-labelledby="dh-confirm-title"
        aria-modal="true"
        className="dh-dialog"
        role="dialog"
      >
        <button
          aria-label={t('agritech.marketplace.close')}
          className="dh-icon-button dh-dialog__close"
          disabled={pending}
          onClick={onClose}
          type="button"
        >
          <MarketplaceIcon name="close" />
        </button>
        <span className="dh-seal dh-seal--small">
          <MarketplaceIcon name="contract" />
        </span>
        <h2 id="dh-confirm-title">{confirmation.title}</h2>
        <p id="dh-confirm-description">{confirmation.description}</p>
        <div className="dh-dialog__actions">
          <button className="dh-button dh-button--secondary" disabled={pending} onClick={onClose} type="button">
            {t('agritech.marketplace.cancel')}
          </button>
          <button
            className="dh-button dh-button--primary"
            disabled={pending}
            onClick={() => void Promise.resolve(confirmation.onConfirm()).finally(onClose)}
            ref={confirmRef}
            type="button"
          >
            {pending ? t('agritech.marketplace.loading') : confirmation.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function MarketplaceFooter({ navigate, t }: Readonly<{ navigate: MarketplaceNavigate; t: MarketplaceTranslate }>) {
  return (
    <footer className="dh-footer">
      <div className="dh-footer__brand">
        <button
          aria-label={t('agritech.marketplace.brand')}
          className="dh-brand dh-brand--footer"
          onClick={() => {
            navigate('/');
          }}
          type="button"
        >
          <MarketplaceBrandLockup t={t} />
        </button>
        <p>{t('agritech.marketplace.footer.description')}</p>
      </div>
      <div>
        <strong>{t('agritech.marketplace.footer.forBuyers')}</strong>
        <button
          aria-label={`${t('agritech.marketplace.footer.forBuyers')}: ${t('agritech.marketplace.catalog')}`}
          onClick={() => {
            navigate('/catalog');
          }}
          type="button"
        >
          {t('agritech.marketplace.catalog')}
        </button>
        <button
          aria-label={`${t('agritech.marketplace.footer.forBuyers')}: ${t('agritech.marketplace.orders')}`}
          onClick={() => {
            navigate('/requests');
          }}
          type="button"
        >
          {t('agritech.marketplace.orders')}
        </button>
      </div>
      <div>
        <strong>{t('agritech.marketplace.footer.forSellers')}</strong>
        <button
          aria-label={`${t('agritech.marketplace.footer.forSellers')}: ${t('agritech.marketplace.orders.feed')}`}
          onClick={() => {
            navigate('/requests');
          }}
          type="button"
        >
          {t('agritech.marketplace.orders.feed')}
        </button>
        <button
          onClick={() => {
            navigate('/verification');
          }}
          type="button"
        >
          {t('agritech.marketplace.verification')}
        </button>
      </div>
      <div>
        <strong>{t('agritech.marketplace.footer.help')}</strong>
        <button
          onClick={() => {
            navigate('/account');
          }}
          type="button"
        >
          {t('agritech.marketplace.account')}
        </button>
        {/* The profile and preferences pages used to hang off a second, generic
            navigation bar. That bar is gone, so the site's own footer carries
            them — otherwise both pages would only be reachable by URL. */}
        <button
          onClick={() => {
            navigate('/profile');
          }}
          type="button"
        >
          {t('user.nav.profile')}
        </button>
        <button
          onClick={() => {
            navigate('/settings');
          }}
          type="button"
        >
          {t('user.nav.settings')}
        </button>
        <span>{t('agritech.marketplace.footer.providerBoundary')}</span>
      </div>
      <p className="dh-footer__legal">{t('agritech.marketplace.footer.legal')}</p>
    </footer>
  );
}

function MarketplaceMobileNav({
  cartCount,
  navigate,
  t,
  view,
}: Readonly<{ cartCount: number; navigate: MarketplaceNavigate; t: MarketplaceTranslate; view: MarketplaceView }>) {
  const items: Array<{
    href: string;
    icon: 'account' | 'cart' | 'home' | 'orders' | 'produce';
    label: string;
    views: MarketplaceView[];
  }> = [
    { href: '/', icon: 'home', label: t('agritech.marketplace.home'), views: ['home'] },
    { href: '/catalog', icon: 'produce', label: t('agritech.marketplace.catalog'), views: ['catalog', 'product'] },
    { href: '/requests', icon: 'orders', label: t('agritech.marketplace.orders'), views: ['requests'] },
    { href: '/cart', icon: 'cart', label: t('agritech.marketplace.cart'), views: ['cart'] },
    {
      href: '/account',
      icon: 'account',
      label: t('agritech.marketplace.account'),
      views: ['account', 'contract', 'favorites', 'verification'],
    },
  ];
  return (
    <nav aria-label={t('agritech.marketplace.accessibility.mobileNavigation')} className="dh-mobile-nav">
      {items.map((item) => (
        <button
          aria-current={item.views.includes(view) ? 'page' : undefined}
          key={item.href}
          onClick={() => {
            navigate(item.href);
          }}
          type="button"
        >
          <span>
            <MarketplaceIcon name={item.icon} />
            {item.icon === 'cart' && cartCount > 0 ? <em>{cartCount}</em> : null}
          </span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  );
}
