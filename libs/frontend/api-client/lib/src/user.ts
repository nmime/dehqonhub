// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-ROUTING-015 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
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
export type VerificationDocumentDto = components['schemas']['VerificationDocumentDto'];
export type StartVerificationDto = components['schemas']['StartVerificationDto'];
export type SubmitVerificationDto = components['schemas']['SubmitVerificationDto'];
export type MarketplaceProviderReadinessDto = components['schemas']['MarketplaceProviderReadinessDto'];
export type VerificationDocumentInputDto = components['schemas']['VerificationDocumentInputDto'];
export type CartViewDto = components['schemas']['CartViewDto'];
export type CartListDto = components['schemas']['CartListDto'];
export type CartItemDto = components['schemas']['CartItemDto'];
export type AddToCartDto = components['schemas']['AddToCartDto'];
export type UpdateCartItemDto = components['schemas']['UpdateCartItemDto'];
export type CheckoutCartDto = components['schemas']['CheckoutCartDto'];
export type CheckoutCartResultDto = components['schemas']['CheckoutCartResultDto'];
export type MarketplacePublicProductListingDto = components['schemas']['MarketplacePublicProductListingDto'];
export type MarketplacePublicProduceListingDto = components['schemas']['MarketplacePublicProduceListingDto'];
export type MarketplacePublicListingDto = MarketplacePublicProductListingDto | MarketplacePublicProduceListingDto;
export type MarketplacePublicCatalogPageDto = components['schemas']['MarketplacePublicCatalogPageDto'];
export type MarketplacePublicRequestDto = components['schemas']['MarketplacePublicRequestDto'];
export type MarketplacePublicRequestPageDto = components['schemas']['MarketplacePublicRequestPageDto'];
export type MarketplacePublicSellerDto = components['schemas']['MarketplacePublicSellerDto'];
export type MarketplacePublicProfileDto = components['schemas']['MarketplacePublicProfileDto'];
export type MarketplacePublicProfileReviewDto = components['schemas']['MarketplacePublicProfileReviewDto'];
export type MarketplacePublicProfileReputationDto = components['schemas']['MarketplacePublicProfileReputationDto'];
export type MarketplacePublicSuggestionDto = components['schemas']['MarketplacePublicSuggestionDto'];
export type MarketplacePublicSuggestionListDto = components['schemas']['MarketplacePublicSuggestionListDto'];
export type MarketplaceListingPublicationDto = components['schemas']['MarketplaceListingPublicationDto'];
export type MarketplaceRequestPublicationDto = components['schemas']['MarketplaceRequestPublicationDto'];
export type MarketplaceOwnedListingPublicationDto = components['schemas']['MarketplaceOwnedListingPublicationDto'];
export type MarketplaceOwnedRequestPublicationDto = components['schemas']['MarketplaceOwnedRequestPublicationDto'];
export type MarketplaceOwnedPublicationsDto = components['schemas']['MarketplaceOwnedPublicationsDto'];
export type PublishMarketplaceListingDto = components['schemas']['PublishMarketplaceListingDto'];
export type PublishMarketplaceRequestDto = components['schemas']['PublishMarketplaceRequestDto'];
export type MarketplaceListingPromotionDto = components['schemas']['MarketplaceListingPromotionDto'];
export type MarketplaceListingPromotionListDto = components['schemas']['MarketplaceListingPromotionListDto'];
export type MarketplacePromotionPlanDto = components['schemas']['MarketplacePromotionPlanDto'];
export type MarketplacePromotionPlanListDto = components['schemas']['MarketplacePromotionPlanListDto'];
export type ActivateMarketplacePromotionDto = components['schemas']['ActivateMarketplacePromotionDto'];
export type MarketplaceFavoriteDto = components['schemas']['MarketplaceFavoriteDto'];
export type MarketplaceFavoriteListDto = components['schemas']['MarketplaceFavoriteListDto'];
export type MarketplaceSampleDto = components['schemas']['MarketplaceSampleDto'];
export type MarketplaceSampleListDto = components['schemas']['MarketplaceSampleListDto'];
export type MarketplaceSampleUsageDto = components['schemas']['MarketplaceSampleUsageDto'];
export type RequestMarketplaceSampleDto = components['schemas']['RequestMarketplaceSampleDto'];
export type MarketplaceReviewDto = components['schemas']['MarketplaceReviewDto'];
export type MarketplaceReviewPageDto = components['schemas']['MarketplaceReviewPageDto'];
export type MarketplaceReviewSelfStateDto = components['schemas']['MarketplaceReviewSelfStateDto'];
export type MarketplaceOwnReviewDto = components['schemas']['MarketplaceOwnReviewDto'];
export type MarketplaceOwnReviewInvitationDto = components['schemas']['MarketplaceOwnReviewInvitationDto'];
export type MarketplaceOwnReviewsDto = components['schemas']['MarketplaceOwnReviewsDto'];
export type SubmitMarketplaceReviewDto = components['schemas']['SubmitMarketplaceReviewDto'];
export type TransitionMarketplaceSampleDto = components['schemas']['TransitionMarketplaceSampleDto'];
export type SubmitMarketplaceSampleFeedbackDto = components['schemas']['SubmitMarketplaceSampleFeedbackDto'];
export type ReplyMarketplaceReviewDto = components['schemas']['ReplyMarketplaceReviewDto'];
export type ReportMarketplaceReviewDto = components['schemas']['ReportMarketplaceReviewDto'];
export type MarketplaceReviewReportReceiptDto = components['schemas']['MarketplaceReviewReportReceiptDto'];
export type MarketplacePhotographDto = components['schemas']['MarketplacePhotographDto'];
export type MarketplacePhotographCapabilityDto = components['schemas']['MarketplacePhotographCapabilityDto'];
export type BuyerRequestViewDto = components['schemas']['BuyerRequestViewDto'];
export type BuyerRequestListDto = components['schemas']['BuyerRequestListDto'];
export type CreateRequestDto = components['schemas']['CreateRequestDto'];
export type OfferViewDto = components['schemas']['OfferViewDto'];
export type OfferListDto = components['schemas']['OfferListDto'];
export type RequestOfferDto = components['schemas']['RequestOfferDto'];
export type OfferSelectionResultDto = components['schemas']['OfferSelectionResultDto'];
export type ContractLineDto = components['schemas']['ContractLineDto'];
export type ContractDeliveryQuoteDto = components['schemas']['ContractDeliveryQuoteDto'];
export type ContractViewDto = components['schemas']['ContractViewDto'];
export type ContractListDto = components['schemas']['ContractListDto'];
export type ContractArtifactDto = components['schemas']['ContractArtifactDto'];
export type CreateContractArtifactDto = components['schemas']['CreateContractArtifactDto'];
export type OpenDisputeDto = components['schemas']['OpenDisputeDto'];
export type ContractDisputeEvidenceDto = components['schemas']['ContractDisputeEvidenceDto'];
export type MarketplaceContractNotificationRecipientDto =
  components['schemas']['MarketplaceContractNotificationRecipientDto'];
