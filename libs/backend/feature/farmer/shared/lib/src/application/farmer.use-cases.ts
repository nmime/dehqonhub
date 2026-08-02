import { Inject, Injectable } from '@nestjs/common';
import { ConflictException, ResourceNotFoundException } from '@app/backend-common-exception';
import type { CreateFarmerDto, FarmerOwner, FarmerProfile, FarmerRepository, UpdateFarmerDto } from '../domain';
import { FarmerRepositoryInjectToken } from './inject-tokens';

@Injectable()
export class CreateFarmerUseCase {
  constructor(@Inject(FarmerRepositoryInjectToken) private readonly repository: FarmerRepository) {}

  async execute(owner: FarmerOwner, input: CreateFarmerDto): Promise<FarmerProfile> {
    const existingOwner = await this.repository.findByOwner(owner);
    if (existingOwner) {
      throw new ConflictException('farmer-profile', 'owner');
    }
    const existingPhone = await this.repository.findByPhone(owner.tenantId, input.phone);
    if (existingPhone) {
      throw new ConflictException('farmer-profile', 'phone');
    }
    return this.repository.create(owner, input);
  }
}

@Injectable()
export class GetFarmerProfileUseCase {
  constructor(@Inject(FarmerRepositoryInjectToken) private readonly repository: FarmerRepository) {}

  async execute(owner: FarmerOwner): Promise<FarmerProfile> {
    const profile = await this.repository.findByOwner(owner);
    if (!profile) {
      throw new ResourceNotFoundException('farmer-profile');
    }
    return profile;
  }
}

@Injectable()
export class UpdateFarmerUseCase {
  constructor(@Inject(FarmerRepositoryInjectToken) private readonly repository: FarmerRepository) {}

  async execute(owner: FarmerOwner, input: UpdateFarmerDto): Promise<FarmerProfile> {
    const profile = await this.repository.update(owner, input);
    if (!profile) {
      throw new ResourceNotFoundException('farmer-profile');
    }
    return profile;
  }
}
