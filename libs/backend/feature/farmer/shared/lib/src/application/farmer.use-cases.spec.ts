// @requirements REQ-AGRITECH-PROFILE-001
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ResourceNotFoundException } from '@app/backend-common-exception';
import { CropTypes, UzbekistanRegions, type FarmerRepository } from '../domain';
import { CreateFarmerUseCase, GetFarmerProfileUseCase, UpdateFarmerUseCase } from './farmer.use-cases';

const profile = {
  id: 'farmer-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  phone: '+998901234567',
  firstName: 'Ali',
  lastName: 'Valiyev',
  region: "Farg'ona viloyati" as const,
  farmSizeHectares: 2.5,
  crops: ['cotton' as const],
  status: 'pending_verification' as const,
  createdAt: new Date('2026-08-02T00:00:00Z'),
  updatedAt: new Date('2026-08-02T00:00:00Z'),
};

describe('CreateFarmerUseCase', () => {
  it('rejects a second profile for the authenticated owner', async () => {
    const repository = { findByOwner: async () => profile } as unknown as FarmerRepository;
    const useCase = new CreateFarmerUseCase(repository);
    await expect(useCase.execute({ tenantId: 'tenant-1', userId: 'user-1' }, profile)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a duplicate tenant phone and creates a unique profile', async () => {
    const findByOwner = vi.fn().mockResolvedValue(undefined);
    const findByPhone = vi.fn().mockResolvedValueOnce(profile).mockResolvedValueOnce(undefined);
    const create = vi.fn().mockResolvedValue(profile);
    const repository = { findByOwner, findByPhone, create } as unknown as FarmerRepository;
    const useCase = new CreateFarmerUseCase(repository);
    const owner = { tenantId: 'tenant-1', userId: 'user-1' };

    await expect(useCase.execute(owner, profile)).rejects.toBeInstanceOf(ConflictException);
    await expect(useCase.execute(owner, profile)).resolves.toBe(profile);
    expect(create).toHaveBeenCalledWith(owner, profile);
    expect(UzbekistanRegions).toContain(profile.region);
    expect(CropTypes).toContain('cotton');
  });
});

describe('farmer profile queries', () => {
  it('returns existing profiles and rejects absent owners', async () => {
    const findByOwner = vi.fn().mockResolvedValueOnce(profile).mockResolvedValueOnce(undefined);
    const useCase = new GetFarmerProfileUseCase({ findByOwner } as unknown as FarmerRepository);
    const owner = { tenantId: 'tenant-1', userId: 'user-1' };
    await expect(useCase.execute(owner)).resolves.toBe(profile);
    await expect(useCase.execute(owner)).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('updates existing profiles and rejects an absent profile', async () => {
    const update = vi.fn().mockResolvedValueOnce(profile).mockResolvedValueOnce(undefined);
    const useCase = new UpdateFarmerUseCase({ update } as unknown as FarmerRepository);
    const owner = { tenantId: 'tenant-1', userId: 'user-1' };
    await expect(useCase.execute(owner, { firstName: 'Alisher' })).resolves.toBe(profile);
    await expect(useCase.execute(owner, { firstName: 'Alisher' })).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
