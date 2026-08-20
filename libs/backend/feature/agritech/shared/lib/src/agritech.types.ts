export type PartnerKind = 'supplier' | 'buyer';
export type PartnerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type ProduceGrade = 'A' | 'B' | 'C';
export type ProduceStatus = 'active' | 'reserved' | 'sold' | 'cancelled';
export type DeliveryStatus = 'scheduled' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';
export type AdvisoryKind = 'weather' | 'agronomy';
export type IntegrationStatus = 'disabled' | 'ready' | 'degraded';
export type PilotStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface AgriTechOwner {
  tenantId: string;
  userId: string;
}

export interface Partner {
  id: string;
  tenantId: string;
  ownerUserId: string;
  kind: PartnerKind;
  legalName: string;
  taxId: string;
  phone: string;
  region: string;
  status: PartnerStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePartnerInput {
  kind: PartnerKind;
  legalName: string;
  taxId: string;
  phone: string;
  region: string;
}

export interface SupplierProductInput {
  partnerId: string;
  name: string;
  nameRu?: string;
  nameUz?: string;
  nameUzCyrl?: string;
  category: 'fertilizer' | 'seed' | 'pesticide' | 'equipment' | 'irrigation' | 'other';
  description: string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  sampleAvailable?: boolean;
  region: string;
  /**
   * Root-relative same-origin listing photographs. The publication projection
   * copies at most five of them into the public snapshot, so this is the one
   * writable image carrier a seller-side listing has.
   */
  images?: string[];
}

export interface SupplierProduct {
  id: string;
  partnerId: string;
  name: string;
  nameRu?: string;
  nameUz?: string;
  nameUzCyrl?: string;
  category: SupplierProductInput['category'];
  description: string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  sampleAvailable: boolean;
  region: string;
  status: 'active' | 'inactive' | 'out_of_stock';
}

export interface UpdateSupplierProductInput {
  name?: string;
  nameRu?: string;
  nameUz?: string;
  nameUzCyrl?: string;
  priceUzs: number;
  stockQuantity: number;
  sampleAvailable?: boolean;
  status: 'active' | 'inactive' | 'out_of_stock';
}

export interface AssignedFarmer {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  region: string;
  district?: string;
  crops: string[];
  status: 'active' | 'inactive' | 'pending_verification';
  fieldAgentUserId?: string;
}

export interface ProduceListing {
  id: string;
  tenantId: string;
  farmerId: string;
  crop: string;
  grade: ProduceGrade;
  quantityKg: number;
  availableQuantityKg: number;
  sampleAvailable: boolean;
  pricePerKgUzs: number;
  region: string;
  availableFrom: Date;
  availableUntil: Date;
  status: ProduceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProduceListingInput {
  supplierPartnerId: string;
  crop: string;
  grade: ProduceGrade;
  quantityKg: number;
  sampleAvailable?: boolean;
  pricePerKgUzs: number;
  region: string;
  availableFrom: Date;
  availableUntil: Date;
}

export interface PriceDiscovery {
  crop: string;
  region: string;
  grade?: ProduceGrade;
  currency: 'UZS';
  unit: 'kg';
  minimumUzs: number;
  medianUzs: number;
  maximumUzs: number;
  sampleSize: number;
  observedAt: Date;
}

export interface DeliveryHistoryEntry {
  status: DeliveryStatus;
  actorUserId: string;
  at: string;
}

export interface Delivery {
  id: string;
  tenantId: string;
  orderId: string;
  agentUserId?: string;
  status: DeliveryStatus;
  scheduledAt: Date;
  proofReference?: string;
  history: DeliveryHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldVisit {
  id: string;
  tenantId: string;
  farmerId: string;
  agentUserId: string;
  notes: string;
  observedGrade?: ProduceGrade;
  observedAt: Date;
  createdAt: Date;
}

export interface Advisory {
  id: string;
  tenantId: string;
  farmerId: string;
  kind: AdvisoryKind;
  source: string;
  summary: string;
  observedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  stale: boolean;
}

export interface AgriTechAnalytics {
  farmers: number;
  activeFarmers: number;
  pendingFarmers: number;
  partnerApplications: number;
  pendingPartners: number;
  approvedSuppliers: number;
  approvedBuyers: number;
  activeInputProducts: number;
  inputStockUnits: number;
  activeProduceListings: number;
  produceAvailableKg: number;
  orders: number;
  deliveredOrders: number;
  fulfillmentRateBasisPoints: number;
  paidPayments: number;
  repeatBuyers: number;
  repeatBuyerRateBasisPoints: number;
  gmvUzs: number;
  commissionBasisPoints: number;
  platformCommissionUzs: number;
}

export interface AgriTechOrderSummary {
  id: string;
  kind: 'input' | 'produce';
  buyerPartnerId?: string;
  produceListingId?: string;
  totalAmountUzs: number;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  deliveryAddress: string;
  region: string;
  createdAt: Date;
}

export interface PilotCohort {
  id: string;
  tenantId: string;
  name: string;
  status: PilotStatus;
  targetFarmers: number;
  targetSuppliers: number;
  startsAt: Date;
  endsAt: Date;
  actualFarmers: number;
  actualSuppliers: number;
  actualOrders: number;
  actualPaidPayments: number;
  actualDeliveries: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationReadiness {
  provider: 'click' | 'payme' | 'bnpl' | 'weather' | 'agronomy' | 'agroportal' | 'digital-agriculture';
  status: IntegrationStatus;
  lastSuccessfulAt?: Date;
  lastErrorCode?: string;
}

export type OperationResult<T> =
  | { status: 'ok'; value: T }
  | {
      status:
        | 'not_found'
        | 'forbidden'
        | 'conflict'
        | 'invalid_state'
        | 'insufficient_quantity'
        | 'farmer_inactive'
        | 'partner_unapproved';
      field?: string;
    };
