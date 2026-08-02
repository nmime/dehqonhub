import { Injectable, Inject } from '@nestjs/common';
import { FarmerProfile, CreateFarmerDto, FarmerRepository } from '../domain';
import { FarmerRepositoryInjectToken } from './inject-tokens';

@Injectable()
export class CreateFarmerUseCase {
  constructor(@Inject(FarmerRepositoryInjectToken) private readonly repository: FarmerRepository) {}

  async execute(dto: CreateFarmerDto): Promise<FarmerProfile> {
    const existing = await this.repository.findByPhone(dto.phone);
    if (existing) {
      throw new Error(`Farmer with phone ${dto.phone} already exists`);
    }
    const id = crypto.randomUUID();
    const profile: FarmerProfile = {
      id, phone: dto.phone, firstName: dto.firstName, lastName: dto.lastName,
      region: dto.region, district: dto.district, village: dto.village,
      farmSizeHectares: dto.farmSizeHectares, crops: dto.crops,
      role: dto.role ?? 'dehqan', status: 'pending_verification',
      telegramId: dto.telegramId, latitude: dto.latitude, longitude: dto.longitude,
      createdAt: new Date(), updatedAt: new Date(),
    };
    await this.repository.create(profile);
    return profile;
  }
}

@Injectable()
export class GetFarmerProfileUseCase {
  constructor(@Inject(FarmerRepositoryInjectToken) private readonly repository: FarmerRepository) {}
  async execute(id: string): Promise<FarmerProfile | undefined> {
    return this.repository.findById(id);
  }
}

@Injectable()
export class ListFarmersUseCase {
  constructor(@Inject(FarmerRepositoryInjectToken) private readonly repository: FarmerRepository) {}
  async execute(filter?: { region?: string; role?: string }): Promise<FarmerProfile[]> {
    return this.repository.findAll(filter);
  }
}
