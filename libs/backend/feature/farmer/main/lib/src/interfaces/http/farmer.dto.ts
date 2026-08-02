import { IsString, IsNumber, IsArray, IsOptional, IsIn, Min, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CropType, FarmerRole, UZBEKISTAN_REGIONS } from '@app/backend-feature-farmer-shared';

export class CreateFarmerDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, { message: 'Phone must be in format +998XXXXXXXXX' })
  phone: string;

  @ApiProperty({ example: 'Abdulloh' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Karimov' })
  @IsString()
  lastName: string;

  @ApiProperty({ enum: UZBEKISTAN_REGIONS })
  @IsIn(UZBEKISTAN_REGIONS)
  region: string;

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
  farmSizeHectares: number;

  @ApiProperty({ enum: CropType, isArray: true })
  @IsArray()
  crops: CropType[];

  @ApiProperty({ required: false, enum: FarmerRole })
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

  @ApiProperty({ required: false, enum: CropType, isArray: true })
  @IsOptional()
  @IsArray()
  crops?: CropType[];

  @ApiProperty({ required: false, enum: FarmerRole })
  @IsOptional()
  role?: FarmerRole;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telegramId?: string;
}
