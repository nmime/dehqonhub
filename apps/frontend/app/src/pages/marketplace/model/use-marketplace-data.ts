// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isApiClientError,
  throwOnOpenApiErrorData,
  useUserApiClient,
  type BuyerRequestViewDto,
  type CartViewDto,
  type ContractViewDto,
  type MarketplaceAiConsultationDto,
  type MarketplaceContractNotificationRecipientDto,
  type MarketplaceFavoriteDto,
  type MarketplaceListingPromotionDto,
  type MarketplaceOwnedListingPublicationDto,
  type MarketplaceOwnedRequestPublicationDto,
  type MarketplacePromotionPlanDto,
  type MarketplaceProviderReadinessDto,
  type MarketplacePublicSellerDto,
  type MarketplaceRoleDashboardDto,
  type MarketplaceSampleDto,
  type MarketplaceSampleUsageDto,
  type OfferViewDto,
  type PartnerViewDto,
  type ProduceListingViewDto,
  type SupplierProductViewDto,
  type VerificationViewDto,
} from '@app/frontend-api-client';
import { createApiRuntimeFetch } from '@app/frontend-api-support';
import {
  marketplaceRoleCanBuy,
  toMarketplaceListing,
  toMarketplaceRequestFeedItem,
  type MarketplaceListing,
  type MarketplaceRequestFeedItem,
} from '../ui/marketplace-ui';

export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type SessionState = 'checking' | 'signed-in' | 'signed-out' | 'error';

export interface Resource<T> {
  data: T;
  status: ResourceStatus;
}

const listResource = <T>(): Resource<T[]> => ({ data: [], status: 'idle' });
const statusForList = (items: readonly unknown[]): ResourceStatus => (items.length === 0 ? 'empty' : 'ready');

const settledListResource = <TInput, TOutput>(
  result: PromiseSettledResult<{ items: TInput[] }>,
  map: (item: TInput) => TOutput,
): Resource<TOutput[]> => {
  if (result.status === 'rejected') {
    return { data: [], status: 'error' };
  }
  const items = result.value.items.map(map);
  return { data: items, status: statusForList(items) };
};

const settledValueResource = <TInput, TOutput>(
  result: PromiseSettledResult<TInput | null>,
  map: (item: TInput) => TOutput,
): Resource<TOutput | null> => {
  if (result.status === 'rejected' || result.value === null) {
    return { data: null, status: 'error' };
  }
  return { data: map(result.value), status: 'ready' };
};

const offerResourceStatus = (hasFailure: boolean, hasOffers: boolean): ResourceStatus => {
  if (hasFailure) {
    return 'error';
  }
  return hasOffers ? 'ready' : 'empty';
};

/**
 * The offer endpoints are keyed by the request *publication* id, not by the request
 * row id. Passing the request id made every owned-request offer read answer 404,
 * the failure was swallowed, and a buyer read "no offers yet" on a request that had
 * offers. An unpublished request has no publication id at all: it is skipped here
 * and reported as awaiting moderation by the view, never as an empty offer list.
 */
const offerPublicationId = (request: BuyerRequestViewDto): string | undefined => request.publicationId;

const initialUsage: MarketplaceSampleUsageDto = {
  limit: 5,
  period: 'current',
  policyVersion: 1,
  remaining: 5,
  used: 0,
};

interface VerificationResourceAccess {
  dashboard: boolean;
  sampleUsage: boolean;
}

/**
 * The sample allowance is a buying figure, and `GET /marketplace/samples/usage`
 * derives its buying party from `marketplaceBuyerRoles` — `farmer` and
 * `buyer`. Reading it as `role === 'buyer'` withheld the quota from the one
 * role that may buy everything, so a verified farmer saw no allowance for a
 * request the server would have answered.
 */
const resourceAccessForVerification = (verification: VerificationViewDto | null): VerificationResourceAccess => {
  if (verification?.status !== 'verified') {
    return { dashboard: false, sampleUsage: false };
  }
  return { dashboard: true, sampleUsage: marketplaceRoleCanBuy(verification.role) };
};