export type MarketplaceContractNotificationListDto = components['schemas']['MarketplaceContractNotificationListDto'];
export type MarketplaceRoleDashboardDto = components['schemas']['MarketplaceRoleDashboardDto'];
export type MarketplaceAiConsultationDto = components['schemas']['MarketplaceAiConsultationDto'];
export type MarketplaceAiConsultationListDto = components['schemas']['MarketplaceAiConsultationListDto'];
export type CreateAiConsultationDto = components['schemas']['CreateAiConsultationDto'];
export type ConfirmAiStarterCartDto = components['schemas']['ConfirmAiStarterCartDto'];
export type MarketplaceAiStarterCartResultDto = components['schemas']['MarketplaceAiStarterCartResultDto'];
export type ContractLifecycleDto = components['schemas']['ContractLifecycleDto'];
export type SettlementCommandDto = components['schemas']['SettlementCommandDto'];
export type FulfillmentCommandDto = components['schemas']['FulfillmentCommandDto'];

export type MarketplacePublicCatalogQuery = NonNullable<
  paths['/marketplace/public/catalog']['get']
>['parameters']['query'];
export type MarketplacePublicRequestQuery = NonNullable<
  paths['/marketplace/public/requests']['get']
>['parameters']['query'];
export type MarketplacePublicSuggestionQuery = NonNullable<
  paths['/marketplace/public/catalog/suggestions']['get']
