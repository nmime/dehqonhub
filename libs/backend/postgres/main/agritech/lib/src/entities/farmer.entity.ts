import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

export type CropType = 'cotton' | 'wheat' | 'fruit' | 'vegetable' | 'potato' | 'rice' | 'other';
export type FarmerStatus = 'active' | 'inactive' | 'pending_verification';

export class FarmerEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  phone!: string;
  firstName!: string;
  lastName!: string;
  region!: string;
  district: string | null = null;
  village: string | null = null;
  farmSizeHectares!: number;
  crops: CropType[] = [];
  status: FarmerStatus = 'pending_verification';
  telegramId: string | null = null;
  latitude: number | null = null;
  longitude: number | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const FarmerEntitySchema = new EntitySchema<FarmerEntity>({
  class: FarmerEntity,
  tableName: 'farmers',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    phone: { type: 'varchar', length: 20 },
    firstName: { type: 'varchar', length: 100, fieldName: 'first_name' },
    lastName: { type: 'varchar', length: 100, fieldName: 'last_name' },
    region: { type: 'varchar', length: 100 },
    district: { type: 'varchar', length: 100, nullable: true },
    village: { type: 'varchar', length: 100, nullable: true },
    farmSizeHectares: { type: 'decimal', precision: 10, scale: 2, fieldName: 'farm_size_hectares' },
    crops: { type: 'json', defaultRaw: "'[]'::jsonb" },
    status: { type: 'varchar', length: 30, default: 'pending_verification' },
    telegramId: { type: 'varchar', length: 50, nullable: true, fieldName: 'telegram_id' },
    latitude: { type: 'decimal', precision: 10, scale: 6, nullable: true },
    longitude: { type: 'decimal', precision: 10, scale: 6, nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [
    { name: 'ux__farmers__tenant_user', properties: ['tenantId', 'userId'] },
    { name: 'ux__farmers__tenant_phone', properties: ['tenantId', 'phone'] },
  ],
  indexes: [
    { name: 'ix__farmers__phone', properties: ['phone'] },
    { name: 'ix__farmers__region', properties: ['region'] },
    { name: 'ix__farmers__telegram_id', properties: ['telegramId'] },
  ],
});
