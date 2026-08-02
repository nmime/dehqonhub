import { Module } from '@nestjs/common';
import { CreateProductUseCase, GetProductUseCase, ListProductsUseCase } from '@app/backend-feature-product-shared';
import { ProductController } from './interfaces/http';

@Module({
  controllers: [ProductController],
  providers: [CreateProductUseCase, GetProductUseCase, ListProductsUseCase],
})
export class ProductMainModule {}
