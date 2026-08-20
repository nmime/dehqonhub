import {
  getFrontendRuntimeConfig,
  getRequiredApiBaseUrl,
  resolveFeatureFlag,
  type FrontendEnv,
} from '@app/frontend-api-support';

export const getFrontendEnv = (): FrontendEnv =>
  import.meta.env as Readonly<Record<string, boolean | string | undefined>>;

export const getAuthApiBaseUrl = (): string => getRequiredApiBaseUrl(getFrontendEnv(), 'VITE_AUTH_API_BASE_URL');

export const getUserApiBaseUrl = (): string => getRequiredApiBaseUrl(getFrontendEnv(), 'VITE_USER_API_BASE_URL');

/**
 * Telegram login is deployment-configurable at runtime: the container writes
 * `runtime-config.js` from `TELEGRAM_AUTH_ENABLED` at start, so the same image can
 * enable it per environment. The Vite build value stays as the local-dev default.
 */
export const isTelegramAuthEnabled = (): boolean =>
  resolveFeatureFlag(getFrontendRuntimeConfig()['telegramAuthEnabled'], getFrontendEnv()['VITE_TELEGRAM_AUTH_ENABLED']);

/**
 * Reviewer credential access is deployment-configurable at runtime and ships
 * ENABLED for the MVP review build, because a state commission has to sign in as
 * each demo reviewer role. The container writes `runtime-config.js` from
 * `REVIEWER_ACCESS_ENABLED` at start, so a deployment turns the published
 * reviewer identities off with `REVIEWER_ACCESS_ENABLED=false` (Helm:
 * `frontendRuntimeConfig.REVIEWER_ACCESS_ENABLED`) without a code change.
 * `VITE_REVIEWER_ACCESS_ENABLED` remains the build-time default for local dev.
 */
export const isReviewerAccessEnabled = (): boolean =>
  resolveFeatureFlag(
    getFrontendRuntimeConfig()['reviewerAccessEnabled'],
    getFrontendEnv()['VITE_REVIEWER_ACCESS_ENABLED'],
    true,
  );
