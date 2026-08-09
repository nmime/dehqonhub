import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { MarketplaceInMemoryAdapter } from '@app/backend-feature-agritech-main-marketplace-in-memory-adapter';
import type {
  AgriTechOwner,
  BuyerRequest,
  Cart,
  CheckoutCartResult,
  Contract,
  OfferSelectionResult,
  RequestOffer,
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
  releaseWorkflow: string | undefined;
  agriTechPartnerStatus: 'pending' | 'approved' | undefined;
  agriTechAvailableQuantityKg: number | undefined;
  agriTechRequestedQuantityKg: number | undefined;
  agriTechReservationAllowed: boolean | undefined;
  agriTechDeliveryProof: string | undefined;
  agriTechDeliveryAllowed: boolean | undefined;
  agriTechMarketplace: MarketplaceInMemoryAdapter | undefined;
  agriTechMarketplaceBuyer: AgriTechOwner | undefined;
  agriTechMarketplaceSeller: AgriTechOwner | undefined;
  agriTechMarketplaceCarts: Cart[] = [];
  agriTechMarketplaceCartId: string | undefined;
  agriTechMarketplaceCheckout: CheckoutCartResult | undefined;
  agriTechMarketplaceRequest: BuyerRequest | undefined;
  agriTechMarketplaceOffer: RequestOffer | undefined;
  agriTechMarketplaceSelection: OfferSelectionResult | undefined;
  agriTechMarketplaceContract: Contract | undefined;
  agriTechMarketplaceError: unknown;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(AcceptanceWorld);
