import { useEffect, useMemo, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthApiClient, useUserApiClient } from '@app/frontend-api-client';
import { clearApiAuthRequired, getApiErrorDisplayMessage } from '@app/frontend-api-support';
import { useAuthShellStore, type Locale, type UiTheme } from '@app/frontend-runtime';
import {
  fetchUserProfile,
  getPayloadLocale,
  getPayloadTheme,
  getProfileState,
  profileQueryKey,
  type ProfileState,
} from '@app/frontend-feature-user-profile';
import { authMeQueryKey, createAuthSession } from './auth-api';
import { AuthMode } from './auth-model';
import { useAuthSessionProbe } from './use-auth-session-probe';

export interface AuthSessionFlowMessages {
  authenticationFailed: string;
  unauthenticated: string;
  profileRequestFailed: string;
  profileUnknown: string;
}

export interface AuthSessionFlowInput {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  locale: Locale;
  messages: AuthSessionFlowMessages;
  navigate?: (to: string, options?: { replace?: boolean }) => void;
  returnUrl?: string | null;
  /**
   * Where to land after a successful sign-in when the visitor did not arrive from
   * a particular page. The caller supplies it because the destination is a route
   * of whichever shell hosts this flow — the web route tree here, an
   * `expo-router` screen on native.
   */
  signedInUrl?: string;
}

export interface AuthSessionFlow {
  isLoginPending: boolean;
  isRegisterPending: boolean;
  profileState: ProfileState;
  submitAuth: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
}

export function useAuthSessionFlow({
  applyUserLocale,
  applyUserTheme,
  locale,
  messages,
  navigate,
  returnUrl,
  signedInUrl,
}: AuthSessionFlowInput): AuthSessionFlow {
  const queryClient = useQueryClient();
  const authStore = useAuthShellStore();
  const authClient = useAuthApiClient();
  const userClient = useUserApiClient();
  const safeReturnUrl = returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : null;
  const { authMeQuery } = useAuthSessionProbe({
    applyUserLocale,
    applyUserTheme,
    locale,
  });

  // Gating this on `authLocale === locale` used to hold the request back until
  // the session's locale had been applied. It also deadlocked: when the session
  // payload and the profile payload disagreed about the locale — a preference
  // saved on another device leaves one of them stale — the two took turns
  // applying their own value, the equality never held, and the profile card sat
  // on its spinner forever. The locale is part of the query key, so a later
  // locale still refetches under its own key; the gate only bought a deadlock.
  const profileQuery = useQuery({
    enabled: Boolean(authMeQuery.data) && !authMeQuery.isLoading,
    queryFn: () => fetchUserProfile(userClient.api, userClient.requestOptions),
    queryKey: [...profileQueryKey(), locale],
    retry: false,
    staleTime: 15_000,
  });
  const profileLocale = getPayloadLocale(profileQuery.data);

  useEffect(() => {
    if (profileLocale) {
      applyUserLocale(profileLocale);
    }
  }, [applyUserLocale, profileLocale]);

  const authMutation = useMutation({
    mutationFn: (input: Parameters<typeof createAuthSession>[2]) =>
      createAuthSession(authClient.api, authClient.requestOptions, input, locale),
    onMutate: async () => {
      // A fast login can overlap the anonymous session probe. Cancel that
      // probe so its eventual 401 cannot clear the newly established session.
      await queryClient.cancelQueries({ queryKey: authMeQueryKey() });
    },
    onSuccess: (body) => {
      authStore.markAuthenticated();
      clearApiAuthRequired();
      const nextLocale = getPayloadLocale(body);
      const nextTheme = getPayloadTheme(body);
      if (nextLocale) {
        applyUserLocale(nextLocale);
      }
      if (nextTheme) {
        applyUserTheme(nextTheme);
      }
      void queryClient.invalidateQueries({ queryKey: authMeQueryKey() });
      void queryClient.invalidateQueries({ queryKey: profileQueryKey() });
      // Leaving the form is part of succeeding. Without the `signedInUrl` half
      // this only moved visitors who had arrived from somewhere specific; anyone
      // who opened the entry point directly stayed on the very form they had just
      // submitted — the stepped flow sat on "step 3 of 3" with the account
      // already created, which reads as a failure. `replace` keeps the form out
      // of the history so Back does not return to a filled-in wizard.
      const destination = safeReturnUrl ?? signedInUrl;
      if (destination) {
        navigate?.(destination, { replace: true });
      }
    },
    retry: false,
  });

  const profileState = useMemo(() => {
    if (authMutation.isError) {
      return {
        status: 'forbidden' as const,
        reason: getApiErrorDisplayMessage(authMutation.error, messages.authenticationFailed),
      };
    }

    if (!authMeQuery.isLoading && !authMeQuery.data) {
      return {
        status: 'unauthenticated' as const,
        reason: messages.unauthenticated,
      };
    }

    return getProfileState(
      authMeQuery.isLoading || profileQuery.isLoading,
      profileQuery.data,
      messages.profileRequestFailed,
      messages.profileUnknown,
      profileQuery.error,
      authMeQuery.data ?? undefined,
    );
  }, [
    authMeQuery.isLoading,
    authMeQuery.data,
    authMutation.error,
    authMutation.isError,
    messages,
    profileQuery.data,
    profileQuery.error,
    profileQuery.isLoading,
  ]);

  const submitAuth = (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    authMutation.mutate({
      displayName: form.get('displayName'),
      email: form.get('email'),
      mode,
      password: form.get('password'),
    });
  };

  return {
    isLoginPending: authMutation.isPending && authMutation.variables.mode === AuthMode.Login,
    isRegisterPending: authMutation.isPending && authMutation.variables.mode === AuthMode.Register,
    profileState,
    submitAuth,
  };
}
