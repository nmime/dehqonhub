// @requirements REQ-AGRITECH-ENGAGEMENT-019
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../support/world.ts';
import {
  MarketplaceEngagementAcceptanceAdapter,
  type FavoriteAcceptanceResult,
  type ReviewAcceptanceResult,
  type SampleAcceptanceResult,
} from '../support/marketplace-engagement.acceptance-adapter.ts';

type EngagementWorld = AcceptanceWorld & {
  engagementAdapter?: MarketplaceEngagementAcceptanceAdapter;
  favoriteResult?: FavoriteAcceptanceResult;
  reviewResult?: ReviewAcceptanceResult;
  sampleResult?: SampleAcceptanceResult;
};

Given('a governed public listing and authenticated engagement parties', function (this: EngagementWorld) {
  this.engagementAdapter = new MarketplaceEngagementAcceptanceAdapter();
});

When('the buyer exercises opaque favorite replay across two listings', function (this: EngagementWorld) {
  this.favoriteResult = requireAdapter(this).exerciseOpaqueFavorite();
});

Then('one favorite persists and changed-resource key reuse conflicts', function (this: EngagementWorld) {
  assert.deepEqual(this.favoriteResult, {
    changedResourceConflict: true,
    favoriteCount: 1,
    replayStable: true,
  });
});

When('the verified buyer races the fifth and sixth monthly sample requests', async function (this: EngagementWorld) {
  this.sampleResult = await requireAdapter(this).exerciseQuotaAndTransitions();
});

Then(
  'only five samples persist and exact parties complete the requester-paid sample flow',
  function (this: EngagementWorld) {
    assert.deepEqual(this.sampleResult, {
      auditCount: 5,
      foreignTransitionDenied: true,
      limit: 5,
      notificationCount: 5,
      persisted: 5,
      requesterPays: true,
      status: 'received',
    });
  },
);

When(
  'the eligible buyer reviews, the seller replies, and an administrator hides the reported review',
  function (this: EngagementWorld) {
    this.reviewResult = requireAdapter(this).exerciseReviewModeration();
  },
);

Then(
  'one deal-verified review is private-field free and moderation alone removes its aggregate',
  function (this: EngagementWorld) {
    assert.deepEqual(this.reviewResult, {
      aggregateAfterHide: 0,
      aggregateBeforeHide: 1,
      changedReplayConflict: true,
      privateFieldsAbsent: true,
      reportingAloneKeptVisible: true,
      replyPersisted: true,
      reviewCount: 1,
      verifiedDeal: true,
    });
  },
);

function requireAdapter(world: EngagementWorld): MarketplaceEngagementAcceptanceAdapter {
  assert.ok(world.engagementAdapter, 'engagement acceptance state was not initialized');
  return world.engagementAdapter;
}
