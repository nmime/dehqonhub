export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'click' | 'payme' | 'cash_on_delivery' | 'bank_transfer';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceUzs: number;
  totalUzs: number;
}

export interface Order {
  id: string;
  farmerId: string;
  items: OrderItem[];
  totalAmountUzs: number;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  deliveryAddress: string;
  region: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderDto {
  farmerId: string;
  items: { productId: string; quantity: number }[];
  deliveryAddress: string;
  region: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.totalUzs, 0);
}

export interface OrderRepository {
  findById(id: string): Promise<Order | undefined>;
  findByFarmerId(farmerId: string): Promise<Order[]>;
  create(order: Order): Promise<void>;
  updateStatus(id: string, status: string): Promise<void>;
}

export interface ProductQueryService {
  getProduct(productId: string): Promise<{ id: string; name: string; priceUzs: number } | undefined>;
}

