// REQ-AGRITECH-WEB-006 REQ-AGRITECH-ROUTING-015: AgriTech pages consume generated OpenAPI path and schema types through this boundary.
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import createClient from 'openapi-fetch';
import createQueryClient from 'openapi-react-query';
import type { components, paths } from './generated/user';
import {
  type ApiClientRequestOptions,
  type ApiClientError,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
  throwOnOpenApiErrorData,
  toOpenApiFetchOptions,
} from './service-options';

const profileMePath = '/profile/me';

export const client = createClient<paths>();
export const query = createQueryClient(client);

export type AuthenticatedPrincipalDto = components['schemas']['AuthenticatedPrincipalDto'];
export type UserProfileViewDto = components['schemas']['UserProfileViewDto'];
export type ProfilePayloadDto = components['schemas']['ProfilePayloadDto'];
export type CreateFarmerDto = components['schemas']['CreateFarmerDto'];
export type FarmerProfileDto = components['schemas']['FarmerProfileDto'];
export type ProductViewDto = components['schemas']['ProductViewDto'];
export type ProductListDto = components['schemas']['ProductListDto'];
export type OrderViewDto = components['schemas']['OrderViewDto'];
export type OrderListDto = components['schemas']['OrderListDto'];
export type PartnerViewDto = components['schemas']['PartnerViewDto'];
export type PartnerListDto = components['schemas']['PartnerListDto'];
export type CreatePartnerDto = components['schemas']['CreatePartnerDto'];
export type SupplierProductViewDto = components['schemas']['SupplierProductViewDto'];
export type SupplierProductListDto = components['schemas']['SupplierProductListDto'];
export type CreateSupplierProductDto = components['schemas']['CreateSupplierProductDto'];
export type UpdateSupplierProductDto = components['schemas']['UpdateSupplierProductDto'];
export type ProduceListingViewDto = components['schemas']['ProduceListingViewDto'];
export type ProduceListingListDto = components['schemas']['ProduceListingListDto'];
export type CreateProduceDto = components['schemas']['CreateProduceDto'];
export type PriceDiscoveryViewDto = components['schemas']['PriceDiscoveryViewDto'];
export type ProduceReservationViewDto = components['schemas']['ProduceReservationViewDto'];
export type ReserveProduceDto = components['schemas']['ReserveProduceDto'];
export type AssignedFarmerViewDto = components['schemas']['AssignedFarmerViewDto'];
export type AssignedFarmerListDto = components['schemas']['AssignedFarmerListDto'];
export type DeliveryViewDto = components['schemas']['DeliveryViewDto'];
export type DeliveryListDto = components['schemas']['DeliveryListDto'];
export type TransitionDeliveryDto = components['schemas']['TransitionDeliveryDto'];
export type CreateFieldVisitDto = components['schemas']['CreateFieldVisitDto'];
export type AdvisoryViewDto = components['schemas']['AdvisoryViewDto'];
export type AdvisoryListDto = components['schemas']['AdvisoryListDto'];
export type CreatePaymentDto = components['schemas']['CreatePaymentDto'];
export type PaymentHandoffViewDto = components['schemas']['PaymentHandoffViewDto'];
export type VerificationViewDto = components['schemas']['VerificationViewDto'];
export type SubmitVerificationDto = components['schemas']['SubmitVerificationDto'];
export type VerificationDocumentDto = components['schemas']['VerificationDocumentDto'];
export type CartViewDto = components['schemas']['CartViewDto'];
export type CartListDto = components['schemas']['CartListDto'];
export type CartItemDto = components['schemas']['CartItemDto'];
export type AddToCartDto = components['schemas']['AddToCartDto'];
export type UpdateCartItemDto = components['schemas']['UpdateCartItemDto'];
export type SampleViewDto = components['schemas']['SampleViewDto'];
export type SampleListDto = components['schemas']['SampleListDto'];
export type SampleUsageViewDto = components['schemas']['SampleUsageViewDto'];
export type FavoriteViewDto = components['schemas']['FavoriteViewDto'];
export type FavoriteListDto = components['schemas']['FavoriteListDto'];
export type ReviewViewDto = components['schemas']['ReviewViewDto'];
export type ReviewListDto = components['schemas']['ReviewListDto'];
export type AddReviewDto = components['schemas']['AddReviewDto'];
export type BuyerRequestViewDto = components['schemas']['BuyerRequestViewDto'];
export type BuyerRequestListDto = components['schemas']['BuyerRequestListDto'];
export type CreateRequestDto = components['schemas']['CreateRequestDto'];
export type OfferViewDto = components['schemas']['OfferViewDto'];
export type OfferListDto = components['schemas']['OfferListDto'];
export type RequestOfferDto = components['schemas']['RequestOfferDto'];
export type ContractViewDto = components['schemas']['ContractViewDto'];
export type ContractListDto = components['schemas']['ContractListDto'];
export type CreateContractDto = components['schemas']['CreateContractDto'];
export type AiConsultationViewDto = components['schemas']['AiConsultationViewDto'];
export type AiConsultationListDto = components['schemas']['AiConsultationListDto'];
export type AskAiDto = components['schemas']['AskAiDto'];

