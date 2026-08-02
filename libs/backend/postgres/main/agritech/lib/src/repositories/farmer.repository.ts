import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { FarmerEntity } from '../entities/farmer.entity';
import { FarmerProfile, CreateFarmerDto, UpdateFarmerDto, FarmerRepository } from '@app/backend-feature-farmer-shared';

function toProfile(e: FarmerEntity): FarmerProfile {
  return {
    id: e.id,
    phone: e.phone,
    firstName: e.firstName,
    lastName: e.lastName,
    region: e.region,
    district: e.district ?? undefined,
    village: e.village ?? undefined,
    farmSizeHectares: Number(e.farmSizeHectares),
    crops: e.crops,
    role: e.role,
    status: e.status,
    telegramId: e.telegramId ?? undefined,
    latitude: e.latitude ?? undefined,
    longitude: e.longitude ?? undefined,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

@Injectable()
export class PostgresFarmerRepository implements FarmerRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async findById(id: string): Promise<FarmerProfile | undefined> {
    const e = await this.em.findOne(FarmerEntity, { id });
    return e ? toProfile(e) : undefined;
  }

  async findByPhone(phone: string): Promise<FarmerProfile | undefined> {
    const e = await this.em.findOne(FarmerEntity, { phone });
    return e ? toProfile(e) : undefined;
  }

  async findByTelegramId(telegramId: string): Promise<FarmerProfile | undefined> {
    const e = await this.em.findOne(FarmerEntity, { telegramId });
    return e ? toProfile(e) : undefined;
  }

  async findAll(filter?: { region?: string; role?: string }): Promise<FarmerProfile[]> {
    const where: Record<string, unknown> = {};
    if (filter?.region) where.region = filter.region;
    if (filter?.role) where.role = filter.role;
    const list = await this.em.find(FarmerEntity, where, { orderBy: { createdAt: 'DESC' } });
    return list.map(toProfile);
  }

  async create(profile: FarmerProfile): Promise<void> {
    const e = new FarmerEntity();
    Object.assign(e, profile);
    this.em.persist(e);
    await this.em.flush();
  }

  async update(id: string, data: UpdateFarmerDto): Promise<void> {
    const e = await this.em.findOne(FarmerEntity, { id });
    if (!e) throw new Error(`Farmer ${id} not found`);
    Object.assign(e, data, { updatedAt: new Date() });
    await this.em.flush();
  }
}
