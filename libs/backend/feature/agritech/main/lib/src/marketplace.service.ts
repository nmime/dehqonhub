import { Inject, Injectable } from '@nestjs/common';
import { MarketplaceRepositoryInjectToken, type MarketplaceRepository } from '@app/backend-feature-agritech-shared';
import { MarketplaceDomainService } from './marketplace.domain-service';

@Injectable()
export class MarketplaceService extends MarketplaceDomainService {
  constructor(@Inject(MarketplaceRepositoryInjectToken) repository: MarketplaceRepository) {
    super(repository);
  }
}
