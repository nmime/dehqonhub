import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateFarmerUseCase, GetFarmerProfileUseCase, ListFarmersUseCase } from '@app/backend-feature-farmer-shared';
import { CreateFarmerDto, UpdateFarmerDto } from './farmer.dto';

@ApiTags('farmers')
@Controller('api/v1/farmers')
export class FarmerController {
  constructor(
    private readonly createFarmer: CreateFarmerUseCase,
    private readonly getFarmer: GetFarmerProfileUseCase,
    private readonly listFarmers: ListFarmersUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Register a new farmer' })
  @ApiResponse({ status: 201, description: 'Farmer registered successfully' })
  @ApiResponse({ status: 409, description: 'Farmer with this phone already exists' })
  async create(@Body() dto: CreateFarmerDto) {
    return this.createFarmer.execute(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get farmer profile by ID' })
  async getById(@Param('id') id: string) {
    return this.getFarmer.execute(id);
  }

  @Get()
  @ApiOperation({ summary: 'List farmers with optional filters' })
  async list(
    @Query('region') region?: string,
    @Query('role') role?: string,
  ) {
    return this.listFarmers.execute({ region, role });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update farmer profile' })
  async update(@Param('id') id: string, @Body() dto: UpdateFarmerDto) {
    // TODO: Implement update use-case
    return { id, ...dto };
  }
}
