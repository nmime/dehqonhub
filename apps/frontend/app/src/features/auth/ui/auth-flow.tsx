import type { ReactNode, SubmitEvent } from 'react';
import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import { AuthMode } from '@app/frontend-feature-user-auth';
import { UiButton, UiCard, UiForm, UiTextField } from '../../../shared/ui';
import { AuthRegisterSteps } from './auth-register-steps';

export type AuthView = 'register' | 'sign-in';

export interface AuthFlowProps {
  isLoginPending: boolean;
  isRegisterPending: boolean;
  isTelegramEnabled: boolean;
  isTelegramPending: boolean;
  loadingLabel: string;
  onSubmit: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
  onTelegram: () => void;
  onViewChange: (view: AuthView) => void;
  socialAuthSlot?: ReactNode;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  view: AuthView;
}

export function AuthFlow({
  isLoginPending,
  isRegisterPending,
  isTelegramEnabled,
  isTelegramPending,
  loadingLabel,
  onSubmit,
  onTelegram,
  onViewChange,
  socialAuthSlot,
  t,
  view,
}: Readonly<AuthFlowProps>) {
  if (view === 'register') {
    return (
      <AuthRegisterSteps
        isRegisterPending={isRegisterPending}
        isTelegramEnabled={isTelegramEnabled}
        isTelegramPending={isTelegramPending}
        loadingLabel={loadingLabel}
        onSignIn={() => {
          onViewChange('sign-in');
        }}
        onSubmit={onSubmit}
        onTelegram={onTelegram}
        t={t}
      />
    );
  }

  return (
    <>
      <UiCard className="user-auth__card" title={t('user.login.title')}>
        <UiForm
          aria-busy={isLoginPending}
          className="xr-auth-form"
          onSubmit={(event) => {
            onSubmit(AuthMode.Login, event);
          }}
        >
          <UiTextField
            aria-label={t('user.form.loginEmailLabel')}
            autoComplete="email"
            label={t('user.form.email')}
            name="email"
            placeholder={t('user.form.emailPlaceholder')}
            required
            type="email"
          />
          <UiTextField
            aria-label={t('user.form.loginPasswordLabel')}
            autoComplete="current-password"
            label={t('user.form.password')}
            minLength={8}
            name="password"
            placeholder={t('user.form.loginPasswordPlaceholder')}
            required
            type="password"
          />
          <UiButton className="xr-submit-button" isLoading={isLoginPending} loadingLabel={loadingLabel} type="submit">
            {t('user.form.login')}
          </UiButton>
        </UiForm>
        <p className="user-auth__switch">
          <span>{t('user.auth.register.prompt')}</span>
          <UiButton
            onClick={() => {
              onViewChange('register');
            }}
            type="button"
            variant="link"
          >
            {t('user.auth.register.start')}
          </UiButton>
        </p>
      </UiCard>
      {socialAuthSlot}
    </>
  );
}
