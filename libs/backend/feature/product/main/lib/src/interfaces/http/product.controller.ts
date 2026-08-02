import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateProductUseCase, GetProductUseCase, ListProductsUseCase } from '@app/backend-feature-product-shared';
import { CreateProductDto, UpdateProductDto } from './product.dto';

@ApiTags('products')
@Controller('api/v1/products')
export class ProductController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly listProducts: ListProductsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product listing' })
  async create(@Body() dto: CreateProductDto) {
    return this.createProduct.execute(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  async getById(@Param('id') id: string) {
    return this.getProduct.execute(id);
  }

  @Get()
  @ApiOperation({ summary: 'List products with filters' })
  async list(
    @Query('category') category?: string,
    @Query('region') region?: string,
  ) {
    return this.listProducts.execute({ category, region });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update product' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return { id, ...dto };
  }
}
