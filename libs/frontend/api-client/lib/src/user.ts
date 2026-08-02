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

const farmerPath = '/agritech/farmer';
const catalogPath = '/agritech/catalog';
const ordersPath = '/agritech/orders';

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
