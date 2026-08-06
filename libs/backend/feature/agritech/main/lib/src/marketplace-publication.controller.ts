// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { BadRequestException } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import type {
  AgriTechOwner,
  MarketplaceListingPublication,
  MarketplaceListingSection,
  MarketplaceListingSourceKind,
  MarketplaceOwnedListingPublication,
  MarketplaceOwnedRequestPublication,
  MarketplaceRequestPublication,
} from '@app/backend-feature-agritech-shared';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { MarketplacePublicService } from './marketplace-public.service';

const listingSections = ['equipment', 'seeds', 'produce'] as const;
const listingSourceKinds = ['product', 'produce'] as const;
const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const idempotencyHeaderSchema = {
  description: 'Actor- and source-scoped publication command key.',
  name: 'Idempotency-Key',
  required: true,
  schema: { maxLength: 100, minLength: 8, pattern: idempotencyKeyPattern.source, type: 'string' },
} as const;

const strictQueryInteger = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim();
  return /^(?:0|[1-9]\d*)$/u.test(normalized) ? Number(normalized) : value;
};

class MarketplaceOwnedPublicationsQueryDto {
  @ApiPropertyOptional({ default: 20, maximum: 50, minimum: 1, type: 'integer' })
  @IsOptional()
  @Transform(strictQueryInteger)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

class PublishMarketplaceListingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sellerPartnerId!: string;

  @ApiProperty({ enum: listingSourceKinds })
  @IsIn(listingSourceKinds)
  sourceKind!: MarketplaceListingSourceKind;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceId!: string;

  @ApiProperty({ enum: listingSections })
  @IsIn(listingSections)
  section!: MarketplaceListingSection;
}

class PublishMarketplaceRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  buyerPartnerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  requestId!: string;
}

export class MarketplaceListingPublicationDto implements MarketplaceListingPublication {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: listingSourceKinds }) sourceKind!: MarketplaceListingSourceKind;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
  @ApiProperty({ enum: listingSections }) section!: MarketplaceListingSection;
  @ApiProperty({ enum: ['published', 'paused', 'rejected'] }) status!: MarketplaceListingPublication['status'];
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] })
  moderationStatus!: MarketplaceListingPublication['moderationStatus'];
  @ApiProperty({ format: 'uuid' }) sellerPublicId!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiPropertyOptional({ format: 'date-time' }) publishedAt?: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class MarketplaceRequestPublicationDto implements MarketplaceRequestPublication {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty({ enum: ['published', 'paused', 'rejected'] }) status!: MarketplaceRequestPublication['status'];
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] })
  moderationStatus!: MarketplaceRequestPublication['moderationStatus'];
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiPropertyOptional({ format: 'date-time' }) publishedAt?: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class MarketplaceOwnedListingPublicationDto implements MarketplaceOwnedListingPublication {
  @ApiProperty({ enum: ['listing'] }) kind!: 'listing';
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: listingSourceKinds }) sourceKind!: MarketplaceListingSourceKind;
  @ApiProperty({ enum: listingSections }) section!: MarketplaceListingSection;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() titleRu?: string;
  @ApiPropertyOptional() titleUz?: string;
  @ApiPropertyOptional() titleUzCyrl?: string;
  @ApiProperty({ enum: ['published', 'paused', 'rejected'] }) status!: MarketplaceOwnedListingPublication['status'];
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] })
  moderationStatus!: MarketplaceOwnedListingPublication['moderationStatus'];
  @ApiProperty({ format: 'uuid' }) sellerPublicId!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiPropertyOptional({ format: 'date-time' }) publishedAt?: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class MarketplaceOwnedRequestPublicationDto implements MarketplaceOwnedRequestPublication {
  @ApiProperty({ enum: ['request'] }) kind!: 'request';
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() buyerDisplayName!: string;
  @ApiProperty({ enum: ['published', 'paused', 'rejected'] }) status!: MarketplaceOwnedRequestPublication['status'];
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] })
  moderationStatus!: MarketplaceOwnedRequestPublication['moderationStatus'];
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiPropertyOptional({ format: 'date-time' }) publishedAt?: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class MarketplaceOwnedPublicationsDto {
  @ApiProperty({ type: [MarketplaceOwnedListingPublicationDto] })
  listings!: MarketplaceOwnedListingPublication[];

  @ApiProperty({ type: [MarketplaceOwnedRequestPublicationDto] })
  requests!: MarketplaceOwnedRequestPublication[];
}

class MarketplaceListingModerationSellerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() region!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) contentRevision!: number;
  @ApiProperty() contentFingerprint!: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] }) moderationStatus!: string;
}

