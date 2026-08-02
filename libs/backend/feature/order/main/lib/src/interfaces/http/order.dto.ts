import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiProperty({ example: 'Fargona, Quva tumani' })
  @IsString()
  deliveryAddress!: string;

  @ApiProperty({ example: "Farg'ona viloyati" })
  @IsString()
  region!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class OrderItemViewDto extends OrderItemDto {
  @ApiProperty() productName!: string;
  @ApiProperty() unitPriceUzs!: number;
  @ApiProperty() totalUzs!: number;
}

export class OrderViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ format: 'uuid' }) farmerId!: string;
  @ApiProperty({ type: [OrderItemViewDto] }) items!: OrderItemViewDto[];
  @ApiProperty() totalAmountUzs!: number;
  @ApiProperty({ enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] }) status!: string;
  @ApiProperty() deliveryAddress!: string;
  @ApiProperty() region!: string;
  @ApiProperty({ required: false }) notes?: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class OrderListDto {
  @ApiProperty({ type: [OrderViewDto] }) items!: OrderViewDto[];
}
