// REQ-AGRITECH-CATALOG-002: the farmer-facing API exposes active catalog reads only.
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import {
  GetProductUseCase,
  ListProductsUseCase,
  ProductCategories,
  type ProductCategory,
} from '@app/backend-feature-product-shared';
import { ProductListDto, ProductViewDto } from './product.dto';

class CatalogQueryDto {
  @IsOptional() @IsIn(ProductCategories) category?: ProductCategory;
  @IsOptional() @IsString() region?: string;
}

@ApiTags('agritech-catalog')
@ApiExceptions(400, 401, 404, 500)
@ApiSessionCookieAuth()
@Controller('agritech/catalog')
export class ProductController {
  constructor(
    private readonly getProduct: GetProductUseCase,
    private readonly listProducts: ListProductsUseCase,
  ) {}

  @Get()
  @ApiOkDataResponse(ProductListDto)
  async list(@Query() query: CatalogQueryDto) {
    return createOkResponse({ items: await this.listProducts.execute(query) });
  }

  @Get(':id')
  @ApiOkDataResponse(ProductViewDto)
  async getById(@Param('id') id: string) {
    return createOkResponse(await this.getProduct.execute(id));
  }
}
