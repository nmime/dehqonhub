import { IsString, IsNumber, IsArray, IsOptional, IsIn, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { ProductCategory } from '@app/backend-feature-product-shared';

const maximumProductPriceUzs = 9_999_999_999_999;

export class ProductViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ required: false }) nameRu?: string;
  @ApiProperty({ required: false }) nameUz?: string;
  @ApiProperty({ enum: ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] })
  category!: ProductCategory;
  @ApiProperty() description!: string;
  @ApiProperty() supplierId!: string;
  @ApiProperty() supplierName!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: maximumProductPriceUzs }) priceUzs!: number;
  @ApiProperty() unit!: string;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 2_147_483_647 }) stockQuantity!: number;
  @ApiProperty() region!: string;
  @ApiProperty({ enum: ['active', 'inactive', 'out_of_stock'] }) status!: string;
  @ApiProperty({ type: [String] }) images!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ProductListDto {
  @ApiProperty({ type: [ProductViewDto] }) items!: ProductViewDto[];
}

export class CreateProductDto {
  @ApiProperty({ example: 'NitroAmmonka 46%' })
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiProperty({ enum: ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] })
  @IsIn(['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'])
  category!: ProductCategory;

  @ApiProperty({ example: 'High nitrogen fertilizer for cotton' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 'supplier-123' })
  @IsString()
  supplierId!: string;

  @ApiProperty({ example: 'AgroHub' })
  @IsString()
  supplierName!: string;

  @ApiProperty({ example: 85000 })
  @IsNumber()
  @Min(0)
  priceUzs!: number;

  @ApiProperty({ example: '50kg bag' })
  @IsString()
  unit!: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  stockQuantity!: number;

  @ApiProperty({ example: 'Toshkent viloyati' })
  @IsString()
  region!: string;

  @ApiProperty({ required: false, isArray: true })
  @IsOptional()
  @IsArray()
  images?: string[];
}

export class UpdateProductDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceUzs?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: 'active' | 'inactive' | 'out_of_stock';
}
