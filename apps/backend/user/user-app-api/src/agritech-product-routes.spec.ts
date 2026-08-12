// @requirements REQ-AGRITECH-ROUTING-015 REQ-AGRITECH-MARKETPLACE-016
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import { AgriTechOperationsController } from '@app/backend-feature-agritech-main';
import { FarmerController } from '@app/backend-feature-farmer-main';
import { OrderController } from '@app/backend-feature-order-main';
import { PaymentModule } from '@app/backend-feature-payment-main';
import { ProductController } from '@app/backend-feature-product-main';
import { GetProductUseCase, ListProductsUseCase } from '@app/backend-feature-product-shared';

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

    expect(prefixes).toEqual(['/', 'farmer', 'orders', 'payments', 'marketplace/catalog']);
    expect(prefixes).not.toContain(expect.stringContaining('agritech'));
  });
});

describe('public catalog HTTP contract', () => {
  const getProduct = { execute: vi.fn() };
  const listProducts = { execute: vi.fn(async () => ({ items: [] })) };
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        { provide: GetProductUseCase, useValue: getProduct },
        { provide: ListProductsUseCase, useValue: listProducts },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ExceptionsFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Anyone can reach this route without a session, so a hand-typed or stale link
  // is an ordinary request rather than an edge case. It used to carry the raw id
  // into the data layer and come back as a 500.
  it('returns a 400 validation problem for a malformed listing id instead of reaching storage', async () => {
    const response = await app.inject({ method: 'GET', url: '/marketplace/catalog/not-a-uuid' });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toEqual(expect.stringContaining('application/problem+json'));
    expect(getProduct.execute).not.toHaveBeenCalled();
  });
});
