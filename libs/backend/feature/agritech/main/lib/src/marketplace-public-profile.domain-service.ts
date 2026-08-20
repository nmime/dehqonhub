// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { BadRequestException } from '@app/backend-common-exception';
import {
  marketplacePublicProfileIdPattern,
  type MarketplacePublicProfile,
  type MarketplacePublicProfileRepository,
} from '@app/backend-feature-agritech-shared';

/**
 * How many recent reviews a profile carries in each direction.
 *
 * The page is a reputation summary, not a review archive, so both lists are
 * bounded server-side and the response never promises to be exhaustive. A
 * caller cannot raise the bound: an unbounded review read on an anonymous
 * endpoint is exactly the query REQ-AGRITECH-PUBLIC-018 requires to stay
 * impossible.
 */
export const marketplacePublicProfileReviewLimit = 20;

/** Framework-independent anonymous party-profile projection boundary. */
export class MarketplacePublicProfileDomainService {
  constructor(private readonly repository: MarketplacePublicProfileRepository) {}

  async getProfile(profileId: string): Promise<MarketplacePublicProfile | undefined> {
    const normalized = typeof profileId === 'string' ? profileId.trim().toLowerCase() : '';
    if (!marketplacePublicProfileIdPattern.test(normalized)) {
      // Rejected before any persistence query runs, so a malformed address can
      // never become a scan.
      throw new BadRequestException({ meta: { field: 'profileId' } });
    }
    return this.repository.findPublicProfile(normalized, marketplacePublicProfileReviewLimit);
  }

  getProfileBySellerId(sellerPublicId: string): Promise<MarketplacePublicProfile | undefined> {
    return this.repository.findPublicProfileBySellerId(sellerPublicId, marketplacePublicProfileReviewLimit);
  }
}
