import type {
  ContractStatus,
  RequestStatus,
  SampleStatus,
  VerificationLevel,
  VerificationRejectionReason,
  VerificationRole,
  VerificationStatus,
} from './marketplace.types';

const monthlySampleLimit = 5;

export const maxMonthlySamples = monthlySampleLimit;

export const verificationRoles: readonly VerificationRole[] = ['farmer', 'seller', 'buyer'];

export const verificationLevels: readonly VerificationLevel[] = ['basic', 'verified', 'trusted'];

export const marketplaceBuyerRoles: readonly VerificationRole[] = ['farmer', 'buyer'];

export const marketplaceSellerRoles: readonly VerificationRole[] = ['farmer', 'seller'];

export const canBuyInMarketplace = (role: VerificationRole | undefined): boolean =>
  role !== undefined && marketplaceBuyerRoles.includes(role);

export const canOfferInMarketplace = (role: VerificationRole | undefined): boolean =>
  role !== undefined && marketplaceSellerRoles.includes(role);

export const samplesRemainingThisMonth = (requestsInMonth: number): number =>
  Math.max(0, monthlySampleLimit - requestsInMonth);

export const isSampleRequestAllowed = ({
  verified,
  requestsThisMonth,
}: {
  verified: boolean;
  requestsThisMonth: number;
}): boolean => verified && requestsThisMonth < monthlySampleLimit;

export const isVerificationAllowed = (status: VerificationStatus): boolean =>
  status === 'none' || status === 'rejected';

const verificationRejectionReasons: readonly VerificationRejectionReason[] = [
  'criteria_not_met',
  'documents_unreadable',
  'identity_mismatch',
];

export const isVerificationReviewReasonValid = (
  decision: 'verified' | 'rejected',
  reason: unknown,
): reason is VerificationRejectionReason | undefined =>
  decision === 'rejected'
    ? typeof reason === 'string' && verificationRejectionReasons.includes(reason as VerificationRejectionReason)
    : reason === undefined;

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
