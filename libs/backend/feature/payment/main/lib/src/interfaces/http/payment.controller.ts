// @requirements REQ-AGRITECH-PAYMENT-004 REQ-AGRITECH-ROUTING-015
import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, IsUrl, Matches } from 'class-validator';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import { CurrentUser, Public, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  CreatePaymentUseCase,
  PaymentCallbackService,
  PaymentConfigurationService,
  type ClickCallbackInput,
  type ClickSignedCallbackInput,
} from '../../application/payment.use-cases';
import { PaymentProviders, type PaymentProvider } from '@app/backend-feature-payment-shared';

class CreatePaymentDto {
  @ApiProperty({ format: 'uuid' }) @IsString() orderId!: string;
  @ApiProperty({ enum: PaymentProviders }) @IsIn(PaymentProviders) provider!: PaymentProvider;
  @ApiProperty({ format: 'uri' }) @IsUrl({ protocols: ['https'], require_protocol: true }) returnUrl!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9:_-]{8,100}$/) idempotencyKey!: string;
  @ApiProperty({ enum: ['en', 'ru', 'uz'] }) @IsIn(['en', 'ru', 'uz']) locale!: 'en' | 'ru' | 'uz';
}

class PaymentHandoffViewDto {
  @ApiProperty({ format: 'uuid' }) transactionId!: string;
  @ApiProperty({ enum: PaymentProviders }) provider!: PaymentProvider;
  @ApiProperty({ enum: ['created', 'pending', 'paid', 'cancelled', 'failed', 'refunded'] }) state!: string;
  @ApiProperty({ format: 'uri' }) checkoutUrl!: string;
}

interface PaymeRpcDto {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
}

interface ClickDto {
  click_trans_id?: string | number;
  merchant_trans_id?: string;
  amount?: string | number;
  error?: string | number;
  service_id?: string | number;
  action?: string | number;
  sign_time?: string;
  sign_string?: string;
  merchant_prepare_id?: string | number;
}

@ApiTags('agritech-payments')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly createPayment: CreatePaymentUseCase,
    private readonly callbacks: PaymentCallbackService,
    private readonly configuration: PaymentConfigurationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(PaymentHandoffViewDto)
  @ApiExceptions(400, 401, 403, 404, 409, 503)
  @ApiSessionCookieAuth()
  async create(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreatePaymentDto) {
    return createOkResponse(
      await this.createPayment.execute({ tenantId: principal.tenantId, userId: principal.subject }, input),
    );
  }

  @Public()
  @Post('payme/callback')
  async payme(@Headers('authorization') authorization: string | undefined, @Body() input: PaymeRpcDto) {
    if (!this.configuration.authenticatePayme(authorization)) {
      return { jsonrpc: '2.0', id: input.id ?? null, error: { code: -32504, message: 'Insufficient privilege' } };
    }
    const response = await this.callbacks.payme(input.method ?? '', input.params ?? {});
    return { jsonrpc: '2.0', id: input.id ?? null, ...response };
  }

  @Public()
  @Post('click/prepare')
  async clickPrepare(@Body() input: ClickDto) {
    const normalized = toClickInput(input, 'prepare');
    return this.configuration.authenticateClick(normalized)
      ? this.callbacks.clickPrepare(normalized)
      : clickAuthError(normalized);
  }

  @Public()
  @Post('click/complete')
  async clickComplete(@Body() input: ClickDto) {
    const normalized = toClickInput(input, 'complete');
    return this.configuration.authenticateClick(normalized)
      ? this.callbacks.clickComplete(normalized)
      : clickAuthError(normalized);
  }
}

const toClickInput = (input: ClickDto, phase: 'prepare' | 'complete'): ClickSignedCallbackInput => ({
  phase,
  clickTransId: String(input.click_trans_id ?? ''),
  merchantTransId: String(input.merchant_trans_id ?? ''),
  amountUzs: Number(input.amount ?? 0),
  error: Number(input.error ?? 0),
  serviceId: String(input.service_id ?? ''),
  action: Number(input.action ?? -1),
  signTime: String(input.sign_time ?? ''),
  signString: String(input.sign_string ?? ''),
  ...(input.merchant_prepare_id === undefined ? {} : { merchantPrepareId: String(input.merchant_prepare_id) }),
});

const clickAuthError = (input: ClickCallbackInput) => ({
  click_trans_id: input.clickTransId,
  merchant_trans_id: input.merchantTransId,
  error: -1,
  error_note: 'SIGN CHECK FAILED!',
});
