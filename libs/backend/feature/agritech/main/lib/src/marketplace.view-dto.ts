import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const verificationRoles = ['farmer', 'seller', 'buyer'] as const;
const verificationLevels = ['basic', 'verified', 'trusted'] as const;
const verificationStatuses = ['none', 'pending', 'verified', 'rejected'] as const;
const cartStatuses = ['open', 'ordered', 'abandoned'] as const;
const sampleStatuses = ['pending', 'shipped', 'delivered', 'cancelled'] as const;
const requestStatuses = ['open', 'offering', 'selected', 'closed', 'expired'] as const;
const offerStatuses = ['pending', 'accepted', 'declined'] as const;
const contractStatuses = ['draft', 'signed', 'active', 'completed', 'cancelled', 'legacy_review_required'] as const;
const deliveryTerms = ['pickup', 'seller_delivery', 'by_agreement'] as const;
const aiKinds = ['recommendation', 'find_cheaper', 'season_advice', 'generic'] as const;
const aiAnswers = ['catalog_match', 'no_catalog_match'] as const;
const maximumDeliveryDays = 365;
const maximumUzsAmount = 9_999_999_999_999;

function IsSellerDeliveryPrice(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isSellerDeliveryPrice',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown, validationArguments: ValidationArguments): boolean {
          const input = validationArguments.object as Partial<RequestOfferDto>;
          if (input.deliveryTerms !== 'seller_delivery') {
            return value === undefined;
          }
          return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maximumUzsAmount;
        },
        defaultMessage(): string {
          return 'deliveryPriceUzs is required for seller_delivery and must be omitted otherwise';
        },
      },
    });
  };
}

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
  @ApiPropertyOptional({ enum: ['criteria_not_met', 'documents_unreadable', 'identity_mismatch'] })
  rejectionReason?: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class VerificationListDto {
  @ApiProperty({ type: [VerificationViewDto] }) items!: VerificationViewDto[];
}

export class NullableVerificationResponseDto {
  @ApiProperty({ type: () => VerificationViewDto, nullable: true }) data!: VerificationViewDto | null;
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

export class CheckoutCartResultDto {
  @ApiProperty({ format: 'uuid' }) cartId!: string;
  @ApiProperty({ format: 'uuid' }) contractId!: string;
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

export class FavoriteMutationResultDto {
  @ApiProperty() productId!: string;
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
  @ApiPropertyOptional({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' }) budgetUzs?: number;
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
  @ApiProperty({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' }) priceUzs!: number;
  @ApiProperty({ enum: deliveryTerms }) deliveryTerms!: string;
  @ApiPropertyOptional({
    description: 'Zero for pickup, positive for seller_delivery, and absent for by_agreement.',
    maximum: maximumUzsAmount,
    minimum: 0,
    type: 'integer',
  })
  deliveryPriceUzs?: number;
  @ApiPropertyOptional({ maxLength: 500, minLength: 1 }) deliveryNote?: string;
  @ApiPropertyOptional({ maximum: maximumDeliveryDays, minimum: 1, type: 'integer' }) deliveryDays?: number;
  @ApiProperty({ enum: offerStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class OfferListDto {
  @ApiProperty({ type: [OfferViewDto] }) items!: OfferViewDto[];
}

export class RequestOfferDto {
  @ApiProperty({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(maximumUzsAmount)
  priceUzs!: number;
  @ApiProperty({ enum: deliveryTerms }) @IsIn(deliveryTerms) deliveryTerms!: (typeof deliveryTerms)[number];
  @ApiPropertyOptional({
    description: 'Required when deliveryTerms is seller_delivery; must be omitted for pickup and by_agreement.',
    maximum: maximumUzsAmount,
    minimum: 1,
    type: 'integer',
  })
  @IsSellerDeliveryPrice()
  deliveryPriceUzs?: number;
  @ApiPropertyOptional({ maxLength: 500, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(500)
  deliveryNote?: string;
  @ApiPropertyOptional({ maximum: maximumDeliveryDays, minimum: 1, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(maximumDeliveryDays)
  deliveryDays?: number;
}

export class ContractDeliveryQuoteDto {
  @ApiProperty({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(maximumUzsAmount)
  deliveryPriceUzs!: number;
  @ApiPropertyOptional({ maxLength: 500, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(500)
  deliveryNote?: string;
  @ApiPropertyOptional({ maximum: maximumDeliveryDays, minimum: 1, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(maximumDeliveryDays)
  deliveryDays?: number;
}

export class OfferSelectionResultDto {
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty({ format: 'uuid' }) offerId!: string;
  @ApiProperty() sellerUserId!: string;
  @ApiProperty({ format: 'uuid' }) contractId!: string;
}

export class ContractLineDto {
  @ApiProperty() productId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' }) unitPriceUzs!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' }) lineTotalUzs!: number;
}

export class ContractViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() buyerUserId!: string;
  @ApiProperty() sellerUserId!: string;
  /** The parties' organizations, absent while a contract outlives one of them. */
  @ApiPropertyOptional({ maxLength: 200 }) buyerName?: string;
  @ApiPropertyOptional({ maxLength: 200 }) sellerName?: string;
  @ApiPropertyOptional({ enum: ['cart_checkout', 'offer_selection'] }) sourceType?: string;
  @ApiPropertyOptional() sourceId?: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' }) amountUzs!: number;
  @ApiProperty({ type: [ContractLineDto] }) lines!: ContractLineDto[];
  @ApiProperty({ enum: deliveryTerms }) deliveryTerms!: string;
  @ApiPropertyOptional({ maximum: maximumUzsAmount, minimum: 0, type: 'integer' }) deliveryPriceUzs?: number;
  @ApiPropertyOptional({ maxLength: 500, minLength: 1 }) deliveryNote?: string;
  @ApiPropertyOptional({ maximum: maximumDeliveryDays, minimum: 1, type: 'integer' }) deliveryDays?: number;
  @ApiProperty() factoringEnabled!: boolean;
  @ApiProperty({ enum: contractStatuses }) status!: string;
  @ApiPropertyOptional({ format: 'date-time' }) buyerSignedAt?: Date;
  @ApiPropertyOptional({ format: 'date-time' }) sellerSignedAt?: Date;
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
  @ApiProperty({
    description: 'Semantic result code; clients localize user-facing consultation copy.',
    enum: aiAnswers,
  })
  answer!: (typeof aiAnswers)[number];
  @ApiProperty({ type: [String] }) productIds!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class AiConsultationListDto {
  @ApiProperty({ type: [AiConsultationViewDto] }) items!: AiConsultationViewDto[];
}
