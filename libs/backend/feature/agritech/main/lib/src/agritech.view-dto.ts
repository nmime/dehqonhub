import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const partnerKinds = ['supplier', 'buyer'] as const;
const partnerStatuses = ['pending', 'approved', 'rejected', 'suspended'] as const;
const productCategories = ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] as const;
const produceGrades = ['A', 'B', 'C'] as const;
const produceStatuses = ['active', 'reserved', 'sold', 'cancelled'] as const;
const deliveryStatuses = ['scheduled', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled'] as const;
const maximumSupplierPriceUzs = 9_999_999_999_999;

export class PartnerViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() ownerUserId!: string;
  @ApiProperty({ enum: partnerKinds }) kind!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() taxId!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() region!: string;
  @ApiProperty({ enum: partnerStatuses }) status!: string;
  @ApiPropertyOptional() reviewedBy?: string;
  @ApiPropertyOptional({ format: 'date-time' }) reviewedAt?: Date;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class PartnerListDto {
  @ApiProperty({ type: [PartnerViewDto] }) items!: PartnerViewDto[];
}

export class SupplierProductViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) partnerId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() nameRu?: string;
  @ApiPropertyOptional() nameUz?: string;
  @ApiProperty({ enum: productCategories }) category!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: maximumSupplierPriceUzs }) priceUzs!: number;
  @ApiProperty() unit!: string;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 2_147_483_647 }) stockQuantity!: number;
  @ApiProperty() region!: string;
  @ApiProperty({ enum: ['active', 'inactive', 'out_of_stock'] }) status!: string;
}

export class SupplierProductListDto {
  @ApiProperty({ type: [SupplierProductViewDto] }) items!: SupplierProductViewDto[];
}

export class CreatedResourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class ProduceListingViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ format: 'uuid' }) farmerId!: string;
  @ApiProperty() crop!: string;
  @ApiProperty({ enum: produceGrades }) grade!: string;
  @ApiProperty() quantityKg!: number;
  @ApiProperty() availableQuantityKg!: number;
  @ApiProperty() pricePerKgUzs!: number;
  @ApiProperty() region!: string;
  @ApiProperty({ format: 'date-time' }) availableFrom!: Date;
  @ApiProperty({ format: 'date-time' }) availableUntil!: Date;
  @ApiProperty({ enum: produceStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class ProduceListingListDto {
  @ApiProperty({ type: [ProduceListingViewDto] }) items!: ProduceListingViewDto[];
}

export class PriceDiscoveryViewDto {
  @ApiProperty() crop!: string;
  @ApiProperty() region!: string;
  @ApiPropertyOptional({ enum: produceGrades }) grade?: string;
  @ApiProperty({ enum: ['UZS'] }) currency!: 'UZS';
  @ApiProperty({ enum: ['kg'] }) unit!: 'kg';
  @ApiProperty() minimumUzs!: number;
  @ApiProperty() medianUzs!: number;
  @ApiProperty() maximumUzs!: number;
  @ApiProperty() sampleSize!: number;
  @ApiProperty({ format: 'date-time' }) observedAt!: Date;
}

export class ProduceReservationViewDto {
  @ApiProperty({ format: 'uuid' }) orderId!: string;
  @ApiProperty() totalAmountUzs!: number;
}

export class AssignedFarmerViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() region!: string;
  @ApiPropertyOptional() district?: string;
  @ApiProperty({ type: [String] }) crops!: string[];
  @ApiProperty({ enum: ['active', 'inactive', 'pending_verification'] }) status!: string;
  @ApiPropertyOptional() fieldAgentUserId?: string;
}

export class AssignedFarmerListDto {
  @ApiProperty({ type: [AssignedFarmerViewDto] }) items!: AssignedFarmerViewDto[];
}

export class DeliveryHistoryViewDto {
  @ApiProperty({ enum: deliveryStatuses }) status!: string;
  @ApiProperty() actorUserId!: string;
  @ApiProperty({ format: 'date-time' }) at!: string;
}

export class DeliveryViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ format: 'uuid' }) orderId!: string;
  @ApiPropertyOptional() agentUserId?: string;
  @ApiProperty({ enum: deliveryStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) scheduledAt!: Date;
  @ApiPropertyOptional() proofReference?: string;
  @ApiProperty({ type: [DeliveryHistoryViewDto] }) history!: DeliveryHistoryViewDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class DeliveryListDto {
  @ApiProperty({ type: [DeliveryViewDto] }) items!: DeliveryViewDto[];
}

export class FieldVisitViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ format: 'uuid' }) farmerId!: string;
  @ApiProperty() agentUserId!: string;
  @ApiProperty() notes!: string;
  @ApiPropertyOptional({ enum: produceGrades }) observedGrade?: string;
  @ApiProperty({ format: 'date-time' }) observedAt!: Date;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class AdvisoryViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ format: 'uuid' }) farmerId!: string;
  @ApiProperty({ enum: ['weather', 'agronomy'] }) kind!: string;
  @ApiProperty() source!: string;
  @ApiProperty() summary!: string;
  @ApiProperty({ format: 'date-time' }) observedAt!: Date;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty() stale!: boolean;
}