const farmerPath = '/farmer';
const catalogPath = '/catalog';
const ordersPath = '/orders';
const agritechPartnersPath = '/partners';
const agritechSupplierProductsPath = '/supplier/products';
const agritechSupplierProductPath = '/supplier/products/{id}';
const agritechProducePath = '/produce';
const agritechProducePricesPath = '/produce/prices';
const agritechProduceReservationPath = '/produce/{id}/reservations';
const agritechProduceCancelPath = '/produce/{id}/cancel';
const agritechAssignedFarmersPath = '/field-agent/farmers';
const agritechDeliveriesPath = '/deliveries';
const agritechDeliveryPath = '/deliveries/{id}';
const agritechFieldVisitsPath = '/field-visits';
const agritechAdvisoriesPath = '/advisories';
const agritechPaymentsPath = '/payments';
const verificationPath = '/verification';
const cartPath = '/cart';
const cartItemPath = '/cart/{id}/items/{productId}';
const cartCheckoutPath = '/cart/{id}/checkout';
const samplesPath = '/samples';
const samplesUsagePath = '/samples/usage';
const favoritesPath = '/favorites';
const favoritePath = '/favorites/{productId}';
const reviewsPath = '/reviews';
const reviewsProductPath = '/reviews/{productId}';
const requestsPath = '/requests';
const myRequestsPath = '/requests/mine';
const offersPath = '/requests/{id}/offers';
const chooseOfferPath = '/requests/{id}/offers/{offerId}/choose';
const contractsPath = '/contracts';
const contractSignPath = '/contracts/{id}/sign';
const aiPath = '/ai';

export const agriTechOperationsControllerListPartners = (options?: ApiClientRequestOptions) =>
  client.GET(agritechPartnersPath, toOpenApiFetchOptions(options));
export const agriTechOperationsControllerCreatePartner = (body: CreatePartnerDto, options?: ApiClientRequestOptions) =>
  client.POST(agritechPartnersPath, { ...toOpenApiFetchOptions(options), body });
export const agriTechOperationsControllerListSupplierProducts = (options?: ApiClientRequestOptions) =>
  client.GET(agritechSupplierProductsPath, toOpenApiFetchOptions(options));
export const agriTechOperationsControllerCreateSupplierProduct = (
  body: CreateSupplierProductDto,
  options?: ApiClientRequestOptions,
) => client.POST(agritechSupplierProductsPath, { ...toOpenApiFetchOptions(options), body });
export const agriTechOperationsControllerUpdateSupplierProduct = (
  id: string,
  body: UpdateSupplierProductDto,
  options?: ApiClientRequestOptions,
) => client.PATCH(agritechSupplierProductPath, { ...toOpenApiFetchOptions(options), params: { path: { id } }, body });
export const agriTechOperationsControllerListProduce = (
  params: { crop?: string; region?: string; grade?: 'A' | 'B' | 'C' } = {},
  options?: ApiClientRequestOptions,
) => client.GET(agritechProducePath, { ...toOpenApiFetchOptions(options), params: { query: params } });
export const agriTechOperationsControllerCreateProduce = (body: CreateProduceDto, options?: ApiClientRequestOptions) =>
  client.POST(agritechProducePath, { ...toOpenApiFetchOptions(options), body });
