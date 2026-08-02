// @requirements REQ-AGRITECH-PROFILE-001
import { describe, expect, it } from 'vitest';
import { ConflictException } from '@app/backend-common-exception';
import type { FarmerRepository } from '../domain';
import { CreateFarmerUseCase } from './farmer.use-cases';

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
});
