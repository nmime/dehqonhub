import { marketplaceBuyerRoles, marketplaceSellerRoles } from '@app/backend-feature-agritech-shared';
import type { VerificationRole } from '@app/backend-feature-agritech-shared';

/**
 * The persistence layer must never restate which verification roles may buy or
 * sell. `marketplaceBuyerRoles` and `marketplaceSellerRoles` in
 * `@app/backend-feature-agritech-shared` are the one authority behind
 * `canBuyInMarketplace` / `canOfferInMarketplace`, and every repository
 * predicate and constraint-trigger predicate is derived from them here.
 *
 * Restating them inline is how the marketplace acquired two production defects
 * of the same class: a persisted rule stricter than the authorization layer
 * passed every application check and then raised `23514` inside the
 * transaction, answering HTTP 500 instead of a typed RFC 9457 problem. See
 * `Migration20260810140000AlignMarketplaceSellerPartyRole` (selling side) and
 * `Migration20260811110000AlignMarketplaceBuyerPartyRole` (buying side).
 */
const roleFilter = (roles: readonly VerificationRole[]): { $in: VerificationRole[] } => ({ $in: [...roles] });

export const marketplaceBuyerRoleFilter = (): { $in: VerificationRole[] } => roleFilter(marketplaceBuyerRoles);

export const marketplaceSellerRoleFilter = (): { $in: VerificationRole[] } => roleFilter(marketplaceSellerRoles);

export const marketplaceCapabilityRoleFilter = (capability: 'buyer' | 'seller'): { $in: VerificationRole[] } =>
  capability === 'buyer' ? marketplaceBuyerRoleFilter() : marketplaceSellerRoleFilter();

/**
 * Renders the same policy as a SQL literal list for the hand-written joins.
 * The values are compile-time domain constants constrained by
 * `ck__marketplace_verifications__role`, never request input.
 */
const roleSqlList = (roles: readonly VerificationRole[]): string => roles.map((role) => `'${role}'`).join(', ');

export const marketplaceBuyerRolesSql = roleSqlList(marketplaceBuyerRoles);

export const marketplaceSellerRolesSql = roleSqlList(marketplaceSellerRoles);
