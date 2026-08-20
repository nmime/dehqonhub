// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@app/backend-common-exception';
import {
  marketplacePublicProfileId,
  marketplacePublicProfileIdPattern,
  type MarketplacePublicProfile,
  type MarketplacePublicProfileRepository,
} from '@app/backend-feature-agritech-shared';
import {
  MarketplacePublicProfileDomainService,
  marketplacePublicProfileReviewLimit,
} from './marketplace-public-profile.domain-service';

const partnerId = '90a0825f-16d6-578a-9484-281652f974f2';

const profile = (): MarketplacePublicProfile => ({
  displayName: 'Agro Kimyo Servis',
  id: marketplacePublicProfileId(partnerId),
  publicSince: new Date('2026-01-01T00:00:00.000Z'),
  region: 'Navoiy',
  reputation: {
    completedDeals: 4,
    completedDealsAsBuyer: 0,
    completedDealsAsSeller: 4,
    firstDealAt: new Date('2026-03-09T10:00:00.000Z'),
    lastDealAt: new Date('2026-06-08T10:00:00.000Z'),
    reviewsReceived: { averageRating: 4.5, count: 4 },
    reviewsWritten: { count: 0 },
    sections: ['seeds'],
  },
  reviewsReceived: [
    {
      createdAt: new Date('2026-06-16T10:00:00.000Z'),
      id: '11111111-1111-4111-8111-111111111111',
      listingId: '22222222-2222-4222-8222-222222222222',
      listingTitle: 'Urea 46% N',
      rating: 5,
      section: 'seeds',
      verifiedDeal: true,
    },
  ],
  reviewsWritten: [],
  roles: ['seller'],
  sellerId: '3ff40b92-6813-5430-85d0-4e7bdfd3b854',
  verified: true,
});

const repositoryFixture = () => {
  const repository = {
    findPublicProfile: vi.fn<MarketplacePublicProfileRepository['findPublicProfile']>(),
    findPublicProfileBySellerId: vi.fn<MarketplacePublicProfileRepository['findPublicProfileBySellerId']>(),
  };
  return { repository, service: new MarketplacePublicProfileDomainService(repository) };
};

describe('marketplacePublicProfileId', () => {
  it('is stable, opaque, and never the partner id it was derived from', () => {
    const derived = marketplacePublicProfileId(partnerId);
    expect(derived).toMatch(marketplacePublicProfileIdPattern);
    expect(derived).toBe(marketplacePublicProfileId(partnerId));
    expect(derived).not.toBe(partnerId);
    // A private identifier must not be recoverable from, or visible inside, the
    // public address.
    expect(derived).not.toContain(partnerId.replaceAll('-', '').slice(0, 8));
    expect(marketplacePublicProfileId('90a0825f-16d6-578a-9484-281652f974f3')).not.toBe(derived);
  });
});

describe('MarketplacePublicProfileDomainService', () => {
  it('reads a bounded profile by its normalized public address', async () => {
    const { repository, service } = repositoryFixture();
    repository.findPublicProfile.mockResolvedValue(profile());

    const result = await service.getProfile(`  ${marketplacePublicProfileId(partnerId).toUpperCase()}  `);

    expect(result?.displayName).toBe('Agro Kimyo Servis');
    expect(repository.findPublicProfile).toHaveBeenCalledWith(
      marketplacePublicProfileId(partnerId),
      marketplacePublicProfileReviewLimit,
    );
  });

  it('rejects a malformed address before any persistence query runs', async () => {
    const { repository, service } = repositoryFixture();

    await expect(service.getProfile('not-an-address')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getProfile('')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findPublicProfile).not.toHaveBeenCalled();
  });

  it('reports absence for a party with no moderated public presence', async () => {
    const { repository, service } = repositoryFixture();
    repository.findPublicProfile.mockResolvedValue(undefined);

    await expect(service.getProfile(marketplacePublicProfileId(partnerId))).resolves.toBeUndefined();
  });

  it('reads the same projection through the public seller address', async () => {
    const { repository, service } = repositoryFixture();
    repository.findPublicProfileBySellerId.mockResolvedValue(profile());

    const result = await service.getProfileBySellerId('3ff40b92-6813-5430-85d0-4e7bdfd3b854');

    expect(result?.id).toBe(marketplacePublicProfileId(partnerId));
    expect(repository.findPublicProfileBySellerId).toHaveBeenCalledWith(
      '3ff40b92-6813-5430-85d0-4e7bdfd3b854',
      marketplacePublicProfileReviewLimit,
    );
  });

  it('carries no private party, contract, or commercial field on the wire', async () => {
    const { repository, service } = repositoryFixture();
    repository.findPublicProfile.mockResolvedValue(profile());

    const serialized = JSON.stringify(await service.getProfile(marketplacePublicProfileId(partnerId)));

    for (const forbidden of [
      'tenantId',
      'userId',
      'ownerUserId',
      'partnerId',
      'buyerPartnerId',
      'sellerPartnerId',
      'buyerUserId',
      'sellerUserId',
      'legalName',
      'taxId',
      'email',
      'phone',
      'contractId',
      'amountUzs',
      'deliveryTerms',
      'moderationStatus',
      'idempotencyKey',
      'reviewEligibilityId',
      'author',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('never receives a review author on a received review', async () => {
    const { repository, service } = repositoryFixture();
    repository.findPublicProfile.mockResolvedValue(profile());

    const result = await service.getProfile(marketplacePublicProfileId(partnerId));

    // A review the profile received names the listing it was left on and nothing
    // about who left it: attribution would publish somebody else's purchase.
    expect(result?.reviewsReceived.every((review) => review.subject === undefined)).toBe(true);
  });
});

/**
 * The committed producer artifact, found by walking up from this file rather than
 * from the runner's working directory: the same suite runs from the repository
 * root and from the project root, and a path that only resolves in one of them
 * would make the boundary check silently skippable.
 */
const contractPath = (): string => {
  const relative = 'apps/backend/user/user-app-api/contracts/openapi/user-app-api.json';
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = join(directory, relative);
    if (existsSync(candidate)) {
      return candidate;
    }
    directory = dirname(directory);
  }
  throw new Error(`Could not locate ${relative} above the spec file.`);
};

describe('the published public profile contract', () => {
  const contract = JSON.parse(readFileSync(contractPath(), 'utf8')) as {
    paths: Record<string, unknown>;
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
  };

  it('publishes the anonymous profile reads', () => {
    expect(contract.paths['/marketplace/public/profiles/{profileId}']).toBeDefined();
    expect(contract.paths['/marketplace/public/sellers/{sellerId}/profile']).toBeDefined();
  });

  it('allowlists the profile schema against every private member', () => {
    const properties = Object.keys(contract.components.schemas['MarketplacePublicProfileDto']?.properties ?? {});
    expect(properties).toEqual([
      'id',
      'displayName',
      'region',
      'description',
      'roles',
      'verified',
      'publicSince',
      'sellerId',
      'reputation',
      'reviewsReceived',
      'reviewsWritten',
    ]);
  });

  it('keeps the review schema author free and the reputation schema amount free', () => {
    const review = Object.keys(contract.components.schemas['MarketplacePublicProfileReviewDto']?.properties ?? {});
    expect(review).not.toContain('author');
    expect(review).not.toContain('buyer');
    expect(review).not.toContain('reviewer');
    const reputation = Object.keys(
      contract.components.schemas['MarketplacePublicProfileReputationDto']?.properties ?? {},
    );
    expect(reputation).not.toContain('amountUzs');
    expect(reputation).not.toContain('contracts');
    expect(reputation).toContain('completedDeals');
  });
});
