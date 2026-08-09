import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isApiClientError,
  throwOnOpenApiErrorData,
  useUserApiClient,
  type BuyerRequestViewDto,
  type CartViewDto,
  type ContractViewDto,
  type FavoriteViewDto,
  type OfferViewDto,
  type ProductViewDto,
  type SampleUsageViewDto,
  type SampleViewDto,
  type VerificationViewDto,
} from '@app/frontend-api-client';

export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type SessionState = 'checking' | 'signed-in' | 'signed-out' | 'error';

export interface Resource<T> {
  data: T;
  status: ResourceStatus;
}

const listResource = <T>(): Resource<T[]> => ({ data: [], status: 'idle' });

const initialUsage: SampleUsageViewDto = { limit: 5, remaining: 5, used: 0 };

export interface MarketplaceData {
  auth: SessionState;
  carts: Resource<CartViewDto[]>;
  catalog: Resource<ProductViewDto[]>;
  contracts: Resource<ContractViewDto[]>;
  favorites: Resource<FavoriteViewDto[]>;
  myRequests: Resource<BuyerRequestViewDto[]>;
  offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  refresh: () => void;
  requests: Resource<BuyerRequestViewDto[]>;
  sampleUsage: Resource<SampleUsageViewDto>;
  samples: Resource<SampleViewDto[]>;
  verification: Resource<VerificationViewDto | null>;
}

const statusForList = (items: readonly unknown[]): ResourceStatus => (items.length === 0 ? 'empty' : 'ready');

export function useMarketplaceData(): MarketplaceData {
  const { api, requestOptions } = useUserApiClient();
  const epochRef = useRef(0);
  const [auth, setAuth] = useState<SessionState>('checking');
  const [catalog, setCatalog] = useState<Resource<ProductViewDto[]>>(listResource);
  const [verification, setVerification] = useState<Resource<VerificationViewDto | null>>({
    data: null,
    status: 'idle',
  });
  const [carts, setCarts] = useState<Resource<CartViewDto[]>>(listResource);
  const [favorites, setFavorites] = useState<Resource<FavoriteViewDto[]>>(listResource);
  const [requests, setRequests] = useState<Resource<BuyerRequestViewDto[]>>(listResource);
  const [myRequests, setMyRequests] = useState<Resource<BuyerRequestViewDto[]>>(listResource);
  const [offersByRequest, setOffersByRequest] = useState<Resource<Record<string, OfferViewDto[]>>>({
    data: {},
    status: 'idle',
  });
  const [contracts, setContracts] = useState<Resource<ContractViewDto[]>>(listResource);
  const [samples, setSamples] = useState<Resource<SampleViewDto[]>>(listResource);
  const [sampleUsage, setSampleUsage] = useState<Resource<SampleUsageViewDto>>({
    data: initialUsage,
    status: 'idle',
  });

  const load = useCallback(async () => {
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    const current = () => epochRef.current === epoch;

    setAuth('checking');
    setCatalog((resource) => ({ ...resource, status: 'loading' }));

    let products: ProductViewDto[];
    try {
      const response = await throwOnOpenApiErrorData(api.productControllerList(requestOptions));
      products = response.items;
    } catch (error) {
      if (!current()) {
        return;
      }
      setCatalog({ data: [], status: 'error' });
      setAuth(isApiClientError(error) && error.status === 401 ? 'signed-out' : 'error');
      return;
    }

    if (!current()) {
      return;
    }
    setAuth('signed-in');
    setCatalog({ data: products, status: statusForList(products) });
    setVerification((resource) => ({ ...resource, status: 'loading' }));
    setCarts((resource) => ({ ...resource, status: 'loading' }));
    setFavorites((resource) => ({ ...resource, status: 'loading' }));
    setRequests((resource) => ({ ...resource, status: 'loading' }));
    setMyRequests((resource) => ({ ...resource, status: 'loading' }));
    setContracts((resource) => ({ ...resource, status: 'loading' }));
    setSamples((resource) => ({ ...resource, status: 'loading' }));
    setSampleUsage((resource) => ({ ...resource, status: 'loading' }));
    setOffersByRequest((resource) => ({ ...resource, status: 'loading' }));

    const loadVerification = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerGetVerification(requestOptions));
        if (current()) {
          setVerification({ data, status: 'ready' });
        }
      } catch {
        if (current()) {
          setVerification({ data: null, status: 'error' });
        }
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
          setSampleUsage({ data: initialUsage, status: 'error' });
        }
      }
    };

    await Promise.all([
      loadVerification(),
      loadCarts(),
      loadFavorites(),
      loadRequests(),
      loadMyRequestsAndOffers(),
      loadContracts(),
      loadSamples(),
      loadUsage(),
    ]);
  }, [api, requestOptions]);

  useEffect(() => {
    void load();
    return () => {
      epochRef.current += 1;
    };
  }, [load]);

  return {
    auth,
    carts,
    catalog,
    contracts,
    favorites,
    myRequests,
    offersByRequest,
    refresh: () => void load(),
    requests,
    sampleUsage,
    samples,
    verification,
  };
}
