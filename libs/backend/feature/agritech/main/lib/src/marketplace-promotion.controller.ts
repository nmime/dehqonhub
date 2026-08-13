// @requirements REQ-AGRITECH-STAGE2-017
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiHeader, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { BadRequestException, ResourceNotFoundException } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import {
  marketplacePromotionPlanCodes,
  type AgriTechOwner,
  type MarketplaceListingPromotion,
  type MarketplacePromotionPlanCode,
} from '@app/backend-feature-agritech-shared';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { MarketplacePromotionService } from './marketplace-promotion.service';

const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;

class ActivateMarketplacePromotionDto {
  @ApiProperty({ description: 'Approved seller organization used for this command.', format: 'uuid' })
  @IsUUID()
  actingPartnerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingPublicId!: string;

  @ApiProperty({ enum: marketplacePromotionPlanCodes })
  @IsIn(marketplacePromotionPlanCodes)
  planCode!: MarketplacePromotionPlanCode;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  startsAt?: string;
}

export class MarketplaceListingPromotionDto implements MarketplaceListingPromotion {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) listingPublicId!: string;
  @ApiProperty({ format: 'uuid' }) sellerPartnerId!: string;
  @ApiProperty({ enum: marketplacePromotionPlanCodes }) planCode!: MarketplacePromotionPlanCode;
  @ApiProperty({ enum: ['scheduled', 'active', 'expired'] })
  status!: MarketplaceListingPromotion['status'];
  @ApiProperty({ format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ minimum: 1, type: 'integer' }) priceUzs!: number;
  @ApiProperty({ enum: ['UZS'] }) currency!: 'UZS';
  @ApiProperty({ description: 'Internal activation audit reference; it is not a payment receipt.' })
  activationReference!: string;
  @ApiProperty({ format: 'date-time' }) activatedAt!: Date;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class MarketplaceListingPromotionListDto {
  @ApiProperty({ type: [MarketplaceListingPromotionDto] }) items!: MarketplaceListingPromotionDto[];
}

class MarketplacePromotionPlanDto {
  @ApiProperty({ enum: marketplacePromotionPlanCodes }) code!: MarketplacePromotionPlanCode;
  @ApiProperty({ enum: ['UZS'] }) currency!: 'UZS';
  @ApiProperty({ maximum: 30, minimum: 1, type: 'integer' }) durationDays!: number;
  @ApiProperty({ minimum: 1, type: 'integer' }) priceUzs!: number;
}

class MarketplacePromotionPlanListDto {
  @ApiProperty({ type: [MarketplacePromotionPlanDto] }) items!: MarketplacePromotionPlanDto[];
}

@ApiTags('marketplace-promotions')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller('marketplace/promotions')
export class MarketplacePromotionController {
  constructor(private readonly service: MarketplacePromotionService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    description: 'Actor- and route-scoped internal promotion activation command key.',
    name: 'Idempotency-Key',
    required: true,
    schema: { maxLength: 100, minLength: 8, pattern: idempotencyKeyPattern.source, type: 'string' },
  })
  @ApiOkDataResponse(MarketplaceListingPromotionDto)
  async activate(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ActivateMarketplacePromotionDto,
  ) {
    return createOkResponse(
      await this.service.activatePromotion(ownerFrom(principal), requireIdempotencyKey(idempotencyKey), {
        actingPartnerId: input.actingPartnerId,
        listingPublicId: input.listingPublicId,
        planCode: input.planCode,
        ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
      }),
    );
  }

  @Get()
  @ApiOkDataResponse(MarketplaceListingPromotionListDto)
  async list(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listPromotions(ownerFrom(principal)) });
  }

  @Get('plans')
  @ApiOkDataResponse(MarketplacePromotionPlanListDto)
  listPlans() {
    return createOkResponse({ items: this.service.listPlans() });
  }

  @Get(':id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(MarketplaceListingPromotionDto)
  async get(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const promotion = await this.service.findPromotion(ownerFrom(principal), id);
    if (!promotion) {
      throw new ResourceNotFoundException('promotion');
    }
    return createOkResponse(promotion);
  }
}

const ownerFrom = (principal: AuthenticatedPrincipal): AgriTechOwner => ({
  tenantId: principal.tenantId,
  userId: principal.subject,
});

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || !idempotencyKeyPattern.test(key)) {
    throw new BadRequestException({ meta: { field: 'Idempotency-Key' } });
  }
  return key;
}
