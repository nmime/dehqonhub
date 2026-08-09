import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { MarketplaceInMemoryAdapter } from '@app/backend-feature-agritech-main-marketplace-in-memory-adapter';
import type { MarketplaceVerificationAcceptanceAdapter } from './marketplace-verification.acceptance-adapter.ts';
import type {
  MarketplacePromotionAcceptanceAdapter,
  MarketplacePromotionAcceptanceResult,
} from './marketplace-promotion.acceptance-adapter.ts';
import type {
  MarketplaceDashboardAiAcceptanceAdapter,
  MarketplaceDashboardAiAcceptanceResult,
} from './marketplace-dashboard-ai.acceptance-adapter.ts';
import type {
  MarketplacePublicAcceptanceAdapter,
  MarketplacePublicGuestProjection,
  MarketplacePublicKeysetExercise,
  MarketplacePublicModerationRace,
  MarketplacePublicSellerRejectionFanout,
} from './marketplace-public.acceptance-adapter.ts';
import type {
  AgriTechOwner,
  BuyerRequest,
  Cart,
  CheckoutCartResult,
  Contract,
  MarketplaceListingPublication,
  OfferSelectionResult,
  RequestOffer,
  Verification,
} from '@app/backend-feature-agritech-shared';

export class AcceptanceWorld extends World {
  claim: unknown;
  normalizedRoles: string[] = [];
  permissions: string[] = [];
  requestId: string | undefined;
  occurrenceUri: string | undefined;
  occurrenceError: unknown;
  notificationChannel: string | undefined;
  externalDelivery: boolean | undefined;
  assuranceExitCode: number | null | undefined;
  releaseAssuranceSources: string | undefined;
  agriTechPartnerStatus: 'pending' | 'approved' | undefined;
  agriTechAvailableQuantityKg: number | undefined;
  agriTechRequestedQuantityKg: number | undefined;
  agriTechReservationAllowed: boolean | undefined;
  agriTechDeliveryProof: string | undefined;
  agriTechDeliveryAllowed: boolean | undefined;
  agriTechMarketplace: MarketplaceInMemoryAdapter | undefined;
  agriTechMarketplaceBuyer: AgriTechOwner | undefined;
  agriTechMarketplaceBuyerPartnerId: string | undefined;
  agriTechMarketplaceSeller: AgriTechOwner | undefined;
  agriTechMarketplaceSellerPartnerId: string | undefined;
  agriTechMarketplaceListingPublicIds: Record<string, string> = {};
  agriTechMarketplaceCarts: Cart[] = [];
  agriTechMarketplaceCartId: string | undefined;
  agriTechMarketplaceCheckout: CheckoutCartResult | undefined;
  agriTechMarketplaceRequest: BuyerRequest | undefined;
  agriTechMarketplaceRequestPublicId: string | undefined;
  agriTechMarketplaceOffer: RequestOffer | undefined;
  agriTechMarketplaceSelection: OfferSelectionResult | undefined;
  agriTechMarketplaceContract: Contract | undefined;
  agriTechMarketplaceError: unknown;
  agriTechVerificationAdapter: MarketplaceVerificationAcceptanceAdapter | undefined;
  agriTechVerificationApplicant: AgriTechOwner | undefined;
  agriTechVerificationResult: Verification | undefined;
  agriTechVerificationReplayCounts: { documents: number; identity: number } | undefined;
  agriTechPromotionAdapter: MarketplacePromotionAcceptanceAdapter | undefined;
  agriTechPromotionResult: MarketplacePromotionAcceptanceResult | undefined;
  agriTechDashboardAiAdapter: MarketplaceDashboardAiAcceptanceAdapter | undefined;
  agriTechDashboardAiResult: MarketplaceDashboardAiAcceptanceResult | undefined;
  agriTechPublicAdapter: MarketplacePublicAcceptanceAdapter | undefined;
  agriTechPublicProjection: MarketplacePublicGuestProjection | undefined;
  agriTechPublicPublication: MarketplaceListingPublication | undefined;
  agriTechPublicReplay: MarketplaceListingPublication | undefined;
  agriTechPublicConflict: unknown;
  agriTechPublicWrongTenant: unknown;
  agriTechPublicModerationRace: MarketplacePublicModerationRace | undefined;
  agriTechPublicKeysetExercise: MarketplacePublicKeysetExercise | undefined;
  agriTechPublicSellerRejectionFanout: MarketplacePublicSellerRejectionFanout | undefined;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(AcceptanceWorld);
