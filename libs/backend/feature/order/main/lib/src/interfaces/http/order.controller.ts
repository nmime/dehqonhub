import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CreateOrderUseCase, GetOrderUseCase, ListFarmerOrdersUseCase } from '@app/backend-feature-order-shared';
import type { CreateOrderDto as DomainCreateOrderDto } from '@app/backend-feature-order-shared';
import { CreateOrderDto, UpdateOrderStatusDto } from './order.dto';

@ApiTags('orders')
@Controller('api/v1/orders')
export class OrderController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly getOrder: GetOrderUseCase,
    private readonly listFarmerOrders: ListFarmerOrdersUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Place a new input order' })
  async create(@Body() dto: CreateOrderDto) {
    return this.createOrder.execute(dto as unknown as DomainCreateOrderDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  async getById(@Param('id') id: string) {
    return this.getOrder.execute(id);
  }

  @Get()
  @ApiOperation({ summary: 'List orders for a farmer' })
  async listByFarmer(@Query('farmerId') farmerId: string) {
    return this.listFarmerOrders.execute(farmerId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return { id, status: dto.status };
  }
}