export class MarketplaceSellerProfileModerationItemDto {
  @ApiProperty({ format: 'uuid' }) sellerPublicId!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() region!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) contentRevision!: number;
  @ApiProperty({ maxLength: 64, minLength: 64 }) contentFingerprint!: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] }) moderationStatus!: string;
  @ApiProperty({ format: 'date-time' }) submittedAt!: Date;
}

class MarketplaceListingModerationContentDto {
  @ApiProperty() title!: string;
  @ApiPropertyOptional() titleRu?: string;
  @ApiPropertyOptional() titleUz?: string;
  @ApiPropertyOptional() titleUzCyrl?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ enum: ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] })
  category?: string;
  @ApiPropertyOptional() crop?: string;
  @ApiPropertyOptional({ enum: ['A', 'B', 'C'] }) grade?: string;
  @ApiProperty() unit!: string;
  @ApiProperty() region!: string;
  @ApiProperty({ type: [String] }) images!: string[];
}

class MarketplaceRequestModerationContentDto {
  @ApiProperty() title!: string;
  @ApiPropertyOptional() product?: string;
  @ApiPropertyOptional() volume?: string;
  @ApiProperty() region!: string;
  @ApiPropertyOptional({ format: 'date' }) deadline?: string;
  @ApiPropertyOptional({ type: 'integer' }) budgetUzs?: number;
  @ApiPropertyOptional() requirements?: string;
  @ApiProperty() buyerDisplayName!: string;
}

class MarketplaceListingModerationItemDto {
  @ApiProperty({ type: MarketplaceListingPublicationDto }) publication!: MarketplaceListingPublication;
  @ApiProperty({ type: MarketplaceListingModerationSellerDto }) seller!: MarketplaceListingModerationSellerDto;
  @ApiProperty({ type: MarketplaceListingModerationContentDto }) content!: MarketplaceListingModerationContentDto;
}

class MarketplaceRequestModerationItemDto {
  @ApiProperty({ type: MarketplaceRequestPublicationDto }) publication!: MarketplaceRequestPublication;
  @ApiProperty({ type: MarketplaceRequestModerationContentDto }) content!: MarketplaceRequestModerationContentDto;
}

export class MarketplacePublicModerationQueueDto {
  @ApiProperty({ type: [MarketplaceSellerProfileModerationItemDto] })
  sellerProfiles!: MarketplaceSellerProfileModerationItemDto[];
  @ApiProperty({ type: [MarketplaceListingModerationItemDto] }) listings!: MarketplaceListingModerationItemDto[];
  @ApiProperty({ type: [MarketplaceRequestModerationItemDto] }) requests!: MarketplaceRequestModerationItemDto[];
}

@ApiTags('marketplace-publications')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller('marketplace/publications')
export class MarketplacePublicationController {
  constructor(private readonly service: MarketplacePublicService) {}

  @Get('mine')
  @ApiOkDataResponse(MarketplaceOwnedPublicationsDto)
  async listMine(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: MarketplaceOwnedPublicationsQueryDto,
  ) {
    return createOkResponse(await this.service.listOwnedPublications(ownerFrom(principal), query.limit));
  }

  @Post('listings')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(idempotencyHeaderSchema)
  @ApiOkDataResponse(MarketplaceListingPublicationDto)
  async publishListing(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: PublishMarketplaceListingDto,
  ) {
    return createOkResponse(
      await this.service.publishListing(ownerFrom(principal), requireIdempotencyKey(idempotencyKey), {
        section: input.section,
        sellerPartnerId: input.sellerPartnerId,
        sourceId: input.sourceId,
        sourceKind: input.sourceKind,
      }),
    );
  }

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(idempotencyHeaderSchema)
  @ApiOkDataResponse(MarketplaceRequestPublicationDto)
  async publishRequest(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: PublishMarketplaceRequestDto,
  ) {
    return createOkResponse(
      await this.service.publishRequest(ownerFrom(principal), requireIdempotencyKey(idempotencyKey), {
        buyerPartnerId: input.buyerPartnerId,
        requestId: input.requestId,
      }),
    );
  }
}

const ownerFrom = (principal: AuthenticatedPrincipal): AgriTechOwner => ({
  tenantId: principal.tenantId,
  userId: principal.subject,
});

const requireIdempotencyKey = (value: string | undefined): string => {
  const key = value?.trim();
  if (!key || !idempotencyKeyPattern.test(key)) {
    throw new BadRequestException({ meta: { field: 'Idempotency-Key' } });
  }
  return key;
};
