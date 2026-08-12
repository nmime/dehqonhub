import { useEffect } from 'react';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { observer } from '@app/frontend-runtime';
import { MarketplacePage } from '../../pages/marketplace';
import { TelegramMiniAppFrame } from './telegram-frame';
import { isBareRoute, isMarketplaceRoute, normalizePath, useUserNavigate } from './user-navigation';

/**
 * The site's only layout. Marketplace routes render their own view inside the
 * DehqonHub chrome; every other route — auth, account preferences, the farmer
 * consoles, not-found — renders as embedded content inside the same chrome, so
 * the header, categories, mobile navigation and footer never change between
 * pages. Telegram mini-app routes are the single exception: they run inside
 * Telegram's own frame, which supplies the surrounding chrome.
 *
 * In-app anchors are delegated to the router so they route client-side.
 */
export const UserShell = observer(function UserShell() {
  const navigate = useUserNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const route = normalizePath(pathname);

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      // Let the browser handle anything that is not a plain left click, or a
      // click the app already handled, so new-tab/download/modified clicks work.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const anchorTarget = anchor.getAttribute('target');
      if ((anchorTarget && anchorTarget !== '_self') || anchor.hasAttribute('download')) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!href?.startsWith('/')) {
        return;
      }
      event.preventDefault();
      navigate(href);
    };
    globalThis.document.addEventListener('click', clickHandler);
    return () => {
      globalThis.document.removeEventListener('click', clickHandler);
    };
  }, [navigate]);

  if (isMarketplaceRoute(route)) {
    return <Outlet />;
  }

  if (isBareRoute(route)) {
    return (
      <TelegramMiniAppFrame navigate={navigate}>
        <Outlet />
      </TelegramMiniAppFrame>
    );
  }

  return (
    <MarketplacePage navigate={navigate} view="embedded">
      <Outlet />
    </MarketplacePage>
  );
});
