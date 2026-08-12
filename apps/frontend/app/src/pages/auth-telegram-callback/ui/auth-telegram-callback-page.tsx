import { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '@app/frontend-runtime';
import { clearTelegramOidcState, readTelegramOidcState, useSocialAuth } from '../../../features/social-auth';
import { getErrorReason } from '../../../shared/lib';
import { UiAlert, UiCard, UiLoading, UiSection, UiToast } from '../../../shared/ui';

interface AuthTelegramCallbackPageProps {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const readProviderError = (): string | null => {
  const value = new URLSearchParams(globalThis.location.search).get('error');
  return value?.trim() || null;
};

export function AuthTelegramCallbackPage({ navigate }: Readonly<AuthTelegramCallbackPageProps>) {
  const { t } = useI18n();
  const socialAuth = useSocialAuth({ navigate });
  const providerError = useMemo(readProviderError, []);
  const pendingState = useMemo(readTelegramOidcState, []);
  const callbackStarted = useRef(false);

  // The effect re-runs on every render, so the ref — not the mutation status, which
  // is still `idle` inside the commit that starts it — is what keeps a Strict Mode
  // double mount, or any later render, from projecting the same session twice.
  useEffect(() => {
    if (callbackStarted.current) {
      return;
    }
    if (providerError) {
      callbackStarted.current = true;
      clearTelegramOidcState();
      return;
    }
    callbackStarted.current = true;
    clearTelegramOidcState();
    socialAuth.completeTelegramOidc(pendingState);
  }, [pendingState, providerError, socialAuth]);

  return (
    <UiSection
      className="user-callback"
      eyebrow={t('auth.provider.telegram')}
      title={t('auth.social.telegram.callback.title')}
    >
      <UiCard className="user-callback__card" title={t('auth.social.telegram.callback.title')}>
        {!providerError && socialAuth.isTelegramOidcCallbackPending ? (
          <UiAlert tone="info">
            <UiLoading label={t('auth.social.telegram.callback.loading')} />
          </UiAlert>
        ) : null}
        {providerError ? <UiToast message={t('auth.social.telegram.callback.providerError')} tone="warning" /> : null}
        {socialAuth.telegramOidcCallbackStatus === 'success' ? (
          <UiToast message={t('auth.social.telegram.callback.success')} tone="success" />
        ) : null}
        {socialAuth.telegramOidcCallbackStatus === 'error' ? (
          <UiToast
            message={getErrorReason(socialAuth.telegramOidcCallbackError, t('auth.social.telegram.callback.error'))}
            tone="warning"
          />
        ) : null}
      </UiCard>
    </UiSection>
  );
}
