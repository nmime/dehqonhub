import type {
  ContractStatus,
  RequestStatus,
  VerificationLevel,
  VerificationDocument,
  VerificationRejectionReason,
  VerificationRole,
  VerificationStatus,
} from './marketplace.types';

export const verificationRoles: readonly VerificationRole[] = ['farmer', 'seller', 'buyer'];

export const verificationLevels: readonly VerificationLevel[] = ['basic', 'verified', 'trusted'];

export const marketplaceBuyerRoles: readonly VerificationRole[] = ['farmer', 'buyer'];

export const marketplaceSellerRoles: readonly VerificationRole[] = ['farmer', 'seller'];

export const canBuyInMarketplace = (role: VerificationRole | undefined): boolean =>
  role !== undefined && marketplaceBuyerRoles.includes(role);

export const canOfferInMarketplace = (role: VerificationRole | undefined): boolean =>
  role !== undefined && marketplaceSellerRoles.includes(role);

export const isVerificationAllowed = (status: VerificationStatus): boolean =>
  status === 'none' || status === 'rejected';

export const hasRequiredVerificationDocuments = (
  role: VerificationRole,
  documents: readonly Pick<VerificationDocument, 'kind'>[],
): boolean => {
  const kinds = new Set(documents.map((document) => document.kind));
  if (role === 'farmer') {
    return kinds.has('farm') && (kinds.has('land') || kinds.has('lease'));
  }
  return kinds.has('business');
};

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

/**
 * Whether a purchase request may still award an offer.
 *
 * `isRequestTransitionAllowed` treats `current === next` as allowed, because a
 * command that re-asserts the stage it already has is idempotent — that is what
 * a repeat offer on an `offering` request needs. Awarding is not idempotent: it
 * freezes a contract. A request that already reached `selected` must therefore
 * be refused here even though `selected -> selected` is a legal no-op, and
 * `open` must be refused because the stage machine has no `open -> selected`
 * edge. Both the PostgreSQL repository and the in-memory adapter read this one
 * predicate, and `tr__marketplace_requests__stage_authority` mirrors the same
 * table in the database, so no implementation can disagree about who may still
 * win a request.
 */
export const canChooseRequestOffer = (status: RequestStatus): boolean =>
  status !== 'selected' && isRequestTransitionAllowed(status, 'selected');