>['parameters']['query'];
export type MarketplaceOwnedPublicationsQuery = NonNullable<
  paths['/marketplace/publications/mine']['get']
>['parameters']['query'];

const farmerPath = '/farmer';
const catalogPath = '/marketplace/catalog';
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
const verificationPath = '/marketplace/verification';
const verificationReadinessPath = '/marketplace/verification/providers/readiness';
const verificationOneIdPath = '/marketplace/verification/oneid/link';
const verificationDocumentsPath = '/marketplace/verification/documents';
const verificationSubmitPath = '/marketplace/verification/submit';
const cartPath = '/marketplace/cart';
const cartByIdPath = '/marketplace/cart/{id}';
const cartItemsPath = '/marketplace/cart/items';
const cartItemPath = '/marketplace/cart/{id}/items/{listingPublicationId}';
const cartCheckoutPath = '/marketplace/cart/{id}/checkout';
const samplesPath = '/marketplace/samples';
const samplesUsagePath = '/marketplace/samples/usage';
const samplePath = '/marketplace/samples/{sampleId}';
const sampleFeedbackPath = '/marketplace/samples/{sampleId}/feedback';
const favoritesPath = '/marketplace/favorites';
const favoritePath = '/marketplace/favorites/{listingPublicationId}';
const reviewsPath = '/marketplace/reviews';
const ownReviewsPath = '/marketplace/reviews/mine';
const reviewSelfStatePath = '/marketplace/reviews/state/{listingPublicationId}';
const reviewReplyPath = '/marketplace/reviews/{reviewId}/reply';
const reviewReportsPath = '/marketplace/reviews/{reviewId}/reports';
const publicCatalogPath = '/marketplace/public/catalog';
const publicCatalogSuggestionsPath = '/marketplace/public/catalog/suggestions';
const publicCatalogListingPath = '/marketplace/public/catalog/{listingId}';
const publicSellerPath = '/marketplace/public/sellers/{sellerId}';
const publicSellerCatalogPath = '/marketplace/public/sellers/{sellerId}/catalog';
const publicProfilePath = '/marketplace/public/profiles/{profileId}';
const publicSellerProfilePath = '/marketplace/public/sellers/{sellerId}/profile';
const publicRequestsPath = '/marketplace/public/requests';
const publicReviewsPath = '/marketplace/public/catalog/{listingPublicationId}/reviews';
const listingPublicationPath = '/marketplace/publications/listings';
const requestPublicationPath = '/marketplace/publications/requests';
const ownedPublicationsPath = '/marketplace/publications/mine';
const promotionsPath = '/marketplace/promotions';
const promotionPlansPath = '/marketplace/promotions/plans';
const promotionPath = '/marketplace/promotions/{id}';
const requestsPath = '/marketplace/requests';
const myRequestsPath = '/marketplace/requests/mine';
const offersPath = '/marketplace/requests/{id}/offers';
const chooseOfferPath = '/marketplace/requests/{id}/offers/{offerId}/choose';
const contractsPath = '/marketplace/contracts';
const contractDeliveryQuotePath = '/marketplace/contracts/{id}/delivery-quote';
const contractArtifactPath = '/marketplace/contracts/{id}/artifact';
const contractArtifactDownloadPath = '/marketplace/contracts/{id}/artifact/download';
const contractSignPath = '/marketplace/contracts/{id}/sign';
const contractFactoringConsentPath = '/marketplace/contracts/{id}/factoring/consent';
const contractSettlementEventsPath = '/marketplace/contracts/{id}/settlement/events';
const contractFulfillmentPath = '/marketplace/contracts/{id}/fulfillment';
const contractDisputePath = '/marketplace/contracts/{id}/dispute';
const contractDisputeEvidencePath = '/marketplace/contracts/{id}/dispute-evidence';
const contractLifecyclePath = '/marketplace/contracts/{id}/lifecycle';
const notificationsPath = '/marketplace/notifications';
const dashboardPath = '/marketplace/dashboard';
const aiPath = '/marketplace/ai/consultations';
const aiStarterCartPath = '/marketplace/ai/consultations/{id}/starter-cart';
const photographsPath = '/marketplace/media';

