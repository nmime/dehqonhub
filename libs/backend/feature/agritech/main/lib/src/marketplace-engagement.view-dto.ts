// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  MarketplaceEngagementListingSummary,
  MarketplaceFavoriteMutationResult,
  MarketplaceFavoriteView,
  MarketplaceReviewModerationItem,
  MarketplaceReviewModerationResult,
  MarketplaceReviewPage,
  MarketplaceReviewReportReceipt,
  MarketplaceReviewView,
  MarketplaceSamplePolicyView,
  MarketplaceSampleUsageView,
  MarketplaceSampleView,
} from '@app/backend-feature-agritech-shared';

export class MarketplaceEngagementSellerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}

export class MarketplaceEngagementListingDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['produce', 'product'] }) kind!: 'produce' | 'product';
  @ApiProperty() title!: string;
  @ApiPropertyOptional() titleRu?: string;
  @ApiPropertyOptional() titleUz?: string;
  @ApiPropertyOptional() titleUzCyrl?: string;
  @ApiProperty() sampleAvailable!: boolean;
  @ApiProperty({ type: MarketplaceEngagementSellerDto }) seller!: MarketplaceEngagementSellerDto;
}

export class MarketplaceFavoriteMutationDto {
  @ApiProperty({ format: 'uuid' }) listingPublicationId!: string;
  @ApiProperty() favorited!: boolean;
}

export class MarketplaceFavoriteDto {
  @ApiProperty({ type: MarketplaceEngagementListingDto }) listing!: MarketplaceEngagementListingDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class MarketplaceFavoriteListDto {
  @ApiProperty({ isArray: true, type: MarketplaceFavoriteDto }) items!: MarketplaceFavoriteDto[];
}

export class MarketplaceSampleDeliveryDto {
  @ApiProperty({ enum: ['pickup', 'seller_delivery'] }) method!: 'pickup' | 'seller_delivery';
  @ApiProperty({ enum: [true] }) requesterPays!: true;
  @ApiProperty({ enum: [0], type: 'integer' }) itemPriceUzs!: 0;
  @ApiPropertyOptional({ minimum: 0, type: 'integer' }) quoteUzs?: number;
}

export class MarketplaceSampleFeedbackDto {
  @ApiProperty({ maximum: 5, minimum: 1, type: 'integer' }) rating!: number;
  @ApiPropertyOptional() comment?: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class MarketplaceSampleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: MarketplaceEngagementListingDto }) listing!: MarketplaceEngagementListingDto;
  @ApiProperty({ enum: ['requester', 'seller'] }) actorRole!: 'requester' | 'seller';
  @ApiProperty({ pattern: '^\\d{4}-Q[1-4]$' }) seasonKey!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) policyVersion!: number;
  @ApiProperty({ enum: ['requested', 'approved', 'declined', 'cancelled', 'shipped', 'received'] })
  status!: 'requested' | 'approved' | 'declined' | 'cancelled' | 'shipped' | 'received';
  @ApiProperty({ type: MarketplaceSampleDeliveryDto }) delivery!: MarketplaceSampleDeliveryDto;
  @ApiPropertyOptional({ type: MarketplaceSampleFeedbackDto }) feedback?: MarketplaceSampleFeedbackDto;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class MarketplaceSampleListDto {
  @ApiProperty({ isArray: true, type: MarketplaceSampleDto }) items!: MarketplaceSampleDto[];
}

export class MarketplaceSampleUsageDto {
  @ApiProperty({ pattern: '^\\d{4}-(?:0[1-9]|1[0-2])$' }) period!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) used!: number;
  @ApiProperty({ minimum: 1, type: 'integer' }) limit!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) remaining!: number;
  @ApiProperty({ minimum: 1, type: 'integer' }) policyVersion!: number;
}

export class MarketplaceSamplePolicyDto {
  @ApiProperty({ minimum: 1, type: 'integer' }) version!: number;
  @ApiProperty({ maximum: 100, minimum: 1, type: 'integer' }) monthlyLimit!: number;
  @ApiProperty({ format: 'date-time' }) activeFrom!: Date;
}

export class MarketplaceReviewReplyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() comment!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class MarketplaceReviewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) listingPublicationId!: string;
  @ApiProperty({ maximum: 5, minimum: 1, type: 'integer' }) rating!: number;
  @ApiPropertyOptional() comment?: string;
  @ApiProperty({ type: [String] }) assetReferences!: string[];
  @ApiProperty({ enum: [true] }) verifiedDeal!: true;
  @ApiPropertyOptional({ type: MarketplaceReviewReplyDto }) reply?: MarketplaceReviewReplyDto;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class MarketplaceReviewAggregateDto {
  @ApiProperty({ format: 'uuid' }) listingPublicationId!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) reviewCount!: number;
  @ApiProperty({ maximum: 5, minimum: 1, nullable: true, type: 'number' }) averageRating!: number | null;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
}

export class MarketplaceReviewPageDto {
  @ApiProperty({ type: MarketplaceReviewAggregateDto }) aggregate!: MarketplaceReviewAggregateDto;
  @ApiProperty({ isArray: true, type: MarketplaceReviewDto }) items!: MarketplaceReviewDto[];
}

export class MarketplaceReviewReportReceiptDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['pending'] }) status!: 'pending';
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class MarketplaceReviewModerationItemDto {
  @ApiProperty({ format: 'uuid' }) reportId!: string;
  @ApiProperty({ enum: ['abuse', 'off_topic', 'privacy', 'spam'] }) reason!: 'abuse' | 'off_topic' | 'privacy' | 'spam';
  @ApiPropertyOptional() reportComment?: string;
  @ApiProperty({ type: MarketplaceReviewDto }) review!: MarketplaceReviewDto;
  @ApiProperty({ minimum: 0, type: 'integer' }) expectedRevision!: number;
  @ApiProperty({ format: 'date-time' }) submittedAt!: Date;
}

