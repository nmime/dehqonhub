import { IsString, IsNumber, IsArray, IsOptional, IsIn, Min, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { CropType, FarmerRole } from '@app/backend-feature-farmer-shared';
import { UZBEKISTAN_REGIONS } from '@app/backend-feature-farmer-shared';

export class CreateFarmerDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, { message: 'Phone must be in format +998XXXXXXXXX' })
  phone!: string;

  @ApiProperty({ example: 'Abdulloh' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Karimov' })
  @IsString()
  lastName!: string;

  @ApiProperty({ enum: UZBEKISTAN_REGIONS })
  @IsIn(UZBEKISTAN_REGIONS)
  region!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  village?: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber()
  @Min(0.01)
  farmSizeHectares!: number;

  @ApiProperty({ enum: ['cotton', 'wheat', 'fruit', 'vegetable', 'potato', 'rice', 'other'], isArray: true })
  @IsArray()
  crops!: CropType[];

  @ApiProperty({ required: false, enum: ['dehqan', 'cooperative', 'supplier', 'buyer', 'agent'] })
  @IsOptional()
  @IsIn(['dehqan', 'cooperative', 'supplier', 'buyer', 'agent'])
  role?: FarmerRole;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telegramId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class UpdateFarmerDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ required: false, enum: UZBEKISTAN_REGIONS })
  @IsOptional()
  region?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  village?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  farmSizeHectares?: number;

  @ApiProperty({ required: false, enum: ['cotton', 'wheat', 'fruit', 'vegetable', 'potato', 'rice', 'other'], isArray: true })
  @IsOptional()
  @IsArray()
  crops?: CropType[];

  @ApiProperty({ required: false, enum: ['dehqan', 'cooperative', 'supplier', 'buyer', 'agent'] })
  @IsOptional()
  role?: FarmerRole;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telegramId?: string;
}