const commandHeader = (idempotencyKey: string) => ({ 'Idempotency-Key': idempotencyKey });

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
export const marketplaceControllerGetVerificationReadiness = (options?: ApiClientRequestOptions) =>
  client.GET(verificationReadinessPath, toOpenApiFetchOptions(options));
export const marketplaceControllerCreateVerification = (
  body: StartVerificationDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(verificationPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerLinkOneId = (idempotencyKey: string, options?: ApiClientRequestOptions) =>
  client.POST(verificationOneIdPath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerStoreVerificationDocument = (
  body: VerificationDocumentInputDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(verificationDocumentsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerSubmitVerification = (
  body: SubmitVerificationDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(verificationSubmitPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplacePublicControllerListCatalog = (
  params: MarketplacePublicCatalogQuery = {},
  options?: ApiClientRequestOptions,
) => client.GET(publicCatalogPath, { ...toOpenApiFetchOptions(options), params: { query: params } });
export const marketplacePublicControllerListSuggestions = (
  params: MarketplacePublicSuggestionQuery,
  options?: ApiClientRequestOptions,
) => client.GET(publicCatalogSuggestionsPath, { ...toOpenApiFetchOptions(options), params: { query: params } });
export const marketplacePublicControllerGetListing = (listingId: string, options?: ApiClientRequestOptions) =>
  client.GET(publicCatalogListingPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { listingId } },
  });
export const marketplacePublicControllerGetSeller = (sellerId: string, options?: ApiClientRequestOptions) =>
  client.GET(publicSellerPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { sellerId } },
  });
export const marketplacePublicProfileControllerGetProfile = (profileId: string, options?: ApiClientRequestOptions) =>
  client.GET(publicProfilePath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { profileId } },
  });
export const marketplacePublicProfileControllerGetSellerProfile = (
  sellerId: string,
  options?: ApiClientRequestOptions,
) =>
  client.GET(publicSellerProfilePath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { sellerId } },
  });
export const marketplacePublicControllerListSellerCatalog = (
  sellerId: string,
  params: MarketplacePublicCatalogQuery = {},
  options?: ApiClientRequestOptions,
) =>
  client.GET(publicSellerCatalogPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { sellerId }, query: params },
  });
export const marketplacePublicControllerListRequests = (
  params: MarketplacePublicRequestQuery = {},
  options?: ApiClientRequestOptions,
) => client.GET(publicRequestsPath, { ...toOpenApiFetchOptions(options), params: { query: params } });
export const marketplacePublicControllerListReviews = (
  listingPublicationId: string,
  options?: ApiClientRequestOptions,
) =>
  client.GET(publicReviewsPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { listingPublicationId } },
  });
