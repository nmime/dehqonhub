// @requirements REQ-AGRITECH-ROUTING-015
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AgriTechOperationsController } from '@app/backend-feature-agritech-main';
import { FarmerController } from '@app/backend-feature-farmer-main';
import { OrderController } from '@app/backend-feature-order-main';
import { PaymentModule } from '@app/backend-feature-payment-main';
import { ProductController } from '@app/backend-feature-product-main';

describe('AgriTech user product routes', () => {
  it('owns direct resource prefixes without a redundant product segment', () => {
    const paymentController = (
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PaymentModule) as Array<{ name: string }>
    ).find(({ name }) => name === 'PaymentController');

    expect(paymentController).toBeDefined();
    const prefixes = [
      Reflect.getMetadata(PATH_METADATA, AgriTechOperationsController),
      Reflect.getMetadata(PATH_METADATA, FarmerController),
      Reflect.getMetadata(PATH_METADATA, OrderController),
      Reflect.getMetadata(PATH_METADATA, paymentController as Record<string, unknown>),
      Reflect.getMetadata(PATH_METADATA, ProductController),
    ];

    expect(prefixes).toEqual(['/', 'farmer', 'orders', 'payments', 'catalog']);
    expect(prefixes).not.toContain(expect.stringContaining('agritech'));
  });
});