export class AdvisoryListDto {
  @ApiProperty({ type: [AdvisoryViewDto] }) items!: AdvisoryViewDto[];
}

export class FarmerStatusViewDto {
  @ApiProperty({ format: 'uuid' }) farmerId!: string;
  @ApiProperty({ enum: ['active', 'inactive', 'pending_verification'] }) status!: string;
}

export class FarmerAssignmentViewDto {
  @ApiProperty({ format: 'uuid' }) farmerId!: string;
}

export class AnalyticsViewDto {
  @ApiProperty() farmers!: number;
  @ApiProperty() activeFarmers!: number;
  @ApiProperty() pendingFarmers!: number;
  @ApiProperty() partnerApplications!: number;
  @ApiProperty() pendingPartners!: number;
  @ApiProperty() approvedSuppliers!: number;
  @ApiProperty() approvedBuyers!: number;
  @ApiProperty() activeInputProducts!: number;
  @ApiProperty() inputStockUnits!: number;
  @ApiProperty() activeProduceListings!: number;
  @ApiProperty() produceAvailableKg!: number;
  @ApiProperty() orders!: number;
  @ApiProperty() deliveredOrders!: number;
  @ApiProperty({ minimum: 0, maximum: 10_000 }) fulfillmentRateBasisPoints!: number;
  @ApiProperty() paidPayments!: number;
  @ApiProperty() repeatBuyers!: number;
  @ApiProperty({ minimum: 0, maximum: 10_000 }) repeatBuyerRateBasisPoints!: number;
  @ApiProperty() gmvUzs!: number;
  @ApiProperty({ minimum: 0, maximum: 10_000 }) commissionBasisPoints!: number;
  @ApiProperty() platformCommissionUzs!: number;
}

export class AgriTechOrderSummaryViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['input', 'produce'] }) kind!: string;
  @ApiPropertyOptional({ format: 'uuid' }) buyerPartnerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) produceListingId?: string;
  @ApiProperty() totalAmountUzs!: number;
  @ApiProperty({ enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] })
  status!: string;
  @ApiProperty() deliveryAddress!: string;
  @ApiProperty() region!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class AgriTechOrderSummaryListDto {
  @ApiProperty({ type: [AgriTechOrderSummaryViewDto] }) items!: AgriTechOrderSummaryViewDto[];
}

export class PilotViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['planned', 'active', 'completed', 'cancelled'] }) status!: string;
  @ApiProperty() targetFarmers!: number;
  @ApiProperty() targetSuppliers!: number;
  @ApiProperty({ format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ format: 'date-time' }) endsAt!: Date;
  @ApiProperty() actualFarmers!: number;
  @ApiProperty() actualSuppliers!: number;
  @ApiProperty() actualOrders!: number;
  @ApiProperty() actualPaidPayments!: number;
  @ApiProperty() actualDeliveries!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class PilotListDto {
  @ApiProperty({ type: [PilotViewDto] }) items!: PilotViewDto[];
}

export class IntegrationReadinessViewDto {
  @ApiProperty({ enum: ['click', 'payme', 'bnpl', 'weather', 'agronomy', 'agroportal', 'digital-agriculture'] })
  provider!: string;
  @ApiProperty({ enum: ['disabled', 'ready', 'degraded'] }) status!: string;
  @ApiPropertyOptional({ format: 'date-time' }) lastSuccessfulAt?: Date;
  @ApiPropertyOptional() lastErrorCode?: string;
}

export class IntegrationReadinessListDto {
  @ApiProperty({ type: [IntegrationReadinessViewDto] }) items!: IntegrationReadinessViewDto[];
}
