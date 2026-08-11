// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022 REQ-AGRITECH-STAGE2-017
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { AdminAgriTechReadPermission } from '@app/common-authz';
import { AdminRbacGuard } from '@app/backend-feature-admin-shared';
import { CurrentUser, RequirePermissions, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  MarketplaceContractNotificationAdminDto,
  MarketplaceContractNotificationQueryService,
} from '@app/backend-feature-agritech-main';

class MarketplaceContractNotificationAdminListDto {
  @ApiProperty({ isArray: true, type: MarketplaceContractNotificationAdminDto })
  items!: MarketplaceContractNotificationAdminDto[];
}

@ApiTags('admin-marketplace-contract-notifications')
@ApiExceptions(401, 403, 500)
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@Controller('admin/marketplace/notifications')
export class MarketplaceContractNotificationAdminController {
  constructor(private readonly notifications: MarketplaceContractNotificationQueryService) {}

  @Get()
  @ApiOkDataResponse(MarketplaceContractNotificationAdminListDto)
  @RequirePermissions(AdminAgriTechReadPermission)
  async list(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({
      items: await this.notifications.listForAdmin(principal.tenantId, principal.locale),
    });
  }
}
