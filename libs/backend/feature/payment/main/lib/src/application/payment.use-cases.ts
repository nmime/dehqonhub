import { HttpStatus, Injectable } from '@nestjs/common';
import { Exception, ExceptionKind } from '@app/backend-common-exception';
import type { CreatePaymentDto } from '../domain/payment';

export class PaymentProviderUnavailableException extends Exception({
  name: 'PaymentProviderUnavailableException',
  kind: ExceptionKind.Server,
  status: HttpStatus.SERVICE_UNAVAILABLE,
}) {}

@Injectable()
export class CreatePaymentUseCase {
  execute(input: CreatePaymentDto): never {
    throw new PaymentProviderUnavailableException({
      meta: { orderId: input.orderId, provider: input.provider, returnUrl: input.returnUrl },
    });
  }
}
