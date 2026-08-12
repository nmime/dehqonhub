// @requirements REQ-AGRITECH-ORDER-003
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import {
  CurrentUser,
  DefaultAuthTenantId,
  Public,
  type AuthenticatedPrincipal,
} from '@app/backend-feature-auth-shared';
import type { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import { MarketplaceService } from './marketplace.service';
import {
  AiConsultationListDto,
  AiConsultationViewDto,
  BuyerRequestListDto,
  BuyerRequestViewDto,
  CartListDto,
  CartViewDto,
  CheckoutCartResultDto,
  ContractDeliveryQuoteDto,
  ContractListDto,
  ContractViewDto,
  FavoriteMutationResultDto,
  FavoriteListDto,
  NullableVerificationResponseDto,
  OfferListDto,
  OfferSelectionResultDto,
  OfferViewDto,
  RequestOfferDto,
  ReviewListDto,
  ReviewViewDto,
  SampleListDto,
  SampleUsageViewDto,
  SampleViewDto,
} from './marketplace.view-dto';

const aiKinds = ['recommendation', 'find_cheaper', 'season_advice', 'generic'] as const;
const deliveryTerms = ['pickup', 'seller_delivery', 'by_agreement'] as const;
const maximumIntegerQuantity = 2_147_483_647;
const maximumUzsAmount = 9_999_999_999_999;

class AddToCartDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() productId!: string;
  @ApiProperty({ maximum: maximumIntegerQuantity, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(maximumIntegerQuantity)
  quantity!: number;
}

class CheckoutCartDto {
  @ApiProperty({ enum: deliveryTerms }) @IsIn(deliveryTerms) deliveryTerms!: (typeof deliveryTerms)[number];
}

class UpdateCartItemDto {
  @ApiProperty({ maximum: maximumIntegerQuantity, minimum: 0, type: 'integer' })
  @IsInt()
  @Min(0)
  @Max(maximumIntegerQuantity)
  quantity!: number;
}

class AddReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

class RequestSampleDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() productId!: string;
}

class AddFavoriteDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() productId!: string;
}

class CreateRequestDto {
  @ApiProperty({ maxLength: 200, minLength: 1 }) @IsString() @Matches(/\S/u) @MaxLength(200) title!: string;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) product?: string;
  @ApiPropertyOptional({ maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) volume?: string;
  @ApiProperty({ maxLength: 100, minLength: 1 }) @IsString() @Matches(/\S/u) @MaxLength(100) region!: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString() deadline?: string;
  @ApiPropertyOptional({ maximum: maximumUzsAmount, minimum: 1, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(maximumUzsAmount)
  budgetUzs?: number;
  @ApiPropertyOptional({ maxLength: 5000, minLength: 1 })
  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(5000)
  requirements?: string;
}

class AskAiDto {
  @ApiProperty({ enum: aiKinds }) @IsIn(aiKinds) kind!: (typeof aiKinds)[number];
  @ApiProperty({ maxLength: 2000 }) @IsString() @MaxLength(2000) question!: string;
}

class RequestQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'offering', 'selected', 'closed', 'expired', 'all'] })
  @IsOptional()
  @IsIn(['open', 'offering', 'selected', 'closed', 'expired', 'all'])
  status?: string;
}

