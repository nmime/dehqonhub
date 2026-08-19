/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { ReactNode } from 'react';

export type UiListRowTone = 'primary' | 'accent' | 'success' | 'destructive';

export interface UiListRowProps {
  /** Decorative glyph inside the coloured plate. */
  icon?: ReactNode;
  /** Plate colour. Semantic, not ornamental: `success` means settled/verified. */
  tone?: UiListRowTone;
  title: string;
  /** Small line under the title — price, quantity, status, reward. */
  meta?: ReactNode;
  metaTone?: UiListRowTone;
  /** Right-hand affordance: a button, a chevron, a check. */
  trailing?: ReactNode;
  className?: string;
  /** Renders an anchor. Mutually exclusive with `onClick`. */
  href?: string;
  /** Renders a button. Mutually exclusive with `href`. */
  onClick?: () => void;
  /** Marks the row as the current route when rendered as an anchor. */
  isCurrent?: boolean;
}

const classNames = (...values: Array<string | undefined | false>): string => values.filter(Boolean).join(' ');

/**
 * Coloured icon plate, title, meta line, trailing affordance.
 *
 * Catalogue entries, offers, orders, tasks and leaderboard rows are all this
 * one shape. It renders as an anchor, a button, or a plain div depending on
 * whether it actually does something — a non-interactive row must not land in
 * the tab order.
 */
export const UiListRow = ({
  className,
  href,
  icon,
  isCurrent,
  meta,
  metaTone,
  onClick,
  title,
  tone = 'primary',
  trailing,
}: Readonly<UiListRowProps>) => {
  const rowClassName = classNames('xr-list-row', className);
  const content = (
    <>
      {icon ? (
        <span aria-hidden="true" className="xr-list-row__plate" data-tone={tone}>
          {icon}
        </span>
      ) : null}
      <span className="xr-list-row__copy">
        <span className="xr-list-row__title">{title}</span>
        {meta ? (
          <span className="xr-list-row__meta" data-tone={metaTone}>
            {meta}
          </span>
        ) : null}
      </span>
      {trailing ? <span className="xr-list-row__trailing">{trailing}</span> : null}
    </>
  );

  if (href !== undefined) {
    return (
      <a aria-current={isCurrent ? 'page' : undefined} className={rowClassName} href={href}>
        {content}
      </a>
    );
  }

  if (onClick !== undefined) {
    return (
      <button className={rowClassName} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
};

export interface UiListRowsProps {
  children: ReactNode;
  className?: string;
}

/** Groups rows inside a panel. */
export const UiListRows = ({ children, className }: Readonly<UiListRowsProps>) => (
  <div className={classNames('xr-list-rows', className)}>{children}</div>
);