export const agriTechOperationsControllerDiscoverPrice = (
  params: { crop: string; region: string; grade?: 'A' | 'B' | 'C' },
  options?: ApiClientRequestOptions,
) => client.GET(agritechProducePricesPath, { ...toOpenApiFetchOptions(options), params: { query: params } });
export const agriTechOperationsControllerReserveProduce = (
  id: string,
  body: ReserveProduceDto,
  options?: ApiClientRequestOptions,
) => client.POST(agritechProduceReservationPath, { ...toOpenApiFetchOptions(options), params: { path: { id } }, body });
export const agriTechOperationsControllerCancelProduce = (id: string, options?: ApiClientRequestOptions) =>
  client.PATCH(agritechProduceCancelPath, { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const agriTechOperationsControllerListAssignedFarmers = (options?: ApiClientRequestOptions) =>
  client.GET(agritechAssignedFarmersPath, toOpenApiFetchOptions(options));
export const agriTechOperationsControllerListDeliveries = (options?: ApiClientRequestOptions) =>
  client.GET(agritechDeliveriesPath, toOpenApiFetchOptions(options));
export const agriTechOperationsControllerTransitionDelivery = (
  id: string,
  body: TransitionDeliveryDto,
  options?: ApiClientRequestOptions,
) => client.PATCH(agritechDeliveryPath, { ...toOpenApiFetchOptions(options), params: { path: { id } }, body });
export const agriTechOperationsControllerRecordFieldVisit = (
  body: CreateFieldVisitDto,
  options?: ApiClientRequestOptions,
) => client.POST(agritechFieldVisitsPath, { ...toOpenApiFetchOptions(options), body });
export const agriTechOperationsControllerListAdvisories = (options?: ApiClientRequestOptions) =>
  client.GET(agritechAdvisoriesPath, toOpenApiFetchOptions(options));

export const marketplaceControllerGetVerification = (options?: ApiClientRequestOptions) =>
  client.GET(verificationPath, toOpenApiFetchOptions(options));
export const marketplaceControllerSubmitVerification = (body: SubmitVerificationDto, options?: ApiClientRequestOptions) =>
  client.POST(verificationPath, { ...toOpenApiFetchOptions(options), body });
export const marketplaceControllerListCarts = (options?: ApiClientRequestOptions) =>
  client.GET(cartPath, toOpenApiFetchOptions(options));
export const marketplaceControllerGetCart = (id: string, options?: ApiClientRequestOptions) =>
  client.GET('/cart/{id}', { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplaceControllerAddToCart = (body: AddToCartDto, options?: ApiClientRequestOptions) =>
  client.POST('/cart/items', { ...toOpenApiFetchOptions(options), body });
export const marketplaceControllerRemoveCartItem = (
  id: string,
  productId: string,
  options?: ApiClientRequestOptions,
) => client.DELETE(cartItemPath, { ...toOpenApiFetchOptions(options), params: { path: { id, productId } } });
export const marketplaceControllerUpdateCartItem = (
  id: string,
  productId: string,
  body: UpdateCartItemDto,
  options?: ApiClientRequestOptions,
) => client.PATCH(cartItemPath, { ...toOpenApiFetchOptions(options), params: { path: { id, productId } }, body });
export const marketplaceControllerCheckoutCart = (id: string, options?: ApiClientRequestOptions) =>
  client.POST(cartCheckoutPath, { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplaceControllerListSamples = (options?: ApiClientRequestOptions) =>
  client.GET(samplesPath, toOpenApiFetchOptions(options));
export const marketplaceControllerRequestSample = (
  body: { productId: string; sellerId: string },
  options?: ApiClientRequestOptions,
) => client.POST(samplesPath, { ...toOpenApiFetchOptions(options), body });
export const marketplaceControllerSampleUsage = (options?: ApiClientRequestOptions) =>
  client.GET(samplesUsagePath, toOpenApiFetchOptions(options));
export const marketplaceControllerListFavorites = (options?: ApiClientRequestOptions) =>
  client.GET(favoritesPath, toOpenApiFetchOptions(options));
export const marketplaceControllerAddFavorite = (productId: string, options?: ApiClientRequestOptions) =>
  client.POST(favoritesPath, { ...toOpenApiFetchOptions(options), body: { productId } });
export const marketplaceControllerRemoveFavorite = (productId: string, options?: ApiClientRequestOptions) =>
  client.DELETE(favoritePath, { ...toOpenApiFetchOptions(options), params: { path: { productId } } });
export const marketplaceControllerListReviews = (productId: string, options?: ApiClientRequestOptions) =>
  client.GET(reviewsProductPath, { ...toOpenApiFetchOptions(options), params: { path: { productId } } });
export const marketplaceControllerAddReview = (
  productId: string,
  body: AddReviewDto,
  options?: ApiClientRequestOptions,
) => client.POST('/reviews/{productId}', { ...toOpenApiFetchOptions(options), params: { path: { productId } }, body });
export const marketplaceControllerListRequests = (options?: ApiClientRequestOptions) =>
  client.GET(requestsPath, toOpenApiFetchOptions(options));
export const marketplaceControllerCreateRequest = (body: CreateRequestDto, options?: ApiClientRequestOptions) =>
  client.POST(requestsPath, { ...toOpenApiFetchOptions(options), body });
export const marketplaceControllerListMyRequests = (options?: ApiClientRequestOptions) =>
  client.GET(myRequestsPath, toOpenApiFetchOptions(options));
export const marketplaceControllerListOffers = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(offersPath, { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplaceControllerMakeOffer = (
  id: string,
  body: RequestOfferDto,
  options?: ApiClientRequestOptions,
) => client.POST(offersPath, { ...toOpenApiFetchOptions(options), params: { path: { id } }, body });
export const marketplaceControllerChooseOffer = (
  id: string,
  offerId: string,
  options?: ApiClientRequestOptions,
) => client.POST(chooseOfferPath, { ...toOpenApiFetchOptions(options), params: { path: { id, offerId } } });
export const marketplaceControllerListContracts = (options?: ApiClientRequestOptions) =>
  client.GET(contractsPath, toOpenApiFetchOptions(options));
export const marketplaceControllerCreateContract = (body: CreateContractDto, options?: ApiClientRequestOptions) =>
  client.POST(contractsPath, { ...toOpenApiFetchOptions(options), body });
export const marketplaceControllerSignContract = (id: string, options?: ApiClientRequestOptions) =>
  client.POST('/contracts/{id}/sign', { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplaceControllerListAi = (options?: ApiClientRequestOptions) =>
  client.GET(aiPath, toOpenApiFetchOptions(options));
export const marketplaceControllerAskAi = (body: AskAiDto, options?: ApiClientRequestOptions) =>
  client.POST(aiPath, { ...toOpenApiFetchOptions(options), body });
export const paymentControllerCreate = (body: CreatePaymentDto, options?: ApiClientRequestOptions) =>
  client.POST(agritechPaymentsPath, { ...toOpenApiFetchOptions(options), body });

export const farmerControllerCreate = (body: CreateFarmerDto, options?: ApiClientRequestOptions) =>
  client.POST(farmerPath, { ...toOpenApiFetchOptions(options), body });

export const farmerControllerGet = (options?: ApiClientRequestOptions) =>
  client.GET(farmerPath, toOpenApiFetchOptions(options));

export const productControllerList = (options?: ApiClientRequestOptions) =>
  client.GET(catalogPath, toOpenApiFetchOptions(options));

export const orderControllerList = (options?: ApiClientRequestOptions) =>
  client.GET(ordersPath, toOpenApiFetchOptions(options));

export const profileControllerMe = (options?: ApiClientRequestOptions) =>
  client.GET(profileMePath, toOpenApiFetchOptions(options));
export type ProfileControllerMeResponse = OpenApiData<typeof profileControllerMe>;
export type ProfileControllerMeData = EnvelopeData<ProfileControllerMeResponse>;
export type ProfileControllerMeError = OpenApiError<typeof profileControllerMe>;

export const getProfileControllerMeQueryKey = () => ['get', profileMePath] as const;
export const getProfileControllerMeQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<ProfileControllerMeResponse, ProfileControllerMeError> =>
  query.queryOptions('get', profileMePath, toOpenApiFetchOptions(options)) as unknown as OpenApiQueryOptions<
    ProfileControllerMeResponse,
    ProfileControllerMeError
  >;

type OpenApiQueryOptions<TData, TError> = Omit<UseQueryOptions<TData, TError, TData>, 'queryFn'> & {
  queryFn: NonNullable<UseQueryOptions<TData, TError, TData>['queryFn']>;
};

type QueryConfig<TData, TError> = Omit<
  UseQueryOptions<TData, ApiClientError<TError>, TData>,
  'queryFn' | 'queryKey'
> & {
  request?: ApiClientRequestOptions;
};

export const useProfileControllerMeQuery = ({
  request,
  ...options
}: QueryConfig<ProfileControllerMeData, ProfileControllerMeError> = {}) =>
  useQuery({
    queryKey: [...getProfileControllerMeQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(profileControllerMe(request)),
    ...options,
  });
