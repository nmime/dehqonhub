// @requirements REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import { BuyerRequestEntity, RequestOfferEntitySchema } from './marketplace.entity';
import { MarketplaceRequestPublicationEntity } from './marketplace-public.entity';

describe('marketplace commerce entity imports', () => {
  it('loads both sides of the request-publication relation without a runtime cycle', () => {
    expect(BuyerRequestEntity.name).toBe('BuyerRequestEntity');
    expect(MarketplaceRequestPublicationEntity.name).toBe('MarketplaceRequestPublicationEntity');
    expect(RequestOfferEntitySchema.meta.properties.requestPublicId).toMatchObject({
      fieldNames: ['request_public_id'],
      nullable: true,
    });
  });
});
