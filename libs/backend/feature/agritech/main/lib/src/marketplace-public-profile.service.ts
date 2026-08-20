// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { Inject, Injectable } from '@nestjs/common';
import {
  MarketplacePublicProfileRepositoryInjectToken,
  type MarketplacePublicProfileRepository,
} from '@app/backend-feature-agritech-shared';
import { MarketplacePublicProfileDomainService } from './marketplace-public-profile.domain-service';

@Injectable()
export class MarketplacePublicProfileService extends MarketplacePublicProfileDomainService {
  constructor(
    @Inject(MarketplacePublicProfileRepositoryInjectToken)
    repository: MarketplacePublicProfileRepository,
  ) {
    super(repository);
  }
}
