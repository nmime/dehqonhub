export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderOwner {
  tenantId: string;
  userId: string;
}

export interface OrderItemRequest {
  productId: string;
  quantity: number;
}

export interface OrderItem extends OrderItemRequest {
  productName: string;
  unitPriceUzs: number;
  totalUzs: number;
}

export interface Order extends OrderOwner {
  id: string;
  farmerId: string;
  items: OrderItem[];
  totalAmountUzs: number;
  status: OrderStatus;
  deliveryAddress: string;
  region: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderDto {
  items: OrderItemRequest[];
  deliveryAddress: string;
  region: string;
  notes?: string;
}

export type CreateOwnedOrderResult =
  | { status: 'created'; order: Order }
  | { status: 'farmer_not_found' }
  | { status: 'invalid_product' | 'insufficient_stock'; productId: string };

export interface OrderRepository {
  createOwned(owner: OrderOwner, input: CreateOrderDto): Promise<CreateOwnedOrderResult>;
  findOwned(owner: OrderOwner, id: string): Promise<Order | undefined>;
  listOwned(owner: OrderOwner): Promise<Order[]>;
}
