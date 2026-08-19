// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import type {
  AgriTechOwner,
  BuyerRequest,
  Cart,
  Contract,
  ContractSourceType,
  OfferSelectionResult,
  RequestOffer,
  Verification,
  VerificationDocument,
} from '@app/backend-feature-agritech-shared';

const verificationRoles = ['farmer', 'seller', 'buyer'] as const;
const verificationLevels = ['basic', 'verified', 'trusted'] as const;
const verificationStatuses = ['none', 'pending', 'verified', 'rejected'] as const;
const cartStatuses = ['open', 'ordered', 'abandoned'] as const;
const requestStatuses = ['open', 'offering', 'selected', 'closed', 'expired'] as const;
const offerStatuses = ['pending', 'accepted', 'declined'] as const;
const publicationStatuses = ['published', 'paused', 'rejected'] as const;
const publicationModerationStatuses = ['pending', 'approved', 'rejected'] as const;
const contractStatuses = ['draft', 'signed', 'active', 'completed', 'cancelled', 'legacy_review_required'] as const;
const deliveryTerms = ['pickup', 'seller_delivery', 'by_agreement'] as const;
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
  @ApiPropertyOptional() mimeType?: string;
  @ApiPropertyOptional() sizeBytes?: number;
  @ApiPropertyOptional({ enum: ['legacy', 'mock', 'live'] }) providerMode?: string;
  @ApiPropertyOptional() providerName?: string;
  @ApiPropertyOptional({ format: 'date-time' }) storedAt?: string;
  @ApiPropertyOptional() optional?: boolean;
  @ApiProperty() simulation!: boolean;
}

export class VerificationViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ enum: verificationRoles }) role!: string;
  @ApiProperty({ enum: verificationLevels }) level!: string;
  @ApiProperty({ enum: verificationStatuses }) status!: string;
  @ApiProperty({ enum: ['identity', 'documents', 'review', 'complete'] }) step!: string;
  @ApiProperty() oneIdLinked!: boolean;
  @ApiProperty({ enum: ['none', 'legacy', 'mock', 'live'] }) providerMode!: string;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ enum: ['none', 'legacy_unknown', 'mock', 'provider_verified'] }) identityAssurance!: string;
  @ApiPropertyOptional() providerName?: string;
  @ApiProperty({ type: [VerificationDocumentDto] }) documents!: VerificationDocumentDto[];
  @ApiPropertyOptional({ format: 'date-time' }) reviewedAt?: Date;
  @ApiPropertyOptional({ enum: ['criteria_not_met', 'documents_unreadable', 'identity_mismatch'] })
  rejectionReason?: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class AdminVerificationViewDto extends VerificationViewDto {
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiPropertyOptional() reviewedBy?: string;
}

export class AdminVerificationListDto {
  @ApiProperty({ type: [AdminVerificationViewDto] }) items!: AdminVerificationViewDto[];
}

export class NullableVerificationResponseDto {
  @ApiProperty({ type: () => VerificationViewDto, nullable: true }) data!: VerificationViewDto | null;
}

const toVerificationDocumentView = (document: VerificationDocument): VerificationDocumentDto => ({
  fileName: document.fileName,
  kind: document.kind,
  ...(document.mimeType ? { mimeType: document.mimeType } : {}),
  ...(document.sizeBytes !== undefined ? { sizeBytes: document.sizeBytes } : {}),
  ...(document.providerMode ? { providerMode: document.providerMode } : {}),
  ...(document.providerName ? { providerName: document.providerName } : {}),
  ...(document.storedAt ? { storedAt: document.storedAt } : {}),
  ...(document.optional !== undefined ? { optional: document.optional } : {}),
  simulation: document.providerMode === 'mock',
});

const verificationStep = (verification: Verification): VerificationViewDto['step'] => {
  if (verification.status === 'verified') {
    return 'complete';
  }
  if (verification.status === 'pending' || verification.status === 'rejected') {
    return 'review';
  }
  return verification.oneIdLinked ? 'documents' : 'identity';
};

