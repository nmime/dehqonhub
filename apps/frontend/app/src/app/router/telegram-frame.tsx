import { useCallback, type ReactNode } from 'react';
import { useMiniApp, useMiniAppBackButton } from '../../shared/mini-app';
import type { UserNavigate } from './user-navigation';

/**
 * Container for the Telegram mini-app routes. Telegram draws the header, the
 * back control and the bottom bar around the webview, so this frame adds no
 * chrome of its own — it only wires Telegram's native back button to the
 * router, which is what lets a visitor who launched straight into `/tma/auth`
 * reach the marketplace.
 */
export function TelegramMiniAppFrame({
  children,
  navigate,
}: Readonly<{ children: ReactNode; navigate: UserNavigate }>) {
  const { environment, isFullscreen } = useMiniApp();
  const goHome = useCallback(() => {
    navigate('/');
  }, [navigate]);
  useMiniAppBackButton({ isVisible: true, onBack: goHome });

  return (
    <div className="dh-telegram-frame" data-mini-app-environment={environment} data-mini-app-fullscreen={isFullscreen}>
      {children}
    </div>
  );
}
