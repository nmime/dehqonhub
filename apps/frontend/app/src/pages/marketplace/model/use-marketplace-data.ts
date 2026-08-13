import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isApiClientError,
  throwOnOpenApiErrorData,
  useUserApiClient,
  type BuyerRequestViewDto,
  type CartViewDto,
  type ContractViewDto,
  type MarketplaceFavoriteDto,
  type MarketplaceSampleDto,
  type MarketplaceSampleUsageDto,
  type OfferViewDto,
  type PartnerViewDto,
  type ProductViewDto,
  type VerificationViewDto,
} from '@app/frontend-api-client';
import {
  addGuestCartItem,
  clearGuestCart,
  readGuestCarts,
  readGuestFavorites,
  toggleGuestFavorite,
  updateGuestCartItem,
} from './guest-session';

export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type SessionState = 'checking' | 'signed-in' | 'signed-out' | 'error';
type CatalogSource = 'checking' | 'demo' | 'live' | 'unavailable';

/**
 * What the marketplace banner has to disclose.
 * - `demo-catalog`: the API answered with its demo dataset, because the tenant
 *   has published nothing yet, so the listings are not live inventory.
 * - `guest`: live listings, but nobody is signed in — the banner offers the
 *   review logins.
 * - `unavailable`: the catalog request failed; the banner keeps a retry.
 * - `none`: live listings read by a signed-in account; no banner.
 */
export type DemoReason = 'demo-catalog' | 'guest' | 'none' | 'unavailable';

export interface Resource<T> {
  data: T;
  status: ResourceStatus;
}

const listResource = <T>(): Resource<T[]> => ({ data: [], status: 'idle' });

/**
 * The sample allowance shown before the account read lands, and the whole of it
 * for a visitor with no account: browsing costs nobody a sample. The period is
 * this month rather than a fixed literal, so a placeholder never claims to
 * describe a month that is not the one being browsed.
 */
const initialUsage = (): MarketplaceSampleUsageDto => ({
  limit: 5,
  period: new Date().toISOString().slice(0, 7),
  policyVersion: 1,
  remaining: 5,
  used: 0,
});

/**
 * Cart and favourite writes for a visitor without a session. They persist to
 * `localStorage` instead of the API, because both endpoints require a session
 * and bouncing someone to a sign-in form on their first "add to cart" is how a
 * marketplace loses them.
 */
export interface MarketplaceLocalActions {
  addToCart: (product: ProductViewDto, quantity: number) => void;
  checkout: (cartId: string) => void;
  toggleFavorite: (product: ProductViewDto) => void;
  updateCart: (productId: string, quantity: number) => void;
}

export interface MarketplaceData {
  auth: SessionState;
  carts: Resource<CartViewDto[]>;
  catalog: Resource<ProductViewDto[]>;
  contracts: Resource<ContractViewDto[]>;
  /** What the banner should disclose about the data on screen. */
  demo: DemoReason;
  favorites: Resource<MarketplaceFavoriteDto[]>;
  /** True while cart and favourite writes stay in this browser: no session. */
  local: boolean;
  localActions: MarketplaceLocalActions;
  myRequests: Resource<BuyerRequestViewDto[]>;
  offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  /**
   * The organizations this account may act for. Every commerce command names the
   * partner it is issued on behalf of, so a basket, a purchase request or an
   * offer is impossible until an approved one exists.
   */
  partners: Resource<PartnerViewDto[]>;
  refresh: () => void;
  requests: Resource<BuyerRequestViewDto[]>;
  sampleUsage: Resource<MarketplaceSampleUsageDto>;
  samples: Resource<MarketplaceSampleDto[]>;
  verification: Resource<VerificationViewDto | null>;
}

const statusForList = (items: readonly unknown[]): ResourceStatus => (items.length === 0 ? 'empty' : 'ready');

/** Reduces the catalog source and session state to the one thing to disclose. */
const disclosureFor = (source: CatalogSource, auth: SessionState): DemoReason => {
  if (source === 'unavailable') {
    return 'unavailable';
  }
  if (source === 'demo') {
    return 'demo-catalog';
  }
  // `checking` stays silent: the page shows its loading state, and a banner that
  // appears for one frame and then leaves reads as a glitch.
  return auth === 'signed-out' || auth === 'error' ? 'guest' : 'none';
};

