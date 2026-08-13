import {
  parseApiToastRules,
  type ApiToastCategory,
  type ApiToastDisplay,
  type ApiToastRule,
} from '@app/frontend-api-support';

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
 * Rule sets are read through a call rather than handed over as ready-made
 * arrays, because that is what keeps an app from shipping a surface it never
 * talks to. The three generated configs are ~1.45 MB of JSON between them and no
 * app reads all three — the marketplace wants the user and auth rules, the
 * console wants the admin and auth rules — but a top-level
 * `parseApiToastRules(config.rules)` is an opaque call to the bundler, which then
 * keeps the config behind it even where the export is unused. Pure annotations
 * did not change that; moving the reference inside a function body did, because
 * an uncalled function is dropped and takes its last reference to the JSON with
 * it. For the marketplace that is ~420 kB of admin rules, and with them every
 * `/admin/*` path, error code and message, out of a bundle served to the public.
 *
 * Each getter parses on first use and caches, so callers can read it per failed
 * request the way the toast runtime does.
 */
let adminRules: readonly ApiToastRule[] | undefined;
let authRules: readonly ApiToastRule[] | undefined;
let userRules: readonly ApiToastRule[] | undefined;
let ruleCatalog: readonly ApiToastRuleCatalogItem[] | undefined;

export const adminApiToastRules = (): readonly ApiToastRule[] =>
  (adminRules ??= parseApiToastRules(adminToastConfig.rules));

export const authApiToastRules = (): readonly ApiToastRule[] =>
  (authRules ??= parseApiToastRules(authToastConfig.rules));

export const userApiToastRules = (): readonly ApiToastRule[] =>
  (userRules ??= parseApiToastRules(userToastConfig.rules));

/**
 * Reads all three configs, so only the console — the one surface that lists
 * every endpoint's presentation — pulls them together.
 */
export const apiToastRuleCatalog = (): readonly ApiToastRuleCatalogItem[] =>
  (ruleCatalog ??= [
    ...catalogFrom(adminToastConfig.rules),
    ...catalogFrom(authToastConfig.rules),
    ...catalogFrom(userToastConfig.rules),
  ]);
