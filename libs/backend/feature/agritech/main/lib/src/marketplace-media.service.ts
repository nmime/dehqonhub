// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplaceMediaObjectStorageInjectToken,
  MarketplaceMediaRepositoryInjectToken,
  type MarketplaceMediaObjectStorage,
  type MarketplaceMediaRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceMediaDomainService } from './marketplace-media.domain-service';

@Injectable()
export class MarketplaceMediaService extends MarketplaceMediaDomainService {
  constructor(
    @Inject(MarketplaceMediaRepositoryInjectToken)
    repository: MarketplaceMediaRepository,
    @Inject(MarketplaceMediaObjectStorageInjectToken)
    storage: MarketplaceMediaObjectStorage,
  ) {
    super(repository, storage);
  }
}
