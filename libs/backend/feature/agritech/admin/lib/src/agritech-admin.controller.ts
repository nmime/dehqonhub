// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-ANALYTICS-011 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-ROUTING-015 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import { BadRequestException } from '@app/backend-common-exception';
import {
  AdminAgriTechApprovePermission,
  AdminAgriTechReadPermission,
  AdminAgriTechWritePermission,
} from '@app/common-authz';
import { CurrentUser, RequirePermissions, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { AdminRbacGuard } from '@app/backend-feature-admin-shared';
import {
  AdvisoryViewDto,
  AgriTechOrderSummaryListDto,
  AgriTechOperationsService,
  AnalyticsViewDto,
  AssignedFarmerListDto,
  DeliveryViewDto,
  FarmerStatusViewDto,
  FarmerAssignmentViewDto,
  IntegrationReadinessListDto,
  MarketplaceService,
  MarketplacePublicService,
  MarketplaceListingPublicationDto,
  MarketplacePublicModerationQueueDto,
  MarketplaceRequestPublicationDto,
  MarketplaceSellerProfileModerationItemDto,
  PartnerListDto,
  PartnerViewDto,
  PilotListDto,
  PilotViewDto,
  ContractListDto,
  AdminVerificationListDto,
  AdminVerificationViewDto,
  toVerificationAdminView,
  ownerFrom,
} from '@app/backend-feature-agritech-main';

class PartnerStatusDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'suspended'] })
  @IsIn(['approved', 'rejected', 'suspended'])
  status!: 'approved' | 'rejected' | 'suspended';
}

class AssignFarmerDto {
  @ApiProperty() @IsString() agentUserId!: string;
}

class FarmerStatusDto {
  @ApiProperty({ enum: ['active', 'inactive', 'pending_verification'] })
  @IsIn(['active', 'inactive', 'pending_verification'])
  status!: 'active' | 'inactive' | 'pending_verification';
}

class ScheduleDeliveryDto {
  @ApiProperty({ format: 'uuid' }) @IsString() orderId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agentUserId?: string;
  @ApiProperty({ format: 'date-time' }) @Type(() => Date) @IsDate() scheduledAt!: Date;
}

class PublishAdvisoryDto {
  @ApiProperty({ format: 'uuid' }) @IsString() farmerId!: string;
  @ApiProperty({ enum: ['weather', 'agronomy'] }) @IsIn(['weather', 'agronomy']) kind!: 'weather' | 'agronomy';
  @ApiProperty() @IsString() source!: string;
  @ApiProperty() @IsString() summary!: string;
  @ApiProperty({ format: 'date-time' }) @Type(() => Date) @IsDate() observedAt!: Date;
  @ApiProperty({ format: 'date-time' }) @Type(() => Date) @IsDate() expiresAt!: Date;
}

class CreatePilotDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) targetFarmers!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) targetSuppliers!: number;
  @ApiProperty({ format: 'date-time' }) @Type(() => Date) @IsDate() startsAt!: Date;
  @ApiProperty({ format: 'date-time' }) @Type(() => Date) @IsDate() endsAt!: Date;
}

class PilotStatusDto {
  @ApiProperty({ enum: ['planned', 'active', 'completed', 'cancelled'] })
  @IsIn(['planned', 'active', 'completed', 'cancelled'])
  status!: 'planned' | 'active' | 'completed' | 'cancelled';
}

const verificationRejectionReasons = ['criteria_not_met', 'documents_unreadable', 'identity_mismatch'] as const;
const publicationModerationDecisions = ['approved', 'rejected'] as const;
const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const idempotencyHeaderSchema = {
  description: 'Actor- and resource-scoped command replay key.',
  name: 'Idempotency-Key',
  required: true,
  schema: { maxLength: 100, minLength: 8, pattern: idempotencyKeyPattern.source, type: 'string' },
} as const;
const contentFingerprintPattern = /^[a-f0-9]{64}$/u;

class ReviewListingPublicationDto {
  @ApiProperty({ enum: publicationModerationDecisions })
  @IsIn(publicationModerationDecisions)
  decision!: (typeof publicationModerationDecisions)[number];

