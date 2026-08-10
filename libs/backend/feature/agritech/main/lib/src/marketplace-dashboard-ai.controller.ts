// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiHeader, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Equals, IsBoolean, IsIn, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { BadRequestException } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import type { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import { MarketplaceDashboardAiService } from './marketplace-dashboard-ai.service';

const aiKinds = ['recommendation', 'find_cheaper', 'season_advice', 'generic'] as const;
const aiExplanationCodes = [
  'grounded_at_consultation_time',
  'lowest_current_price_first',
  'seasonal_calendar_unavailable',
  'stock_revalidated_on_confirmation',
  'no_grounded_catalog_match',
] as const;
const aiReasonCodes = ['query_terms_match', 'current_public_stock', 'lowest_current_price'] as const;
const contractStatuses = ['draft', 'signed', 'active', 'completed', 'cancelled', 'legacy_review_required'] as const;
const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const safeAiQuestionPattern = /^[^\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]*$/u;

class CreateAiConsultationDto {
  @ApiProperty({ enum: aiKinds }) @IsIn(aiKinds) kind!: (typeof aiKinds)[number];
  @ApiProperty({ maxLength: 2_000, minLength: 1 })
  @IsString()
  @Matches(/\S/u)
  @Matches(safeAiQuestionPattern)
  @MaxLength(2_000)
  question!: string;
}

class ConfirmAiStarterCartDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() actingPartnerId!: string;
  @ApiProperty({ description: 'Must be true. Closing or cancelling the preview sends no command.' })
  @IsBoolean()
  @Equals(true)
  confirmed!: boolean;
}

class MarketplaceAiAvailabilityDto {
  @ApiProperty({ enum: ['in_stock_at_consultation'] }) status!: 'in_stock_at_consultation';
  @ApiProperty({ minimum: 1, type: 'integer' }) quantity!: number;
  @ApiProperty() unit!: string;
  @ApiProperty({ enum: ['stock_may_change'] }) warningCode!: 'stock_may_change';
}

class MarketplaceAiLocalizedTitlesDto {
  @ApiProperty() en!: string;
  @ApiProperty() ru!: string;
  @ApiProperty() uz!: string;
  @ApiProperty() uzCyrl!: string;
}

class MarketplaceAiRecommendationDto {
  @ApiProperty({ format: 'uuid' }) listingPublicationId!: string;
  @ApiProperty({ format: 'uuid' }) sellerPublicId!: string;
  @ApiProperty({ type: MarketplaceAiLocalizedTitlesDto }) titles!: MarketplaceAiLocalizedTitlesDto;
  @ApiProperty({ minimum: 0, type: 'integer' }) priceUzs!: number;
  @ApiProperty({ type: MarketplaceAiAvailabilityDto }) availability!: MarketplaceAiAvailabilityDto;
  @ApiProperty({ enum: aiReasonCodes, isArray: true }) reasonCodes!: string[];
}

class MarketplaceAiPreviewPartitionDto {
  @ApiProperty({ format: 'uuid' }) sellerPublicId!: string;
  @ApiProperty({ items: { format: 'uuid', type: 'string' }, type: 'array' }) listingPublicationIds!: string[];
}

class MarketplaceAiStarterCartPreviewDto {
  @ApiProperty({ enum: ['requires_confirmation', 'unavailable'] })
  status!: 'requires_confirmation' | 'unavailable';
  @ApiProperty({ type: [MarketplaceAiPreviewPartitionDto] })
  sellerPartitions!: MarketplaceAiPreviewPartitionDto[];
}

class MarketplaceAiGroundedResponseDto {
  @ApiProperty({ enum: aiExplanationCodes, isArray: true }) explanationCodes!: string[];
  @ApiProperty({ type: [MarketplaceAiRecommendationDto] }) recommendations!: MarketplaceAiRecommendationDto[];
  @ApiProperty({ type: MarketplaceAiStarterCartPreviewDto })
  starterCartPreview!: MarketplaceAiStarterCartPreviewDto;
}

class MarketplaceAiConsultationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: aiKinds }) kind!: string;
  @ApiProperty() question!: string;
  @ApiProperty({ enum: ['catalog_match', 'no_catalog_match'] }) answer!: string;
  @ApiProperty({ items: { format: 'uuid', type: 'string' }, type: 'array' }) listingPublicationIds!: string[];
  @ApiProperty({ type: MarketplaceAiGroundedResponseDto }) response!: MarketplaceAiGroundedResponseDto;
  @ApiPropertyOptional({ format: 'date-time' }) confirmedAt?: Date;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class MarketplaceAiConsultationListDto {
  @ApiProperty({ type: [MarketplaceAiConsultationDto] }) items!: MarketplaceAiConsultationDto[];
}

