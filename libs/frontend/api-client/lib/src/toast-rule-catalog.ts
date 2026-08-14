import type { ApiToastCategory, ApiToastDisplay } from '@app/frontend-api-support';

import adminToastConfig from './generated/toast/admin-app-api.toast-rules.frontend.generated.json';
import authToastConfig from './generated/toast/auth-app-api.toast-rules.frontend.generated.json';
import userToastConfig from './generated/toast/user-app-api.toast-rules.frontend.generated.json';

export interface ApiToastRuleCatalogItem {
  readonly app: string;
  readonly defaultDisplay: ApiToastDisplay;
  readonly defaultMessage: string;
  readonly defaultSeverity: ApiToastCategory;
  readonly errorCode: string | null;
  readonly id: string;
  readonly method: string;
  readonly operationId: string | null;
  readonly path: string;
  readonly status: number | string;
  readonly tags: readonly string[];
}

interface GeneratedCatalogRule {
  readonly catalog: Omit<ApiToastRuleCatalogItem, 'id'>;
  readonly id: string;
}

const catalogFrom = (rules: readonly unknown[]): ApiToastRuleCatalogItem[] =>
  (rules as readonly GeneratedCatalogRule[]).map((rule) => ({ id: rule.id, ...rule.catalog }));

/**
 * The combined catalog lives apart from the per-app rule sets because it is the
 * only reader of all three generated configs, and a chunk holds whole modules:
 * kept next to the rule sets an app needs for its own toasts, it dragged the
 * third config into that app's entry chunk however little of the module was used.
 * On its own it is reachable only from the presentation console — the one screen
 * that lists every endpoint's presentation — and travels with it.
 *
 * Parses on first read and caches. See `toast-rules.ts` for why the configs are
 * referenced from inside a function body rather than at module scope.
 */
let ruleCatalog: readonly ApiToastRuleCatalogItem[] | undefined;

export const apiToastRuleCatalog = (): readonly ApiToastRuleCatalogItem[] =>
  (ruleCatalog ??= [
    ...catalogFrom(adminToastConfig.rules),
    ...catalogFrom(authToastConfig.rules),
    ...catalogFrom(userToastConfig.rules),
  ]);