  @ApiProperty({ minimum: 0, type: 'integer' })
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @ApiProperty({ maxLength: 64, minLength: 64, pattern: contentFingerprintPattern.source })
  @Matches(contentFingerprintPattern)
  expectedSellerContentFingerprint!: string;

  @ApiProperty({ minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  expectedSellerContentRevision!: number;
}

class ReviewSellerProfileDto {
  @ApiProperty({ enum: publicationModerationDecisions })
  @IsIn(publicationModerationDecisions)
  decision!: (typeof publicationModerationDecisions)[number];

  @ApiProperty({ maxLength: 64, minLength: 64, pattern: contentFingerprintPattern.source })
  @Matches(contentFingerprintPattern)
  expectedContentFingerprint!: string;

  @ApiProperty({ minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  expectedContentRevision!: number;
}

class ReviewRequestPublicationDto {
  @ApiProperty({ enum: publicationModerationDecisions })
  @IsIn(publicationModerationDecisions)
  decision!: (typeof publicationModerationDecisions)[number];

  @ApiProperty({ minimum: 0, type: 'integer' })
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

function IsDecisionRejectionReason(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isDecisionRejectionReason',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown, validationArguments: ValidationArguments): boolean {
          const input = validationArguments.object as Partial<ReviewVerificationDto>;
          if (input.decision === 'verified') {
            return value === undefined;
          }
          return verificationRejectionReasons.includes(value as (typeof verificationRejectionReasons)[number]);
        },
        defaultMessage(): string {
          return 'reason is required for rejected decisions and must be omitted for verified decisions';
        },
      },
    });
  };
}

export class ReviewVerificationDto {
  @ApiProperty({ enum: ['verified', 'rejected'] })
  @IsIn(['verified', 'rejected'])
  decision!: 'verified' | 'rejected';
  @ApiPropertyOptional({
    description: 'Required for rejected decisions and forbidden for verified decisions.',
    enum: verificationRejectionReasons,
  })
  @IsDecisionRejectionReason()
  reason?: 'criteria_not_met' | 'documents_unreadable' | 'identity_mismatch';
  @ApiProperty({ minimum: 0, type: 'integer' })
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

@ApiTags('admin-agritech')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@Controller('admin')
export class AgriTechAdminController {
  constructor(
    private readonly service: AgriTechOperationsService,
    private readonly marketplace: MarketplaceService,
    private readonly marketplacePublic: MarketplacePublicService,
  ) {}

