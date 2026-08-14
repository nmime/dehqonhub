import { useState } from 'react';
import { observer, useI18n, type Locale, type UiTheme } from '@app/frontend-runtime';
import { AuthRecoveryCard, useAuthSessionFlow, type AuthView } from '../../../features/auth';
import { SocialAuthButtons, useSocialAuth } from '../../../features/social-auth';
import { UiSection } from '../../../shared/ui';
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
  });
  const socialAuth = useSocialAuth({ navigate });
  const isRegistering = view === 'register';

  return (
    <UiSection
      className="user-auth"
      eyebrow={t('user.auth.eyebrow')}
      title={t(isRegistering ? 'user.auth.register.title' : 'user.auth.title')}
    >
      <p className="user-page-intro">{t(isRegistering ? 'user.auth.register.description' : 'user.auth.description')}</p>
      <AuthPanel
        isLoginPending={authSession.isLoginPending}
        isRegisterPending={authSession.isRegisterPending}
        isTelegramEnabled={isTelegramAuthEnabled()}
        isTelegramPending={socialAuth.isTelegramOidcPending}
        loadingLabel={t('user.loadingProfile')}
        onAuthSubmit={authSession.submitAuth}
        onTelegram={() => {
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
      <AuthRecoveryCard t={t} />
    </UiSection>
  );
});
