// @requirements REQ-FRONTEND-JOURNEY-001 REQ-FRONTEND-NATIVE-006 REQ-FRONTEND-SHELL-004
// Evidence for: REQ-FRONTEND-JOURNEY-001 REQ-FRONTEND-NATIVE-006 REQ-FRONTEND-SHELL-004
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useI18n } from '@app/frontend-runtime';
import { MobileAppProviders } from './app/mobile-app-providers';
import { useMobileRuntime } from './shared';

function LocaleProbe() {
  const { locale } = useI18n();
  const { applyUserLocale } = useMobileRuntime();

  return (
    <>
      <span data-testid="locale">{locale}</span>
      <button
        onClick={() => {
          applyUserLocale('ru');
        }}
        type="button"
      >
        to-russian
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('MobileAppProviders', () => {
  it('drives the shared preference model so a locale change flows into i18n', async () => {
    render(
      <MobileAppProviders>
        <LocaleProbe />
      </MobileAppProviders>,
    );

    expect(screen.getByTestId('locale').textContent).toBe('en');

    fireEvent.click(screen.getByText('to-russian'));

    await waitFor(() => {
      expect(screen.getByTestId('locale').textContent).toBe('ru');
    });
  });
});
