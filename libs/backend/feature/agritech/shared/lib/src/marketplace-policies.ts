import type {
  ContractStatus,
  RequestStatus,
  SampleStatus,
  VerificationLevel,
  VerificationRole,
  VerificationStatus,
} from './marketplace.types';

const MONTHLY_SAMPLE_LIMIT = 5;

export const MAX_MONTHLY_SAMPLES = MONTHLY_SAMPLE_LIMIT;

export const VERIFICATION_ROLES: readonly VerificationRole[] = ['farmer', 'seller', 'buyer'];

export const VERIFICATION_LEVELS: readonly VerificationLevel[] = ['basic', 'verified', 'trusted'];

export const sampleCountUsedThisMonth = (requestsInMonth: number): number => Math.min(requestsInMonth, MONTHLY_SAMPLE_LIMIT);

export const samplesRemainingThisMonth = (requestsInMonth: number): number =>
  Math.max(0, MONTHLY_SAMPLE_LIMIT - requestsInMonth);

export const isSampleRequestAllowed = ({
  verified,
  requestsThisMonth,
  now,
}: {
  verified: boolean;
  requestsThisMonth: number;
  now?: Date;
}): boolean => {
  void now;
  return verified && requestsThisMonth < MONTHLY_SAMPLE_LIMIT;
};

export const isVerificationAllowed = (status: VerificationStatus): boolean =>
  status === 'none' || status === 'rejected';

export const canPurchaseWithoutVerification = false;

export const isContractTransitionAllowed = (current: ContractStatus, next: ContractStatus): boolean =>
  current === next ||
  (current === 'draft' && ['signed', 'cancelled'].includes(next)) ||
  (current === 'signed' && ['active', 'cancelled'].includes(next)) ||
  (current === 'active' && ['completed', 'cancelled'].includes(next));

export const requestTransitions: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  open: ['offering', 'closed', 'expired'],
  offering: ['selected', 'closed', 'expired'],
  selected: ['closed'],
  closed: [],
  expired: [],
};

export const isRequestTransitionAllowed = (current: RequestStatus, next: RequestStatus): boolean =>
  current === next || requestTransitions[current].includes(next);

export const sampleTransitions: Readonly<Record<SampleStatus, readonly SampleStatus[]>> = {
  pending: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export const isSampleTransitionAllowed = (current: SampleStatus, next: SampleStatus): boolean =>
  current === next || sampleTransitions[current].includes(next);
