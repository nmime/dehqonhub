// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002
import { describe, expect, it } from 'vitest';
import {
  isContractTransitionAllowed,
  isRequestTransitionAllowed,
  isSampleRequestAllowed,
  isSampleTransitionAllowed,
  isVerificationAllowed,
  MAX_MONTHLY_SAMPLES,
  samplesRemainingThisMonth,
} from '@app/backend-feature-agritech-shared';

describe('marketplace policies', () => {
  it('caps samples at five per month', () => {
    expect(MAX_MONTHLY_SAMPLES).toBe(5);
    expect(samplesRemainingThisMonth(2)).toBe(3);
    expect(samplesRemainingThisMonth(5)).toBe(0);
    expect(samplesRemainingThisMonth(9)).toBe(0);
  });

  it('allows a sample only for verified users under the monthly cap', () => {
    expect(isSampleRequestAllowed({ verified: true, requestsThisMonth: 0 })).toBe(true);
    expect(isSampleRequestAllowed({ verified: true, requestsThisMonth: 4 })).toBe(true);
    expect(isSampleRequestAllowed({ verified: true, requestsThisMonth: 5 })).toBe(false);
    expect(isSampleRequestAllowed({ verified: false, requestsThisMonth: 0 })).toBe(false);
  });

  it('gates verification resubmission on status', () => {
    expect(isVerificationAllowed('none')).toBe(true);
    expect(isVerificationAllowed('rejected')).toBe(true);
    expect(isVerificationAllowed('pending')).toBe(false);
    expect(isVerificationAllowed('verified')).toBe(false);
  });

  it('validates contract transitions', () => {
    expect(isContractTransitionAllowed('draft', 'signed')).toBe(true);
    expect(isContractTransitionAllowed('draft', 'cancelled')).toBe(true);
    expect(isContractTransitionAllowed('signed', 'active')).toBe(true);
    expect(isContractTransitionAllowed('active', 'completed')).toBe(true);
    expect(isContractTransitionAllowed('draft', 'active')).toBe(false);
    expect(isContractTransitionAllowed('completed', 'active')).toBe(false);
  });

  it('validates reverse-auction request transitions', () => {
    expect(isRequestTransitionAllowed('open', 'offering')).toBe(true);
    expect(isRequestTransitionAllowed('offering', 'selected')).toBe(true);
    expect(isRequestTransitionAllowed('open', 'selected')).toBe(false);
    expect(isRequestTransitionAllowed('selected', 'open')).toBe(false);
  });

  it('validates sample lifecycle transitions', () => {
    expect(isSampleTransitionAllowed('pending', 'shipped')).toBe(true);
    expect(isSampleTransitionAllowed('shipped', 'delivered')).toBe(true);
    expect(isSampleTransitionAllowed('pending', 'delivered')).toBe(false);
    expect(isSampleTransitionAllowed('delivered', 'shipped')).toBe(false);
  });
});
