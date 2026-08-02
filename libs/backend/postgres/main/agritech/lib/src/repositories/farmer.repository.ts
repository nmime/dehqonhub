import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateFarmerDto,
  FarmerOwner,
  FarmerProfile,
  FarmerRepository,
  UpdateFarmerDto,
} from '@app/backend-feature-farmer-shared';
import { FarmerEntity } from '../entities/farmer.entity';

export function toFarmerProfile(entity: FarmerEntity): FarmerProfile {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    userId: entity.userId,
    phone: entity.phone,
    firstName: entity.firstName,
    lastName: entity.lastName,
    region: entity.region as FarmerProfile['region'],
    district: entity.district ?? undefined,
    village: entity.village ?? undefined,
    farmSizeHectares: Number(entity.farmSizeHectares),
    crops: entity.crops,
    status: entity.status,
    telegramId: entity.telegramId ?? undefined,
    latitude: entity.latitude === null ? undefined : Number(entity.latitude),
    longitude: entity.longitude === null ? undefined : Number(entity.longitude),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

@Injectable()
export class PostgresFarmerRepository implements FarmerRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async findByOwner(owner: FarmerOwner): Promise<FarmerProfile | undefined> {
    const entity = await this.em.findOne(FarmerEntity, owner);
    return entity ? toFarmerProfile(entity) : undefined;
  }

  async findByPhone(tenantId: string, phone: string): Promise<FarmerProfile | undefined> {
    const entity = await this.em.findOne(FarmerEntity, { tenantId, phone });
    return entity ? toFarmerProfile(entity) : undefined;
  }

  async create(owner: FarmerOwner, input: CreateFarmerDto): Promise<FarmerProfile> {
    const entity = new FarmerEntity();
    Object.assign(entity, owner, input);
    this.em.persist(entity);
    await this.em.flush();
    return toFarmerProfile(entity);
  }

  async update(owner: FarmerOwner, input: UpdateFarmerDto): Promise<FarmerProfile | undefined> {
    const entity = await this.em.findOne(FarmerEntity, owner);
    if (!entity) {
      return undefined;
    }
    this.em.assign(entity, input);
    await this.em.flush();
    return toFarmerProfile(entity);
  }
}
