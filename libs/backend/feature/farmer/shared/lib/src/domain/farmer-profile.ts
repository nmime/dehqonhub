export const UzbekistanRegions = [
  'Toshkent shahri',
  'Toshkent viloyati',
  'Samarqand viloyati',
  'Andijon viloyati',
  "Farg'ona viloyati",
  'Namangan viloyati',
  'Buxoro viloyati',
  'Qashqadaryo viloyati',
  'Surxondaryo viloyati',
  'Xorazm viloyati',
  'Navoiy viloyati',
  'Jizzax viloyati',
  'Sirdaryo viloyati',
  "Qoraqalpog'iston Respublikasi",
] as const;

export const CropTypes = ['cotton', 'wheat', 'fruit', 'vegetable', 'potato', 'rice', 'other'] as const;

export type UzbekistanRegion = (typeof UzbekistanRegions)[number];
export type CropType = (typeof CropTypes)[number];
export type FarmerStatus = 'active' | 'inactive' | 'pending_verification';

export interface FarmerOwner {
  tenantId: string;
  userId: string;
}

export interface FarmerProfile extends FarmerOwner {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  region: UzbekistanRegion;
  district?: string;
  village?: string;
  farmSizeHectares: number;
  crops: CropType[];
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
  region: UzbekistanRegion;
  district?: string;
  village?: string;
  farmSizeHectares: number;
  crops: CropType[];
  telegramId?: string;
  latitude?: number;
  longitude?: number;
}

export type UpdateFarmerDto = Partial<Omit<CreateFarmerDto, 'phone'>>;
