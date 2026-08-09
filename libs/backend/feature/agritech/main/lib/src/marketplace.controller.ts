// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import type { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import { MarketplaceService } from './marketplace.service';
import {
  AiConsultationListDto,
  AiConsultationViewDto,
  BuyerRequestListDto,
  BuyerRequestViewDto,
  CartItemDto,
  CartListDto,
  CartViewDto,
  ContractListDto,
  ContractViewDto,
  FavoriteListDto,
  OfferListDto,
  OfferViewDto,
  RequestOfferDto,
  ReviewListDto,
  ReviewViewDto,
  SampleListDto,
  SampleUsageViewDto,
  SampleViewDto,
  VerificationListDto,
  VerificationViewDto,
} from './marketplace.view-dto';

const verificationRoles = ['farmer', 'seller', 'buyer'] as const;
const verificationLevels = ['basic', 'verified', 'trusted'] as const;
const docKinds = ['id', 'land', 'lease', 'cadastre', 'farm', 'machinery', 'warehouse', 'business'] as const;
const aiKinds = ['recommendation', 'find_cheaper', 'season_advice', 'generic'] as const;
const deliveryTerms = ['pickup', 'seller_delivery', 'by_agreement'] as const;

class VerificationDocumentDto {
  @ApiProperty({ enum: docKinds }) @IsIn(docKinds) kind!: (typeof docKinds)[number];
  @ApiProperty() @IsString() fileName!: string;
  @ApiProperty() @IsString() storageKey!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() optional?: boolean;
}

class SubmitVerificationDto {
  @ApiProperty({ enum: verificationRoles }) @IsIn(verificationRoles) role!: (typeof verificationRoles)[number];
  @ApiProperty({ enum: verificationLevels }) @IsIn(verificationLevels) level!: (typeof verificationLevels)[number];
  @ApiProperty() @IsBoolean() oneIdLinked!: boolean;
  @ApiProperty({ type: [VerificationDocumentDto] })
  @IsArray()
  @ArrayMinSize(1)
  documents!: VerificationDocumentDto[];
}

class AddToCartDto {
  @ApiProperty() @IsString() sellerId!: string;
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) quantity!: number;
}

class UpdateCartItemDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) quantity!: number;
}

class AddReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

class CreateRequestDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() product?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() volume?: string;
  @ApiProperty() @IsString() region!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) budgetUzs?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() requirements?: string;
}

class CreateContractDto {
  @ApiProperty() @IsString() buyerUserId!: string;
  @ApiProperty() @IsString() sellerUserId!: string;
  @ApiProperty() @IsString() subject!: string;
  @ApiProperty({ minimum: 1 }) @IsNumber() @Min(1) amountUzs!: number;
  @ApiProperty({ enum: deliveryTerms }) @IsIn(deliveryTerms) deliveryTerms!: (typeof deliveryTerms)[number];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) deliveryPriceUzs?: number;
  @ApiProperty() @IsBoolean() factoringEnabled!: boolean;
}

class AskAiDto {
  @ApiProperty({ enum: aiKinds }) @IsIn(aiKinds) kind!: (typeof aiKinds)[number];
  @ApiProperty() @IsString() question!: string;
}

class RequestQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}