export function useMarketplaceData(): MarketplaceData {
  const { api, requestOptions } = useUserApiClient();
  const epochRef = useRef(0);
  const [auth, setAuth] = useState<SessionState>('checking');
  const [catalogSource, setCatalogSource] = useState<CatalogSource>('checking');
  const [catalog, setCatalog] = useState<Resource<ProductViewDto[]>>(listResource);
  const [verification, setVerification] = useState<Resource<VerificationViewDto | null>>({
    data: null,
    status: 'idle',
  });
  const [carts, setCarts] = useState<Resource<CartViewDto[]>>(listResource);
  const [favorites, setFavorites] = useState<Resource<MarketplaceFavoriteDto[]>>(listResource);
  const [requests, setRequests] = useState<Resource<BuyerRequestViewDto[]>>(listResource);
  const [myRequests, setMyRequests] = useState<Resource<BuyerRequestViewDto[]>>(listResource);
  const [offersByRequest, setOffersByRequest] = useState<Resource<Record<string, OfferViewDto[]>>>({
    data: {},
    status: 'idle',
  });
  const [contracts, setContracts] = useState<Resource<ContractViewDto[]>>(listResource);
  const [partners, setPartners] = useState<Resource<PartnerViewDto[]>>(listResource);
  const [samples, setSamples] = useState<Resource<MarketplaceSampleDto[]>>(listResource);
  const [sampleUsage, setSampleUsage] = useState<Resource<MarketplaceSampleUsageDto>>({
    data: initialUsage(),
    status: 'idle',
  });

  /**
   * Restores the browser-local basket for a visitor with no session, and empties
   * the resources that only exist per account. Their per-resource requests are
   * deliberately skipped: they would each 401, and those 401s would fire the
   * runtime's auth-required navigation mid-browse.
   */
  const enterGuestMode = useCallback(() => {
    const favoriteEntries = readGuestFavorites();
    const cartEntries = readGuestCarts();
    setCarts({ data: cartEntries, status: statusForList(cartEntries) });
    setFavorites({ data: favoriteEntries, status: statusForList(favoriteEntries) });
    setMyRequests({ data: [], status: 'empty' });
    setOffersByRequest({ data: {}, status: 'empty' });
    setContracts({ data: [], status: 'empty' });
    setPartners({ data: [], status: 'empty' });
    setSamples({ data: [], status: 'empty' });
    setSampleUsage({ data: initialUsage(), status: 'ready' });
  }, []);

  const load = useCallback(async () => {
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    const current = () => epochRef.current === epoch;

    setAuth('checking');
    setCatalog((resource) => ({ ...resource, status: 'loading' }));
    setRequests((resource) => ({ ...resource, status: 'loading' }));
    setVerification((resource) => ({ ...resource, status: 'loading' }));

    /**
     * The catalog read needs no session, and the API answers a tenant that has
     * published nothing with its own demo dataset — so a listing on screen is
     * always server-owned, and the only failure left here is an unreachable API.
     */
    const loadCatalog = async () => {
      try {
        const response = await throwOnOpenApiErrorData(api.productControllerList(requestOptions));
        // A 200 that carries no list is a malformed payload, not an empty catalog.
        // The chrome issues this request on every route, so a proxy or a stub
        // answering it with an unrelated body must not take the whole site down.
        const products = Array.isArray(response.items) ? response.items : [];
        if (current()) {
          setCatalogSource(response.demo ? 'demo' : 'live');
          setCatalog({ data: products, status: statusForList(products) });
        }
      } catch {
        if (current()) {
          setCatalogSource('unavailable');
          setCatalog({ data: [], status: 'error' });
        }
      }
    };

    const loadRequests = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerListRequests(requestOptions));
        if (current()) {
          setRequests({ data: data.items, status: statusForList(data.items) });
        }
      } catch {
        if (current()) {
          setRequests({ data: [], status: 'error' });
        }
      }
    };

    /**
     * Verification is the cheapest guarded read, so it doubles as the session
     * probe: its 401 is how the page learns that nobody is signed in.
     */
    const loadSession = async (): Promise<boolean> => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerGetVerification(requestOptions));
        if (current()) {
          setAuth('signed-in');
          setVerification({ data, status: 'ready' });
        }
        return true;
      } catch (error) {
        if (current()) {
          setAuth(isApiClientError(error) && error.status === 401 ? 'signed-out' : 'error');
          setVerification({ data: null, status: 'idle' });
        }
        return false;
      }
    };

    const loadCarts = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerListCarts(requestOptions));
        if (current()) {
          setCarts({ data: data.items, status: statusForList(data.items) });
        }
      } catch {
        if (current()) {
          setCarts({ data: [], status: 'error' });
        }
      }
    };

    const loadFavorites = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerListFavorites(requestOptions));
        if (current()) {
          setFavorites({ data: data.items, status: statusForList(data.items) });
        }
      } catch {
        if (current()) {
          setFavorites({ data: [], status: 'error' });
        }
      }
    };

    const loadMyRequestsAndOffers = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerListMyRequests(requestOptions));
        if (!current()) {
          return;
        }
        setMyRequests({ data: data.items, status: statusForList(data.items) });
        if (data.items.length === 0) {
          setOffersByRequest({ data: {}, status: 'empty' });
          return;
        }
        const pairs = await Promise.all(
          data.items.map(async (request): Promise<readonly [string, OfferViewDto[] | undefined]> => {
            try {
              const offers = await throwOnOpenApiErrorData(
                api.marketplaceControllerListOffers(request.id, requestOptions),
              );
              return [request.id, offers.items] as const;
            } catch {
              return [request.id, undefined] as const;
            }
          }),
        );
        if (current()) {
          const mapped = pairs.reduce<Record<string, OfferViewDto[]>>((result, [requestId, items]) => {
            if (items) {
              result[requestId] = items;
            }
            return result;
          }, {});
          const hasFailure = pairs.some(([, items]) => items === undefined);
          const hasOffers = pairs.some(([, items]) => (items?.length ?? 0) > 0);
          let offersStatus: ResourceStatus = 'empty';
          if (hasFailure) {
            offersStatus = 'error';
          } else if (hasOffers) {
            offersStatus = 'ready';
          }
          setOffersByRequest({
            data: mapped,
            status: offersStatus,
          });
        }
      } catch {
        if (current()) {
          setMyRequests({ data: [], status: 'error' });
          setOffersByRequest({ data: {}, status: 'error' });
        }
      }
    };

    const loadContracts = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerListContracts(requestOptions));
        if (current()) {
          setContracts({ data: data.items, status: statusForList(data.items) });
        }
      } catch {
        if (current()) {
          setContracts({ data: [], status: 'error' });
        }
      }
    };

    const loadPartners = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.agriTechOperationsControllerListPartners(requestOptions));
        if (current()) {
          setPartners({ data: data.items, status: statusForList(data.items) });
        }
      } catch {
        if (current()) {
          setPartners({ data: [], status: 'error' });
        }
      }
    };

    const loadSamples = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerListSamples(requestOptions));
        if (current()) {
          setSamples({ data: data.items, status: statusForList(data.items) });
        }
      } catch {
        if (current()) {
          setSamples({ data: [], status: 'error' });
        }
      }
    };

    const loadUsage = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerSampleUsage(requestOptions));
        if (current()) {
          setSampleUsage({ data, status: 'ready' });
        }
      } catch {
        if (current()) {
          setSampleUsage({ data: initialUsage(), status: 'error' });
        }
      }
    };

    const loadAccountResources = async () => {
      if (!(await loadSession())) {
        if (current()) {
          enterGuestMode();
        }
        return;
      }
      await Promise.all([
        loadCarts(),
        loadFavorites(),
        loadMyRequestsAndOffers(),
        loadContracts(),
        loadPartners(),
        loadSamples(),
        loadUsage(),
      ]);
    };

    await Promise.all([loadCatalog(), loadRequests(), loadAccountResources()]);
  }, [api, enterGuestMode, requestOptions]);

  useEffect(() => {
    void load();
    return () => {
      epochRef.current += 1;
    };
  }, [load]);

  const localActions = useMemo<MarketplaceLocalActions>(
    () => ({
      addToCart: (product, quantity) => {
        const next = addGuestCartItem(product, quantity);
        setCarts({ data: next, status: statusForList(next) });
      },
      checkout: (cartId) => {
        const next = clearGuestCart(cartId);
        setCarts({ data: next, status: statusForList(next) });
      },
      toggleFavorite: (product) => {
        const next = toggleGuestFavorite(product);
        setFavorites({ data: next, status: statusForList(next) });
      },
      updateCart: (productId, quantity) => {
        const next = updateGuestCartItem(productId, quantity);
        setCarts({ data: next, status: statusForList(next) });
      },
    }),
    [],
  );

  return {
    auth,
    carts,
    catalog,
    contracts,
    demo: disclosureFor(catalogSource, auth),
    favorites,
    local: auth === 'signed-out' || auth === 'error',
    localActions,
    myRequests,
    offersByRequest,
    partners,
    refresh: () => void load(),
    requests,
    sampleUsage,
    samples,
    verification,
  };
}
