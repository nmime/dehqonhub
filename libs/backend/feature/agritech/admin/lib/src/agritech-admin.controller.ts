// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-ANALYTICS-011 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-ROUTING-015
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
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
  PartnerListDto,
  PartnerViewDto,
  PilotListDto,
  PilotViewDto,
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

@ApiTags('admin-agritech')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@Controller('admin')
export class AgriTechAdminController {
  constructor(private readonly service: AgriTechOperationsService) {}

  @Get('partners')
  @ApiOkDataResponse(PartnerListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async listPartners(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.service.listPartners(principal.tenantId) });
  }

  @Patch('partners/:id/status')
  @ApiOkDataResponse(PartnerViewDto)
  @RequirePermissions(AdminAgriTechApprovePermission)
  async setPartnerStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: PartnerStatusDto,
  ) {
    return createOkResponse(await this.service.setPartnerStatus(ownerFrom(principal), id, input.status));
  }

  @Patch('farmers/:id/assignment')
  @ApiOkDataResponse(FarmerAssignmentViewDto)
  @RequirePermissions(AdminAgriTechWritePermission)
  async assignFarmer(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
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
  @ApiOkDataResponse(FarmerStatusViewDto)
  @RequirePermissions(AdminAgriTechApprovePermission)
  async setFarmerStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
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
  @ApiOkDataResponse(PilotViewDto)
  @RequirePermissions(AdminAgriTechWritePermission)
  async setPilotStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
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
