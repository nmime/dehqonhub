// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { Controller, Get } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import type {
  MarketplaceContractNotificationLocale,
  MarketplaceContractNotificationStatus,
  MarketplaceContractParty,
} from '@app/backend-feature-agritech-shared';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  MarketplaceContractNotificationQueryService,
  type MarketplaceContractNotificationAdminView,
  type MarketplaceContractNotificationRecipientView,
} from './marketplace-contract-notification.service';
import { ownerFrom } from './agritech.controller';

export class MarketplaceContractNotificationAdminDto implements MarketplaceContractNotificationAdminView {
  @ApiProperty({ minimum: 0, type: 'integer' }) attempts!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) channelAttempts!: number;
  @ApiProperty({ format: 'uuid' }) contractId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ enum: ['telegram', 'sms'] }) deliveryChannel!: 'telegram' | 'sms';
  @ApiProperty({ format: 'date-time', required: false }) dispatchedAt?: Date;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() event!: string;
  @ApiProperty({ format: 'date-time', required: false }) lastAttemptAt?: Date;
  @ApiProperty({ required: false }) lastErrorCode?: string;
  @ApiProperty({ enum: ['en', 'ru', 'uz', 'uz-cyrl'] }) locale!: MarketplaceContractNotificationLocale;
  @ApiProperty() message!: string;
  @ApiProperty({ format: 'date-time' }) nextAttemptAt!: Date;
  @ApiProperty({ enum: ['none', 'mock', 'live'] }) providerMode!: 'none' | 'mock' | 'live';
  @ApiProperty({ required: false }) providerName?: string;
  @ApiProperty({ enum: ['en', 'ru', 'uz', 'uz-cyrl'] }) recipientLocale!: MarketplaceContractNotificationLocale;
  @ApiProperty({ enum: ['buyer', 'seller'] }) recipientParty!: MarketplaceContractParty;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ enum: ['pending', 'simulated', 'delivered', 'failed', 'reconciliation_required'] })
  status!: MarketplaceContractNotificationStatus;
  @ApiProperty() templateKey!: string;
  @ApiProperty({ format: 'uuid' }) timelineEventId!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ enum: ['in-app'] }) surface!: 'in-app';
}

export class MarketplaceContractNotificationRecipientDto implements MarketplaceContractNotificationRecipientView {
  @ApiProperty({ minimum: 0, type: 'integer' }) attempts!: number;
  @ApiProperty({ format: 'date-time', required: false }) attemptedAt?: Date;
  @ApiProperty({ format: 'uuid' }) contractId!: string;
  @ApiProperty() contractPath!: string;
  @ApiProperty({ enum: ['telegram', 'sms'] }) deliveryChannel!: 'telegram' | 'sms';
  @ApiProperty() event!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['en', 'ru', 'uz', 'uz-cyrl'] }) locale!: MarketplaceContractNotificationLocale;
  @ApiProperty() message!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: Date;
  @ApiProperty({ enum: ['buyer', 'seller'] }) recipientParty!: MarketplaceContractParty;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ enum: ['pending', 'simulated', 'delivered', 'failed', 'reconciliation_required'] })
  status!: MarketplaceContractNotificationStatus;
  @ApiProperty({ enum: ['in-app'] }) surface!: 'in-app';
}

class MarketplaceContractNotificationListDto {
  @ApiProperty({ isArray: true, type: MarketplaceContractNotificationRecipientDto })
  items!: MarketplaceContractNotificationRecipientDto[];
}

@ApiTags('marketplace-contract-notifications')
@ApiExceptions(401, 403, 500)
@ApiSessionCookieAuth()
@Controller('marketplace/notifications')
export class MarketplaceContractNotificationController {
  constructor(private readonly notifications: MarketplaceContractNotificationQueryService) {}

  @Get()
  @ApiOkDataResponse(MarketplaceContractNotificationListDto)
  async list(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({
      items: await this.notifications.listForRecipient(ownerFrom(principal), principal.locale),
    });
  }
}
