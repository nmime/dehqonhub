/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { HTMLAttributes, ReactNode } from 'react';

export interface UiStatChipProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** Leading glyph. Decorative — the accessible name comes from `label`. */
  icon?: ReactNode;
  /** Short name of the quantity, e.g. a balance or credit-limit label. */
  label: string;
  /** Formatted value. Callers own locale formatting. */
  value: string;
  /**
   * Renders the trailing circular button. Without it the chip is a read-only
   * readout and drops the button entirely rather than showing a dead control.
   */
  actionLabel?: string;
  onAction?: () => void;
}

const classNames = (...values: Array<string | undefined | false>): string => values.filter(Boolean).join(' ');

/**
 * Persistent resource readout that sits directly under the mini-app header.
 *
 * The visible text is the value alone — the label is carried on the group so
 * the row stays scannable at a glance without leaving the number unlabelled
 * for assistive technology.
 */
export const UiStatChip = ({
  actionLabel,
  className,
  icon,
  label,
  onAction,
  value,
  ...props
}: Readonly<UiStatChipProps>) => {
  const hasAction = actionLabel !== undefined && onAction !== undefined;

  return (
    <div
      {...props}
      aria-label={`${label}: ${value}`}
      className={classNames('xr-stat-chip', !hasAction && 'xr-stat-chip--plain', className)}
      role="group"
    >
      {icon ? (
        <span aria-hidden="true" className="xr-stat-chip__icon">
          {icon}
        </span>
      ) : null}
      <span className="xr-stat-chip__value">{value}</span>
      {hasAction ? (
        <button aria-label={actionLabel} className="xr-stat-chip__action" onClick={onAction} type="button">
          <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 14 14" width="14">
            <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeLinecap="round" strokeWidth="2.25" />
          </svg>
        </button>
      ) : null}
    </div>
  );
};

export interface UiStatChipRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const UiStatChipRow = ({ children, className, ...props }: Readonly<UiStatChipRowProps>) => (
  <div {...props} className={classNames('xr-stat-chip-row', className)}>
    {children}
  </div>
);
