// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-STAGE2-017
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Multipart } from '@fastify/multipart';
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
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  BadRequestException,
  Exception,
  ExceptionKind,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import type {
  AgriTechOwner,
  MarketplaceContractArtifact,
  MarketplaceContractDisputeReason,
  MarketplaceContractFulfillmentCommand,
  MarketplaceContractLifecycle,
  MarketplaceDisputeEvidenceMediaType,
  MarketplaceContractSettlementKind,
  MarketplaceSettlementProviderCommand,
} from '@app/backend-feature-agritech-shared';
import { maximumMarketplaceDisputeEvidenceBytes } from '@app/backend-feature-agritech-shared';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { MarketplaceContractLifecycleService } from './marketplace-contract-lifecycle.service';

const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const settlementKinds = ['direct_payment', 'factoring'] as const;
const settlementCommands = [
  'confirm_buyer_payment',
  'confirm_seller_receipt',
  'request_decision',
  'record_seller_payout',
  'record_buyer_repayment',
  'close',
] as const;
const settlementEventTypes = [
  'buyer_consented',
  'seller_consented',
  'buyer_payment_confirmed',
  'seller_receipt_confirmed',
  'factoring_requested',
  'factoring_approved',
  'factoring_rejected',
  'seller_paid',
  'buyer_repaid',
  'factoring_closed',
] as const;
type SettlementProviderMode = 'none' | 'mock' | 'live';
type DisputeEvidenceUpload = {
  content: Uint8Array;
  fileName: string;
  mediaType: MarketplaceDisputeEvidenceMediaType;
};
const fulfillmentCommands = ['start', 'mark_delivered', 'accept_delivery'] as const;
const disputeReasons = ['delivery_issue', 'quality_issue', 'quantity_issue', 'other'] as const;
const idempotencyHeader = {
  description: 'Actor- and route-scoped command key; exact replay returns the original lifecycle state.',
  name: 'Idempotency-Key',
  required: true,
  schema: { maxLength: 100, minLength: 8, pattern: idempotencyKeyPattern.source, type: 'string' },
};

class MarketplaceEvidencePayloadTooLargeException extends Exception({
  kind: ExceptionKind.Client,
  name: 'MarketplaceEvidencePayloadTooLargeException',
  status: HttpStatus.PAYLOAD_TOO_LARGE,
}) {}

class CreateContractArtifactDto {
  @ApiProperty({ enum: settlementKinds })
  @IsIn(settlementKinds)
  settlementKind!: MarketplaceContractSettlementKind;
}

class SettlementCommandDto {
  @ApiProperty({ enum: settlementCommands })
  @IsIn(settlementCommands)
  command!: MarketplaceSettlementProviderCommand;
}

class FulfillmentCommandDto {
  @ApiProperty({ enum: fulfillmentCommands })
  @IsIn(fulfillmentCommands)
  command!: MarketplaceContractFulfillmentCommand;
}

class OpenDisputeDto {
  @ApiProperty({ enum: disputeReasons })
  @IsIn(disputeReasons)
  reason!: MarketplaceContractDisputeReason;
}

class ContractArtifactDto {
  @ApiProperty({ minimum: 64, type: 'integer' }) byteSize!: number;
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' }) checksumSha256!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ enum: ['application/pdf'] }) mediaType!: 'application/pdf';
  @ApiProperty({ enum: ['mock', 'live'] }) providerMode!: 'mock' | 'live';
  @ApiProperty() providerName!: string;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' }) snapshotFingerprint!: string;
  @ApiProperty({ enum: [1] }) snapshotRevision!: number;
  @ApiProperty({ enum: ['dehqonhub-contract-v1'] }) templateVersion!: 'dehqonhub-contract-v1';
  @ApiProperty({ enum: ['MOCK PROVIDER — NOT A LEGAL CONTRACT'], nullable: true, type: String })
  watermark!: 'MOCK PROVIDER — NOT A LEGAL CONTRACT' | null;
}

