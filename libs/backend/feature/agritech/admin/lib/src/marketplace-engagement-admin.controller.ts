// @requirements REQ-AGRITECH-ENGAGEMENT-019
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { BadRequestException } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import {
  MarketplaceEngagementService,
  MarketplaceReviewModerationQueueDto,
  MarketplaceReviewModerationResultDto,
  MarketplaceSamplePolicyDto,
  toMarketplaceReviewModerationItemDto,
  toMarketplaceReviewModerationResultDto,
  toMarketplaceSamplePolicyDto,
} from '@app/backend-feature-agritech-main';
import { CurrentUser, RequirePermissions, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { AdminRbacGuard } from '@app/backend-feature-admin-shared';
import {
  AdminAgriTechApprovePermission,
  AdminAgriTechReadPermission,
  AdminAgriTechWritePermission,
} from '@app/common-authz';

const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const idempotencyHeader = {
  description: 'Admin command key. An exact replay returns the persisted original result.',
  name: 'Idempotency-Key',
  required: true,
  schema: { maxLength: 100, minLength: 8, pattern: idempotencyKeyPattern.source, type: 'string' },
};

class ActivateMarketplaceSamplePolicyDto {
  @ApiProperty({ maximum: 100, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(100)
  monthlyLimit!: number;

  @ApiProperty({ minimum: 1, type: 'integer' }) @IsInt() @Min(1) expectedVersion!: number;
}

class ModerateMarketplaceReviewDto {
  @ApiProperty({ enum: ['dismissed', 'hidden'] })
  @IsIn(['dismissed', 'hidden'])
  decision!: 'dismissed' | 'hidden';

  @ApiProperty({ minimum: 0, type: 'integer' }) @IsInt() @Min(0) expectedRevision!: number;
}

@ApiTags('admin-marketplace-engagement')
@ApiExceptions(400, 401, 403, 404, 409, 500)
@ApiSessionCookieAuth()
@UseGuards(AdminRbacGuard)
@Controller('agritech/marketplace/engagement')
export class MarketplaceEngagementAdminController {
  constructor(private readonly engagement: MarketplaceEngagementService) {}

  @Get('sample-policy')
  @RequirePermissions(AdminAgriTechReadPermission)
  @ApiOkDataResponse(MarketplaceSamplePolicyDto)
  async getSamplePolicy(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(toMarketplaceSamplePolicyDto(await this.engagement.getSamplePolicy(principal.tenantId)));
  }

  @Post('sample-policy')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdminAgriTechWritePermission)
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceSamplePolicyDto)
  async activateSamplePolicy(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ActivateMarketplaceSamplePolicyDto,
  ) {
    return createOkResponse(
      toMarketplaceSamplePolicyDto(
        await this.engagement.activateSamplePolicy(ownerFrom(principal), input, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  @Get('review-reports')
  @RequirePermissions(AdminAgriTechReadPermission)
  @ApiOkDataResponse(MarketplaceReviewModerationQueueDto)
  async listReviewReports(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({
      items: (await this.engagement.listReviewModerationQueue(principal.tenantId)).map(
        toMarketplaceReviewModerationItemDto,
      ),
    });
  }

  @Patch('review-reports/:reportId')
  @RequirePermissions(AdminAgriTechApprovePermission)
  @ApiParam({ format: 'uuid', name: 'reportId' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(MarketplaceReviewModerationResultDto)
  async moderateReviewReport(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ModerateMarketplaceReviewDto,
  ) {
    return createOkResponse(
      toMarketplaceReviewModerationResultDto(
        await this.engagement.moderateReviewReport(
          ownerFrom(principal),
          reportId,
          input,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }
}

const ownerFrom = (principal: AuthenticatedPrincipal) => ({
  tenantId: principal.tenantId,
  userId: principal.subject,
});

const requireIdempotencyKey = (value: string | undefined): string => {
  if (!value || !idempotencyKeyPattern.test(value)) {
    throw new BadRequestException({ meta: { field: 'idempotencyKey', resourceType: 'marketplace-engagement' } });
  }
  return value;
};