export const marketplacePublicationControllerPublishListing = (
  body: PublishMarketplaceListingDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(listingPublicationPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplacePublicationControllerPublishRequest = (
  body: PublishMarketplaceRequestDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(requestPublicationPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplacePublicationControllerListMine = (
  params: MarketplaceOwnedPublicationsQuery = {},
  options?: ApiClientRequestOptions,
) => client.GET(ownedPublicationsPath, { ...toOpenApiFetchOptions(options), params: { query: params } });
export const marketplacePromotionControllerListPlans = (options?: ApiClientRequestOptions) =>
  client.GET(promotionPlansPath, toOpenApiFetchOptions(options));
export const marketplacePromotionControllerList = (options?: ApiClientRequestOptions) =>
  client.GET(promotionsPath, toOpenApiFetchOptions(options));
export const marketplacePromotionControllerGet = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(promotionPath, { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplacePromotionControllerActivate = (
  body: ActivateMarketplacePromotionDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(promotionsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerListCarts = (options?: ApiClientRequestOptions) =>
  client.GET(cartPath, toOpenApiFetchOptions(options));
export const marketplaceControllerGetCart = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(cartByIdPath, { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplaceControllerAddToCart = (
  body: AddToCartDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(cartItemsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerRemoveCartItem = (
  id: string,
  listingPublicationId: string,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.DELETE(cartItemPath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { id, listingPublicationId } },
  });
export const marketplaceControllerUpdateCartItem = (
  id: string,
  listingPublicationId: string,
  body: UpdateCartItemDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(cartItemPath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { id, listingPublicationId } },
    body,
  });
export const marketplaceControllerCheckoutCart = (
  id: string,
  body: CheckoutCartDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(cartCheckoutPath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { id } },
    body,
  });
export const marketplaceControllerListSamples = (options?: ApiClientRequestOptions) =>
  client.GET(samplesPath, toOpenApiFetchOptions(options));
export const marketplaceControllerRequestSample = (
  body: RequestMarketplaceSampleDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(samplesPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerTransitionSample = (
  sampleId: string,
  body: TransitionMarketplaceSampleDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(samplePath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { sampleId } },
  });
export const marketplaceControllerSubmitSampleFeedback = (
  sampleId: string,
  body: SubmitMarketplaceSampleFeedbackDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(sampleFeedbackPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { sampleId } },
  });
export const marketplaceControllerSampleUsage = (options?: ApiClientRequestOptions) =>
  client.GET(samplesUsagePath, toOpenApiFetchOptions(options));
export const marketplaceControllerListFavorites = (options?: ApiClientRequestOptions) =>
  client.GET(favoritesPath, toOpenApiFetchOptions(options));
export const marketplaceControllerAddFavorite = (
  listingPublicationId: string,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(favoritePath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { listingPublicationId } },
  });
export const marketplaceControllerRemoveFavorite = (
  listingPublicationId: string,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.DELETE(favoritePath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { listingPublicationId } },
  });
export const marketplaceControllerAddReview = (
  body: SubmitMarketplaceReviewDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(reviewsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerListOwnReviews = (options?: ApiClientRequestOptions) =>
  client.GET(ownReviewsPath, toOpenApiFetchOptions(options));
export const marketplaceControllerGetReviewSelfState = (
  listingPublicationId: string,
  options?: ApiClientRequestOptions,
) =>
  client.GET(reviewSelfStatePath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { listingPublicationId } },
  });
export const marketplaceControllerReplyToReview = (
  reviewId: string,
  body: ReplyMarketplaceReviewDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(reviewReplyPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { reviewId } },
  });
export const marketplaceControllerReportReview = (
  reviewId: string,
  body: ReportMarketplaceReviewDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(reviewReportsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { reviewId } },
  });
export const marketplaceControllerListRequests = (options?: ApiClientRequestOptions) =>
  client.GET(requestsPath, toOpenApiFetchOptions(options));
export const marketplaceControllerCreateRequest = (
  body: CreateRequestDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(requestsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerListMyRequests = (options?: ApiClientRequestOptions) =>
  client.GET(myRequestsPath, toOpenApiFetchOptions(options));
export const marketplaceControllerListOffers = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(offersPath, { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplaceControllerMakeOffer = (
  id: string,
  body: RequestOfferDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(offersPath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { id } },
    body,
  });
export const marketplaceControllerChooseOffer = (
  id: string,
  offerId: string,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(chooseOfferPath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { id, offerId } },
  });
export const marketplaceControllerListContracts = (options?: ApiClientRequestOptions) =>
  client.GET(contractsPath, toOpenApiFetchOptions(options));
export const marketplaceControllerUpdateContractDeliveryQuote = (
  id: string,
  body: ContractDeliveryQuoteDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(contractDeliveryQuotePath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { id } },
    body,
  });
export const marketplaceControllerCreateContractArtifact = (
  id: string,
  body: CreateContractArtifactDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(contractArtifactPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { id } },
  });
export const marketplaceControllerGetContractArtifact = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(contractArtifactPath, { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplaceControllerDownloadContractArtifact = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(contractArtifactDownloadPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
    parseAs: 'blob',
  });
export const marketplaceControllerSignContract = (
  id: string,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(contractSignPath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { id } },
  });
export const marketplaceControllerConsentFactoring = (
  id: string,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(contractFactoringConsentPath, {
    ...toOpenApiFetchOptions(options),
    params: { header: commandHeader(idempotencyKey), path: { id } },
  });
export const marketplaceControllerRecordSettlementEvent = (
  id: string,
  body: SettlementCommandDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(contractSettlementEventsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { id } },
  });
export const marketplaceControllerTransitionContractFulfillment = (
  id: string,
  body: FulfillmentCommandDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(contractFulfillmentPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { id } },
  });
export const marketplaceControllerOpenContractDispute = (
  id: string,
  body: OpenDisputeDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(contractDisputePath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { id } },
  });
export const marketplaceControllerStoreContractDisputeEvidence = (
  id: string,
  evidence: File,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) => {
  const body = new FormData();
  body.append('evidence', evidence);
  return client.POST(contractDisputeEvidencePath, {
    ...toOpenApiFetchOptions(options),
    body: body as never,
    params: { header: commandHeader(idempotencyKey), path: { id } },
  });
};
/**
 * What this deployment can do with an uploaded photograph.
 *
 * Read before the control is offered, so a deployment without object storage
 * says so instead of accepting a file it would have to drop. The limits travel
 * with the answer, so the form refuses an oversized or unsupported file before
 * spending a request on it.
 */
export const marketplaceMediaControllerGetCapability = (options?: ApiClientRequestOptions) =>
  client.GET(photographsPath, toOpenApiFetchOptions(options));

/**
 * Upload one photograph.
 *
 * The body is `FormData`, so no layer sets `Content-Type` and the browser
 * writes the multipart boundary itself; the route accepts exactly one file part
 * named `photo` and no text fields. The response carries the opaque identifier
 * plus the two reference shapes a listing and a review accept.
 */
export const marketplaceMediaControllerStorePhotograph = (photo: File, options?: ApiClientRequestOptions) => {
  const body = new FormData();
  body.append('photo', photo);
  return client.POST(photographsPath, { ...toOpenApiFetchOptions(options), body: body as never });
};

export const marketplaceControllerGetContractLifecycle = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(contractLifecyclePath, { ...toOpenApiFetchOptions(options), params: { path: { id } } });
export const marketplaceControllerListNotifications = (options?: ApiClientRequestOptions) =>
  client.GET(notificationsPath, toOpenApiFetchOptions(options));
export const marketplaceControllerGetDashboard = (options?: ApiClientRequestOptions) =>
  client.GET(dashboardPath, toOpenApiFetchOptions(options));
export const marketplaceControllerListAi = (options?: ApiClientRequestOptions) =>
  client.GET(aiPath, toOpenApiFetchOptions(options));
export const marketplaceControllerAskAi = (
  body: CreateAiConsultationDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(aiPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey) },
  });
export const marketplaceControllerConfirmAiStarterCart = (
  id: string,
  body: ConfirmAiStarterCartDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(aiStarterCartPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: commandHeader(idempotencyKey), path: { id } },
  });
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
