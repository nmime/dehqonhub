// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it } from 'vitest';
import {
  canBuyInMarketplace,
  canOfferInMarketplace,
  isContractTransitionAllowed,
  isRequestTransitionAllowed,
  hasRequiredVerificationDocuments,
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

  it('asks farmers for land or lease proof on top of the farm document', () => {
    const documents = (...kinds: readonly string[]) => kinds.map((kind) => ({ kind }) as never);

    expect(hasRequiredVerificationDocuments('farmer', documents('farm', 'land'))).toBe(true);
    expect(hasRequiredVerificationDocuments('farmer', documents('farm', 'lease'))).toBe(true);
    expect(hasRequiredVerificationDocuments('farmer', documents('farm'))).toBe(false);
    expect(hasRequiredVerificationDocuments('farmer', documents('land', 'lease'))).toBe(false);
    // A farm document does nothing for the commercial roles, and vice versa.
    expect(hasRequiredVerificationDocuments('seller', documents('business'))).toBe(true);
    expect(hasRequiredVerificationDocuments('buyer', documents('business'))).toBe(true);
    expect(hasRequiredVerificationDocuments('seller', documents('farm', 'land'))).toBe(false);
    expect(hasRequiredVerificationDocuments('farmer', documents('business'))).toBe(false);
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
