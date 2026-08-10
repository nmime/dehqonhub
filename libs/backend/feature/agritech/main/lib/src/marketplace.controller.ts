// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
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
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { RouteConfig } from '@nestjs/platform-fastify';
import { BadRequestException } from '@app/backend-common-exception';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import type { AgriTechOwner } from '@app/backend-feature-agritech-shared';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceVerificationService } from './marketplace-verification.service';
import {
  BuyerRequestListDto,
  BuyerRequestViewDto,
  CartListDto,
  CartViewDto,
  CheckoutCartResultDto,
  ContractDeliveryQuoteDto,
  ContractListDto,
  ContractViewDto,
  NullableVerificationResponseDto,
  OfferListDto,
  OfferSelectionResultDto,
  OfferViewDto,
  RequestOfferDto,
  VerificationViewDto,
  toBuyerRequestView,
  toCartSelfView,
  toContractSelfView,
  toOfferPartyView,
  toOfferSelectionView,
  toVerificationSelfView,
} from './marketplace.view-dto';

const deliveryTerms = ['pickup', 'seller_delivery', 'by_agreement'] as const;
const maximumIntegerQuantity = 2_147_483_647;
const maximumUzsAmount = 9_999_999_999_999;
const maximumVerificationDocumentBytes = 10 * 1024 * 1024;
const maximumVerificationDocumentBase64Length = Math.ceil(maximumVerificationDocumentBytes / 3) * 4;
const verificationDocumentKinds = [
  'id',
  'land',
  'lease',
  'cadastre',
  'farm',
  'machinery',
  'warehouse',
  'business',
  'license',
] as const;
const verificationDocumentMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const verificationRoles = ['farmer', 'seller', 'buyer'] as const;
const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const idempotencyHeaderSchema = {
  description: 'Actor- and resource-scoped command replay key.',
  name: 'Idempotency-Key',
  required: true,
  schema: { maxLength: 100, minLength: 8, pattern: idempotencyKeyPattern.source, type: 'string' },
} as const;

class StartVerificationDto {
  @ApiProperty({ enum: verificationRoles }) @IsIn(verificationRoles) role!: (typeof verificationRoles)[number];
  @ApiProperty({ minimum: 0, type: 'integer' }) @IsInt() @Min(0) expectedRevision!: number;
}

class SubmitVerificationDto {
  @ApiProperty({ minimum: 0, type: 'integer' }) @IsInt() @Min(0) expectedRevision!: number;
}

class MarketplaceProviderCapabilityReadinessDto {
  @ApiProperty({ enum: ['disabled', 'mock', 'live'] }) mode!: 'disabled' | 'mock' | 'live';
  @ApiProperty({ nullable: true, type: String }) providerName!: string | null;
  @ApiProperty() ready!: boolean;
  @ApiProperty({ enum: ['disabled', 'idempotent-retry'] }) reconciliation!: 'disabled' | 'idempotent-retry';
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ maximum: 30_000, minimum: 100, type: 'integer' }) timeoutMs!: number;
}

class MarketplaceProviderReadinessDto {
  @ApiProperty({ type: MarketplaceProviderCapabilityReadinessDto })
  contractArtifactStorage!: MarketplaceProviderCapabilityReadinessDto;
  @ApiProperty({ type: MarketplaceProviderCapabilityReadinessDto })
  directPayment!: MarketplaceProviderCapabilityReadinessDto;
  @ApiProperty({ type: MarketplaceProviderCapabilityReadinessDto })
  factoring!: MarketplaceProviderCapabilityReadinessDto;
  @ApiProperty({ type: MarketplaceProviderCapabilityReadinessDto }) oneId!: MarketplaceProviderCapabilityReadinessDto;
  @ApiProperty({ type: MarketplaceProviderCapabilityReadinessDto })
  notificationDelivery!: MarketplaceProviderCapabilityReadinessDto;
  @ApiProperty({ type: MarketplaceProviderCapabilityReadinessDto })
  promotionBilling!: MarketplaceProviderCapabilityReadinessDto;
  @ApiProperty({ type: MarketplaceProviderCapabilityReadinessDto })
  qualifiedSignature!: MarketplaceProviderCapabilityReadinessDto;
  @ApiProperty({ type: MarketplaceProviderCapabilityReadinessDto })
  verificationDocuments!: MarketplaceProviderCapabilityReadinessDto;
}

class VerificationDocumentInputDto {
  @ApiProperty({ enum: verificationDocumentKinds })
  @IsIn(verificationDocumentKinds)
  kind!: (typeof verificationDocumentKinds)[number];

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Matches(/\S/u)
  @Matches(/^[^/\\]+$/u)
  @MaxLength(200)
  fileName!: string;