class CommissionRateSnapshotDto {
  @ApiProperty({ maximum: 1000, minimum: 0, type: 'integer' }) produce!: number;
  @ApiProperty({ maximum: 1000, minimum: 0, type: 'integer' }) product!: number;
  @ApiProperty({ maximum: 1000, minimum: 0, type: 'integer' }) request!: number;
}

class ContractCommissionDto {
  @ApiProperty({ minimum: 0, type: 'integer' }) amountUzs!: number;
  @ApiProperty({ minimum: 1, type: 'integer' }) baseAmountUzs!: number;
  @ApiProperty({ enum: ['UZS'] }) currency!: 'UZS';
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: CommissionRateSnapshotDto }) rateSnapshot!: CommissionRateSnapshotDto;
  @ApiProperty() rateVersion!: string;
}

class ContractDisputeDto {
  @ApiProperty({ enum: ['buyer', 'seller'] }) openedByParty!: 'buyer' | 'seller';
  @ApiProperty({ enum: disputeReasons }) reason!: MarketplaceContractDisputeReason;
  @ApiProperty({ enum: ['open', 'resolved'] }) status!: 'open' | 'resolved';
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ enum: ['dismissed', 'upheld_cancelled'] }) decision?: 'dismissed' | 'upheld_cancelled';
  @ApiPropertyOptional({ minimum: 1, type: 'integer' }) evidenceRevision?: number;
  @ApiPropertyOptional() outcomeNote?: string;
  @ApiPropertyOptional({ format: 'date-time' }) resolvedAt?: Date;
}

class ContractDisputeEvidenceDto {
  @ApiProperty({ minimum: 1, type: 'integer' }) byteSize!: number;
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' }) checksumSha256!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ maxLength: 200 }) fileName!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['application/pdf', 'image/jpeg', 'image/png'] })
  mediaType!: 'application/pdf' | 'image/jpeg' | 'image/png';
  @ApiProperty({ enum: ['mock', 'live'] }) providerMode!: 'mock' | 'live';
  @ApiProperty() providerName!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) revision!: number;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ enum: ['buyer', 'seller'] }) uploadedByParty!: 'buyer' | 'seller';
}

class ContractReputationSignalDto {
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ enum: ['negative'] }) impact!: 'negative';
  @ApiProperty({ enum: ['dispute_dismissed', 'dispute_upheld'] })
  outcome!: 'dispute_dismissed' | 'dispute_upheld';
  @ApiProperty({ enum: disputeReasons }) reason!: MarketplaceContractDisputeReason;
  @ApiProperty({ enum: ['buyer', 'seller'] }) subjectParty!: 'buyer' | 'seller';
}

class ContractFulfillmentDto {
  @ApiProperty({
    enum: ['awaiting_settlement', 'ready', 'in_progress', 'delivered', 'disputed', 'cancelled', 'completed'],
  })
  status!: MarketplaceContractLifecycle['fulfillment']['status'];
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiPropertyOptional({ format: 'date-time' }) startedAt?: Date;
  @ApiPropertyOptional({ format: 'date-time' }) deliveredAt?: Date;
  @ApiPropertyOptional({ format: 'date-time' }) completedAt?: Date;
}

