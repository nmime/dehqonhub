import { Module } from '@nestjs/common';
import { GetProductUseCase, ListProductsUseCase } from '@app/backend-feature-product-shared';
import { ProductController } from './interfaces/http';

@Module({ controllers: [ProductController], providers: [GetProductUseCase, ListProductsUseCase] })
export class ProductMainModule {}
