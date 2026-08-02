import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { CropTypes, UzbekistanRegions, type CropType, type UzbekistanRegion } from '@app/backend-feature-farmer-shared';

export class CreateFarmerDto {
  @ApiProperty({ example: '+998901234567' })
  @Matches(/^\+998\d{9}$/)
  phone!: string;

  @ApiProperty({ example: 'Abdulloh' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Karimov' })
  @IsString()
  lastName!: string;

  @ApiProperty({ enum: UzbekistanRegions })
  @IsIn(UzbekistanRegions)
  region!: UzbekistanRegion;

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

  @ApiProperty({ enum: CropTypes, isArray: true })
  @IsArray()
  @IsIn(CropTypes, { each: true })
  crops!: CropType[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telegramId?: string;

  @ApiProperty({ required: false, minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiProperty({ required: false, minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class UpdateFarmerDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?: string;
  @ApiProperty({ required: false, enum: UzbekistanRegions })
  @IsOptional()
  @IsIn(UzbekistanRegions)
  region?: UzbekistanRegion;
  @ApiProperty({ required: false }) @IsOptional() @IsString() district?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() village?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0.01) farmSizeHectares?: number;
  @ApiProperty({ required: false, enum: CropTypes, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(CropTypes, { each: true })
  crops?: CropType[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() telegramId?: string;
}

export class FarmerProfileDto extends CreateFarmerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: ['pending_verification', 'active', 'inactive'] }) status!:
    'pending_verification' | 'active' | 'inactive';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
