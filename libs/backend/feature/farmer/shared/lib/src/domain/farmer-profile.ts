export type FarmerRole = 'dehqan' | 'cooperative' | 'supplier' | 'buyer' | 'agent';
export type CropType = 'cotton' | 'wheat' | 'fruit' | 'vegetable' | 'potato' | 'rice' | 'other';
export type FarmerStatus = 'active' | 'inactive' | 'pending_verification';

export interface FarmerProfile {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  region: string;
  district?: string;
  village?: string;
  farmSizeHectares: number;
  crops: CropType[];
  role: FarmerRole;
  status: FarmerStatus;
  telegramId?: string;
  latitude?: number;
  longitude?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFarmerDto {
  phone: string;
  firstName: string;
  lastName: string;
  region: string;
  district?: string;
  village?: string;
  farmSizeHectares: number;
  crops: CropType[];
  role?: FarmerRole;
  telegramId?: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateFarmerDto {
  firstName?: string;
  lastName?: string;
  region?: string;
  district?: string;
  village?: string;
  farmSizeHectares?: number;
  crops?: CropType[];
  role?: FarmerRole;
  telegramId?: string;
  latitude?: number;
  longitude?: number;
}

export const UZBEKISTAN_REGIONS = [
  'Toshkent shahri', 'Toshkent viloyati', 'Samarqand viloyati',
  'Andijon viloyati', 'Farg\'ona viloyati', 'Namangan viloyati',
  'Buxoro viloyati', 'Qashqadaryo viloyati', 'Surxondaryo viloyati',
  'Xorazm viloyati', 'Navoiy viloyati', 'Jizzax viloyati',
  'Sirdaryo viloyati', 'Qoraqalpog\'iston Respublikasi'
] as const;

export function validateRegion(region: string): boolean {
  return (UZBEKISTAN_REGIONS as readonly string[]).includes(region);
}

export function createFarmerProfile(dto: CreateFarmerDto, id: string): FarmerProfile {
  return {
    id,
    phone: dto.phone,
    firstName: dto.firstName,
    lastName: dto.lastName,
    region: dto.region,
    district: dto.district,
    village: dto.village,
    farmSizeHectares: dto.farmSizeHectares,
    crops: dto.crops,
    role: dto.role ?? 'dehqan',
    status: 'pending_verification',
    telegramId: dto.telegramId,
    latitude: dto.latitude,
    longitude: dto.longitude,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
