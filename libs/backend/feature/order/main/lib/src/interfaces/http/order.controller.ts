// REQ-AGRITECH-ORDER-003 REQ-AGRITECH-ROUTING-015: all order routes derive ownership from the authenticated principal.
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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
  @HttpCode(HttpStatus.OK)
  @ApiOkDataResponse(OrderViewDto)
  async create(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateOrderDto) {
    return createOkResponse(await this.createOrder.execute(ownerFrom(principal), input));
  }

  @Get()
  @ApiOkDataResponse(OrderListDto)
  async list(@CurrentUser() principal: AuthenticatedPrincipal) {
    return createOkResponse({ items: await this.listOrders.execute(ownerFrom(principal)) });
  }

  // The id reaches a `uuid` column directly, so an unparsed value made Postgres
  // raise `invalid input syntax for type uuid` and the route answered 500 instead
  // of the 400 this controller already declares. Every other order-flow route
  // parses its uuid params the same way.
  @Get(':id')
  @ApiOkDataResponse(OrderViewDto)
  async get(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return createOkResponse(await this.getOrder.execute(ownerFrom(principal), id));
  }
}

function ownerFrom(principal: AuthenticatedPrincipal): OrderOwner {
  return { tenantId: principal.tenantId, userId: principal.subject };
}
