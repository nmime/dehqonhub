// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import type { AgriTechOwner, OperationResult } from './agritech.types';
import type { AiConsultationAnswer, AiConsultationKind, ContractStatus, VerificationRole } from './marketplace.types';

export const MarketplaceDashboardAiRepositoryInjectToken = Symbol('MarketplaceDashboardAiRepositoryInjectToken');

export type MarketplaceAiExplanationCode =
  | 'grounded_at_consultation_time'
  | 'lowest_current_price_first'
  | 'seasonal_calendar_unavailable'
  | 'stock_revalidated_on_confirmation'
  | 'no_grounded_catalog_match';

export type MarketplaceAiRecommendationReasonCode =
  'query_terms_match' | 'current_public_stock' | 'lowest_current_price';

export interface MarketplaceAiRecommendation {
  listingPublicationId: string;
  sellerPublicId: string;
  titles: {
    en: string;
    ru: string;
    uz: string;
    uzCyrl: string;
  };
  priceUzs: number;
  availability: {
    status: 'in_stock_at_consultation';
    quantity: number;
    unit: string;
    warningCode: 'stock_may_change';
  };
  reasonCodes: MarketplaceAiRecommendationReasonCode[];
}

export interface MarketplaceAiStarterCartPreview {
  status: 'requires_confirmation' | 'unavailable';
  sellerPartitions: Array<{
    sellerPublicId: string;
    listingPublicationIds: string[];
  }>;
}

export interface MarketplaceAiGroundedResponse {
  explanationCodes: MarketplaceAiExplanationCode[];
  recommendations: MarketplaceAiRecommendation[];
  starterCartPreview: MarketplaceAiStarterCartPreview;
}

export interface MarketplaceAiConsultation {
  id: string;
  kind: AiConsultationKind;
  question: string;
  answer: AiConsultationAnswer;
  listingPublicationIds: string[];
  response: MarketplaceAiGroundedResponse;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplaceAiStarterCartInput {
  actingPartnerId: string;
  confirmed: boolean;
}

export interface MarketplaceAiStarterCartPartition {
  cartId: string;
  sellerPublicId: string;
  listingPublicationIds: string[];
}

export interface MarketplaceAiStarterCartResult {
  consultationId: string;
  status: 'confirmed';
  carts: MarketplaceAiStarterCartPartition[];
  confirmedAt: Date;
}

export interface MarketplaceDashboardRecentDeal {
  contractId: string;
  side: 'buyer' | 'seller';
  counterpartyName?: string;
  amountUzs: number;
  status: ContractStatus;
  updatedAt: Date;
}

export interface MarketplaceDashboardTopListing {
  listingPublicationId: string;
  title: string;
  completedQuantity: number;
  revenueUzs: number;
}

export interface MarketplaceDashboardMonthlyActivity {
  month: string;
  completedPurchases: number;
  completedSales: number;
  purchaseSpendUzs: number;
  salesRevenueUzs: number;
}

export interface MarketplaceSellerDashboardMetrics {
  activeListings: number;
  pendingOffers: number;
  activeDeals: number;
  completedDeals: number;
  completedRevenueUzs: number;
  offerConversionBps: number;
  topListings: MarketplaceDashboardTopListing[];
}

export interface MarketplaceBuyerDashboardMetrics {
  openCarts: number;
  openPurchaseRequests: number;
  activeDeals: number;
  completedDeals: number;
  completedSpendUzs: number;
}

interface MarketplaceRoleDashboardBase {
  role: VerificationRole;
  generatedAt: Date;
  monthlyActivity: MarketplaceDashboardMonthlyActivity[];
  recentDeals: MarketplaceDashboardRecentDeal[];
}

export interface MarketplaceSupplierDashboard extends MarketplaceRoleDashboardBase {
  role: 'seller';
  seller: MarketplaceSellerDashboardMetrics;
}

export interface MarketplaceBuyerDashboard extends MarketplaceRoleDashboardBase {
  role: 'buyer';
  buyer: MarketplaceBuyerDashboardMetrics;
}

export interface MarketplaceFarmerDashboard extends MarketplaceRoleDashboardBase {
  role: 'farmer';
  buyer: MarketplaceBuyerDashboardMetrics;
  seller: MarketplaceSellerDashboardMetrics;
}

export type MarketplaceRoleDashboard =
  MarketplaceSupplierDashboard | MarketplaceBuyerDashboard | MarketplaceFarmerDashboard;

export interface MarketplaceDashboardAiRepository {
  getRoleDashboard(owner: AgriTechOwner): Promise<OperationResult<MarketplaceRoleDashboard>>;
  createAiConsultation(
    owner: AgriTechOwner,
    kind: AiConsultationKind,
    question: string,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceAiConsultation>>;
  listAiConsultations(owner: AgriTechOwner): Promise<MarketplaceAiConsultation[]>;
  confirmAiStarterCart(
    owner: AgriTechOwner,
    consultationId: string,
    input: MarketplaceAiStarterCartInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceAiStarterCartResult>>;
}
