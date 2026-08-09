// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ResourceNotFoundException } from '@app/backend-common-exception';
import { MarketplaceInMemoryAdapter } from './marketplace.in-memory-adapter';

const tenantId = 'tenant-memory-parity';
const buyer = { tenantId, userId: 'buyer-memory' };
const seller = { tenantId, userId: 'seller-memory' };

function createApprovedActors(adapter: MarketplaceInMemoryAdapter): void {
  adapter.registerVerifiedActor(buyer, 'buyer');
  adapter.registerApprovedOrganization(buyer, 'buyer');
  adapter.registerVerifiedActor(seller, 'seller');
  adapter.registerApprovedOrganization(seller, 'supplier');
}

describe('MarketplaceInMemoryAdapter conflict parity', () => {
  it('maps a repeated verification decision to the same canonical conflict as PostgreSQL', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const verification = adapter.registerVerifiedActor(buyer, 'buyer');

    await expect(
      adapter.reviewVerification(tenantId, verification.id, 'rejected', 'admin-memory', 'criteria_not_met'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects fabricated or contradictory verification decision reasons', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    const verification = adapter.registerVerifiedActor(buyer, 'buyer');

    await expect(adapter.reviewVerification(tenantId, verification.id, 'rejected', 'admin-memory')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      adapter.reviewVerification(tenantId, verification.id, 'verified', 'admin-memory', 'criteria_not_met'),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps an already-selected request unchanged and reports conflict while missing requests remain not found', async () => {
    const adapter = new MarketplaceInMemoryAdapter();
    createApprovedActors(adapter);
    const request = await adapter.createRequest(buyer, { region: 'Samarkand', title: 'Corn seed' });
    const offer = await adapter.makeOffer(seller, request.id, 4_000_000, 'pickup');
    const selection = await adapter.chooseOffer(buyer, request.id, offer.id);

    await expect(adapter.chooseOffer(buyer, request.id, offer.id)).rejects.toThrow(ConflictException);
    await expect(adapter.chooseOffer(buyer, 'missing-request', offer.id)).rejects.toThrow(ResourceNotFoundException);

    await expect(adapter.findRequest(buyer, request.id)).resolves.toMatchObject({ status: 'selected' });
    await expect(adapter.findOffer(buyer, request.id, offer.id)).resolves.toMatchObject({ status: 'accepted' });
    await expect(adapter.listContracts(buyer)).resolves.toEqual([
      expect.objectContaining({ id: selection.contractId, sourceId: offer.id, sourceType: 'offer_selection' }),
    ]);
  });
});
