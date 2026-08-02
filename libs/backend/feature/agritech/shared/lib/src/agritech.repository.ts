import type {
  Advisory,
  AgriTechAnalytics,
  AgriTechOrderSummary,
  AgriTechOwner,
  CreatePartnerInput,
  CreateProduceListingInput,
  Delivery,
  DeliveryStatus,
  FieldVisit,
  IntegrationReadiness,
  OperationResult,
  Partner,
  PartnerStatus,
  PilotCohort,
  PilotStatus,
  PriceDiscovery,
  ProduceGrade,
  ProduceListing,
  SupplierProductInput,
  SupplierProduct,
  UpdateSupplierProductInput,
  AssignedFarmer,
} from './agritech.types';

export const AgriTechOperationsRepositoryInjectToken = Symbol('AgriTechOperationsRepositoryInjectToken');

export interface AgriTechOperationsRepository {
  createPartner(owner: AgriTechOwner, input: CreatePartnerInput): Promise<OperationResult<Partner>>;
  listOwnedPartners(owner: AgriTechOwner): Promise<Partner[]>;
  listPartners(tenantId: string): Promise<Partner[]>;
  setPartnerStatus(owner: AgriTechOwner, partnerId: string, status: PartnerStatus): Promise<OperationResult<Partner>>;
  createSupplierProduct(owner: AgriTechOwner, input: SupplierProductInput): Promise<OperationResult<{ id: string }>>;
  listSupplierProducts(owner: AgriTechOwner): Promise<SupplierProduct[]>;
  updateSupplierProduct(
    owner: AgriTechOwner,
    productId: string,
    input: UpdateSupplierProductInput,
  ): Promise<OperationResult<SupplierProduct>>;
  createProduceListing(
    owner: AgriTechOwner,
    input: CreateProduceListingInput,
  ): Promise<OperationResult<ProduceListing>>;
  listProduce(
    tenantId: string,
    filter: { crop?: string; region?: string; grade?: ProduceGrade },
  ): Promise<ProduceListing[]>;
  discoverPrice(
    tenantId: string,
    filter: { crop: string; region: string; grade?: ProduceGrade },
  ): Promise<OperationResult<PriceDiscovery>>;
  reserveProduce(
    owner: AgriTechOwner,
    listingId: string,
    input: { partnerId: string; quantityKg: number; deliveryAddress: string },
  ): Promise<OperationResult<{ orderId: string; totalAmountUzs: number }>>;
  cancelProduceListing(owner: AgriTechOwner, listingId: string): Promise<OperationResult<ProduceListing>>;
  listAssignedFarmers(owner: AgriTechOwner): Promise<AssignedFarmer[]>;
  listFarmers(tenantId: string): Promise<AssignedFarmer[]>;
  assignFarmer(
    owner: AgriTechOwner,
    farmerId: string,
    agentUserId: string,
  ): Promise<OperationResult<{ farmerId: string }>>;
  setFarmerStatus(
    owner: AgriTechOwner,
    farmerId: string,
    status: 'active' | 'inactive' | 'pending_verification',
  ): Promise<OperationResult<{ farmerId: string; status: string }>>;
  recordFieldVisit(
    owner: AgriTechOwner,
    input: { farmerId: string; notes: string; observedGrade?: ProduceGrade; observedAt: Date },
  ): Promise<OperationResult<FieldVisit>>;
  listOrders(tenantId: string): Promise<AgriTechOrderSummary[]>;
  scheduleDelivery(
    owner: AgriTechOwner,
    input: { orderId: string; agentUserId?: string; scheduledAt: Date },
  ): Promise<OperationResult<Delivery>>;
  listDeliveries(owner: AgriTechOwner): Promise<Delivery[]>;
  transitionDelivery(
    owner: AgriTechOwner,
    deliveryId: string,
    input: { status: DeliveryStatus; proofReference?: string },
  ): Promise<OperationResult<Delivery>>;
  publishAdvisory(
    owner: AgriTechOwner,
    input: {
      farmerId: string;
      kind: 'weather' | 'agronomy';
      source: string;
      summary: string;
      observedAt: Date;
      expiresAt: Date;
    },
  ): Promise<OperationResult<Advisory>>;
  listAdvisories(owner: AgriTechOwner): Promise<OperationResult<Advisory[]>>;
  analytics(tenantId: string): Promise<AgriTechAnalytics>;
  createPilot(
    owner: AgriTechOwner,
    input: {
      name: string;
      targetFarmers: number;
      targetSuppliers: number;
      startsAt: Date;
      endsAt: Date;
    },
  ): Promise<OperationResult<PilotCohort>>;
  listPilots(tenantId: string): Promise<PilotCohort[]>;
  setPilotStatus(owner: AgriTechOwner, pilotId: string, status: PilotStatus): Promise<OperationResult<PilotCohort>>;
  integrationReadiness(tenantId: string): Promise<IntegrationReadiness[]>;
}
