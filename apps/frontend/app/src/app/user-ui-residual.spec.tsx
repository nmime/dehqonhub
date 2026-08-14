// @requirements REQ-FRONTEND-SHELL-004
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const social = vi.hoisted(() => ({
  clearTelegramOidcState: vi.fn(),
  completeDiscordCallback: vi.fn(),
  completeTelegramOidc: vi.fn(),
  continueWithDiscord: vi.fn(),
  state: {
    discordCallbackError: new Error('discord callback failed'),
    discordCallbackStatus: 'idle',
    isDiscordCallbackPending: false,
    isTelegramOidcCallbackPending: false,
    telegramOidcCallbackError: new Error('telegram callback failed'),
    telegramOidcCallbackStatus: 'idle',
  },
}));

vi.mock('@app/frontend-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-runtime')>();
  return {
    ...actual,
    useI18n: () => ({ locale: 'en', t: (key: string) => key }),
  };
});

vi.mock('../features/auth', () => ({ useAuthSessionProbe: vi.fn() }));
vi.mock('../features/logout', () => ({ LogoutButton: () => <button type="button">logout</button> }));
vi.mock('../features/social-auth', () => ({
  clearTelegramOidcState: social.clearTelegramOidcState,
  ProviderIdentitiesPanel: ({ onLink }: { onLink: (provider: string) => void }) => (
    <div>
      <button
        onClick={() => {
          onLink('discord');
        }}
        type="button"
      >
        link-discord
      </button>
      <button
        onClick={() => {
          onLink('telegram');
        }}
        type="button"
      >
        link-telegram
      </button>
    </div>
  ),
  readTelegramOidcState: () => ({ intent: 'login', returnUrl: '/profile' }),
  SocialAuthProvider: { Discord: 'discord', Telegram: 'telegram' },
  useSocialAuth: () => ({
    ...social.state,
    completeDiscordCallback: social.completeDiscordCallback,
    completeTelegramOidc: social.completeTelegramOidc,
    continueWithDiscord: social.continueWithDiscord,
  }),
}));
vi.mock('../shared/lib', () => ({ getErrorReason: (_error: unknown, fallback: string) => fallback }));
vi.mock('../shared/ui', () => {
  const Container = ({ children, title }: { children?: ReactNode; title?: string }) => (
    <section>
      {title ? <h1>{title}</h1> : null}
      {children}
    </section>
  );
  return {
    LanguageSwitcher: () => <span>language</span>,
    ThemeSwitcher: () => <span>theme</span>,
    UiAlert: Container,
    UiCard: Container,
    UiLoading: ({ label }: { label: string }) => <span>{label}</span>,
    UiSection: Container,
    UiToast: ({ message }: { message: string }) => <span>{message}</span>,
  };
});

import { AuthDiscordCallbackPage } from '../pages/auth-discord-callback';
import { AuthTelegramCallbackPage } from '../pages/auth-telegram-callback';
import { SettingsPage } from '../pages/settings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  social.state.discordCallbackStatus = 'idle';
  social.state.telegramOidcCallbackStatus = 'idle';
});

describe('remaining user settings and callback states', () => {
  it('routes both provider links and renders completed or failed callback outcomes', () => {
    const navigate = vi.fn();
    render(<SettingsPage applyUserLocale={vi.fn()} applyUserTheme={vi.fn()} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'link-discord' }));
    fireEvent.click(screen.getByRole('button', { name: 'link-telegram' }));
    expect(social.continueWithDiscord).toHaveBeenCalledWith({ intent: 'link' });
    expect(navigate).toHaveBeenCalledWith('/link/telegram', { replace: false });

    cleanup();
    window.history.replaceState(null, '', '/auth/discord/callback?code=code&state=state');
    social.state.discordCallbackStatus = 'success';
    const discord = render(<AuthDiscordCallbackPage navigate={navigate} />);
    expect(screen.getByText('auth.social.discord.callback.success')).toBeTruthy();
    social.state.discordCallbackStatus = 'error';
    discord.rerender(<AuthDiscordCallbackPage navigate={navigate} />);
    expect(screen.getByText('auth.social.discord.callback.error')).toBeTruthy();

    cleanup();
    window.history.replaceState(null, '', '/auth/telegram/callback');
    social.state.telegramOidcCallbackStatus = 'success';
    const telegram = render(<AuthTelegramCallbackPage navigate={navigate} />);
    expect(screen.getByText('auth.social.telegram.callback.success')).toBeTruthy();
    social.state.telegramOidcCallbackStatus = 'error';
    telegram.rerender(<AuthTelegramCallbackPage navigate={navigate} />);
    expect(screen.getByText('auth.social.telegram.callback.error')).toBeTruthy();
  });
});
