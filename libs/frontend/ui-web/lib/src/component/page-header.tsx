/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type HTMLAttributes, type ReactNode } from 'react';

export interface UiPageHeaderProps extends HTMLAttributes<HTMLElement> {
  title: string;
  /** One muted line under the title. Keep it to a single sentence. */
  subtitle?: string;
  /**
   * `1` for the route's own title, `2` when the header introduces a section
   * inside a page that already has an h1. Heading order is not decorative.
   */
  headingLevel?: 1 | 2;
  align?: 'center' | 'start';
  /** Stat chips or a single control rendered under the subtitle. */
  children?: ReactNode;
}

const classNames = (...values: Array<string | undefined | false>): string => values.filter(Boolean).join(' ');

/** Centred title over a muted subtitle — the opening block of every screen. */
export const UiPageHeader = ({
  align = 'center',
  children,
  className,
  headingLevel = 1,
  subtitle,
  title,
  ...props
}: Readonly<UiPageHeaderProps>) => {
  const headingId = useId();
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <header
      {...props}
      aria-labelledby={headingId}
      className={classNames('xr-page-header', align === 'start' && 'xr-page-header--start', className)}
    >
      <Heading className="xr-page-header__title" id={headingId}>
        {title}
      </Heading>
      {subtitle ? <p className="xr-page-header__subtitle">{subtitle}</p> : null}
      {children}
    </header>
  );
};