class DirectPaymentSettlementDto {
  @ApiProperty({ enum: ['direct_payment'] }) kind!: 'direct_payment';
  @ApiProperty({ enum: ['awaiting_buyer_confirmation', 'buyer_confirmed', 'seller_received'] })
  status!: 'awaiting_buyer_confirmation' | 'buyer_confirmed' | 'seller_received';
  @ApiProperty({ minimum: 1, type: 'integer' }) amountUzs!: number;
  @ApiProperty({ enum: ['UZS'] }) currency!: 'UZS';
  @ApiProperty({ enum: ['none', 'mock', 'live'] }) latestProviderMode!: SettlementProviderMode;
  @ApiProperty({ enum: ['clear', 'required'] }) reconciliationState!: 'clear' | 'required';
  @ApiPropertyOptional() reconciliationReason?: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class FactoringSettlementDto {
  @ApiProperty({ enum: ['factoring'] }) kind!: 'factoring';
  @ApiProperty({
    enum: ['awaiting_consents', 'ready_to_request', 'approved', 'rejected', 'seller_paid', 'buyer_repaid', 'closed'],
  })
  status!:
    'awaiting_consents' | 'ready_to_request' | 'approved' | 'rejected' | 'seller_paid' | 'buyer_repaid' | 'closed';
  @ApiProperty({ minimum: 1, type: 'integer' }) amountUzs!: number;
  @ApiProperty({ enum: ['UZS'] }) currency!: 'UZS';
  @ApiProperty({ enum: ['none', 'mock', 'live'] }) latestProviderMode!: SettlementProviderMode;
  @ApiProperty({ enum: ['clear', 'required'] }) reconciliationState!: 'clear' | 'required';
  @ApiPropertyOptional() reconciliationReason?: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) revision!: number;
  @ApiProperty() simulation!: boolean;
  @ApiPropertyOptional({ format: 'date-time' }) buyerConsentedAt?: Date;
  @ApiPropertyOptional({ format: 'date-time' }) sellerConsentedAt?: Date;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class ContractSignatureDto {
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' }) artifactChecksum!: string;
  @ApiProperty({ enum: ['buyer', 'seller'] }) party!: 'buyer' | 'seller';
  @ApiProperty({ enum: ['mock', 'live'] }) providerMode!: 'mock' | 'live';
  @ApiProperty() providerName!: string;
  @ApiProperty({ format: 'date-time' }) signedAt!: Date;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ enum: [1] }) snapshotRevision!: number;
}

class ContractTimelineEventDto {
  @ApiProperty({ enum: ['buyer', 'seller', 'admin'] }) actorParty!: 'buyer' | 'seller' | 'admin';
  @ApiProperty({ enum: ['artifact', 'signature', 'settlement', 'fulfillment', 'dispute', 'completion'] })
  category!: MarketplaceContractLifecycle['timeline'][number]['category'];
  @ApiProperty() eventType!: string;
  @ApiProperty({ enum: ['none', 'mock', 'live'] }) providerMode!: 'none' | 'mock' | 'live';
  @ApiProperty({ minimum: 1, type: 'integer' }) sequence!: number;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

class ContractSettlementEventDto {
  @ApiProperty({ enum: ['buyer', 'seller'] }) actorParty!: 'buyer' | 'seller';
  @ApiProperty({ enum: settlementEventTypes })
  eventType!: MarketplaceContractLifecycle['settlementEvents'][number]['eventType'];
  @ApiProperty({ enum: ['none', 'mock', 'live'] }) providerMode!: 'none' | 'mock' | 'live';
  @ApiPropertyOptional() providerName?: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) sequence!: number;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

class ContractNotificationIntentDto {
  @ApiProperty({ enum: ['telegram', 'sms'] }) channel!: 'telegram' | 'sms';
  @ApiProperty({ enum: ['buyer', 'seller'] }) recipientParty!: 'buyer' | 'seller';
  @ApiProperty({ enum: ['pending', 'simulated', 'delivered', 'failed', 'reconciliation_required'] }) status!: string;
  @ApiProperty({ minimum: 0, type: 'integer' }) attempts!: number;
  @ApiProperty() simulation!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ format: 'date-time' }) lastAttemptAt?: Date;
}

class ContractReviewEligibilityDto {
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ minimum: 0, type: 'integer' }) sourceCount!: number;
}

