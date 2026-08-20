// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-ADVISORY-009 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-ROUTING-015 REQ-AGRITECH-ENGAGEMENT-019
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsBoolean,
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
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { AgriTechOperationsService } from './agritech.service';
import type { AgriTechOwner, DeliveryStatus, ProduceGrade } from '@app/backend-feature-agritech-shared';
import {
  AdvisoryListDto,
  AssignedFarmerListDto,
  CreatedResourceDto,
  DeliveryListDto,
  DeliveryViewDto,
  FieldVisitViewDto,
  PartnerListDto,
  PartnerViewDto,
  PriceDiscoveryViewDto,
  ProduceListingListDto,
  ProduceListingViewDto,
  ProduceReservationViewDto,
  SupplierProductListDto,
  SupplierProductViewDto,
} from './agritech.view-dto';

const partnerKinds = ['supplier', 'buyer'] as const;
const produceGrades = ['A', 'B', 'C'] as const;
const productCategories = ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] as const;
const deliveryStatuses = ['assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled'] as const;
const maximumIntegerQuantity = 2_147_483_647;
const maximumSupplierPriceUzs = 9_999_999_999_999;
/**
 * How many photographs one listing may carry.
 *
 * `ck__marketplace_listing_publications__content` refuses a snapshot holding
 * more than five images, and the publication projection slices the source array
 * to the same bound. Rejecting the sixth here tells the seller which field is
 * wrong instead of letting the photograph disappear at publication time.
 */
const maximumSupplierProductImages = 5;
/**
 * The only shape a listing photograph may take.
 *
 * Listing images are root-relative paths into the checked-in, same-origin media
 * directory. Every deployment sends `img-src 'self' data:`, so a URL to any
 * other host resolves in a dev server and then silently fails in production,
 * and `/marketplace/` is a reserved API namespace. Pinning the prefix, the
 * character class and the extension rejects a remote host, a traversal segment
 * and a non-image path in one predicate rather than storing a string the
 * catalog cannot render.
 */
const supplierProductImagePattern = /^\/media\/marketplace\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/u;

class CreatePartnerDto {
  @ApiProperty({ enum: partnerKinds }) @IsIn(partnerKinds) kind!: 'supplier' | 'buyer';
  @ApiProperty() @IsString() legalName!: string;
  @ApiProperty() @IsString() taxId!: string;
  @ApiProperty({ example: '+998901234567' }) @IsString() phone!: string;
  @ApiProperty() @IsString() region!: string;
}

class CreateSupplierProductDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() partnerId!: string;
  @ApiProperty({ maxLength: 200, minLength: 1 }) @IsString() @Matches(/\S/u) @MaxLength(200) name!: string;
  @ApiPropertyOptional({ maxLength: 200, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  nameRu?: string;
  @ApiPropertyOptional({ maxLength: 200, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  nameUz?: string;
  @ApiPropertyOptional({ maxLength: 200, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  nameUzCyrl?: string;
  @ApiProperty({ enum: productCategories }) @IsIn(productCategories) category!: (typeof productCategories)[number];
  @ApiProperty() @IsString() description!: string;
  @ApiProperty({ maximum: maximumSupplierPriceUzs, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(maximumSupplierPriceUzs)
  priceUzs!: number;
  @ApiProperty() @IsString() unit!: string;
  @ApiProperty({ maximum: maximumIntegerQuantity, minimum: 0, type: 'integer' })
  @IsInt()
  @Min(0)
  @Max(maximumIntegerQuantity)
  stockQuantity!: number;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() sampleAvailable?: boolean;
  @ApiProperty() @IsString() region!: string;
  @ApiPropertyOptional({
    description: 'Root-relative same-origin listing photographs, at most five.',
    example: ['/media/marketplace/wheat-grain.webp'],
    maxItems: maximumSupplierProductImages,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(maximumSupplierProductImages)
  @IsString({ each: true })
  @Matches(supplierProductImagePattern, { each: true })
  images?: string[];
}

class UpdateSupplierProductDto {
  @ApiPropertyOptional({ maxLength: 200, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional({ maxLength: 200, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  nameRu?: string;
  @ApiPropertyOptional({ maxLength: 200, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  nameUz?: string;
  @ApiPropertyOptional({ maxLength: 200, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  nameUzCyrl?: string;
  @ApiProperty({ maximum: maximumSupplierPriceUzs, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(maximumSupplierPriceUzs)
  priceUzs!: number;
  @ApiProperty({ maximum: maximumIntegerQuantity, minimum: 0, type: 'integer' })
  @IsInt()
  @Min(0)
  @Max(maximumIntegerQuantity)
  stockQuantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sampleAvailable?: boolean;
  @ApiProperty({ enum: ['active', 'inactive', 'out_of_stock'] })
  @IsIn(['active', 'inactive', 'out_of_stock'])
  status!: 'active' | 'inactive' | 'out_of_stock';
}

class CreateProduceDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() supplierPartnerId!: string;
  @ApiProperty() @IsString() crop!: string;
  @ApiProperty({ enum: produceGrades }) @IsIn(produceGrades) grade!: ProduceGrade;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) quantityKg!: number;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() sampleAvailable?: boolean;
  @ApiProperty({ maximum: maximumSupplierPriceUzs, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(maximumSupplierPriceUzs)
  pricePerKgUzs!: number;
  @ApiProperty() @IsString() region!: string;
  @ApiProperty({ format: 'date-time' }) @Type(() => Date) @IsDate() availableFrom!: Date;
  @ApiProperty({ format: 'date-time' }) @Type(() => Date) @IsDate() availableUntil!: Date;
}

class UpdateSampleAvailabilityDto {
  @ApiProperty() @IsBoolean() sampleAvailable!: boolean;
}

class ProduceQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() crop?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional({ enum: produceGrades }) @IsOptional() @IsIn(produceGrades) grade?: ProduceGrade;
}

class PriceQueryDto {
  @ApiProperty() @IsString() crop!: string;
  @ApiProperty() @IsString() region!: string;
  @ApiPropertyOptional({ enum: produceGrades }) @IsOptional() @IsIn(produceGrades) grade?: ProduceGrade;
}

class ReserveProduceDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() partnerId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) quantityKg!: number;
  @ApiProperty() @IsString() deliveryAddress!: string;
}

class TransitionDeliveryDto {
  @ApiProperty({ enum: deliveryStatuses }) @IsIn(deliveryStatuses) status!: DeliveryStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() proofReference?: string;
}

class CreateFieldVisitDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() farmerId!: string;
  @ApiProperty() @IsString() notes!: string;
  @ApiPropertyOptional({ enum: produceGrades }) @IsOptional() @IsIn(produceGrades) observedGrade?: ProduceGrade;
  @ApiProperty({ format: 'date-time' }) @Type(() => Date) @IsDate() observedAt!: Date;
}

@ApiTags('agritech-operations')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller()
export class AgriTechOperationsController {
  constructor(private readonly service: AgriTechOperationsService) {}

  @Post('partners')
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(PartnerViewDto)
  async createPartner(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreatePartnerDto) {
    return createOkResponse(await this.service.createPartner(ownerFrom(principal), input));
  }

  @Get('partners')
  @ApiOkDataResponse(PartnerListDto)
  async listPartners(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listOwnedPartners(ownerFrom(principal)) });
  }

  @Post('supplier/products')
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(CreatedResourceDto)
  async createSupplierProduct(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: CreateSupplierProductDto,
  ) {
    return createOkResponse(await this.service.createSupplierProduct(ownerFrom(principal), input));
  }

  @Get('supplier/products')
  @ApiOkDataResponse(SupplierProductListDto)
  async listSupplierProducts(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listSupplierProducts(ownerFrom(principal)) });
  }

  @Patch('supplier/products/:id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(SupplierProductViewDto)
  async updateSupplierProduct(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateSupplierProductDto,
  ) {
    return createOkResponse(await this.service.updateSupplierProduct(ownerFrom(principal), id, input));
  }

  @Post('produce')
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(ProduceListingViewDto)
  async createProduce(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateProduceDto) {
    return createOkResponse(await this.service.createProduceListing(ownerFrom(principal), input));
  }

  @Get('produce')
  @ApiOkDataResponse(ProduceListingListDto)
  async listProduce(@CurrentUser() principal: AuthenticatedPrincipal, @Query() query: ProduceQueryDto) {
    return createOkResponse({ items: await this.service.listProduce(ownerFrom(principal), query) });
  }

  @Patch('produce/:id/sample-availability')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(ProduceListingViewDto)
  async updateProduceSampleAvailability(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateSampleAvailabilityDto,
  ) {
    return createOkResponse(
      await this.service.updateProduceSampleAvailability(ownerFrom(principal), id, input.sampleAvailable),
    );
  }

  @Get('produce/prices')
  @ApiOkDataResponse(PriceDiscoveryViewDto)
  async discoverPrice(@CurrentUser() principal: AuthenticatedPrincipal, @Query() query: PriceQueryDto) {
    return createOkResponse(await this.service.discoverPrice(ownerFrom(principal), query));
  }

  @Post('produce/:id/reservations')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(ProduceReservationViewDto)
  async reserveProduce(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReserveProduceDto,
  ) {
    return createOkResponse(await this.service.reserveProduce(ownerFrom(principal), id, input));
  }

  @Patch('produce/:id/cancel')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(ProduceListingViewDto)
  async cancelProduce(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return createOkResponse(await this.service.cancelProduceListing(ownerFrom(principal), id));
  }

  @Get('field-agent/farmers')
  @ApiOkDataResponse(AssignedFarmerListDto)
  async listAssignedFarmers(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listAssignedFarmers(ownerFrom(principal)) });
  }

  @Get('deliveries')
  @ApiOkDataResponse(DeliveryListDto)
  async listDeliveries(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listDeliveries(ownerFrom(principal)) });
  }

  @Patch('deliveries/:id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(DeliveryViewDto)
  async transitionDelivery(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TransitionDeliveryDto,
  ) {
    return createOkResponse(await this.service.transitionDelivery(ownerFrom(principal), id, input));
  }

  @Post('field-visits')
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(FieldVisitViewDto)
  async recordFieldVisit(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateFieldVisitDto) {
    return createOkResponse(await this.service.recordFieldVisit(ownerFrom(principal), input));
  }

  @Get('advisories')
  @ApiOkDataResponse(AdvisoryListDto)
  async listAdvisories(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listAdvisories(ownerFrom(principal)) });
  }
}

export const ownerFrom = (principal: AuthenticatedPrincipal): AgriTechOwner => ({
  tenantId: principal.tenantId,
  userId: principal.subject,
});