  @Get('verifications')
  @ApiOkDataResponse(AdminVerificationListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async listVerifications(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({
      items: (await this.marketplace.listVerifications(principal.tenantId)).map(toVerificationAdminView),
    });
  }

  @Patch('verifications/:id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeaderSchema)
  @ApiOkDataResponse(AdminVerificationViewDto)
  @RequirePermissions(AdminAgriTechApprovePermission)
  async reviewVerification(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ReviewVerificationDto,
  ) {
    return createOkResponse(
      toVerificationAdminView(
        await this.marketplace.reviewVerification(
          principal.tenantId,
          id,
          input.decision,
          principal.subject,
          input.expectedRevision,
          requireIdempotencyKey(idempotencyKey),
          input.reason,
        ),
      ),
    );
  }

  @Get('marketplace/publications/pending')
  @ApiOkDataResponse(MarketplacePublicModerationQueueDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async listPendingMarketplacePublications(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(await this.marketplacePublic.listPendingModeration(principal.tenantId));
  }

  @Patch('marketplace/publications/sellers/:id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(MarketplaceSellerProfileModerationItemDto)
  @RequirePermissions(AdminAgriTechApprovePermission)
  async reviewMarketplaceSellerProfile(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ReviewSellerProfileDto,
  ) {
    return createOkResponse(
      await this.marketplacePublic.reviewSellerProfile(principal.tenantId, id, principal.subject, {
        ...input,
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
      }),
    );
  }

  @Patch('marketplace/publications/listings/:id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(MarketplaceListingPublicationDto)
  @RequirePermissions(AdminAgriTechApprovePermission)
  async reviewMarketplaceListingPublication(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ReviewListingPublicationDto,
  ) {
    return createOkResponse(
      await this.marketplacePublic.reviewListingPublication(principal.tenantId, id, principal.subject, {
        ...input,
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
      }),
    );
  }

  @Patch('marketplace/publications/requests/:id')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkDataResponse(MarketplaceRequestPublicationDto)
  @RequirePermissions(AdminAgriTechApprovePermission)
  async reviewMarketplaceRequestPublication(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ReviewRequestPublicationDto,
  ) {
    return createOkResponse(
      await this.marketplacePublic.reviewRequestPublication(principal.tenantId, id, principal.subject, {
        ...input,
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
      }),
    );
  }

  @Get('contracts')
  @ApiOkDataResponse(ContractListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async listContracts(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.marketplace.listTenantContracts(principal.tenantId) });
  }

  @Get('partners')
  @ApiOkDataResponse(PartnerListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async listPartners(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listPartners(principal.tenantId) });
  }

  @Patch('partners/:id/status')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(PartnerViewDto)
  @RequirePermissions(AdminAgriTechApprovePermission)
  async setPartnerStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PartnerStatusDto,
  ) {
    return createOkResponse(await this.service.setPartnerStatus(ownerFrom(principal), id, input.status));
  }

  @Patch('farmers/:id/assignment')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(FarmerAssignmentViewDto)
  @RequirePermissions(AdminAgriTechWritePermission)
  async assignFarmer(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AssignFarmerDto,
  ) {
    return createOkResponse(await this.service.assignFarmer(ownerFrom(principal), id, input.agentUserId));
  }

  @Get('farmers')
  @ApiOkDataResponse(AssignedFarmerListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async listFarmers(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listFarmers(principal.tenantId) });
  }

  @Patch('farmers/:id/status')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(FarmerStatusViewDto)
  @RequirePermissions(AdminAgriTechApprovePermission)
  async setFarmerStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: FarmerStatusDto,
  ) {
    return createOkResponse(await this.service.setFarmerStatus(ownerFrom(principal), id, input.status));
  }

  @Get('orders')
  @ApiOkDataResponse(AgriTechOrderSummaryListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async listOrders(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listOrders(principal.tenantId) });
  }

  @Post('deliveries')
  @ApiOkDataResponse(DeliveryViewDto)
  @RequirePermissions(AdminAgriTechWritePermission)
  async scheduleDelivery(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: ScheduleDeliveryDto) {
    return createOkResponse(await this.service.scheduleDelivery(ownerFrom(principal), input));
  }

  @Post('advisories')
  @ApiOkDataResponse(AdvisoryViewDto)
  @RequirePermissions(AdminAgriTechWritePermission)
  async publishAdvisory(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: PublishAdvisoryDto) {
    return createOkResponse(await this.service.publishAdvisory(ownerFrom(principal), input));
  }

  @Get('analytics')
  @ApiOkDataResponse(AnalyticsViewDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async analytics(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(await this.service.analytics(principal.tenantId));
  }

  @Post('pilots')
  @ApiOkDataResponse(PilotViewDto)
  @RequirePermissions(AdminAgriTechWritePermission)
  async createPilot(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreatePilotDto) {
    return createOkResponse(await this.service.createPilot(ownerFrom(principal), input));
  }

  @Get('pilots')
  @ApiOkDataResponse(PilotListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async listPilots(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listPilots(principal.tenantId) });
  }

  @Patch('pilots/:id/status')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(PilotViewDto)
  @RequirePermissions(AdminAgriTechWritePermission)
  async setPilotStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PilotStatusDto,
  ) {
    return createOkResponse(await this.service.setPilotStatus(ownerFrom(principal), id, input.status));
  }

  @Get('integrations')
  @ApiOkDataResponse(IntegrationReadinessListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async integrations(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.integrationReadiness(principal.tenantId) });
  }
}

const requireIdempotencyKey = (value: string | undefined): string => {
  const key = value?.trim();
  if (!key || !idempotencyKeyPattern.test(key)) {
    throw new BadRequestException({ meta: { field: 'Idempotency-Key' } });
  }
  return key;
};
