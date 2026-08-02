import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'click' | 'payme' | 'cash_on_delivery' | 'bank_transfer';

export interface OrderItemData {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceUzs: number;
  totalUzs: number;
}

export class OrderEntity {
  id: string = randomUUID();
  farmerId!: string;
  items!: OrderItemData[];
  totalAmountUzs!: number;
  status: OrderStatus = 'pending';
  paymentMethod: PaymentMethod | null = null;
  deliveryAddress!: string;
  region!: string;
  notes: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const OrderEntitySchema = new EntitySchema<OrderEntity>({
  class: OrderEntity,
  tableName: 'orders',
  properties: {
    id: { type: 'uuid', primary: true },
    farmerId: { type: 'uuid', fieldName: 'farmer_id' },
    items: { type: 'json', defaultRaw: "'[]'::jsonb" },
    totalAmountUzs: { type: 'decimal', precision: 15, scale: 2, fieldName: 'total_amount_uzs' },
    status: { type: 'varchar', length: 20, default: 'pending' },
    paymentMethod: { type: 'varchar', length: 30, nullable: true, fieldName: 'payment_method' },
    deliveryAddress: { type: 'text', fieldName: 'delivery_address' },
    region: { type: 'varchar', length: 100 },
    notes: { type: 'text', nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [
    { name: 'ix__orders__farmer_id', properties: ['farmerId'] },
    { name: 'ix__orders__status', properties: ['status'] },
    { name: 'ix__orders__region', properties: ['region'] },
    { name: 'ix__orders__created_at', properties: ['createdAt'] },
  ],
});