const beginOptionalResourceLoad = <T>(resource: Resource<T>, enabled: boolean, disabled: Resource<T>): Resource<T> =>
  enabled ? { ...resource, status: 'loading' } : disabled;

const loadVerificationResources = async (
  access: VerificationResourceAccess,
  loaders: { dashboard: () => Promise<void>; sampleUsage: () => Promise<void> },
): Promise<void> => {
  const requests: Promise<void>[] = [];
  if (access.dashboard) {
    requests.push(loaders.dashboard());
  }
  if (access.sampleUsage) {
    requests.push(loaders.sampleUsage());
  }
  await Promise.all(requests);
};

export interface MarketplaceData {
  aiConsultations: Resource<MarketplaceAiConsultationDto[]>;
  auth: SessionState;
  carts: Resource<CartViewDto[]>;
  catalog: Resource<MarketplaceListing[]>;
  contracts: Resource<ContractViewDto[]>;
  dashboard: Resource<MarketplaceRoleDashboardDto | null>;
  favorites: Resource<MarketplaceFavoriteDto[]>;
  myRequests: Resource<BuyerRequestViewDto[]>;
  notifications: Resource<MarketplaceContractNotificationRecipientDto[]>;
  offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  ownedListingPublications: Resource<MarketplaceOwnedListingPublicationDto[]>;
  ownedRequestPublications: Resource<MarketplaceOwnedRequestPublicationDto[]>;
  partners: Resource<PartnerViewDto[]>;
  produceListings: Resource<ProduceListingViewDto[]>;
  promotionPlans: Resource<MarketplacePromotionPlanDto[]>;
  promotions: Resource<MarketplaceListingPromotionDto[]>;
  providerReadiness: Resource<MarketplaceProviderReadinessDto | null>;
  refresh: () => void;
  requests: Resource<MarketplaceRequestFeedItem[]>;
  sampleUsage: Resource<MarketplaceSampleUsageDto>;
  samples: Resource<MarketplaceSampleDto[]>;
  seller: Resource<MarketplacePublicSellerDto | null>;
  sellerCatalog: Resource<MarketplaceListing[]>;
  selectedListing: Resource<MarketplaceListing | null>;
  supplierProducts: Resource<SupplierProductViewDto[]>;
  verification: Resource<VerificationViewDto | null>;
}

