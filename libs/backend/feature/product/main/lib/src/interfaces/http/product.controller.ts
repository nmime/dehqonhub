// REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ROUTING-015: the farmer-facing API exposes active catalog reads only.
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
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
@Controller('marketplace/catalog')
export class ProductController {
  constructor(
    private readonly getProduct: GetProductUseCase,
    private readonly listProducts: ListProductsUseCase,
  ) {}

  @Get()
  @ApiOkDataResponse(ProductListDto)
  async list(@CurrentUser() principal: AuthenticatedPrincipal, @Query() query: CatalogQueryDto) {
    return createOkResponse({ items: await this.listProducts.execute(principal.tenantId, query) });
  }

  @Get(':id')
  @ApiOkDataResponse(ProductViewDto)
  async getById(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(await this.getProduct.execute(principal.tenantId, id));
  }
}