  @ApiProperty({ enum: verificationDocumentMimeTypes })
  @IsIn(verificationDocumentMimeTypes)
  mimeType!: (typeof verificationDocumentMimeTypes)[number];

  @ApiProperty({
    description: 'Base64-encoded evidence bytes. Size and checksum are derived server-side.',
    maxLength: maximumVerificationDocumentBase64Length,
  })
  @IsString()
  @Matches(/\S/u)
  @MaxLength(maximumVerificationDocumentBase64Length)
  contentBase64!: string;
}

class AddToCartDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() actingPartnerId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() listingPublicationId!: string;
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

class CreateRequestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() actingPartnerId!: string;
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

class RequestQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'offering', 'selected', 'closed', 'expired', 'all'] })
  @IsOptional()
  @IsIn(['open', 'offering', 'selected', 'closed', 'expired', 'all'])
  status?: string;
}

@ApiTags('marketplace')
@ApiExceptions(400, 401, 403, 404, 409, 413, 500, 503)
@ApiSessionCookieAuth()
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly service: MarketplaceService,
    private readonly verification: MarketplaceVerificationService,
  ) {}

  // ---- Verification ----
  @Get('verification')
  @ApiOkResponse({ description: 'OK', type: NullableVerificationResponseDto })
  async getVerification(@CurrentUser() principal: AuthenticatedPrincipal) {
    const verification = await this.service.getVerification(marketplaceOwner(principal));
    return createOkResponse(verification ? toVerificationSelfView(verification) : null);
  }

  @Post('verification')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(idempotencyHeaderSchema)
  @ApiOkDataResponse(VerificationViewDto)
  async createVerification(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: StartVerificationDto,
  ) {
    return createOkResponse(
      toVerificationSelfView(
        await this.verification.createVerification(
          marketplaceOwner(principal),
          input.role,
          input.expectedRevision,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Post('verification/oneid/link')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(VerificationViewDto)
  async linkOneId(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return createOkResponse(
      toVerificationSelfView(
        await this.verification.linkOneId(marketplaceOwner(principal), requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  @Get('verification/providers/readiness')
  @ApiOkDataResponse(MarketplaceProviderReadinessDto)
  providerReadiness() {
    return createOkResponse(this.verification.getProviderReadiness());
  }

  @Post('verification/documents')
  @HttpCode(HttpStatus.OK)
  @RouteConfig({ bodyLimit: 14_100_000 })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(VerificationViewDto)
  async storeVerificationDocuments(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: VerificationDocumentInputDto,
  ) {
    return createOkResponse(
      toVerificationSelfView(
        await this.verification.storeDocuments(
          marketplaceOwner(principal),
          [decodeVerificationDocument(input)],
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Post('verification/submit')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(idempotencyHeaderSchema)
  @ApiOkDataResponse(VerificationViewDto)
  async submitVerification(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: SubmitVerificationDto,
  ) {
    return createOkResponse(
      toVerificationSelfView(
        await this.verification.submitVerification(
          marketplaceOwner(principal),
          input.expectedRevision,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  // ---- Cart ----
  @Get('cart')
  @ApiOkDataResponse(CartListDto)
  async listCarts(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({
      items: (await this.service.listCarts(marketplaceOwner(principal))).map(toCartSelfView),
    });
  }

  @Get('cart/:id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(CartViewDto)
  async getCart(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return createOkResponse(toCartSelfView(await this.service.getCart(marketplaceOwner(principal), id)));
  }

  @Post('cart/items')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(CartViewDto)
  async addToCart(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: AddToCartDto,
  ) {
    return createOkResponse(
      toCartSelfView(
        await this.service.addToCart(
          marketplaceOwner(principal),
          {
            actingPartnerId: input.actingPartnerId,
            listingPublicationId: input.listingPublicationId,
            quantity: input.quantity,
          },
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Patch('cart/:id/items/:listingPublicationId')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiParam({ format: 'uuid', name: 'listingPublicationId' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(CartViewDto)
  async updateCartItem(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('listingPublicationId', ParseUUIDPipe) listingPublicationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: UpdateCartItemDto,
  ) {
    return createOkResponse(
      toCartSelfView(
        await this.service.updateCartItem(
          marketplaceOwner(principal),
          id,
          listingPublicationId,
          input.quantity,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Delete('cart/:id/items/:listingPublicationId')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiParam({ format: 'uuid', name: 'listingPublicationId' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(CartViewDto)
  async removeCartItem(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('listingPublicationId', ParseUUIDPipe) listingPublicationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return createOkResponse(
      toCartSelfView(
        await this.service.removeCartItem(
          marketplaceOwner(principal),
          id,
          listingPublicationId,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Post('cart/:id/checkout')
  @ApiParam({ format: 'uuid', name: 'id' })
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(CheckoutCartResultDto)
  async checkoutCart(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CheckoutCartDto,
  ) {
    return createOkResponse(
      await this.service.checkoutCart(marketplaceOwner(principal), id, input, requireIdempotencyKey(idempotencyKey)),
    );
  }

  // ---- Requests (reverse auction) ----
  @Post('requests')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(BuyerRequestViewDto)
  async createRequest(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateRequestDto,
  ) {
    return createOkResponse(
      toBuyerRequestView(
        await this.service.createRequest(marketplaceOwner(principal), input, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  @Get('requests')
  @ApiOkDataResponse(BuyerRequestListDto)
  async listRequests(@CurrentUser() principal: AuthenticatedPrincipal, @Query() query: RequestQueryDto) {
    return createOkResponse({
      items: (await this.service.listRequests(principal.tenantId, query.status)).map(toBuyerRequestView),
    });
  }

  @Get('requests/mine')
  @ApiOkDataResponse(BuyerRequestListDto)
  async listMyRequests(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({
      items: (await this.service.listMyRequests(marketplaceOwner(principal))).map(toBuyerRequestView),
    });
  }

  @Post('requests/:id/offers')
  @ApiParam({ format: 'uuid', name: 'id' })
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(OfferViewDto)
  async makeOffer(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: RequestOfferDto,
  ) {
    return createOkResponse(
      toOfferPartyView(
        await this.service.makeOffer(marketplaceOwner(principal), id, input, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  @Get('requests/:id/offers')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(OfferListDto)
  async listOffers(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return createOkResponse({
      items: (await this.service.listOffers(marketplaceOwner(principal), id)).map(toOfferPartyView),
    });
  }

  @Post('requests/:id/offers/:offerId/choose')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiParam({ format: 'uuid', name: 'offerId' })
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(OfferSelectionResultDto)
  async chooseOffer(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return createOkResponse(
      toOfferSelectionView(
        await this.service.chooseOffer(marketplaceOwner(principal), id, offerId, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  // ---- Contracts ----
  @Patch('contracts/:id/delivery-quote')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeaderSchema)
  @ApiOkDataResponse(ContractViewDto)
  async updateContractDeliveryQuote(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ContractDeliveryQuoteDto,
  ) {
    const owner = marketplaceOwner(principal);
    const contract = await this.service.updateContractDeliveryQuote(
      owner,
      id,
      input,
      requireIdempotencyKey(idempotencyKey),
    );
    return createOkResponse(toContractSelfView(contract, owner));
  }

  @Get('contracts')
  @ApiOkDataResponse(ContractListDto)
  async listContracts(@CurrentUser() principal: AuthenticatedPrincipal) {
    const owner = marketplaceOwner(principal);
    const contracts = await this.service.listContracts(owner);
    return createOkResponse({ items: contracts.map((contract) => toContractSelfView(contract, owner)) });
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

function decodeVerificationDocument(input: VerificationDocumentInputDto) {
  const fileName = input.fileName.normalize('NFC').trim();
  if (
    [...fileName].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f;
    })
  ) {
    throw new BadRequestException({ meta: { field: 'fileName' } });
  }
  const encoded = input.contentBase64.trim();
  if (!isCanonicalBase64(encoded)) {
    throw new BadRequestException({ meta: { field: 'contentBase64' } });
  }
  const content = Buffer.from(encoded, 'base64');
  if (
    content.byteLength === 0 ||
    content.byteLength > maximumVerificationDocumentBytes ||
    !matchesVerificationDocumentMime(content, input.mimeType)
  ) {
    throw new BadRequestException({ meta: { field: 'contentBase64' } });
  }
  return {
    content: new Uint8Array(content),
    fileName,
    kind: input.kind,
    mimeType: input.mimeType,
  };
}

function isCanonicalBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  let padding = 0;
  if (value.endsWith('==')) {
    padding = 2;
  } else if (value.endsWith('=')) {
    padding = 1;
  }
  const dataLength = value.length - padding;
  for (let index = 0; index < dataLength; index += 1) {
    const code = value.charCodeAt(index);
    const allowed =
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      code === 0x2b ||
      code === 0x2f;
    if (!allowed) {
      return false;
    }
  }
  for (let index = dataLength; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 0x3d) {
      return false;
    }
  }
  return padding === 0 || (padding === 1 ? dataLength % 4 === 3 : dataLength % 4 === 2);
}

function matchesVerificationDocumentMime(content: Uint8Array, mimeType: VerificationDocumentInputDto['mimeType']) {
  if (mimeType === 'application/pdf') {
    return Buffer.from(content.subarray(0, 5)).toString('ascii') === '%PDF-';
  }
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => content[index] === byte);
  }
  return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
}