@ApiExtraModels(DirectPaymentSettlementDto, FactoringSettlementDto)
class ContractLifecycleDto {
  @ApiPropertyOptional({ type: ContractArtifactDto }) artifact?: ContractArtifactDto;
  @ApiPropertyOptional({ type: ContractCommissionDto }) commission?: ContractCommissionDto;
  @ApiProperty({ format: 'uuid' }) contractId!: string;
  @ApiPropertyOptional({ type: ContractDisputeDto }) dispute?: ContractDisputeDto;
  @ApiProperty({ isArray: true, type: ContractDisputeEvidenceDto }) disputeEvidence!: ContractDisputeEvidenceDto[];
  @ApiProperty({ type: ContractFulfillmentDto }) fulfillment!: ContractFulfillmentDto;
  @ApiProperty({ isArray: true, type: ContractNotificationIntentDto })
  notificationIntents!: ContractNotificationIntentDto[];
  @ApiProperty({ type: ContractReviewEligibilityDto }) reviewEligibility!: ContractReviewEligibilityDto;
  @ApiProperty({ isArray: true, type: ContractReputationSignalDto })
  reputationSignals!: ContractReputationSignalDto[];
  @ApiProperty({
    discriminator: { propertyName: 'kind' },
    oneOf: [{ $ref: getSchemaPath(DirectPaymentSettlementDto) }, { $ref: getSchemaPath(FactoringSettlementDto) }],
  })
  settlement!: DirectPaymentSettlementDto | FactoringSettlementDto;
  @ApiProperty({ isArray: true, type: ContractSettlementEventDto }) settlementEvents!: ContractSettlementEventDto[];
  @ApiProperty({ isArray: true, type: ContractSignatureDto }) signatures!: ContractSignatureDto[];
  @ApiProperty({ isArray: true, type: ContractTimelineEventDto }) timeline!: ContractTimelineEventDto[];
}

@ApiTags('marketplace-contract-lifecycle')
@ApiExceptions(400, 401, 403, 404, 409, 413, 500, 503)
@ApiSessionCookieAuth()
@Controller('marketplace/contracts')
export class MarketplaceContractLifecycleController {
  constructor(private readonly service: MarketplaceContractLifecycleService) {}

