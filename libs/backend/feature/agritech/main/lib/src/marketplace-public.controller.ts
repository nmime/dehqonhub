// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ResourceNotFoundException } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse } from '@app/backend-common-swagger';
import { Public } from '@app/backend-feature-auth-shared';
import type {
  MarketplaceCatalogSort,
  MarketplaceListingSection,
  MarketplacePublicListing,
  MarketplacePublicProduceListing,
  MarketplacePublicProductListing,
  MarketplacePublicRequest,
  MarketplacePublicListingRating,
  MarketplacePublicSeller,
  MarketplacePublicSuggestion,
} from '@app/backend-feature-agritech-shared';
import { MarketplacePublicService } from './marketplace-public.service';

const listingSections = ['equipment', 'seeds', 'produce'] as const;
const catalogSorts = ['newest', 'price_asc', 'price_desc'] as const;
const productCategories = ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] as const;
const maximumUzsAmount = 9_999_999_999_999;
const maximumAvailableQuantity = 2_147_483_647;
const safeQueryTextPattern = /^[^\p{Cc}\p{Cf}]+$/u;

const strictQueryInteger = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim();
  return /^(?:0|[1-9]\d*)$/u.test(normalized) ? Number(normalized) : value;
};

const strictQueryBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
};

const normalizedQueryText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

class MarketplacePublicCatalogQueryDto {
  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ maximum: 50, minimum: 1, type: 'integer' })
  @IsOptional()
  @Transform(strictQueryInteger)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(normalizedQueryText)
  @IsString()
  @Matches(/\S/u)
  @Matches(safeQueryTextPattern)
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(normalizedQueryText)
  @IsString()
  @Matches(/\S/u)
  @Matches(safeQueryTextPattern)
  @MaxLength(200)
  region?: string;

  @ApiPropertyOptional({ enum: listingSections })
  @IsOptional()
  @IsIn(listingSections)
  section?: MarketplaceListingSection;

  @ApiPropertyOptional({ enum: productCategories })
  @IsOptional()
  @IsIn(productCategories)
  category?: MarketplacePublicProductListing['category'];

  @ApiPropertyOptional({ maxLength: 200, minLength: 1 })
  @IsOptional()
  @Transform(normalizedQueryText)
  @IsString()
  @Matches(/\S/u)
  @Matches(safeQueryTextPattern)
  @MaxLength(200)
  crop?: string;

  @ApiPropertyOptional({ maximum: maximumUzsAmount, minimum: 0, type: 'integer' })
  @IsOptional()
  @Transform(strictQueryInteger)
  @IsInt()
  @Min(0)
  @Max(maximumUzsAmount)
  minPriceUzs?: number;

  @ApiPropertyOptional({ maximum: maximumUzsAmount, minimum: 0, type: 'integer' })
  @IsOptional()
  @Transform(strictQueryInteger)
  @IsInt()
  @Min(0)
  @Max(maximumUzsAmount)
  maxPriceUzs?: number;

  @ApiPropertyOptional({ maximum: maximumAvailableQuantity, minimum: 1, type: 'integer' })
  @IsOptional()
  @Transform(strictQueryInteger)
  @IsInt()
  @Min(1)
  @Max(maximumAvailableQuantity)
  minAvailableQuantity?: number;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @Transform(strictQueryBoolean)
  @IsBoolean()
  sampleAvailable?: boolean;

  @ApiPropertyOptional({ enum: catalogSorts })
  @IsOptional()
  @IsIn(catalogSorts)
  sort?: MarketplaceCatalogSort;
}

class MarketplacePublicRequestsQueryDto {
  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ maximum: 50, minimum: 1, type: 'integer' })
  @IsOptional()
  @Transform(strictQueryInteger)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(normalizedQueryText)
  @IsString()
  @Matches(/\S/u)
  @Matches(safeQueryTextPattern)
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(normalizedQueryText)
  @IsString()
  @Matches(/\S/u)
  @Matches(safeQueryTextPattern)
  @MaxLength(200)
  region?: string;
}

class MarketplacePublicSuggestionQueryDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(normalizedQueryText)
  @IsString()
  @Matches(/\S/u)
  @Matches(safeQueryTextPattern)
  @MaxLength(200)
  q!: string;

  @ApiPropertyOptional({ maximum: 10, minimum: 1, type: 'integer' })
  @IsOptional()
  @Transform(strictQueryInteger)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

class MarketplacePublicSellerDto implements MarketplacePublicSeller {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() region!: string;
  @ApiProperty() verified!: boolean;
  @ApiProperty({ enum: ['live', 'demo'] }) provenance!: MarketplacePublicSeller['provenance'];
  @ApiPropertyOptional() description?: string;
}

class MarketplacePublicListingRatingDto implements MarketplacePublicListingRating {
  @ApiProperty({ maximum: 5, minimum: 1, nullable: true, type: 'number' }) average!: number | null;
  @ApiProperty({ minimum: 0, type: 'integer' }) count!: number;
}

abstract class MarketplacePublicListingBaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() titleRu?: string;
  @ApiPropertyOptional() titleUz?: string;
  @ApiPropertyOptional() titleUzCyrl?: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ type: 'integer' }) priceUzs!: number;
  @ApiProperty() unit!: string;
  @ApiProperty({ type: 'integer' }) availableQuantity!: number;
  @ApiProperty() region!: string;
  @ApiProperty({ type: [String] }) images!: string[];
  @ApiProperty() promoted!: boolean;
  @ApiProperty({ enum: ['live', 'demo'] }) provenance!: MarketplacePublicListing['provenance'];
  @ApiProperty() transactional!: boolean;
  @ApiProperty() sampleAvailable!: boolean;
  @ApiProperty({ type: MarketplacePublicListingRatingDto }) rating!: MarketplacePublicListingRating;
  @ApiProperty({ type: MarketplacePublicSellerDto }) seller!: MarketplacePublicSeller;
  @ApiProperty({ format: 'date-time' }) publishedAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class MarketplacePublicProductListingDto
  extends MarketplacePublicListingBaseDto
  implements MarketplacePublicProductListing
{
  @ApiProperty({ enum: ['product'] }) kind!: 'product';
  @ApiProperty({ enum: ['equipment', 'seeds'] }) section!: 'equipment' | 'seeds';
  @ApiProperty({ enum: productCategories }) category!: MarketplacePublicProductListing['category'];
}

class MarketplacePublicProduceListingDto
  extends MarketplacePublicListingBaseDto
  implements MarketplacePublicProduceListing
{
  @ApiProperty({ enum: ['produce'] }) kind!: 'produce';
  @ApiProperty({ enum: ['produce'] }) section!: 'produce';
  @ApiProperty() crop!: string;
  @ApiProperty({ enum: ['A', 'B', 'C'] }) grade!: MarketplacePublicProduceListing['grade'];
}

const marketplacePublicListingSchema = {
  discriminator: {
    mapping: {
      produce: getSchemaPath(MarketplacePublicProduceListingDto),
      product: getSchemaPath(MarketplacePublicProductListingDto),
    },
    propertyName: 'kind',
  },
  oneOf: [
    { $ref: getSchemaPath(MarketplacePublicProductListingDto) },
    { $ref: getSchemaPath(MarketplacePublicProduceListingDto) },
  ],
};

class MarketplacePublicCatalogPageDto {
  @ApiProperty({ items: marketplacePublicListingSchema, type: 'array' }) items!: MarketplacePublicListing[];
  @ApiPropertyOptional() nextCursor?: string;
}

class MarketplacePublicRequestDto implements MarketplacePublicRequest {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() product?: string;
  @ApiPropertyOptional() volume?: string;
  @ApiProperty() region!: string;
  @ApiPropertyOptional({ format: 'date' }) deadline?: string;
  @ApiPropertyOptional({ type: 'integer' }) budgetUzs?: number;
  @ApiPropertyOptional() requirements?: string;
  @ApiProperty() buyerDisplayName!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class MarketplacePublicRequestPageDto {
  @ApiProperty({ type: [MarketplacePublicRequestDto] }) items!: MarketplacePublicRequest[];
  @ApiPropertyOptional() nextCursor?: string;
}

class MarketplacePublicSuggestionDto implements MarketplacePublicSuggestion {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['listing', 'seller', 'request'] }) kind!: MarketplacePublicSuggestion['kind'];
  @ApiProperty() label!: string;
  @ApiPropertyOptional({ enum: listingSections }) section?: MarketplaceListingSection;
}