export class MarketplaceReviewModerationQueueDto {
  @ApiProperty({ isArray: true, type: MarketplaceReviewModerationItemDto })
  items!: MarketplaceReviewModerationItemDto[];
}

export class MarketplaceReviewModerationResultDto {
  @ApiProperty({ format: 'uuid' }) reportId!: string;
  @ApiProperty({ enum: ['dismissed', 'hidden'] }) decision!: 'dismissed' | 'hidden';
  @ApiProperty() reviewVisible!: boolean;
  @ApiProperty({ type: MarketplaceReviewAggregateDto }) aggregate!: MarketplaceReviewAggregateDto;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ format: 'date-time' }) decidedAt!: Date;
}

export const toMarketplaceFavoriteMutationDto = (
  value: MarketplaceFavoriteMutationResult,
): MarketplaceFavoriteMutationDto => ({
  favorited: value.favorited,
  listingPublicationId: value.listingPublicationId,
});

export const toMarketplaceFavoriteDto = (value: MarketplaceFavoriteView): MarketplaceFavoriteDto => ({
  createdAt: value.createdAt,
  listing: toMarketplaceListingDto(value.listing),
});

export const toMarketplaceSampleDto = (value: MarketplaceSampleView): MarketplaceSampleDto => ({
  actorRole: value.actorRole,
  createdAt: value.createdAt,
  delivery: {
    itemPriceUzs: 0,
    method: value.delivery.method,
    requesterPays: true,
    ...(value.delivery.quoteUzs !== undefined ? { quoteUzs: value.delivery.quoteUzs } : {}),
  },
  ...(value.feedback
    ? {
        feedback: {
          ...(value.feedback.comment !== undefined ? { comment: value.feedback.comment } : {}),
          createdAt: value.feedback.createdAt,
          rating: value.feedback.rating,
        },
      }
    : {}),
  id: value.id,
  listing: toMarketplaceListingDto(value.listing),
  policyVersion: value.policyVersion,
  revision: value.revision,
  seasonKey: value.seasonKey,
  status: value.status,
  updatedAt: value.updatedAt,
});

export const toMarketplaceSampleUsageDto = (value: MarketplaceSampleUsageView): MarketplaceSampleUsageDto => ({
  limit: value.limit,
  period: value.period,
  policyVersion: value.policyVersion,
  remaining: value.remaining,
  used: value.used,
});

export const toMarketplaceSamplePolicyDto = (value: MarketplaceSamplePolicyView): MarketplaceSamplePolicyDto => ({
  activeFrom: value.activeFrom,
  monthlyLimit: value.monthlyLimit,
  version: value.version,
});

export const toMarketplaceReviewDto = (value: MarketplaceReviewView): MarketplaceReviewDto => ({
  assetReferences: [...value.assetReferences],
  ...(value.comment !== undefined ? { comment: value.comment } : {}),
  createdAt: value.createdAt,
  id: value.id,
  listingPublicationId: value.listingPublicationId,
  rating: value.rating,
  ...(value.reply
    ? {
        reply: {
          comment: value.reply.comment,
          createdAt: value.reply.createdAt,
          id: value.reply.id,
          revision: value.reply.revision,
          updatedAt: value.reply.updatedAt,
        },
      }
    : {}),
  revision: value.revision,
  updatedAt: value.updatedAt,
  verifiedDeal: true,
});

export const toMarketplaceReviewPageDto = (value: MarketplaceReviewPage): MarketplaceReviewPageDto => ({
  aggregate: {
    averageRating: value.aggregate.averageRating,
    listingPublicationId: value.aggregate.listingPublicationId,
    reviewCount: value.aggregate.reviewCount,
    revision: value.aggregate.revision,
  },
  items: value.items.map(toMarketplaceReviewDto),
});

export const toMarketplaceReviewReportReceiptDto = (
  value: MarketplaceReviewReportReceipt,
): MarketplaceReviewReportReceiptDto => ({
  createdAt: value.createdAt,
  id: value.id,
  revision: value.revision,
  status: 'pending',
});

export const toMarketplaceReviewModerationItemDto = (
  value: MarketplaceReviewModerationItem,
): MarketplaceReviewModerationItemDto => ({
  expectedRevision: value.expectedRevision,
  ...(value.reportComment !== undefined ? { reportComment: value.reportComment } : {}),
  reason: value.reason,
  reportId: value.reportId,
  review: toMarketplaceReviewDto(value.review),
  submittedAt: value.submittedAt,
});

export const toMarketplaceReviewModerationResultDto = (
  value: MarketplaceReviewModerationResult,
): MarketplaceReviewModerationResultDto => ({
  aggregate: {
    averageRating: value.aggregate.averageRating,
    listingPublicationId: value.aggregate.listingPublicationId,
    reviewCount: value.aggregate.reviewCount,
    revision: value.aggregate.revision,
  },
  decidedAt: value.decidedAt,
  decision: value.decision,
  reportId: value.reportId,
  reviewVisible: value.reviewVisible,
  revision: value.revision,
});

const toMarketplaceListingDto = (value: MarketplaceEngagementListingSummary): MarketplaceEngagementListingDto => ({
  id: value.id,
  kind: value.kind,
  sampleAvailable: value.sampleAvailable,
  seller: { displayName: value.seller.displayName, id: value.seller.id },
  title: value.title,
  ...(value.titleRu !== undefined ? { titleRu: value.titleRu } : {}),
  ...(value.titleUz !== undefined ? { titleUz: value.titleUz } : {}),
  ...(value.titleUzCyrl !== undefined ? { titleUzCyrl: value.titleUzCyrl } : {}),
});
