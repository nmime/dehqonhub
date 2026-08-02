import { FarmerProfile, CreateFarmerDto, UpdateFarmerDto } from './farmer-profile';

export interface FarmerRepository {
  findById(id: string): Promise<FarmerProfile | undefined>;
  findByPhone(phone: string): Promise<FarmerProfile | undefined>;
  findByTelegramId(telegramId: string): Promise<FarmerProfile | undefined>;
  findAll(filter?: { region?: string; role?: string }): Promise<FarmerProfile[]>;
  create(profile: FarmerProfile): Promise<void>;
  update(id: string, data: UpdateFarmerDto): Promise<void>;
}
