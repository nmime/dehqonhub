// @requirements REQ-AUTH-RECOVERY-010
import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, throwOnOpenApiErrorData, useAuthApiClient } from '@app/frontend-api-client';
import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import { UiButton, UiCard, UiForm, UiTextField, UiToast } from '../../../shared/ui';

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

const successMessageKey = {
  'verification-requested': 'user.auth.recovery.verificationRequested',
  'verification-confirmed': 'user.auth.recovery.verificationConfirmed',
  'reset-requested': 'user.auth.recovery.resetRequested',
  'reset-confirmed': 'user.auth.recovery.resetConfirmed',
} as const satisfies Record<string, TranslationKey>;

const formText = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

export function AuthRecoveryCard({ t }: Readonly<{ t: Translate }>) {
  const { api, requestOptions } = useAuthApiClient();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' }>();

  const mutation = useMutation({
    mutationFn: async (
      input:
        | { kind: 'request-verification'; email: string }
        | { kind: 'confirm-verification'; token: string }
        | { kind: 'request-reset'; email: string }
        | { kind: 'confirm-reset'; token: string; password: string },
    ) => {
      if (input.kind === 'request-verification') {
        await throwOnOpenApiErrorData(
          api.authControllerRequestEmailVerification({ email: input.email }, requestOptions),
        );
        return 'verification-requested' as const;
      }
      if (input.kind === 'confirm-verification') {
        await throwOnOpenApiErrorData(
          api.authControllerConfirmEmailVerification({ token: input.token }, requestOptions),
        );
        return 'verification-confirmed' as const;
      }
      if (input.kind === 'request-reset') {
        await throwOnOpenApiErrorData(api.authControllerRequestPasswordReset({ email: input.email }, requestOptions));
        return 'reset-requested' as const;
      }
      await throwOnOpenApiErrorData(
        api.authControllerConfirmPasswordReset({ password: input.password, token: input.token }, requestOptions),
      );
      return 'reset-confirmed' as const;
    },
    onError: () => {
      setNotice({
        message: t('user.auth.recovery.error'),
        tone: 'warning',
      });
    },
    onSuccess: async (result) => {
      setNotice({ message: t(successMessageKey[result]), tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: authApi.getAuthControllerMeQueryKey() });
    },
    retry: false,
  });

  const submit =
    (kind: 'request-verification' | 'confirm-verification' | 'request-reset' | 'confirm-reset') =>
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (kind === 'request-verification' || kind === 'request-reset') {
        mutation.mutate({ email: formText(form, 'email'), kind });
        return;
      }
      if (kind === 'confirm-verification') {
        mutation.mutate({ kind, token: formText(form, 'token') });
        return;
      }
      mutation.mutate({ kind, password: formText(form, 'password'), token: formText(form, 'token') });
    };

  return (
    <UiCard className="user-auth__card user-auth__recovery" title={t('user.auth.recovery.title')}>
      <p>{t('user.auth.recovery.description')}</p>
      {notice ? <UiToast message={notice.message} tone={notice.tone} /> : null}
      <section aria-labelledby="email-verification-title">
        <h3 id="email-verification-title">{t('user.auth.recovery.verifyTitle')}</h3>
        <UiForm onSubmit={submit('request-verification')}>
          <UiTextField autoComplete="email" label={t('user.form.email')} name="email" required type="email" />
          <UiButton disabled={mutation.isPending} type="submit" variant="secondary">
            {t('user.auth.recovery.sendVerification')}
          </UiButton>
        </UiForm>
        <UiForm onSubmit={submit('confirm-verification')}>
          <UiTextField
            autoComplete="one-time-code"
            label={t('user.auth.recovery.code')}
            minLength={16}
            name="token"
            required
          />
          <UiButton disabled={mutation.isPending} type="submit">
            {t('user.auth.recovery.confirmVerification')}
          </UiButton>
        </UiForm>
      </section>
      <section aria-labelledby="password-reset-title">
        <h3 id="password-reset-title">{t('user.auth.recovery.resetTitle')}</h3>
        <UiForm onSubmit={submit('request-reset')}>
          <UiTextField autoComplete="email" label={t('user.form.email')} name="email" required type="email" />
          <UiButton disabled={mutation.isPending} type="submit" variant="secondary">
            {t('user.auth.recovery.sendReset')}
          </UiButton>
        </UiForm>
        <UiForm onSubmit={submit('confirm-reset')}>
          <UiTextField
            autoComplete="one-time-code"
            label={t('user.auth.recovery.code')}
            minLength={16}
            name="token"
            required
          />
          <UiTextField
            autoComplete="new-password"
            label={t('user.auth.recovery.newPassword')}
            minLength={8}
            name="password"
            required
            type="password"
          />
          <UiButton disabled={mutation.isPending} type="submit">
            {t('user.auth.recovery.confirmReset')}
          </UiButton>
        </UiForm>
      </section>
    </UiCard>
  );
}
