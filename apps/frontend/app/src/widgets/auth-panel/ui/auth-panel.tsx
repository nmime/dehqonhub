import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import type { SubmitEvent, ReactNode } from 'react';
import { AuthFlow, type AuthMode, type AuthView } from '../../../features/auth';

export interface AuthPanelProps {
  isLoginPending: boolean;
  isRegisterPending: boolean;
  isTelegramEnabled: boolean;
  isTelegramPending: boolean;
  loadingLabel: string;
  onAuthSubmit: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
  onTelegram: () => void;
  onViewChange: (view: AuthView) => void;
  view: AuthView;
  children: ReactNode;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  socialAuthSlot?: ReactNode;
}

export function AuthPanel({
  isLoginPending,
  isRegisterPending,
  isTelegramEnabled,
  isTelegramPending,
  loadingLabel,
  onAuthSubmit,
  onTelegram,
  onViewChange,
  view,
  children,
  t,
  socialAuthSlot,
}: Readonly<AuthPanelProps>) {
  return (
    <div className="user-auth__grid" id="auth">
      <AuthFlow
        isLoginPending={isLoginPending}
        isRegisterPending={isRegisterPending}
        isTelegramEnabled={isTelegramEnabled}
        isTelegramPending={isTelegramPending}
        loadingLabel={loadingLabel}
        onSubmit={onAuthSubmit}
        onTelegram={onTelegram}
        onViewChange={onViewChange}
        socialAuthSlot={socialAuthSlot}
        t={t}
        view={view}
      />
      {children}
    </div>
  );
}
