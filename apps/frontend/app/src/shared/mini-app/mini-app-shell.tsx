import { useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Share2 } from 'lucide-react';
import {
  ProductShell,
  UiBottomNav,
  UiNavLeadersIcon,
  UiNavMarketIcon,
  UiNavOffersIcon,
  UiNavOrdersIcon,
  UiNavProfileIcon,
  type ProductShellAction,
  type ProductShellProps,
  type UiBottomNavItem,
} from '@app/frontend-ui-web';
import { useMiniApp, useMiniAppBackButton } from './mini-app-provider';

export interface MiniAppShellProps extends Omit<ProductShellProps, 'children' | 'headerLeading' | 'headerTrailing'> {
  activePath: string;
  backLabel?: string;
  children: ReactNode;
  onBack: () => void;
  shareLabel?: string;
  shareText?: string;
  shareTitle?: string;
  heroActions?: ProductShellAction[];
}

const getShareUrl = (): string => {
  if (typeof location === 'undefined') {
    return '/';
  }
  return location.href;
};

/**
 * Route-to-glyph mapping for the bottom navigation.
 *
 * The filled marks from the shared asset pack replace lucide's strokes here
 * only: at nav size, inside a filled active plate, a 2px stroke loses too much
 * contrast on a low-DPI screen. Lucide still owns every other icon in the app.
 */
const iconForAction = (href: string): ReactNode => {
  if (href.startsWith('/profile') || href.startsWith('/auth')) {
    return <UiNavProfileIcon />;
  }
  if (href.startsWith('/orders') || href.startsWith('/settings') || href.startsWith('/link/')) {
    return <UiNavOrdersIcon />;
  }
  if (href.startsWith('/offers') || href.startsWith('/requests')) {
    return <UiNavOffersIcon />;
  }
  if (href.startsWith('/leaders') || href.startsWith('/ratings')) {
    return <UiNavLeadersIcon />;
  }
  return <UiNavMarketIcon />;
};

const toNavItem = (action: ProductShellAction): UiBottomNavItem => ({
  href: action.href,
  icon: iconForAction(action.href),
  isCurrent: action.isCurrent,
  label: action.label,
});

export function MiniAppShell({
  activePath,
  actions,
  appName,
  backLabel = 'Back',
  children,
  onBack,
  shareLabel = 'Share',
  shareText,
  shareTitle,
  heroActions,
  ...productShellProps
}: Readonly<MiniAppShellProps>) {
  const miniApp = useMiniApp();
  const [shareResult, setShareResult] = useState<string | null>(null);
  const canGoBack = activePath !== '/';
  useMiniAppBackButton({ isVisible: canGoBack, onBack });

  const handleShare = async () => {
    const result = await miniApp.share({
      text: shareText,
      title: shareTitle ?? appName,
      url: getShareUrl(),
    });
    setShareResult(result);
  };

  const backControl =
    !miniApp.isTelegram && canGoBack ? (
      <button
        aria-label={backLabel}
        className="xr-mini-app-control xr-mini-app-control--back"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={19} strokeWidth={2} />
        <span className="sr-only">{backLabel}</span>
      </button>
    ) : null;
  const shareControl = (
    <button
      aria-label={shareLabel}
      className="xr-mini-app-control xr-mini-app-control--share"
      data-share-result={shareResult ?? 'idle'}
      onClick={() => void handleShare()}
      type="button"
    >
      {shareResult === 'copied' ? (
        <Check aria-hidden="true" size={19} strokeWidth={2} />
      ) : (
        <Share2 aria-hidden="true" size={19} strokeWidth={2} />
      )}
      <span className="sr-only">{shareResult === 'copied' ? 'Copied' : shareLabel}</span>
    </button>
  );

  return (
    <div
      className="xr-mini-app-shell"
      data-mini-app-environment={miniApp.environment}
      data-mini-app-fullscreen={miniApp.isFullscreen}
      data-mini-app-path={activePath}
    >
      <ProductShell
        {...productShellProps}
        actions={heroActions ?? actions}
        appName={appName}
        headerLeading={backControl}
        headerTrailing={shareControl}
      >
        {children}
      </ProductShell>
      <UiBottomNav
        action={{
          icon:
            shareResult === 'copied' ? (
              <Check aria-hidden="true" size={20} strokeWidth={2.5} />
            ) : (
              <Share2 aria-hidden="true" size={20} strokeWidth={2.5} />
            ),
          label: shareLabel,
          onClick: () => void handleShare(),
        }}
        ariaLabel={`${appName} bottom navigation`}
        items={actions.map(toNavItem)}
      />
      <span aria-live="polite" className="sr-only">
        {shareResult === 'copied' ? 'Share link copied to clipboard.' : null}
      </span>
    </div>
  );
}
