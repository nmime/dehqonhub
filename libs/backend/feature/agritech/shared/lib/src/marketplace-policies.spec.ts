// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import {
  canBuyInMarketplace,
  canOfferInMarketplace,
  isContractTransitionAllowed,
  isRequestTransitionAllowed,
  isVerificationAllowed,
  isVerificationReviewReasonValid,
} from './marketplace-policies';

describe('marketplace policies', () => {
  it('separates verified buyer and offer roles', () => {
    expect(canBuyInMarketplace('buyer')).toBe(true);
    expect(canBuyInMarketplace('farmer')).toBe(true);
    expect(canBuyInMarketplace('seller')).toBe(false);
    expect(canOfferInMarketplace('seller')).toBe(true);
    expect(canOfferInMarketplace('farmer')).toBe(true);
    expect(canOfferInMarketplace('buyer')).toBe(false);
    expect(canOfferInMarketplace(undefined)).toBe(false);
  });

  it('gates verification resubmission on status', () => {
    expect(isVerificationAllowed('none')).toBe(true);
    expect(isVerificationAllowed('rejected')).toBe(true);
    expect(isVerificationAllowed('pending')).toBe(false);
    expect(isVerificationAllowed('verified')).toBe(false);
  });

  it('requires a bounded rejection reason only for rejected verification decisions', () => {
    expect(isVerificationReviewReasonValid('rejected', 'identity_mismatch')).toBe(true);
    expect(isVerificationReviewReasonValid('rejected', undefined)).toBe(false);
    expect(isVerificationReviewReasonValid('rejected', 'invented_reason')).toBe(false);
    expect(isVerificationReviewReasonValid('verified', undefined)).toBe(true);
    expect(isVerificationReviewReasonValid('verified', 'criteria_not_met')).toBe(false);
  });

  it('validates contract transitions', () => {
    expect(isContractTransitionAllowed('draft', 'signed')).toBe(true);
    expect(isContractTransitionAllowed('draft', 'cancelled')).toBe(true);
    expect(isContractTransitionAllowed('signed', 'active')).toBe(true);
    expect(isContractTransitionAllowed('active', 'completed')).toBe(true);
    expect(isContractTransitionAllowed('draft', 'active')).toBe(false);
    expect(isContractTransitionAllowed('completed', 'active')).toBe(false);
    expect(isContractTransitionAllowed('legacy_review_required', 'signed')).toBe(false);
  });

  it('validates reverse-auction request transitions', () => {
    expect(isRequestTransitionAllowed('open', 'offering')).toBe(true);
    expect(isRequestTransitionAllowed('offering', 'selected')).toBe(true);
    expect(isRequestTransitionAllowed('open', 'selected')).toBe(false);
    expect(isRequestTransitionAllowed('selected', 'open')).toBe(false);
  });
});