  @Post(':id/artifact')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(ContractArtifactDto)
  async createArtifact(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateContractArtifactDto,
  ) {
    return createOkResponse(
      toContractArtifactDto(
        await this.service.createArtifact(
          ownerFrom(principal),
          id,
          input.settlementKind,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Get(':id/artifact')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(ContractArtifactDto)
  async getArtifact(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const artifact = await this.service.getArtifact(ownerFrom(principal), id);
    if (!artifact) {
      throw new ResourceNotFoundException('contract-artifact');
    }
    return createOkResponse(toContractArtifactDto(artifact));
  }

  @Get(':id/artifact/download')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    content: { 'application/pdf': { schema: { format: 'binary', type: 'string' } } },
    description: 'Authorized immutable contract artifact download.',
  })
  async downloadArtifact(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const download = await this.service.downloadArtifact(ownerFrom(principal), id);
    response.header('Content-Type', download.artifact.mediaType);
    response.header('Content-Disposition', `attachment; filename="${download.fileName}"`);
    response.header('X-Content-Type-Options', 'nosniff');
    return Buffer.from(download.content);
  }

  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(ContractLifecycleDto)
  async sign(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return createOkResponse(
      toContractLifecycleDto(await this.service.sign(ownerFrom(principal), id, requireIdempotencyKey(idempotencyKey))),
    );
  }

  @Post(':id/factoring/consent')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(ContractLifecycleDto)
  async consentFactoring(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return createOkResponse(
      toContractLifecycleDto(
        await this.service.consentFactoring(ownerFrom(principal), id, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  @Post(':id/settlement/events')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(ContractLifecycleDto)
  async recordSettlementEvent(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: SettlementCommandDto,
  ) {
    return createOkResponse(
      toContractLifecycleDto(
        await this.service.recordSettlementCommand(
          ownerFrom(principal),
          id,
          input.command,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Post(':id/fulfillment')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(ContractLifecycleDto)
  async transitionFulfillment(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: FulfillmentCommandDto,
  ) {
    return createOkResponse(
      toContractLifecycleDto(
        await this.service.transitionFulfillment(
          ownerFrom(principal),
          id,
          input.command,
          requireIdempotencyKey(idempotencyKey),
        ),
      ),
    );
  }

  @Post(':id/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeader)
  @ApiOkDataResponse(ContractLifecycleDto)
  async openDispute(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: OpenDisputeDto,
  ) {
    return createOkResponse(
      toContractLifecycleDto(
        await this.service.openDispute(ownerFrom(principal), id, input.reason, requireIdempotencyKey(idempotencyKey)),
      ),
    );
  }

  @Post(':id/dispute-evidence')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiHeader(idempotencyHeader)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      additionalProperties: false,
      properties: { evidence: { format: 'binary', type: 'string' } },
      required: ['evidence'],
      type: 'object',
    },
  })
  @ApiOkDataResponse(ContractDisputeEvidenceDto)
  async storeDisputeEvidence(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    const evidence = await readDisputeEvidencePart(request);
    const stored = await this.service.storeDisputeEvidence(
      ownerFrom(principal),
      id,
      evidence,
      requireIdempotencyKey(idempotencyKey),
    );
    return createOkResponse({
      byteSize: stored.byteSize,
      checksumSha256: stored.checksumSha256,
      createdAt: stored.createdAt,
      fileName: stored.fileName,
      id: stored.id,
      mediaType: stored.mediaType,
      providerMode: stored.providerMode,
      providerName: stored.providerName,
      revision: stored.revision,
      simulation: stored.simulation,
      uploadedByParty: stored.uploadedByParty,
    });
  }

  @Get(':id/lifecycle')
  @ApiParam({ format: 'uuid', name: 'id' })
  @ApiOkDataResponse(ContractLifecycleDto)
  async getLifecycle(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return createOkResponse(toContractLifecycleDto(await this.service.getLifecycle(ownerFrom(principal), id)));
  }
}

function toContractArtifactDto(artifact: MarketplaceContractArtifact): ContractArtifactDto {
  return {
    byteSize: artifact.byteSize,
    checksumSha256: artifact.checksumSha256,
    createdAt: artifact.createdAt,
    mediaType: artifact.mediaType,
    providerMode: artifact.providerMode,
    providerName: artifact.providerName,
    simulation: artifact.simulation,
    snapshotFingerprint: artifact.snapshotFingerprint,
    snapshotRevision: artifact.snapshotRevision,
    templateVersion: artifact.templateVersion,
    watermark: artifact.watermark,
  };
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- this explicit allowlist mapper keeps every private lifecycle field out of the user DTO
function toContractLifecycleDto(lifecycle: MarketplaceContractLifecycle): ContractLifecycleDto {
  const settlementCommon = {
    amountUzs: lifecycle.settlement.amountUzs,
    createdAt: lifecycle.settlement.createdAt,
    currency: lifecycle.settlement.currency,
    latestProviderMode: lifecycle.settlement.latestProviderMode,
    ...(lifecycle.settlement.reconciliationReason
      ? { reconciliationReason: lifecycle.settlement.reconciliationReason }
      : {}),
    reconciliationState: lifecycle.settlement.reconciliationState,
    revision: lifecycle.settlement.revision,
    simulation: lifecycle.settlement.simulation,
    updatedAt: lifecycle.settlement.updatedAt,
  };
  const settlement: DirectPaymentSettlementDto | FactoringSettlementDto =
    lifecycle.settlement.kind === 'direct_payment'
      ? {
          ...settlementCommon,
          kind: 'direct_payment',
          status: lifecycle.settlement.status as DirectPaymentSettlementDto['status'],
        }
      : {
          ...settlementCommon,
          ...(lifecycle.settlement.buyerConsentedAt ? { buyerConsentedAt: lifecycle.settlement.buyerConsentedAt } : {}),
          kind: 'factoring',
          ...(lifecycle.settlement.sellerConsentedAt
            ? { sellerConsentedAt: lifecycle.settlement.sellerConsentedAt }
            : {}),
          status: lifecycle.settlement.status as FactoringSettlementDto['status'],
        };
  return {
    ...(lifecycle.artifact ? { artifact: toContractArtifactDto(lifecycle.artifact) } : {}),
    ...(lifecycle.commission
      ? {
          commission: {
            amountUzs: lifecycle.commission.amountUzs,
            baseAmountUzs: lifecycle.commission.baseAmountUzs,
            createdAt: lifecycle.commission.createdAt,
            currency: lifecycle.commission.currency,
            rateSnapshot: { ...lifecycle.commission.rateSnapshot },
            rateVersion: lifecycle.commission.rateVersion,
          },
        }
      : {}),
    contractId: lifecycle.contractId,
    ...(lifecycle.dispute
      ? {
          dispute: {
            createdAt: lifecycle.dispute.createdAt,
            ...(lifecycle.dispute.decision ? { decision: lifecycle.dispute.decision } : {}),
            ...(lifecycle.dispute.evidenceRevision ? { evidenceRevision: lifecycle.dispute.evidenceRevision } : {}),
            openedByParty: lifecycle.dispute.openedByParty,
            ...(lifecycle.dispute.outcomeNote ? { outcomeNote: lifecycle.dispute.outcomeNote } : {}),
            reason: lifecycle.dispute.reason,
            ...(lifecycle.dispute.resolvedAt ? { resolvedAt: lifecycle.dispute.resolvedAt } : {}),
            status: lifecycle.dispute.status,
          },
        }
      : {}),
    disputeEvidence: lifecycle.disputeEvidence.map((evidence) => ({
      byteSize: evidence.byteSize,
      checksumSha256: evidence.checksumSha256,
      createdAt: evidence.createdAt,
      fileName: evidence.fileName,
      id: evidence.id,
      mediaType: evidence.mediaType,
      providerMode: evidence.providerMode,
      providerName: evidence.providerName,
      revision: evidence.revision,
      simulation: evidence.simulation,
      uploadedByParty: evidence.uploadedByParty,
    })),
    fulfillment: {
      ...(lifecycle.fulfillment.completedAt ? { completedAt: lifecycle.fulfillment.completedAt } : {}),
      createdAt: lifecycle.fulfillment.createdAt,
      ...(lifecycle.fulfillment.deliveredAt ? { deliveredAt: lifecycle.fulfillment.deliveredAt } : {}),
      revision: lifecycle.fulfillment.revision,
      ...(lifecycle.fulfillment.startedAt ? { startedAt: lifecycle.fulfillment.startedAt } : {}),
      status: lifecycle.fulfillment.status,
      updatedAt: lifecycle.fulfillment.updatedAt,
    },
    notificationIntents: lifecycle.notificationIntents.map((intent) => ({
      attempts: intent.attempts,
      channel: intent.channel,
      createdAt: intent.createdAt,
      ...(intent.lastAttemptAt ? { lastAttemptAt: intent.lastAttemptAt } : {}),
      recipientParty: intent.recipientParty,
      simulation: intent.simulation,
      status: intent.status,
    })),
    reviewEligibility: {
      eligible: lifecycle.reviewEligibilities.length > 0,
      sourceCount: lifecycle.reviewEligibilities.length,
    },
    reputationSignals: lifecycle.reputationSignals.map((signal) => ({
      createdAt: signal.createdAt,
      impact: signal.impact,
      outcome: signal.outcome,
      reason: signal.reason,
      subjectParty: signal.subjectParty,
    })),
    settlement,
    settlementEvents: lifecycle.settlementEvents.map((event) => ({
      actorParty: event.actorParty,
      createdAt: event.createdAt,
      eventType: event.eventType,
      providerMode: event.providerMode,
      ...(event.providerName ? { providerName: event.providerName } : {}),
      sequence: event.sequence,
      simulation: event.simulation,
    })),
    signatures: lifecycle.signatures.map((signature) => ({
      artifactChecksum: signature.artifactChecksum,
      party: signature.party,
      providerMode: signature.providerMode,
      providerName: signature.providerName,
      signedAt: signature.signedAt,
      simulation: signature.simulation,
      snapshotRevision: signature.snapshotRevision,
    })),
    timeline: lifecycle.timeline.map((event) => ({
      actorParty: event.actorParty,
      category: event.category,
      createdAt: event.createdAt,
      eventType: event.eventType,
      providerMode: event.providerMode,
      sequence: event.sequence,
      simulation: event.simulation,
    })),
  };
}

function ownerFrom(principal: AuthenticatedPrincipal): AgriTechOwner {
  return { tenantId: principal.tenantId, userId: principal.subject };
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- multipart stream validation and draining must remain one bounded request-state machine
async function readDisputeEvidencePart(request: FastifyRequest): Promise<DisputeEvidenceUpload> {
  let evidence: DisputeEvidenceUpload | undefined;
  let invalidPart = false;
  try {
    const multipartRequest = request as FastifyRequest & {
      parts(options?: { limits?: Record<string, number> }): AsyncIterableIterator<Multipart>;
    };
    for await (const part of multipartRequest.parts({
      limits: {
        fieldNameSize: 64,
        fieldSize: 1024,
        fields: 0,
        files: 1,
        headerPairs: 64,
        parts: 1,
        fileSize: maximumMarketplaceDisputeEvidenceBytes,
      },
    })) {
      if (part.type !== 'file') {
        invalidPart = true;
        continue;
      }
      if (part.fieldname !== 'evidence' || evidence) {
        invalidPart = true;
        for await (const chunk of part.file) {
          // Drain rejected file streams so Fastify can safely complete the request.
          const drainedChunk: unknown = chunk;
          if (!(drainedChunk instanceof Uint8Array)) {
            throw new BadRequestException({ meta: { field: 'evidence' } });
          }
        }
        continue;
      }
      const chunks: Uint8Array[] = [];
      let byteSize = 0;
      let tooLarge = false;
      for await (const chunk of part.file) {
        const unknownChunk: unknown = chunk;
        if (!(unknownChunk instanceof Uint8Array)) {
          throw new BadRequestException({ meta: { field: 'evidence' } });
        }
        const buffer = Uint8Array.from(unknownChunk);
        byteSize += buffer.byteLength;
        if (byteSize > maximumMarketplaceDisputeEvidenceBytes) {
          tooLarge = true;
        } else {
          chunks.push(buffer);
        }
      }
      if (tooLarge || part.file.truncated) {
        throw new MarketplaceEvidencePayloadTooLargeException();
      }
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(part.mimetype)) {
        invalidPart = true;
        continue;
      }
      evidence = {
        content: Buffer.concat(chunks, byteSize),
        fileName: part.filename,
        mediaType: part.mimetype as MarketplaceDisputeEvidenceMediaType,
      };
    }
  } catch (error) {
    if (
      error instanceof MarketplaceEvidencePayloadTooLargeException ||
      multipartErrorCode(error) === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw new MarketplaceEvidencePayloadTooLargeException();
    }
    throw new BadRequestException({
      ...(error instanceof Error ? { cause: error } : {}),
      meta: { field: 'evidence' },
    });
  }
  if (invalidPart || !evidence) {
    throw new BadRequestException({ meta: { field: 'evidence' } });
  }
  return evidence;
}

function multipartErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || !idempotencyKeyPattern.test(key)) {
    throw new BadRequestException({ meta: { field: 'Idempotency-Key' } });
  }
  return key;
}
