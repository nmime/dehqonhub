import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

export type FarmerRole = 'dehqan' | 'cooperative' | 'supplier' | 'buyer' | 'agent';
export type CropType = 'cotton' | 'wheat' | 'fruit' | 'vegetable' | 'potato' | 'rice' | 'other';
export type FarmerStatus = 'active' | 'inactive' | 'pending_verification';

export class FarmerEntity {
  id: string = randomUUID();
  phone!: string;
  firstName!: string;
  lastName!: string;
  region!: string;
  district: string | null = null;
  village: string | null = null;
  farmSizeHectares!: number;
  crops: CropType[] = [];
  role: FarmerRole = 'dehqan';
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
    phone: { type: 'varchar', length: 20, unique: true },
    firstName: { type: 'varchar', length: 100, fieldName: 'first_name' },
    lastName: { type: 'varchar', length: 100, fieldName: 'last_name' },
    region: { type: 'varchar', length: 100 },
    district: { type: 'varchar', length: 100, nullable: true },
    village: { type: 'varchar', length: 100, nullable: true },
    farmSizeHectares: { type: 'decimal', precision: 10, scale: 2, fieldName: 'farm_size_hectares' },
    crops: { type: 'json', defaultRaw: "'[]'::jsonb" },
    role: { type: 'varchar', length: 20, default: 'dehqan' },
    status: { type: 'varchar', length: 30, default: 'pending_verification' },
    telegramId: { type: 'varchar', length: 50, nullable: true, fieldName: 'telegram_id' },
    latitude: { type: 'decimal', precision: 10, scale: 6, nullable: true },
    longitude: { type: 'decimal', precision: 10, scale: 6, nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [
    { name: 'ix__farmers__phone', properties: ['phone'] },
    { name: 'ix__farmers__region', properties: ['region'] },
    { name: 'ix__farmers__role', properties: ['role'] },
    { name: 'ix__farmers__telegram_id', properties: ['telegramId'] },
  ],
});