class MarketplaceAiStarterCartPartitionDto {
  @ApiProperty({ format: 'uuid' }) cartId!: string;
  @ApiProperty({ format: 'uuid' }) sellerPublicId!: string;
  @ApiProperty({ items: { format: 'uuid', type: 'string' }, type: 'array' }) listingPublicationIds!: string[];
}

class MarketplaceAiStarterCartResultDto {
  @ApiProperty({ format: 'uuid' }) consultationId!: string;
  @ApiProperty({ enum: ['confirmed'] }) status!: 'confirmed';
  @ApiProperty({ type: [MarketplaceAiStarterCartPartitionDto] }) carts!: MarketplaceAiStarterCartPartitionDto[];
  @ApiProperty({ format: 'date-time' }) confirmedAt!: Date;
}

class MarketplaceDashboardTopListingDto {
  @ApiProperty({ format: 'uuid' }) listingPublicationId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedQuantity!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) revenueUzs!: number;
}

class MarketplaceSellerDashboardMetricsDto {
  @ApiProperty({ minimum: 0, type: 'integer' }) activeListings!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) pendingOffers!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) activeDeals!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedDeals!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedRevenueUzs!: number;
  @ApiProperty({ maximum: 10_000, minimum: 0, type: 'integer' }) offerConversionBps!: number;
  @ApiProperty({ type: [MarketplaceDashboardTopListingDto] }) topListings!: MarketplaceDashboardTopListingDto[];
}

class MarketplaceBuyerDashboardMetricsDto {
  @ApiProperty({ minimum: 0, type: 'integer' }) openCarts!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) openPurchaseRequests!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) activeDeals!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedDeals!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedSpendUzs!: number;
}

class MarketplaceDashboardMonthlyActivityDto {
  @ApiProperty({ pattern: '^\\d{4}-\\d{2}$' }) month!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedPurchases!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedSales!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) purchaseSpendUzs!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) salesRevenueUzs!: number;
}

class MarketplaceDashboardRecentDealDto {
  @ApiProperty({ format: 'uuid' }) contractId!: string;
  @ApiProperty({ enum: ['buyer', 'seller'] }) side!: string;
  @ApiPropertyOptional() counterpartyName?: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) amountUzs!: number;
  @ApiProperty({ enum: contractStatuses }) status!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class MarketplaceRoleDashboardDto {
  @ApiProperty({ enum: ['buyer', 'farmer', 'seller'] }) role!: string;
  @ApiPropertyOptional({ type: MarketplaceBuyerDashboardMetricsDto }) buyer?: MarketplaceBuyerDashboardMetricsDto;
  @ApiPropertyOptional({ type: MarketplaceSellerDashboardMetricsDto }) seller?: MarketplaceSellerDashboardMetricsDto;
  @ApiProperty({ type: [MarketplaceDashboardMonthlyActivityDto] })
  monthlyActivity!: MarketplaceDashboardMonthlyActivityDto[];
  @ApiProperty({ type: [MarketplaceDashboardRecentDealDto] }) recentDeals!: MarketplaceDashboardRecentDealDto[];
  @ApiProperty({ format: 'date-time' }) generatedAt!: Date;
}

@ApiTags('marketplace-dashboard-ai')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller('marketplace')
export class MarketplaceDashboardAiController {
  constructor(private readonly service: MarketplaceDashboardAiService) {}

  @Get('dashboard')
  @ApiOkDataResponse(MarketplaceRoleDashboardDto)
  async dashboard(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(await this.service.getRoleDashboard(marketplaceOwner(principal)));
  }

  @Post('ai/consultations')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(MarketplaceAiConsultationDto)
  async createConsultation(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateAiConsultationDto,
  ) {
    return createOkResponse(
      await this.service.createAiConsultation(
        marketplaceOwner(principal),
        input.kind,
        input.question,
        requireIdempotencyKey(idempotencyKey),
      ),
    );
  }

  @Get('ai/consultations')
  @ApiOkDataResponse(MarketplaceAiConsultationListDto)
  async listConsultations(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listAiConsultations(marketplaceOwner(principal)) });
  }

  @Post('ai/consultations/:id/starter-cart')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(MarketplaceAiStarterCartResultDto)
  async confirmStarterCart(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ConfirmAiStarterCartDto,
  ) {
    return createOkResponse(
      await this.service.confirmAiStarterCart(
        marketplaceOwner(principal),
        id,
        input,
        requireIdempotencyKey(idempotencyKey),
      ),
    );
  }
}

const marketplaceOwner = (principal: AuthenticatedPrincipal): AgriTechOwner => ({
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