@ApiTags('marketplace')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller()
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  // ---- Verification ----
  @Get('verification')
  @ApiOkDataResponse(VerificationViewDto)
  async getVerification(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(await this.service.getVerification(marketplaceOwner(principal)));
  }

  @Post('verification')
  @ApiOkDataResponse(VerificationViewDto)
  async submitVerification(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: SubmitVerificationDto) {
    return createOkResponse(await this.service.submitVerification(marketplaceOwner(principal), input));
  }

  // ---- Cart ----
  @Get('cart')
  @ApiOkDataResponse(CartListDto)
  async listCarts(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listCarts(marketplaceOwner(principal)) });
  }

  @Get('cart/:id')
  @ApiOkDataResponse(CartViewDto)
  async getCart(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(await this.service.getCart(marketplaceOwner(principal), id));
  }

  @Post('cart/items')
  @ApiOkDataResponse(CartViewDto)
  async addToCart(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: AddToCartDto) {
    return createOkResponse(
      await this.service.addToCart(marketplaceOwner(principal), input.sellerId, {
        productId: input.productId,
        quantity: input.quantity,
      }),
    );
  }

  @Patch('cart/:id/items/:productId')
  @ApiOkDataResponse(CartViewDto)
  async updateCartItem(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() input: UpdateCartItemDto,
  ) {
    return createOkResponse(await this.service.updateCartItem(marketplaceOwner(principal), id, productId, input.quantity));
  }

  @Delete('cart/:id/items/:productId')
  @ApiOkDataResponse(CartViewDto)
  async removeCartItem(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return createOkResponse(await this.service.removeCartItem(marketplaceOwner(principal), id, productId));
  }

  @Post('cart/:id/checkout')
  @ApiOkDataResponse(CartViewDto)
  async checkoutCart(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(await this.service.checkoutCart(marketplaceOwner(principal), id));
  }

  // ---- Samples ----
  @Post('samples')
  @ApiOkDataResponse(SampleViewDto)
  async requestSample(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: { productId: string; sellerId: string },
  ) {
    return createOkResponse(await this.service.requestSample(marketplaceOwner(principal), input.productId, input.sellerId));
  }

  @Get('samples')
  @ApiOkDataResponse(SampleListDto)
  async listSamples(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listSamples(marketplaceOwner(principal)) });
  }

  @Get('samples/usage')
  @ApiOkDataResponse(SampleUsageViewDto)
  async sampleUsage(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(await this.service.sampleUsage(marketplaceOwner(principal)));
  }

  // ---- Favorites ----
  @Post('favorites')
  @ApiOkDataResponse(CartViewDto)
  async addFavorite(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: { productId: string },
  ) {
    return createOkResponse(await this.service.addFavorite(marketplaceOwner(principal), input.productId));
  }

  @Delete('favorites/:productId')
  @ApiOkDataResponse(CartViewDto)
  async removeFavorite(@CurrentUser() principal: AuthenticatedPrincipal, @Param('productId') productId: string) {
    return createOkResponse(await this.service.removeFavorite(marketplaceOwner(principal), productId));
  }

  @Get('favorites')
  @ApiOkDataResponse(FavoriteListDto)
  async listFavorites(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listFavorites(marketplaceOwner(principal)) });
  }

  // ---- Reviews ----
  @Post('reviews/:productId')
  @ApiOkDataResponse(ReviewViewDto)
  async addReview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('productId') productId: string,
    @Body() input: AddReviewDto,
  ) {
    return createOkResponse(await this.service.addReview(marketplaceOwner(principal), productId, input.rating, input.comment));
  }

  @Get('reviews/:productId')
  @ApiOkDataResponse(ReviewListDto)
  async listReviews(@CurrentUser() principal: AuthenticatedPrincipal, @Param('productId') productId: string) {
    return createOkResponse({ items: await this.service.listProductReviews(principal.tenantId, productId) });
  }

  // ---- Requests (reverse auction) ----
  @Post('requests')
  @ApiOkDataResponse(BuyerRequestViewDto)
  async createRequest(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateRequestDto) {
    return createOkResponse(await this.service.createRequest(marketplaceOwner(principal), input));
  }

  @Get('requests')
  @ApiOkDataResponse(BuyerRequestListDto)
  async listRequests(@CurrentUser() principal: AuthenticatedPrincipal, @Query() query: RequestQueryDto) {
    return createOkResponse({ items: await this.service.listRequests(principal.tenantId, query.status) });
  }

  @Get('requests/mine')
  @ApiOkDataResponse(BuyerRequestListDto)
  async listMyRequests(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listMyRequests(marketplaceOwner(principal)) });
  }

  @Post('requests/:id/offers')
  @ApiOkDataResponse(OfferViewDto)
  async makeOffer(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: RequestOfferDto,
  ) {
    return createOkResponse(
      await this.service.makeOffer(marketplaceOwner(principal), id, input.priceUzs, input.deliveryNote, input.deliveryDays),
    );
  }

  @Get('requests/:id/offers')
  @ApiOkDataResponse(OfferListDto)
  async listOffers(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse({ items: await this.service.listOffers(principal.tenantId, id) });
  }

  @Post('requests/:id/offers/:offerId/choose')
  @ApiOkDataResponse(OfferViewDto)
  async chooseOffer(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Param('offerId') offerId: string,
  ) {
    return createOkResponse(await this.service.chooseOffer(marketplaceOwner(principal), id, offerId));
  }

  // ---- Contracts ----
  @Post('contracts')
  @ApiOkDataResponse(ContractViewDto)
  async createContract(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateContractDto) {
    return createOkResponse(await this.service.createContract(marketplaceOwner(principal), input));
  }

  @Post('contracts/:id/sign')
  @ApiOkDataResponse(ContractViewDto)
  async signContract(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(await this.service.signContract(marketplaceOwner(principal), id));
  }

  @Get('contracts')
  @ApiOkDataResponse(ContractListDto)
  async listContracts(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listContracts(marketplaceOwner(principal)) });
  }

  // ---- AI consultant ----
  @Post('ai')
  @ApiOkDataResponse(AiConsultationViewDto)
  async askAi(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: AskAiDto) {
    return createOkResponse(await this.service.askAi(marketplaceOwner(principal), input.kind, input.question));
  }

  @Get('ai')
  @ApiOkDataResponse(AiConsultationListDto)
  async listAi(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listAiConsultations(marketplaceOwner(principal)) });
  }
}

export const marketplaceOwner = (principal: AuthenticatedPrincipal): AgriTechOwner => ({
  tenantId: principal.tenantId,
  userId: principal.subject,
});
