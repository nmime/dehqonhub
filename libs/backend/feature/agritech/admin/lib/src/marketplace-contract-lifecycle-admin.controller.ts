// @requirements REQ-AGRITECH-STAGE2-017
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BadRequestException } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { MarketplaceContractLifecycleService } from '@app/backend-feature-agritech-main';
import { CurrentUser, RequirePermissions, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { AdminRbacGuard } from '@app/backend-feature-admin-shared';
import {
  AdminAgriTechApprovePermission,
  AdminAgriTechReadPermission,
  AdminAgriTechWritePermission,
} from '@app/common-authz';

const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const ratePolicyVersionPattern = /^[a-z0-9][a-z0-9-]{2,49}$/u;
const idempotencyHeader = {
  description: 'Admin command key. Exact replay returns the persisted original result.',
  name: 'Idempotency-Key',
  required: true,
  schema: { maxLength: 100, minLength: 8, pattern: idempotencyKeyPattern.source, type: 'string' },
};

class CommissionRatesDto {
  @ApiProperty({
    description: 'Commission basis points for produce lines.',
    maximum: 1000,
    minimum: 0,
    type: 'integer',
  })
  @IsInt()
  @Min(0)
  @Max(1000)
  produce!: number;

  @ApiProperty({
    description: 'Commission basis points for product lines.',
    maximum: 1000,
    minimum: 0,
    type: 'integer',
  })
  @IsInt()
  @Min(0)
  @Max(1000)
  product!: number;

  @ApiProperty({
    description: 'Commission basis points for request lines.',
    maximum: 1000,
    minimum: 0,
    type: 'integer',
  })
  @IsInt()
  @Min(0)
  @Max(1000)
  request!: number;
}

class ActivateCommissionRatePolicyDto {
  @ApiProperty({ pattern: ratePolicyVersionPattern.source })
  @Matches(ratePolicyVersionPattern)
  version!: string;

  @ApiProperty({ type: CommissionRatesDto })
  @Type(() => CommissionRatesDto)
  @ValidateNested()
  rates!: CommissionRatesDto;
}

class CommissionRatePolicyDto {
  @ApiProperty() version!: string;
  @ApiProperty({ type: CommissionRatesDto }) rates!: CommissionRatesDto;
  @ApiProperty({ enum: ['active', 'retired'] }) status!: 'active' | 'retired';
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ format: 'date-time' }) retiredAt?: Date;
}

class CommissionRatePolicyListDto {
  @ApiProperty({ isArray: true, type: CommissionRatePolicyDto }) items!: CommissionRatePolicyDto[];
}

class ResolveContractDisputeDto {
  @ApiProperty({ enum: ['dismissed', 'upheld_cancelled'] })
  @IsIn(['dismissed', 'upheld_cancelled'])
  decision!: 'dismissed' | 'upheld_cancelled';

  @ApiProperty({ format: 'uuid', isArray: true, maxItems: 20, minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  evidenceIds!: string[];

  @ApiProperty({ minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  evidenceRevision!: number;

  @ApiProperty({ maxLength: 1000, minLength: 1 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  outcomeNote!: string;
}

class ContractDisputeResolutionDto {
  @ApiProperty({ format: 'uuid' }) contractId!: string;
  @ApiProperty({ enum: ['dismissed', 'upheld_cancelled'] }) decision!: 'dismissed' | 'upheld_cancelled';
  @ApiProperty({ enum: ['in_progress', 'delivered', 'cancelled'] })
  fulfillmentStatus!: 'in_progress' | 'delivered' | 'cancelled';
  @ApiProperty({ minimum: 1, type: 'integer' }) evidenceRevision!: number;
  @ApiProperty({ enum: ['resolved'] }) status!: 'resolved';
  @ApiProperty({ format: 'date-time' }) resolvedAt!: Date;
}

@ApiTags('admin-marketplace-contract-lifecycle')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@UseGuards(AdminRbacGuard)
@Controller('agritech/marketplace')
export class MarketplaceContractLifecycleAdminController {
  constructor(private readonly lifecycle: MarketplaceContractLifecycleService) {}

  @Get('commission-policies')
  @RequirePermissions(AdminAgriTechReadPermission)
  @ApiOkDataResponse(CommissionRatePolicyListDto)
  async listCommissionPolicies() {
    const policies = await this.lifecycle.listCommissionRatePolicies();
    return createOkResponse({
      items: policies.map((policy) => ({
        createdAt: policy.createdAt,
        rates: { ...policy.rateSnapshot },
        ...(policy.retiredAt ? { retiredAt: policy.retiredAt } : {}),
        status: policy.status,
        version: policy.version,
      })),
    });
  }

  @Post('commission-policies')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdminAgriTechWritePermission)
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(CommissionRatePolicyDto)
  async activateCommissionPolicy(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ActivateCommissionRatePolicyDto,
  ) {
    const policy = await this.lifecycle.activateCommissionRatePolicy(
      ownerFrom(principal),
      input.version,
      input.rates,
      requireIdempotencyKey(idempotencyKey),
    );
    return createOkResponse({
      createdAt: policy.createdAt,
      rates: { ...policy.rateSnapshot },
      ...(policy.retiredAt ? { retiredAt: policy.retiredAt } : {}),
      status: policy.status,
      version: policy.version,
    });
  }

  @Post('contracts/:id/dispute-resolution')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdminAgriTechApprovePermission)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(ContractDisputeResolutionDto)
  async resolveDispute(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ResolveContractDisputeDto,
  ) {
    const lifecycle = await this.lifecycle.resolveDispute(
      ownerFrom(principal),
      id,
      input.decision,
      input.evidenceIds,
      input.evidenceRevision,
      input.outcomeNote,
      requireIdempotencyKey(idempotencyKey),
    );
    if (!lifecycle.dispute?.decision || !lifecycle.dispute.resolvedAt || lifecycle.dispute.status !== 'resolved') {
      throw new BadRequestException({ meta: { field: 'dispute' } });
    }
    return createOkResponse({
      contractId: lifecycle.contractId,
      decision: lifecycle.dispute.decision,
      evidenceRevision: lifecycle.dispute.evidenceRevision as number,
      fulfillmentStatus: lifecycle.fulfillment.status as 'in_progress' | 'delivered' | 'cancelled',
      resolvedAt: lifecycle.dispute.resolvedAt,
      status: 'resolved' as const,
    });
  }
}

function ownerFrom(principal: AuthenticatedPrincipal) {
  return { tenantId: principal.tenantId, userId: principal.subject };
}

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || !idempotencyKeyPattern.test(key)) {
    throw new BadRequestException({ meta: { field: 'Idempotency-Key' } });
  }
  return key;
}