export const toVerificationSelfView = (verification: Verification): VerificationViewDto => ({
  createdAt: verification.createdAt,
  documents: verification.documents.map(toVerificationDocumentView),
  id: verification.id,
  revision: verification.version,
  identityAssurance: verification.identityAssurance,
  level: verification.level,
  oneIdLinked: verification.oneIdLinked,
  providerMode: verification.providerMode,
  ...(verification.providerName ? { providerName: verification.providerName } : {}),
  ...(verification.rejectionReason ? { rejectionReason: verification.rejectionReason } : {}),
  ...(verification.reviewedAt ? { reviewedAt: verification.reviewedAt } : {}),
  role: verification.role,
  simulation:
    verification.providerMode === 'mock' || verification.documents.some((document) => document.providerMode === 'mock'),
  status: verification.status,
  step: verificationStep(verification),
  updatedAt: verification.updatedAt,
});

export const toVerificationAdminView = (verification: Verification): AdminVerificationViewDto => ({
  ...toVerificationSelfView(verification),
  tenantId: verification.tenantId,
  userId: verification.userId,
  ...(verification.reviewedBy ? { reviewedBy: verification.reviewedBy } : {}),
});

export class CartItemDto {
  @ApiProperty({ format: 'uuid' }) listingPublicationId!: string;
  @ApiProperty({ enum: ['product', 'produce'] }) sourceKind!: string;
  @ApiProperty() quantity!: number;
}

export class MarketplaceSafePartyDto {
  @ApiProperty() displayName!: string;
  @ApiProperty() region!: string;
}

export class CartViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: MarketplaceSafePartyDto }) seller!: MarketplaceSafePartyDto;
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

export class BuyerRequestViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() product?: string;
  @ApiPropertyOptional() volume?: string;
  @ApiProperty() region!: string;
  @ApiPropertyOptional() deadline?: string;
  @ApiPropertyOptional({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' }) budgetUzs?: number;
  @ApiPropertyOptional() requirements?: string;
  @ApiProperty({ enum: requestStatuses }) status!: string;
  @ApiPropertyOptional({
    description:
      'Public request publication id. The offer endpoints are keyed by it, never by the request id. Absent until the request is published, which means it is still awaiting moderation and cannot receive offers yet.',
    format: 'uuid',
  })
  publicationId?: string;
  @ApiPropertyOptional({
    description: 'Publication lifecycle state. Present only together with publicationId.',
    enum: publicationStatuses,
  })
  publicationStatus?: string;
  @ApiPropertyOptional({
    description: 'Moderation decision on the publication. Present only together with publicationId.',
    enum: publicationModerationStatuses,
  })
  moderationStatus?: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class BuyerRequestListDto {
  @ApiProperty({ type: [BuyerRequestViewDto] }) items!: BuyerRequestViewDto[];
}

export class OfferViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) requestPublicId!: string;
  @ApiProperty({ type: MarketplaceSafePartyDto }) seller!: MarketplaceSafePartyDto;
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
  @ApiProperty({ format: 'uuid' }) @IsUUID() actingPartnerId!: string;
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
  @ApiProperty({ minimum: 0, type: 'integer' })
  @IsInt()
  @Min(0)
  expectedRevision!: number;
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
  @ApiProperty({ format: 'uuid' }) requestPublicId!: string;
  @ApiProperty({ format: 'uuid' }) offerId!: string;
  @ApiProperty({ format: 'uuid' }) contractId!: string;
}

export class ContractLineDto {
  @ApiProperty({ format: 'uuid' }) sourcePublicationId!: string;
  @ApiProperty({ enum: ['product', 'produce', 'request'] }) sourceKind!: string;
  @ApiProperty() sourceRevision!: number;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' }) unitPriceUzs!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' }) lineTotalUzs!: number;
}

export class MarketplacePartySnapshotDto {
  @ApiProperty() legalName!: string;
  @ApiProperty() region!: string;
}

export class ContractViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ enum: ['buyer', 'seller'] }) actorParty!: 'buyer' | 'seller';
  @ApiProperty({ type: MarketplacePartySnapshotDto }) buyerPartySnapshot!: MarketplacePartySnapshotDto;
  @ApiProperty({ type: MarketplacePartySnapshotDto }) sellerPartySnapshot!: MarketplacePartySnapshotDto;
  @ApiPropertyOptional({ enum: ['cart_checkout', 'offer_selection'] }) sourceType?: ContractSourceType;
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

