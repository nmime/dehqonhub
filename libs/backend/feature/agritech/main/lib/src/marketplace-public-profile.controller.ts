// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ResourceNotFoundException } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse } from '@app/backend-common-swagger';
import { Public } from '@app/backend-feature-auth-shared';
import type {
  MarketplaceListingSection,
  MarketplacePublicProfile,
  MarketplacePublicProfileParty,
  MarketplacePublicProfileReputation,
  MarketplacePublicProfileReview,
  MarketplacePublicProfileRole,
} from '@app/backend-feature-agritech-shared';
import { MarketplacePublicProfileService } from './marketplace-public-profile.service';

const listingSections = ['equipment', 'seeds', 'produce'] as const;
const profileRoles = ['seller', 'buyer'] as const;

class MarketplacePublicProfilePartyDto implements MarketplacePublicProfileParty {
  @ApiProperty() profileId!: string;
  @ApiProperty() displayName!: string;
}

class MarketplacePublicProfileReviewCountsDto {
  @ApiProperty({ minimum: 0, type: 'integer' }) count!: number;
  @ApiProperty({ maximum: 5, minimum: 1, nullable: true, type: 'number' }) averageRating!: number | null;
}

class MarketplacePublicProfileWrittenCountsDto {
  @ApiProperty({ minimum: 0, type: 'integer' }) count!: number;
}

class MarketplacePublicProfileReputationDto implements MarketplacePublicProfileReputation {
  @ApiProperty({ minimum: 0, type: 'integer' }) completedDeals!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedDealsAsSeller!: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) completedDealsAsBuyer!: number;
  @ApiProperty({ format: 'date-time', nullable: true, type: 'string' }) firstDealAt!: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: 'string' }) lastDealAt!: Date | null;
  @ApiProperty({ enum: listingSections, isArray: true }) sections!: MarketplaceListingSection[];
  @ApiProperty({ type: MarketplacePublicProfileReviewCountsDto })
  reviewsReceived!: MarketplacePublicProfileReputation['reviewsReceived'];
  @ApiProperty({ type: MarketplacePublicProfileWrittenCountsDto })
  reviewsWritten!: MarketplacePublicProfileReputation['reviewsWritten'];
}

class MarketplacePublicProfileReviewReplyDto {
  @ApiProperty() comment!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

class MarketplacePublicProfileReviewDto implements MarketplacePublicProfileReview {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ maximum: 5, minimum: 1, type: 'integer' }) rating!: number;
  @ApiPropertyOptional() comment?: string;
  @ApiProperty({ enum: [true] }) verifiedDeal!: true;
  @ApiProperty({ format: 'uuid' }) listingId!: string;
  @ApiProperty() listingTitle!: string;
  @ApiProperty({ enum: listingSections }) section!: MarketplaceListingSection;
  @ApiPropertyOptional({ type: MarketplacePublicProfileReviewReplyDto })
  reply?: MarketplacePublicProfileReview['reply'];
  @ApiPropertyOptional({
    description: 'The reviewed seller. Present only on reviews this profile wrote, never on reviews it received.',
    type: MarketplacePublicProfilePartyDto,
  })
  subject?: MarketplacePublicProfileParty;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

class MarketplacePublicProfileDto implements MarketplacePublicProfile {
  @ApiProperty({ description: 'Opaque public profile address. Never a user, tenant or partner identifier.' })
  id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() region!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: profileRoles, isArray: true }) roles!: MarketplacePublicProfileRole[];
  @ApiProperty() verified!: boolean;
  @ApiProperty({ format: 'date-time' }) publicSince!: Date;
  @ApiPropertyOptional({ description: 'Public seller address, when this party publishes a catalog.', format: 'uuid' })
  sellerId?: string;
  @ApiProperty({ type: MarketplacePublicProfileReputationDto }) reputation!: MarketplacePublicProfileReputation;
  @ApiProperty({ type: [MarketplacePublicProfileReviewDto] }) reviewsReceived!: MarketplacePublicProfileReview[];
  @ApiProperty({ type: [MarketplacePublicProfileReviewDto] }) reviewsWritten!: MarketplacePublicProfileReview[];
}

/**
 * The anonymous read behind "visit somebody else's profile".
 *
 * It is a sibling of `MarketplacePublicController` rather than another route on
 * it, because the profile projection joins reviews and completed contracts,
 * which the catalog boundary deliberately never touches. Keeping them apart
 * means the catalog's allowlist cannot be widened by accident while adding a
 * reputation figure here.
 */
@ApiTags('marketplace-public')
@ApiExceptions(400, 404, 500)
@Public()
@Controller('marketplace/public')
export class MarketplacePublicProfileController {
  constructor(private readonly service: MarketplacePublicProfileService) {}

  @Get('profiles/:profileId')
  @ApiOkDataResponse(MarketplacePublicProfileDto)
  async getProfile(@Param('profileId') profileId: string) {
    const profile = await this.service.getProfile(profileId);
    if (!profile) {
      // A party with no moderated public presence is indistinguishable from a
      // party that does not exist.
      throw new ResourceNotFoundException('marketplace-public-profile');
    }
    return createOkResponse(profile);
  }

  @Get('sellers/:sellerId/profile')
  @ApiOkDataResponse(MarketplacePublicProfileDto)
  async getSellerProfile(@Param('sellerId', ParseUUIDPipe) sellerId: string) {
    const profile = await this.service.getProfileBySellerId(sellerId);
    if (!profile) {
      throw new ResourceNotFoundException('marketplace-public-profile');
    }
    return createOkResponse(profile);
  }
}
