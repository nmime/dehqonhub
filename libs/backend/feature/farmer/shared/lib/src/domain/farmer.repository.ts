import type { CreateFarmerDto, FarmerOwner, FarmerProfile, UpdateFarmerDto } from './farmer-profile';

export interface FarmerRepository {
  findByOwner(owner: FarmerOwner): Promise<FarmerProfile | undefined>;
  findByPhone(tenantId: string, phone: string): Promise<FarmerProfile | undefined>;
  create(owner: FarmerOwner, input: CreateFarmerDto): Promise<FarmerProfile>;
  update(owner: FarmerOwner, input: UpdateFarmerDto): Promise<FarmerProfile | undefined>;
}