export function toContractSelfView(contract: Contract, owner: AgriTechOwner): ContractViewDto {
  const buyerMatch = contract.buyerTenantId === owner.tenantId && contract.buyerUserId === owner.userId;
  const sellerMatch = contract.sellerTenantId === owner.tenantId && contract.sellerUserId === owner.userId;
  let actorParty: 'buyer' | 'seller';
  if (buyerMatch) {
    actorParty = 'buyer';
  } else if (sellerMatch) {
    actorParty = 'seller';
  } else {
    throw new Error('Contract self view requires an authorized contract party');
  }

  return {
    id: contract.id,
    revision: contract.revision,
    actorParty,
    buyerPartySnapshot: {
      legalName: contract.buyerPartySnapshot.legalName,
      region: contract.buyerPartySnapshot.region,
    },
    sellerPartySnapshot: {
      legalName: contract.sellerPartySnapshot.legalName,
      region: contract.sellerPartySnapshot.region,
    },
    ...(contract.sourceType === undefined ? {} : { sourceType: contract.sourceType }),
    subject: contract.subject,
    amountUzs: contract.amountUzs,
    lines: contract.lines.map((line) => ({
      sourcePublicationId: line.sourcePublicationId,
      sourceKind: line.sourceKind,
      sourceRevision: line.sourceRevision,
      name: line.name,
      unit: line.unit,
      unitPriceUzs: line.unitPriceUzs,
      quantity: line.quantity,
      lineTotalUzs: line.lineTotalUzs,
    })),
    deliveryTerms: contract.deliveryTerms,
    ...(contract.deliveryPriceUzs === undefined ? {} : { deliveryPriceUzs: contract.deliveryPriceUzs }),
    ...(contract.deliveryNote === undefined ? {} : { deliveryNote: contract.deliveryNote }),
    ...(contract.deliveryDays === undefined ? {} : { deliveryDays: contract.deliveryDays }),
    factoringEnabled: contract.factoringEnabled,
    status: contract.status,
    ...(contract.buyerSignedAt === undefined ? {} : { buyerSignedAt: contract.buyerSignedAt }),
    ...(contract.sellerSignedAt === undefined ? {} : { sellerSignedAt: contract.sellerSignedAt }),
    ...(contract.signedAt === undefined ? {} : { signedAt: contract.signedAt }),
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

export const toCartSelfView = (cart: Cart): CartViewDto => ({
  createdAt: cart.createdAt,
  id: cart.id,
  items: cart.items.map((item) => ({
    listingPublicationId: item.listingPublicationId,
    quantity: item.quantity,
    sourceKind: item.sourceKind,
  })),
  seller: { displayName: cart.seller.displayName, region: cart.seller.region },
  status: cart.status,
  updatedAt: cart.updatedAt,
});

export const toBuyerRequestView = (request: BuyerRequest): BuyerRequestViewDto => ({
  ...(request.budgetUzs === undefined ? {} : { budgetUzs: request.budgetUzs }),
  createdAt: request.createdAt,
  ...(request.deadline === undefined ? {} : { deadline: request.deadline }),
  id: request.id,
  ...(request.moderationStatus === undefined ? {} : { moderationStatus: request.moderationStatus }),
  ...(request.product === undefined ? {} : { product: request.product }),
  ...(request.publicationId === undefined ? {} : { publicationId: request.publicationId }),
  ...(request.publicationStatus === undefined ? {} : { publicationStatus: request.publicationStatus }),
  region: request.region,
  ...(request.requirements === undefined ? {} : { requirements: request.requirements }),
  status: request.status,
  title: request.title,
  updatedAt: request.updatedAt,
  ...(request.volume === undefined ? {} : { volume: request.volume }),
});

export const toOfferPartyView = (offer: RequestOffer): OfferViewDto => ({
  createdAt: offer.createdAt,
  ...(offer.deliveryDays === undefined ? {} : { deliveryDays: offer.deliveryDays }),
  ...(offer.deliveryNote === undefined ? {} : { deliveryNote: offer.deliveryNote }),
  ...(offer.deliveryPriceUzs === undefined ? {} : { deliveryPriceUzs: offer.deliveryPriceUzs }),
  deliveryTerms: offer.deliveryTerms,
  id: offer.id,
  priceUzs: offer.priceUzs,
  requestPublicId: offer.requestPublicId,
  seller: { displayName: offer.seller.displayName, region: offer.seller.region },
  status: offer.status,
});

export const toOfferSelectionView = (result: OfferSelectionResult): OfferSelectionResultDto => ({
  contractId: result.contractId,
  offerId: result.offerId,
  requestPublicId: result.requestPublicId,
});
