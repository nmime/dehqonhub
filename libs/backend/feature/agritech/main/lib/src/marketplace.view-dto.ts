import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const verificationRoles = ['farmer', 'seller', 'buyer'] as const;
const verificationLevels = ['basic', 'verified', 'trusted'] as const;
const verificationStatuses = ['none', 'pending', 'verified', 'rejected'] as const;
const cartStatuses = ['open', 'ordered', 'abandoned'] as const;
const sampleStatuses = ['pending', 'shipped', 'delivered', 'cancelled'] as const;
const requestStatuses = ['open', 'offering', 'selected', 'closed', 'expired'] as const;
const offerStatuses = ['pending', 'accepted', 'declined'] as const;
const contractStatuses = ['draft', 'signed', 'active', 'completed', 'cancelled'] as const;
const deliveryTerms = ['pickup', 'seller_delivery', 'by_agreement'] as const;
const aiKinds = ['recommendation', 'find_cheaper', 'season_advice', 'generic'] as const;

export class VerificationDocumentDto {
  @ApiProperty() kind!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() storageKey!: string;
  @ApiPropertyOptional() optional?: boolean;
}

export class VerificationViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: verificationRoles }) role!: string;
  @ApiProperty({ enum: verificationLevels }) level!: string;
  @ApiProperty({ enum: verificationStatuses }) status!: string;
  @ApiProperty() oneIdLinked!: boolean;
  @ApiProperty({ type: [VerificationDocumentDto] }) documents!: VerificationDocumentDto[];
  @ApiPropertyOptional() reviewedBy?: string;
  @ApiPropertyOptional({ format: 'date-time' }) reviewedAt?: Date;
  @ApiPropertyOptional() rejectionReason?: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class VerificationListDto {
  @ApiProperty({ type: [VerificationViewDto] }) items!: VerificationViewDto[];
}

export class CartItemDto {
  @ApiProperty() productId!: string;
  @ApiProperty() quantity!: number;
}

export class CartViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() sellerId!: string;
  @ApiProperty({ type: [CartItemDto] }) items!: CartItemDto[];
  @ApiProperty({ enum: cartStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class CartListDto {
  @ApiProperty({ type: [CartViewDto] }) items!: CartViewDto[];
}

export class SampleViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() sellerId!: string;
  @ApiProperty({ enum: sampleStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class SampleListDto {
  @ApiProperty({ type: [SampleViewDto] }) items!: SampleViewDto[];
}

export class SampleUsageViewDto {
  @ApiProperty() used!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() remaining!: number;
}

export class FavoriteViewDto {
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class FavoriteListDto {
  @ApiProperty({ type: [FavoriteViewDto] }) items!: FavoriteViewDto[];
}

export class ReviewViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() rating!: number;
  @ApiPropertyOptional() comment?: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class ReviewListDto {
  @ApiProperty({ type: [ReviewViewDto] }) items!: ReviewViewDto[];
}

export class BuyerRequestViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() buyerUserId!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() product?: string;
  @ApiPropertyOptional() volume?: string;
  @ApiProperty() region!: string;
  @ApiPropertyOptional() deadline?: string;
  @ApiPropertyOptional() budgetUzs?: number;
  @ApiPropertyOptional() requirements?: string;
  @ApiProperty({ enum: requestStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class BuyerRequestListDto {
  @ApiProperty({ type: [BuyerRequestViewDto] }) items!: BuyerRequestViewDto[];
}

export class OfferViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() sellerUserId!: string;
  @ApiProperty() priceUzs!: number;
  @ApiPropertyOptional() deliveryNote?: string;
  @ApiPropertyOptional() deliveryDays?: number;
  @ApiProperty({ enum: offerStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class OfferListDto {
  @ApiProperty({ type: [OfferViewDto] }) items!: OfferViewDto[];
}

export class RequestOfferDto {
  @ApiProperty() priceUzs!: number;
  @ApiPropertyOptional() deliveryNote?: string;
  @ApiPropertyOptional() deliveryDays?: number;
}

export class ContractViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() buyerUserId!: string;
  @ApiProperty() sellerUserId!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() amountUzs!: number;
  @ApiProperty({ enum: deliveryTerms }) deliveryTerms!: string;
  @ApiPropertyOptional() deliveryPriceUzs?: number;
  @ApiProperty() factoringEnabled!: boolean;
  @ApiProperty({ enum: contractStatuses }) status!: string;
  @ApiPropertyOptional({ format: 'date-time' }) signedAt?: Date;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class ContractListDto {
  @ApiProperty({ type: [ContractViewDto] }) items!: ContractViewDto[];
}

export class AiConsultationViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: aiKinds }) kind!: string;
  @ApiProperty() question!: string;
  @ApiProperty() answer!: string;
  @ApiProperty({ type: [String] }) productIds!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class AiConsultationListDto {
  @ApiProperty({ type: [AiConsultationViewDto] }) items!: AiConsultationViewDto[];
}
