// REQ-AGRITECH-WEB-006: AgriTech pages consume generated OpenAPI path and schema types through this boundary.
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

const farmerPath = '/agritech/farmer';
const catalogPath = '/agritech/catalog';
const ordersPath = '/agritech/orders';
const agritechPartnersPath = '/agritech/partners';
const agritechSupplierProductsPath = '/agritech/supplier/products';
const agritechSupplierProductPath = '/agritech/supplier/products/{id}';
const agritechProducePath = '/agritech/produce';
const agritechProducePricesPath = '/agritech/produce/prices';
const agritechProduceReservationPath = '/agritech/produce/{id}/reservations';
const agritechProduceCancelPath = '/agritech/produce/{id}/cancel';
const agritechAssignedFarmersPath = '/agritech/field-agent/farmers';
const agritechDeliveriesPath = '/agritech/deliveries';
const agritechDeliveryPath = '/agritech/deliveries/{id}';
const agritechFieldVisitsPath = '/agritech/field-visits';
const agritechAdvisoriesPath = '/agritech/advisories';
const agritechPaymentsPath = '/agritech/payments';

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
