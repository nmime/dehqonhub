import { IsString, IsNumber, IsArray, IsOptional, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class OrderItemDto {
  @ApiProperty({ example: 'product-123' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'farmer-456' })
  @IsString()
  farmerId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: "Toshkent viloyati, Chirchiq tumani" })
  @IsString()
  deliveryAddress: string;

  @ApiProperty({ example: "Toshkent viloyati" })
  @IsString()
  region: string;

  @ApiProperty({ required: false, enum: ['click', 'payme', 'cash_on_delivery', 'bank_transfer'] })
  @IsOptional()
  @IsIn(['click', 'payme', 'cash_on_delivery', 'bank_transfer'])
  paymentMethod?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] })
  @IsIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
  status: string;
}
