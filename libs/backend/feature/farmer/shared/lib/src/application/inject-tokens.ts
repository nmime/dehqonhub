import { InjectionToken } from '@nestjs/common';

// Farmer repository token
export const FarmerRepositoryInjectToken = new InjectionToken('FarmerRepository');

// Product repository token
export const ProductRepositoryInjectToken = new InjectionToken('ProductRepository');

// Order repository token
export const OrderRepositoryInjectToken = new InjectionToken('OrderRepository');

// Product query service token
export const ProductQueryServiceInjectToken = new InjectionToken('ProductQueryService');