class MarketplacePublicSuggestionListDto {
  @ApiProperty({ type: [MarketplacePublicSuggestionDto] }) items!: MarketplacePublicSuggestion[];
}

@ApiTags('marketplace-public')
@ApiExceptions(400, 404, 500)
@ApiExtraModels(MarketplacePublicProductListingDto, MarketplacePublicProduceListingDto)
@Public()
@Controller('marketplace/public')
export class MarketplacePublicController {
  constructor(private readonly service: MarketplacePublicService) {}

  @Get('catalog')
  @ApiOkDataResponse(MarketplacePublicCatalogPageDto)
  async listCatalog(@Query() query: MarketplacePublicCatalogQueryDto) {
    return createOkResponse(
      await this.service.listCatalog({
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.q ? { query: query.q } : {}),
        ...(query.region ? { region: query.region } : {}),
        ...(query.section ? { section: query.section } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.crop ? { crop: query.crop } : {}),
        ...(query.minPriceUzs !== undefined ? { minPriceUzs: query.minPriceUzs } : {}),
        ...(query.maxPriceUzs !== undefined ? { maxPriceUzs: query.maxPriceUzs } : {}),
        ...(query.minAvailableQuantity !== undefined ? { minAvailableQuantity: query.minAvailableQuantity } : {}),
        ...(query.sampleAvailable !== undefined ? { sampleAvailable: query.sampleAvailable } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
      }),
    );
  }

  @Get('catalog/suggestions')
  @ApiOkDataResponse(MarketplacePublicSuggestionListDto)
  async listSuggestions(@Query() query: MarketplacePublicSuggestionQueryDto) {
    return createOkResponse({ items: await this.service.listSuggestions(query.q, query.limit) });
  }

  @Get('catalog/:listingId')
  @ApiOkResponse({
    description: 'OK',
    schema: {
      properties: { data: marketplacePublicListingSchema },
      required: ['data'],
      type: 'object',
    },
  })
  async getListing(@Param('listingId', ParseUUIDPipe) listingId: string) {
    const listing = await this.service.getListing(listingId);
    if (!listing) {
      throw new ResourceNotFoundException('marketplace-public-listing');
    }
    return createOkResponse(listing);
  }

  @Get('sellers/:sellerId')
  @ApiOkDataResponse(MarketplacePublicSellerDto)
  async getSeller(@Param('sellerId', ParseUUIDPipe) sellerId: string) {
    const seller = await this.service.getSeller(sellerId);
    if (!seller) {
      throw new ResourceNotFoundException('marketplace-public-seller');
    }
    return createOkResponse(seller);
  }

  @Get('sellers/:sellerId/catalog')
  @ApiOkDataResponse(MarketplacePublicCatalogPageDto)
  async listSellerCatalog(
    @Param('sellerId', ParseUUIDPipe) sellerId: string,
    @Query() query: MarketplacePublicCatalogQueryDto,
  ) {
    return createOkResponse(
      await this.service.listSellerCatalog(sellerId, {
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.q ? { query: query.q } : {}),
        ...(query.region ? { region: query.region } : {}),
        ...(query.section ? { section: query.section } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.crop ? { crop: query.crop } : {}),
        ...(query.minPriceUzs !== undefined ? { minPriceUzs: query.minPriceUzs } : {}),
        ...(query.maxPriceUzs !== undefined ? { maxPriceUzs: query.maxPriceUzs } : {}),
        ...(query.minAvailableQuantity !== undefined ? { minAvailableQuantity: query.minAvailableQuantity } : {}),
        ...(query.sampleAvailable !== undefined ? { sampleAvailable: query.sampleAvailable } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
      }),
    );
  }

  @Get('requests')
  @ApiOkDataResponse(MarketplacePublicRequestPageDto)
  async listRequests(@Query() query: MarketplacePublicRequestsQueryDto) {
    return createOkResponse(
      await this.service.listRequests({
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.q ? { query: query.q } : {}),
        ...(query.region ? { region: query.region } : {}),
      }),
    );
  }
}
