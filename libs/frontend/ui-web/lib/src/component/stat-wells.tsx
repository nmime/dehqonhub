/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { HTMLAttributes } from 'react';

export type UiStatWellTone = 'default' | 'accent' | 'success';

export interface UiStatWell {
  /** Stable key and accessible pairing anchor. */
  id: string;
  /** Formatted number or short string. Callers own locale formatting. */
  value: string;
  label: string;
  tone?: UiStatWellTone;
}

export interface UiStatWellsProps extends HTMLAttributes<HTMLDListElement> {
  /** Names the group, e.g. "Settlement countdown". Required for the list role. */
  caption: string;
  items: readonly UiStatWell[];
}

const classNames = (...values: Array<string | undefined>): string => values.filter(Boolean).join(' ');

/**
 * A row of big numbers over small muted labels, each in its own dark well.
 *
 * Rendered as a description list so the value/label pairing survives without
 * sight — a countdown read as "2 2 44 55" is useless on a screen reader.
 */
export const UiStatWells = ({ caption, className, items, ...props }: Readonly<UiStatWellsProps>) => (
  <dl {...props} aria-label={caption} className={classNames('xr-stat-wells', className)}>
    {/* Term before definition so it reads as "Days: 2"; the cell is laid out
        column-reverse so the value still sits on top visually. */}
    {items.map((item) => (
      <div className="xr-stat-wells__cell" key={item.id}>
        <dt className="xr-stat-wells__label">{item.label}</dt>
        <dd className="xr-stat-wells__value" data-tone={item.tone}>
          {item.value}
        </dd>
      </div>
    ))}
  </dl>
);