@ApiTags('marketplace')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  // ---- Verification ----
  @Get('verification')
  @ApiOkResponse({ description: 'OK', type: NullableVerificationResponseDto })
  async getVerification(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(await this.service.getVerification(marketplaceOwner(principal)));
  }

  // ---- Cart ----
  @Get('cart')
  @ApiOkDataResponse(CartListDto)
  async listCarts(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listCarts(marketplaceOwner(principal)) });
  }

  @Get('cart/:id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(CartViewDto)
  async getCart(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return createOkResponse(await this.service.getCart(marketplaceOwner(principal), id));
  }

  @Post('cart/items')
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(CartViewDto)
  async addToCart(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: AddToCartDto) {
    return createOkResponse(
      await this.service.addToCart(marketplaceOwner(principal), {
        productId: input.productId,
        quantity: input.quantity,
      }),
    );
  }

  @Patch('cart/:id/items/:productId')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiParam({ format: 'uuid', name: 'productId' })
  @ApiOkDataResponse(CartViewDto)
  async updateCartItem(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: UpdateCartItemDto,
  ) {
    return createOkResponse(
      await this.service.updateCartItem(marketplaceOwner(principal), id, productId, input.quantity),
    );
  }

  @Delete('cart/:id/items/:productId')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiParam({ format: 'uuid', name: 'productId' })
  @ApiOkDataResponse(CartViewDto)
  async removeCartItem(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return createOkResponse(await this.service.removeCartItem(marketplaceOwner(principal), id, productId));
  }

  @Post('cart/:id/checkout')
  @ApiParam({ format: 'uuid', name: 'id' })
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(CheckoutCartResultDto)
  async checkoutCart(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CheckoutCartDto,
  ) {
    return createOkResponse(await this.service.checkoutCart(marketplaceOwner(principal), id, input));
  }

  // ---- Samples ----
  @Post('samples')
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(SampleViewDto)
  async requestSample(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: RequestSampleDto) {
    return createOkResponse(await this.service.requestSample(marketplaceOwner(principal), input.productId));
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
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(FavoriteMutationResultDto)
  async addFavorite(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: AddFavoriteDto) {
    return createOkResponse(await this.service.addFavorite(marketplaceOwner(principal), input.productId));
  }

  @Delete('favorites/:productId')
  @ApiParam({ format: 'uuid', name: 'productId' })
  @ApiOkDataResponse(FavoriteMutationResultDto)
  async removeFavorite(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return createOkResponse(await this.service.removeFavorite(marketplaceOwner(principal), productId));
  }

  @Get('favorites')
  @ApiOkDataResponse(FavoriteListDto)
  async listFavorites(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listFavorites(marketplaceOwner(principal)) });
  }

  // ---- Reviews ----
  @Post('reviews/:productId')
  @ApiParam({ format: 'uuid', name: 'productId' })
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(ReviewViewDto)
  async addReview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: AddReviewDto,
  ) {
    return createOkResponse(
      await this.service.addReview(marketplaceOwner(principal), productId, input.rating, input.comment),
    );
  }

  // Ratings are part of deciding whether to buy, so they are readable without a
  // session — the same reasoning that makes the catalog itself public. Writing a
  // review stays guarded above.
  @Get('reviews/:productId')
  @Public()
  @ApiParam({ format: 'uuid', name: 'productId' })
  @ApiOkDataResponse(ReviewListDto)
  async listReviews(
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return createOkResponse({ items: await this.service.listProductReviews(tenantOf(principal), productId) });
  }

  // ---- Requests (reverse auction) ----
  @Post('requests')
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(BuyerRequestViewDto)
  async createRequest(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateRequestDto) {
    return createOkResponse(await this.service.createRequest(marketplaceOwner(principal), input));
  }

  // The open-request feed is what tells a visiting seller there is demand here,
  // so it reads without a session. Posting a request and offering on one stay
  // guarded: both are acts by an identified buyer or seller.
  @Get('requests')
  @Public()
  @ApiOkDataResponse(BuyerRequestListDto)
  async listRequests(@CurrentUser() principal: AuthenticatedPrincipal | undefined, @Query() query: RequestQueryDto) {
    return createOkResponse({ items: await this.service.listRequests(tenantOf(principal), query.status) });
  }

  @Get('requests/mine')
  @ApiOkDataResponse(BuyerRequestListDto)
  async listMyRequests(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listMyRequests(marketplaceOwner(principal)) });
  }

  @Post('requests/:id/offers')
  @ApiParam({ format: 'uuid', name: 'id' })
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(OfferViewDto)
  async makeOffer(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestOfferDto,
  ) {
    return createOkResponse(
      await this.service.makeOffer(
        marketplaceOwner(principal),
        id,
        input.priceUzs,
        input.deliveryTerms,
        input.deliveryPriceUzs,
        input.deliveryNote,
        input.deliveryDays,
      ),
    );
  }

  @Get('requests/:id/offers')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(OfferListDto)
  async listOffers(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return createOkResponse({ items: await this.service.listOffers(marketplaceOwner(principal), id) });
  }

  @Post('requests/:id/offers/:offerId/choose')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiParam({ format: 'uuid', name: 'offerId' })
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(OfferSelectionResultDto)
  async chooseOffer(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return createOkResponse(await this.service.chooseOffer(marketplaceOwner(principal), id, offerId));
  }

  // ---- Contracts ----
  @Patch('contracts/:id/delivery-quote')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(ContractViewDto)
  async updateContractDeliveryQuote(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ContractDeliveryQuoteDto,
  ) {
    return createOkResponse(await this.service.updateContractDeliveryQuote(marketplaceOwner(principal), id, input));
  }

  @Post('contracts/:id/sign')
  @ApiParam({ format: 'uuid', name: 'id' })
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(ContractViewDto)
  async signContract(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return createOkResponse(await this.service.signContract(marketplaceOwner(principal), id));
  }

  @Get('contracts')
  @ApiOkDataResponse(ContractListDto)
  async listContracts(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listContracts(marketplaceOwner(principal)) });
  }

  // ---- AI consultant ----
  @Post('ai')
  @HttpCode(HttpStatus.OK)
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

const marketplaceOwner = (principal: AuthenticatedPrincipal): AgriTechOwner => ({
  tenantId: principal.tenantId,
  userId: principal.subject,
});

/** Tenant behind a public read: the visitor's own when signed in, else the default. */
const tenantOf = (principal: AuthenticatedPrincipal | undefined): string => principal?.tenantId ?? DefaultAuthTenantId;
