// REQ-AGRITECH-ORDER-003 REQ-AGRITECH-ROUTING-015: all order routes derive ownership from the authenticated principal.
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse } from '@app/backend-common-response';
import { CurrentUser, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  CreateOrderUseCase,
  GetOrderUseCase,
  ListFarmerOrdersUseCase,
  type OrderOwner,
} from '@app/backend-feature-order-shared';
import { CreateOrderDto, OrderListDto, OrderViewDto } from './order.dto';

@ApiTags('agritech-orders')
@ApiExceptions(400, 401, 404, 409, 500)
@ApiSessionCookieAuth()
@Controller('orders')
export class OrderController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly getOrder: GetOrderUseCase,
    private readonly listOrders: ListFarmerOrdersUseCase,
  ) {}

  @Post()
  @ApiOkDataResponse(OrderViewDto)
  async create(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateOrderDto) {
    return createOkResponse(await this.createOrder.execute(ownerFrom(principal), input));
  }

  @Get()
  @ApiOkDataResponse(OrderListDto)
  async list(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.listOrders.execute(ownerFrom(principal)) });
  }

  @Get(':id')
  @ApiOkDataResponse(OrderViewDto)
  async get(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(await this.getOrder.execute(ownerFrom(principal), id));
  }
}

function ownerFrom(principal: AuthenticatedPrincipal): OrderOwner {
  return { tenantId: principal.tenantId, userId: principal.subject };
}
