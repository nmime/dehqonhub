// REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-ROUTING-015: authority comes from the authenticated principal, never route or body IDs.
import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  CreateFarmerUseCase,
  GetFarmerProfileUseCase,
  UpdateFarmerUseCase,
  type FarmerOwner,
} from '@app/backend-feature-farmer-shared';
import { CreateFarmerDto, FarmerProfileDto, UpdateFarmerDto } from './farmer.dto';

@ApiTags('agritech-farmer')
@ApiExceptions(400, 401, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller('farmer')
export class FarmerController {
  constructor(
    private readonly createFarmer: CreateFarmerUseCase,
    private readonly getFarmer: GetFarmerProfileUseCase,
    private readonly updateFarmer: UpdateFarmerUseCase,
  ) {}

  @Post()
  @ApiOkDataResponse(FarmerProfileDto)
  async create(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateFarmerDto) {
    return createOkResponse(await this.createFarmer.execute(ownerFrom(principal), input));
  }

  @Get()
  @ApiOkDataResponse(FarmerProfileDto)
  async get(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse(await this.getFarmer.execute(ownerFrom(principal)));
  }

  @Patch()
  @ApiOkDataResponse(FarmerProfileDto)
  async update(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: UpdateFarmerDto) {
    return createOkResponse(await this.updateFarmer.execute(ownerFrom(principal), input));
  }
}

function ownerFrom(principal: AuthenticatedPrincipal): FarmerOwner {
  return { tenantId: principal.tenantId, userId: principal.subject };
}
