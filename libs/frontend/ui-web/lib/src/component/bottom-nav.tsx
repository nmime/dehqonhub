/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { ReactNode } from 'react';

export interface UiBottomNavItem {
  /** Visible label. Never hidden — see the note on the component. */
  label: string;
  href: string;
  icon: ReactNode;
  isCurrent?: boolean;
}

export interface UiBottomNavAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

export interface UiBottomNavProps {
  /** Names the landmark, e.g. "DehqonHub bottom navigation". */
  ariaLabel: string;
  items: readonly UiBottomNavItem[];
  /** Optional trailing button (share, compose) rendered inside the island. */
  action?: UiBottomNavAction;
  className?: string;
}

const classNames = (...values: Array<string | undefined>): string => values.filter(Boolean).join(' ');

/**
 * Floating bottom navigation island.
 *
 * Labels are rendered visibly rather than as `sr-only` text. The audience is
 * largely first-time smartphone users on low-end Android, for whom an unlabelled
 * glyph row is genuinely ambiguous; the visible label also gives the active item
 * a non-colour indicator, so the state does not depend on hue alone.
 */
export const UiBottomNav = ({ action, ariaLabel, className, items }: Readonly<UiBottomNavProps>) => (
  <nav aria-label={ariaLabel} className={classNames('xr-mini-app-bottom-bar', className)}>
    {items.map((item) => (
      <a
        aria-current={item.isCurrent ? 'page' : undefined}
        className="xr-mini-app-bottom-bar__action"
        data-current={item.isCurrent ?? false}
        href={item.href}
        key={`${item.href}:${item.label}`}
      >
        <span aria-hidden="true">{item.icon}</span>
        <span className="xr-mini-app-bottom-bar__label">{item.label}</span>
      </a>
    ))}
    {action ? (
      <button
        className="xr-mini-app-bottom-bar__action xr-mini-app-bottom-bar__share"
        data-current={false}
        onClick={action.onClick}
        type="button"
      >
        <span aria-hidden="true">{action.icon}</span>
        <span className="xr-mini-app-bottom-bar__label">{action.label}</span>
      </button>
    ) : null}
  </nav>
);
