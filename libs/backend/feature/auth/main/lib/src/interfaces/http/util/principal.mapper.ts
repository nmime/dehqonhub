import {
  isLanguage,
  type AuthenticatedPrincipal,
  type AuthSessionView,
  type Language,
} from '@app/backend-feature-auth-shared';

export function principalFromUserView(
  principal: AuthenticatedPrincipal,
  user: AuthSessionView['user'],
): AuthenticatedPrincipal {
  return {
    ...principal,
    subject: user.id,
    tenantId: user.tenantId,
    email: user.email ?? undefined,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? undefined,
    locale: normalizePrincipalLocale(user.locale),
    theme: user.theme,
    roles: user.roles,
    permissions: user.permissions,
  };
}

function normalizePrincipalLocale(locale: AuthSessionView['user']['locale']): Language | undefined {
  return locale && isLanguage(locale) ? locale : undefined;
}

/**
 * The identity attributes a session actually stores. `roles` and `permissions`
 * are excluded: the session keeps them empty and authorization replaces them
 * from the RBAC tables on every protected request, so comparing them would
 * report drift on every call.
 */
const sessionIdentityKeys = [
  'subject',
  'tenantId',
  'email',
  'displayName',
  'avatarUrl',
  'locale',
  'theme',
] as const satisfies readonly (keyof AuthenticatedPrincipal)[];

/**
 * Whether a principal rebuilt from the stored account differs from the session's
 * sign-in snapshot. Callers use it to re-sync only a session that has drifted,
 * which keeps a plain read from writing to the session store.
 */
export function hasSessionIdentityDrift(principal: AuthenticatedPrincipal, refreshed: AuthenticatedPrincipal): boolean {
  return sessionIdentityKeys.some((key) => principal[key] !== refreshed[key]);
}
