import type { BetterAuthPlugin } from 'better-auth';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';

/**
 * Give every Better-Auth user a tenant.
 *
 * Deliberately hook-free. This plugin used to register an after hook on
 * `/sign-in` and `/sign-up` whose handler returned the middleware context, and
 * an after hook that returns a value *replaces* the response — so the endpoint's
 * own payload was thrown away. Email sign-in is served by this feature's own
 * `/auth/login`, which left `/sign-in/oauth2` as the one endpoint the hook
 * touched: it answers with the authorization URL and nothing else, so the
 * Telegram hand-off reached the browser empty and "continue with Telegram" did
 * nothing at all. The wrapper also carried the submitted credentials and the
 * configured secret into a response body they had no business reaching.
 *
 * The tenant itself needs no hook: the field default applies on insert, and
 * `input: false` keeps a client from choosing its own tenant.
 */
export const multiTenantPlugin: BetterAuthPlugin = {
  id: 'multi-tenant',
  init: () => {},
  schema: {
    user: {
      fields: {
        tenantId: {
          type: 'string',
          defaultValue: DefaultAuthTenantId,
          input: false,
        },
      },
    },
  },
};
