// @requirements REQ-AGRITECH-PAYMENT-004
import { describe, expect, it } from 'vitest';
import { PaymentProviders, PaymentRepositoryInjectToken } from './index';

describe('payment shared contracts', () => {
  it('exports the repository port and supported providers', () => {
    expect(typeof PaymentRepositoryInjectToken).toBe('symbol');
    expect(PaymentProviders).toEqual(['click', 'payme', 'bnpl']);
  });
});
