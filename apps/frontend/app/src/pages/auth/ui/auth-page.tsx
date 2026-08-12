import { useState } from 'react';
import { observer, useI18n, type Locale, type UiTheme } from '@app/frontend-runtime';
import { useAuthSessionFlow, type AuthView } from '../../../features/auth';
import { SocialAuthButtons, useSocialAuth } from '../../../features/social-auth';
import { UiSection, UiToast } from '../../../shared/ui';
import { getErrorReason } from '../../../shared/lib';
import { isTelegramAuthEnabled } from '../../../shared/config';
import { AuthPanel } from '../../../widgets/auth-panel';
import { ProfileStatusCard } from '../../../widgets/profile-status';

interface AuthPageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export const AuthPage = observer(function AuthPage({
  applyUserLocale,
  applyUserTheme,
  navigate,
}: Readonly<AuthPageProps>) {
  const { locale, t } = useI18n();
  const query = new URLSearchParams(globalThis.location.search);
  const returnUrl = query.get('returnUrl') ?? null;
  // `?mode=register` opens the stepped flow directly, so a "create an account"
  // link elsewhere on the site does not land on the sign-in form first.
  const [view, setView] = useState<AuthView>(query.get('mode') === 'register' ? 'register' : 'sign-in');
  const authSession = useAuthSessionFlow({
    applyUserLocale,
    applyUserTheme,
    locale,
    messages: {
      authenticationFailed: t('user.error.authenticationFailed'),
      unauthenticated: t('user.state.unauthenticated'),
      profileRequestFailed: t('user.error.profileRequestFailed'),
      profileUnknown: t('user.profile.unknown'),
    },
    navigate,
    returnUrl,
    // The signed-in hub. Someone who opened the entry point directly has no
    // page to be returned to, and the account area is where a fresh account
    // continues: it shows the verification state a new seller needs next.
    signedInUrl: '/account',
  });
  const socialAuth = useSocialAuth({ navigate });
  const isRegistering = view === 'register';
  // Choosing a provider hands off to a redirect. When that handoff is refused
  // before it starts — a callback URL the auth service does not trust, a provider
  // that is off in this environment — nothing navigates, so without this the
  // button simply did nothing and the visitor had no way to know why.
  const providerStart = socialAuth.telegramOidcError
    ? { error: socialAuth.telegramOidcError, provider: 'auth.provider.telegram' as const }
    : socialAuth.discordError && { error: socialAuth.discordError, provider: 'auth.provider.discord' as const };

  return (
    <UiSection
      className="user-auth"
      eyebrow={t('user.nav.auth')}
      title={t(isRegistering ? 'user.auth.register.title' : 'user.auth.title')}
    >
      <p className="user-page-intro">{t(isRegistering ? 'user.auth.register.description' : 'user.auth.description')}</p>
      {providerStart ? (
        <UiToast
          message={getErrorReason(
            providerStart.error,
            t('auth.social.error.providerUnavailable', {
              provider: t(providerStart.provider),
            }),
          )}
          tone="warning"
        />
      ) : null}
      <AuthPanel
        isLoginPending={authSession.isLoginPending}
        isRegisterPending={authSession.isRegisterPending}
        isTelegramEnabled={isTelegramAuthEnabled()}
        isTelegramPending={socialAuth.isTelegramOidcPending}
        loadingLabel={t('user.loadingProfile')}
        onAuthSubmit={authSession.submitAuth}
        onTelegram={() => {
          // Telegram OIDC has no separate sign-up: the provider creates the
          // account the first time someone arrives through it.
          socialAuth.continueWithTelegram({
            intent: 'login',
            returnUrl: returnUrl ?? undefined,
          });
        }}
        onViewChange={setView}
        socialAuthSlot={
          <SocialAuthButtons
            isDiscordPending={socialAuth.isDiscordPending}
            isTelegramPending={socialAuth.isTelegramOidcPending}
            isTelegramEnabled={isTelegramAuthEnabled()}
            onDiscord={(intent) => {
              socialAuth.continueWithDiscord({ intent });
            }}
            onTelegram={(intent) => {
              socialAuth.continueWithTelegram({ intent, returnUrl: returnUrl ?? undefined });
            }}
            t={t}
          />
        }
        t={t}
        view={view}
      >
        <ProfileStatusCard state={authSession.profileState} t={t} />
      </AuthPanel>
    </UiSection>
  );
});