export function useMarketplaceData(listingPublicationId?: string, sellerPublicId?: string): MarketplaceData {
  const { api, requestOptions } = useUserApiClient();
  const epochRef = useRef(0);
  const [auth, setAuth] = useState<SessionState>('checking');
  const [catalog, setCatalog] = useState<Resource<MarketplaceListing[]>>(listResource);
  const [selectedListing, setSelectedListing] = useState<Resource<MarketplaceListing | null>>({
    data: null,
    status: 'idle',
  });
  const [seller, setSeller] = useState<Resource<MarketplacePublicSellerDto | null>>({ data: null, status: 'idle' });
  const [sellerCatalog, setSellerCatalog] = useState<Resource<MarketplaceListing[]>>(listResource);
  const [requests, setRequests] = useState<Resource<MarketplaceRequestFeedItem[]>>(listResource);
  const [verification, setVerification] = useState<Resource<VerificationViewDto | null>>({
    data: null,
    status: 'idle',
  });
  const [carts, setCarts] = useState<Resource<CartViewDto[]>>(listResource);
  const [favorites, setFavorites] = useState<Resource<MarketplaceFavoriteDto[]>>(listResource);
  const [myRequests, setMyRequests] = useState<Resource<BuyerRequestViewDto[]>>(listResource);
  const [offersByRequest, setOffersByRequest] = useState<Resource<Record<string, OfferViewDto[]>>>({
    data: {},
    status: 'idle',
  });
  const [contracts, setContracts] = useState<Resource<ContractViewDto[]>>(listResource);
  const [samples, setSamples] = useState<Resource<MarketplaceSampleDto[]>>(listResource);
  const [partners, setPartners] = useState<Resource<PartnerViewDto[]>>(listResource);
  const [dashboard, setDashboard] = useState<Resource<MarketplaceRoleDashboardDto | null>>({
    data: null,
    status: 'idle',
  });
  const [sampleUsage, setSampleUsage] = useState<Resource<MarketplaceSampleUsageDto>>({
    data: initialUsage,
    status: 'idle',
  });
  const [providerReadiness, setProviderReadiness] = useState<Resource<MarketplaceProviderReadinessDto | null>>({
    data: null,
    status: 'idle',
  });
  const [promotions, setPromotions] = useState<Resource<MarketplaceListingPromotionDto[]>>(listResource);
  const [promotionPlans, setPromotionPlans] = useState<Resource<MarketplacePromotionPlanDto[]>>(listResource);
  const [notifications, setNotifications] =
    useState<Resource<MarketplaceContractNotificationRecipientDto[]>>(listResource);
  const [aiConsultations, setAiConsultations] = useState<Resource<MarketplaceAiConsultationDto[]>>(listResource);
  const [supplierProducts, setSupplierProducts] = useState<Resource<SupplierProductViewDto[]>>(listResource);
  const [produceListings, setProduceListings] = useState<Resource<ProduceListingViewDto[]>>(listResource);
  const [ownedListingPublications, setOwnedListingPublications] =
    useState<Resource<MarketplaceOwnedListingPublicationDto[]>>(listResource);
  const [ownedRequestPublications, setOwnedRequestPublications] =
    useState<Resource<MarketplaceOwnedRequestPublicationDto[]>>(listResource);

  const load = useCallback(async () => {
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    const current = () => epochRef.current === epoch;

    setAuth('checking');
    setCatalog((resource) => ({ ...resource, status: 'loading' }));
    setRequests((resource) => ({ ...resource, status: 'loading' }));
    setSelectedListing((resource) => ({
      data: listingPublicationId ? resource.data : null,
      status: listingPublicationId ? 'loading' : 'idle',
    }));
    setSeller((resource) => ({
      data: sellerPublicId ? resource.data : null,
      status: sellerPublicId ? 'loading' : 'idle',
    }));
    setSellerCatalog((resource) => ({
      data: sellerPublicId ? resource.data : [],
      status: sellerPublicId ? 'loading' : 'idle',
    }));

    const [catalogResult, requestsResult, listingResult, sellerResult, sellerCatalogResult] = await Promise.allSettled([
      // The catalog defaults to a 20-item page, which silently turned every filter
      // and sort below into a filter over the first page. `limit` is the API's
      // maximum; a catalog outgrowing it needs the server-side filters and the
      // cursor this screen still does not pass.
      throwOnOpenApiErrorData(api.marketplacePublicControllerListCatalog({ limit: 50 }, requestOptions)),
      throwOnOpenApiErrorData(api.marketplacePublicControllerListRequests({}, requestOptions)),
      listingPublicationId
        ? throwOnOpenApiErrorData(api.marketplacePublicControllerGetListing(listingPublicationId, requestOptions))
        : Promise.resolve(null),
      sellerPublicId
        ? throwOnOpenApiErrorData(api.marketplacePublicControllerGetSeller(sellerPublicId, requestOptions))
        : Promise.resolve(null),
      sellerPublicId
        ? throwOnOpenApiErrorData(api.marketplacePublicControllerListSellerCatalog(sellerPublicId, {}, requestOptions))
        : Promise.resolve({ items: [] }),
    ]);

    if (!current()) {
      return;
    }

    setCatalog(settledListResource(catalogResult, toMarketplaceListing));
    setRequests(settledListResource(requestsResult, toMarketplaceRequestFeedItem));
    if (listingPublicationId) {
      setSelectedListing(settledValueResource(listingResult, toMarketplaceListing));
    }
    if (sellerPublicId) {
      setSeller(settledValueResource(sellerResult, (value) => value));
      setSellerCatalog(settledListResource(sellerCatalogResult, toMarketplaceListing));
    }

    let verificationData: VerificationViewDto | null;
    try {
      verificationData = await throwOnOpenApiErrorData(
        api.marketplaceControllerGetVerification({
          ...requestOptions,
          fetchImpl: createApiRuntimeFetch(),
        }),
      );
    } catch (error) {
      if (!current()) {
        return;
      }
      const signedOut = isApiClientError(error) && error.status === 401;
      setAuth(signedOut ? 'signed-out' : 'error');
      setVerification({ data: null, status: signedOut ? 'empty' : 'error' });
      setCarts({ data: [], status: 'empty' });
      setFavorites({ data: [], status: 'empty' });
      setMyRequests({ data: [], status: 'empty' });
      setOffersByRequest({ data: {}, status: 'empty' });
      setContracts({ data: [], status: 'empty' });
      setSamples({ data: [], status: 'empty' });
      setPartners({ data: [], status: 'empty' });
      setDashboard({ data: null, status: 'empty' });
      setSampleUsage({ data: initialUsage, status: 'idle' });
      setProviderReadiness({ data: null, status: 'empty' });
      setPromotions({ data: [], status: 'empty' });
      setPromotionPlans({ data: [], status: 'empty' });
      setNotifications({ data: [], status: 'empty' });
      setAiConsultations({ data: [], status: 'empty' });
      setSupplierProducts({ data: [], status: 'empty' });
      setProduceListings({ data: [], status: 'empty' });
      setOwnedListingPublications({ data: [], status: 'empty' });
      setOwnedRequestPublications({ data: [], status: 'empty' });
      return;
    }

    if (!current()) {
      return;
    }
    const verificationResourceAccess = resourceAccessForVerification(verificationData);
    setAuth('signed-in');
    setVerification({ data: verificationData, status: 'ready' });
    setCarts((resource) => ({ ...resource, status: 'loading' }));
    setFavorites((resource) => ({ ...resource, status: 'loading' }));
    setMyRequests((resource) => ({ ...resource, status: 'loading' }));
    setContracts((resource) => ({ ...resource, status: 'loading' }));
    setSamples((resource) => ({ ...resource, status: 'loading' }));
    setPartners((resource) => ({ ...resource, status: 'loading' }));
    setDashboard((resource) =>
      beginOptionalResourceLoad(resource, verificationResourceAccess.dashboard, { data: null, status: 'empty' }),
    );
    setSampleUsage((resource) =>
      beginOptionalResourceLoad(resource, verificationResourceAccess.sampleUsage, {
        data: initialUsage,
        status: 'idle',
      }),
    );
    setOffersByRequest((resource) => ({ ...resource, status: 'loading' }));
    setProviderReadiness((resource) => ({ ...resource, status: 'loading' }));
    setPromotions((resource) => ({ ...resource, status: 'loading' }));
    setPromotionPlans((resource) => ({ ...resource, status: 'loading' }));
    setNotifications((resource) => ({ ...resource, status: 'loading' }));
    setAiConsultations((resource) => ({ ...resource, status: 'loading' }));
    setSupplierProducts((resource) => ({ ...resource, status: 'loading' }));
    setProduceListings((resource) => ({ ...resource, status: 'loading' }));
    setOwnedListingPublications((resource) => ({ ...resource, status: 'loading' }));
    setOwnedRequestPublications((resource) => ({ ...resource, status: 'loading' }));

    const loadList = async <T>(request: Promise<{ items: T[] }>, setter: (resource: Resource<T[]>) => void) => {
      try {
        const data = await request;
        if (current()) {
          setter({ data: data.items, status: statusForList(data.items) });
        }
      } catch {
        if (current()) {
          setter({ data: [], status: 'error' });
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
        const publishedRequests = data.items.filter((request) => offerPublicationId(request) !== undefined);
        if (publishedRequests.length === 0) {
          setOffersByRequest({ data: {}, status: 'empty' });
          return;
        }
        const pairs = await Promise.all(
          publishedRequests.map(async (request): Promise<readonly [string, OfferViewDto[] | undefined]> => {
            try {
              const offers = await throwOnOpenApiErrorData(
                // Keyed by the publication id the offer endpoints actually accept.
                api.marketplaceControllerListOffers(offerPublicationId(request) as string, requestOptions),
              );
              return [request.id, offers.items] as const;
            } catch {
              return [request.id, undefined] as const;
            }
          }),
        );
        if (!current()) {
          return;
        }
        const mapped = pairs.reduce<Record<string, OfferViewDto[]>>((result, [requestId, items]) => {
          if (items) {
            result[requestId] = items;
          }
          return result;
        }, {});
        const hasFailure = pairs.some(([, items]) => items === undefined);
        const hasOffers = pairs.some(([, items]) => (items?.length ?? 0) > 0);
        setOffersByRequest({
          data: mapped,
          status: offerResourceStatus(hasFailure, hasOffers),
        });
      } catch {
        if (current()) {
          setMyRequests({ data: [], status: 'error' });
          setOffersByRequest({ data: {}, status: 'error' });
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

    const loadDashboard = async () => {
      try {
        const data = await throwOnOpenApiErrorData(api.marketplaceControllerGetDashboard(requestOptions));
        if (current()) {
          setDashboard({ data, status: 'ready' });
        }
      } catch {
        if (current()) {
          setDashboard({ data: null, status: 'error' });
        }
      }
    };

    const loadOwnedPublications = async () => {
      try {
        const data = await throwOnOpenApiErrorData(
          api.marketplacePublicationControllerListMine({ limit: 50 }, requestOptions),
        );
        if (current()) {
          setOwnedListingPublications({ data: data.listings, status: statusForList(data.listings) });
          setOwnedRequestPublications({ data: data.requests, status: statusForList(data.requests) });
        }
      } catch {
        if (current()) {
          setOwnedListingPublications({ data: [], status: 'error' });
          setOwnedRequestPublications({ data: [], status: 'error' });
        }
      }
    };

    const loadReadiness = async () => {
      try {
        const value = await throwOnOpenApiErrorData(api.marketplaceControllerGetVerificationReadiness(requestOptions));
        if (current()) {
          setProviderReadiness({ data: value, status: 'ready' });
        }
      } catch {
        if (current()) {
          setProviderReadiness({ data: null, status: 'error' });
        }
      }
    };

    await Promise.all([
      loadList(throwOnOpenApiErrorData(api.marketplaceControllerListCarts(requestOptions)), setCarts),
      loadList(throwOnOpenApiErrorData(api.marketplaceControllerListFavorites(requestOptions)), setFavorites),
      loadMyRequestsAndOffers(),
      loadList(throwOnOpenApiErrorData(api.marketplaceControllerListContracts(requestOptions)), setContracts),
      loadList(throwOnOpenApiErrorData(api.marketplaceControllerListSamples(requestOptions)), setSamples),
      loadList(throwOnOpenApiErrorData(api.agriTechOperationsControllerListPartners(requestOptions)), setPartners),
      loadVerificationResources(verificationResourceAccess, {
        dashboard: loadDashboard,
        sampleUsage: loadUsage,
      }),
      loadReadiness(),
      loadList(throwOnOpenApiErrorData(api.marketplacePromotionControllerList(requestOptions)), setPromotions),
      loadList(throwOnOpenApiErrorData(api.marketplacePromotionControllerListPlans(requestOptions)), setPromotionPlans),
      loadList(throwOnOpenApiErrorData(api.marketplaceControllerListNotifications(requestOptions)), setNotifications),
      loadList(throwOnOpenApiErrorData(api.marketplaceControllerListAi(requestOptions)), setAiConsultations),
      loadList(
        throwOnOpenApiErrorData(api.agriTechOperationsControllerListSupplierProducts(requestOptions)),
        setSupplierProducts,
      ),
      loadList(
        throwOnOpenApiErrorData(api.agriTechOperationsControllerListProduce({}, requestOptions)),
        setProduceListings,
      ),
      loadOwnedPublications(),
    ]);
  }, [api, listingPublicationId, requestOptions, sellerPublicId]);

  useEffect(() => {
    void load();
    return () => {
      epochRef.current += 1;
    };
  }, [load]);

  return {
    aiConsultations,
    auth,
    carts,
    catalog,
    contracts,
    dashboard,
    favorites,
    myRequests,
    notifications,
    offersByRequest,
    ownedListingPublications,
    ownedRequestPublications,
    partners,
    produceListings,
    promotionPlans,
    promotions,
    providerReadiness,
    refresh: () => void load(),
    requests,
    sampleUsage,
    samples,
    seller,
    sellerCatalog,
    selectedListing,
    supplierProducts,
    verification,
  };
}
