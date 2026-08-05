import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type OrderKind = 'input' | 'produce';

export interface OrderHistoryData {
  status: OrderStatus;
  actorUserId: string;
  at: string;
}

export interface OrderItemData {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceUzs: number;
  totalUzs: number;
}

export class OrderEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  farmerId!: string;
  kind: OrderKind = 'input';
  buyerPartnerId: string | null = null;
  produceListingId: string | null = null;
  items!: OrderItemData[];
  totalAmountUzs!: number;
  status: OrderStatus = 'pending';
  deliveryAddress!: string;
  region!: string;
  notes: string | null = null;
  history: OrderHistoryData[] = [];
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const OrderEntitySchema = new EntitySchema<OrderEntity>({
  class: OrderEntity,
  tableName: 'orders',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    farmerId: { type: 'uuid', fieldName: 'farmer_id' },
    kind: { type: 'varchar', length: 20, default: 'input' },
    buyerPartnerId: { type: 'uuid', nullable: true, fieldName: 'buyer_partner_id' },
    produceListingId: { type: 'uuid', nullable: true, fieldName: 'produce_listing_id' },
    items: { type: 'json', defaultRaw: "'[]'::jsonb" },
    totalAmountUzs: { type: 'decimal', precision: 15, scale: 2, fieldName: 'total_amount_uzs' },
    status: { type: 'varchar', length: 20, default: 'pending' },
    deliveryAddress: { type: 'text', fieldName: 'delivery_address' },
    region: { type: 'varchar', length: 100 },
    notes: { type: 'text', nullable: true },
    history: { type: 'json', defaultRaw: "'[]'::jsonb" },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [
    { name: 'ix__orders__tenant_user', properties: ['tenantId', 'userId'] },
    { name: 'ix__orders__farmer_id', properties: ['farmerId'] },
    { name: 'ix__orders__status', properties: ['status'] },
    { name: 'ix__orders__region', properties: ['region'] },
    { name: 'ix__orders__created_at', properties: ['createdAt'] },
    { name: 'ix__orders__buyer_partner_id', properties: ['buyerPartnerId'] },
    { name: 'ix__orders__produce_listing_id', properties: ['produceListingId'] },
  ],
});
