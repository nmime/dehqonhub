// REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ROUTING-015: the farmer-facing API exposes active catalog reads only.
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import {
  CurrentUser,
  DefaultAuthTenantId,
  Public,
  type AuthenticatedPrincipal,
} from '@app/backend-feature-auth-shared';
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

/**
 * Browsing the catalog needs no session. A visitor who has to sign in before
 * seeing a single listing has no reason to sign up, so these two reads are
 * public and resolve the default tenant when no session names one. Everything
 * that acts on a listing — cart, favourites, samples, reviews — stays guarded.
 */
@ApiTags('agritech-catalog')
@ApiExceptions(400, 404, 500)
@ApiSessionCookieAuth()
@Controller('marketplace/catalog')
export class ProductController {
  constructor(
    private readonly getProduct: GetProductUseCase,
    private readonly listProducts: ListProductsUseCase,
  ) {}

  @Get()
  @Public()
  @ApiOkDataResponse(ProductListDto)
  async list(@CurrentUser() principal: AuthenticatedPrincipal | undefined, @Query() query: CatalogQueryDto) {
    return createOkResponse(await this.listProducts.execute(tenantOf(principal), query));
  }

  @Get(':id')
  @Public()
  @ApiOkDataResponse(ProductViewDto)
  async getById(@CurrentUser() principal: AuthenticatedPrincipal | undefined, @Param('id') id: string) {
    return createOkResponse(await this.getProduct.execute(tenantOf(principal), id));
  }
}

const tenantOf = (principal: AuthenticatedPrincipal | undefined): string => principal?.tenantId ?? DefaultAuthTenantId;
