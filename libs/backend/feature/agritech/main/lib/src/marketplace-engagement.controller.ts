// @requirements REQ-AGRITECH-ENGAGEMENT-019
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BadRequestException } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { CurrentUser, Public, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import type { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import { MarketplaceEngagementService } from './marketplace-engagement.service';
import {
  MarketplaceFavoriteListDto,
  MarketplaceFavoriteMutationDto,
  MarketplaceReviewDto,
  MarketplaceReviewPageDto,
  MarketplaceReviewReportReceiptDto,
  MarketplaceReviewSelfStateDto,
  MarketplaceSampleDto,
  MarketplaceSampleListDto,
  MarketplaceSampleUsageDto,
  toMarketplaceFavoriteDto,
  toMarketplaceFavoriteMutationDto,
  toMarketplaceReviewDto,
  toMarketplaceReviewPageDto,
  toMarketplaceReviewReportReceiptDto,
  toMarketplaceReviewSelfStateDto,
  toMarketplaceSampleDto,
  toMarketplaceSampleUsageDto,
} from './marketplace-engagement.view-dto';

const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const publicAssetReferencePattern = /^public-asset:[A-Za-z0-9_-]{8,100}$/u;
const maximumUzsAmount = 9_999_999_999_999;
const idempotencyHeader = {
  description: 'Command key. An exact replay returns the persisted original result.',
  name: 'Idempotency-Key',
  required: true,
  schema: { maxLength: 100, minLength: 8, pattern: idempotencyKeyPattern.source, type: 'string' },
};

class RequestMarketplaceSampleDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() listingPublicationId!: string;
  @ApiProperty({ enum: ['pickup', 'seller_delivery'] })
  @IsIn(['pickup', 'seller_delivery'])
  deliveryMethod!: 'pickup' | 'seller_delivery';
}

class TransitionMarketplaceSampleDto {
  @ApiProperty({ enum: ['approve', 'cancel', 'decline', 'receive', 'ship'] })
  @IsIn(['approve', 'cancel', 'decline', 'receive', 'ship'])
  action!: 'approve' | 'cancel' | 'decline' | 'receive' | 'ship';

  @ApiProperty({ minimum: 0, type: 'integer' }) @IsInt() @Min(0) expectedRevision!: number;

  @ApiPropertyOptional({ maximum: maximumUzsAmount, minimum: 0, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(maximumUzsAmount)
  deliveryQuoteUzs?: number;
}

class SubmitMarketplaceSampleFeedbackDto {
  @ApiProperty({ maximum: 5, minimum: 1, type: 'integer' }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(1_000)
  comment?: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) @IsInt() @Min(0) expectedRevision!: number;
}

class SubmitMarketplaceReviewDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() listingPublicationId!: string;
  @ApiProperty({ maximum: 5, minimum: 1, type: 'integer' }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(2_000)
  comment?: string;
  @ApiProperty({ format: 'public-asset:<opaque-id>', maxItems: 3, type: [String] })
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(publicAssetReferencePattern, { each: true })
  assetReferences!: string[];
}

class ReplyMarketplaceReviewDto {
  @ApiProperty({ maxLength: 1_000 }) @IsString() @Matches(/\S/u) @MaxLength(1_000) comment!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) @IsInt() @Min(0) expectedRevision!: number;
}

class ReportMarketplaceReviewDto {
  @ApiProperty({ enum: ['abuse', 'off_topic', 'privacy', 'spam'] })
  @IsIn(['abuse', 'off_topic', 'privacy', 'spam'])
  reason!: 'abuse' | 'off_topic' | 'privacy' | 'spam';
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(500)
  comment?: string;
}

@ApiTags('marketplace-engagement')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller('marketplace')
export class MarketplaceEngagementController {
  constructor(private readonly service: MarketplaceEngagementService) {}

  @Post('favorites/:listingPublicationId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'listingPublicationId' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceFavoriteMutationDto)
  async addFavorite(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('listingPublicationId', ParseUUIDPipe) listingPublicationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return createOkResponse(
      toMarketplaceFavoriteMutationDto(
        await this.service.addFavorite(
          ownerFrom(principal),
          listingPublicationId,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Delete('favorites/:listingPublicationId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'listingPublicationId' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceFavoriteMutationDto)
  async removeFavorite(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('listingPublicationId', ParseUUIDPipe) listingPublicationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return createOkResponse(
      toMarketplaceFavoriteMutationDto(
        await this.service.removeFavorite(
          ownerFrom(principal),
          listingPublicationId,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Get('favorites')
  @ApiOkDataResponse(MarketplaceFavoriteListDto)
  async listFavorites(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({
      items: (await this.service.listFavorites(ownerFrom(principal))).map(toMarketplaceFavoriteDto),
    });
  }

  @Post('samples')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceSampleDto)
  async requestSample(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: RequestMarketplaceSampleDto,
  ) {
    return createOkResponse(
      toMarketplaceSampleDto(
        await this.service.requestSample(ownerFrom(principal), input, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  @Get('samples')
  @ApiOkDataResponse(MarketplaceSampleListDto)
  async listSamples(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({
      items: (await this.service.listSamples(ownerFrom(principal))).map(toMarketplaceSampleDto),
    });
  }

  @Get('samples/usage')
  @ApiOkDataResponse(MarketplaceSampleUsageDto)
  async getSampleUsage(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(toMarketplaceSampleUsageDto(await this.service.getSampleUsage(ownerFrom(principal))));
  }

  @Patch('samples/:sampleId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'sampleId' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceSampleDto)
  async transitionSample(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('sampleId', ParseUUIDPipe) sampleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: TransitionMarketplaceSampleDto,
  ) {
    return createOkResponse(
      toMarketplaceSampleDto(
        await this.service.transitionSample(
          ownerFrom(principal),
          sampleId,
          input,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Post('samples/:sampleId/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'sampleId' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceSampleDto)
  async submitSampleFeedback(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('sampleId', ParseUUIDPipe) sampleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: SubmitMarketplaceSampleFeedbackDto,
  ) {
    return createOkResponse(
      toMarketplaceSampleDto(
        await this.service.submitSampleFeedback(
          ownerFrom(principal),
          sampleId,
          input,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Post('reviews')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceReviewDto)
  async submitReview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: SubmitMarketplaceReviewDto,
  ) {
    return createOkResponse(
      toMarketplaceReviewDto(
        await this.service.submitReview(ownerFrom(principal), input, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  /**
   * The caller's own standing with one listing's ratings. The public review read
   * is author-free by design, so a browser cannot infer from it whether the review
   * it is looking at is its own; this read says so from persisted eligibility
   * instead, which is also what the write path enforces.
   */
  @Get('reviews/state/:listingPublicationId')
  @ApiParam({ format: 'uuid', name: 'listingPublicationId' })
  @ApiOkDataResponse(MarketplaceReviewSelfStateDto)
  async getReviewSelfState(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('listingPublicationId', ParseUUIDPipe) listingPublicationId: string,
  ) {
    return createOkResponse(
      toMarketplaceReviewSelfStateDto(
        await this.service.getReviewSelfState(ownerFrom(principal), listingPublicationId),
      ),
    );
  }

  @Post('reviews/:reviewId/reply')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'reviewId' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceReviewDto)
  async replyToReview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ReplyMarketplaceReviewDto,
  ) {
    return createOkResponse(
      toMarketplaceReviewDto(
        await this.service.replyToReview(ownerFrom(principal), reviewId, input, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  @Post('reviews/:reviewId/reports')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'reviewId' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceReviewReportReceiptDto)
  async reportReview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ReportMarketplaceReviewDto,
  ) {
    return createOkResponse(
      toMarketplaceReviewReportReceiptDto(
        await this.service.reportReview(ownerFrom(principal), reviewId, input, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }
}

@ApiTags('marketplace-public-engagement')
@ApiExceptions(400, 404, 500)
@Public()
@Controller('marketplace/public/catalog')
export class MarketplacePublicEngagementController {
  constructor(private readonly service: MarketplaceEngagementService) {}

  @Get(':listingPublicationId/reviews')
  @ApiParam({ format: 'uuid', name: 'listingPublicationId' })
  @ApiOkDataResponse(MarketplaceReviewPageDto)
  async listReviews(@Param('listingPublicationId', ParseUUIDPipe) listingPublicationId: string) {
    return createOkResponse(toMarketplaceReviewPageDto(await this.service.listPublicReviews(listingPublicationId)));
  }
}

const ownerFrom = (principal: AuthenticatedPrincipal): AgriTechOwner => ({
  tenantId: principal.tenantId,
  userId: principal.subject,
});

const requireIdempotencyKey = (value: string | undefined): string => {
  if (!value || !idempotencyKeyPattern.test(value)) {
    throw new BadRequestException({ meta: { field: 'idempotencyKey', resourceType: 'marketplace-engagement' } });
  }
  return value;
};
