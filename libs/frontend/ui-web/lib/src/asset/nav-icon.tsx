/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { SVGProps } from 'react';

export interface UiNavIconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'> {
  size?: number;
}

/**
 * Filled 24px navigation glyphs.
 *
 * Deliberately filled rather than lucide's 2px strokes: at 22px on a low-DPI
 * Android screen a stroked glyph inside a filled active plate loses most of its
 * contrast. These inherit `currentColor`, so the active plate flips them white
 * with no extra rule. Always decorative — `UiBottomNav` renders a visible label.
 */
const NavIcon = ({ children, size = 22, ...props }: Readonly<UiNavIconProps & { children: React.ReactNode }>) => (
  <svg
    {...props}
    aria-hidden="true"
    focusable="false"
    height={size}
    viewBox="0 0 24 24"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
  >
    {children}
  </svg>
);

/** Marketplace / catalogue — a market stall with an awning. */
export const UiNavMarketIcon = (props: Readonly<UiNavIconProps>) => (
  <NavIcon {...props}>
    <path
      d="M3.6 3.5h16.8a1 1 0 0 1 .96.73l1.1 3.85A2.6 2.6 0 0 1 19.9 11a2.6 2.6 0 0 1-2.4-1.6 2.6 2.6 0 0 1-4.9 0 2.6 2.6 0 0 1-4.9 0A2.6 2.6 0 0 1 4.1 11 2.6 2.6 0 0 1 1.54 8.08l1.1-3.85a1 1 0 0 1 .96-.73Z"
      fill="currentColor"
    />
    <path
      d="M4.5 12.4c.9 0 1.76-.28 2.45-.8v7.4h10.1v-7.4c.69.52 1.55.8 2.45.8v8.1a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1v-8.1Z"
      fill="currentColor"
      opacity="0.75"
    />
  </NavIcon>
);

/** Orders — a clipboard with lines. */
export const UiNavOrdersIcon = (props: Readonly<UiNavIconProps>) => (
  <NavIcon {...props}>
    <path
      d="M8 2.8h8a1.2 1.2 0 0 1 1.2 1.2v.6H19a2 2 0 0 1 2 2v13.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2h1.8V4A1.2 1.2 0 0 1 8 2.8Z"
      fill="currentColor"
      opacity="0.75"
    />
    <path
      d="M9 1.6h6a1.4 1.4 0 0 1 1.4 1.4v1.8a.8.8 0 0 1-.8.8H8.4a.8.8 0 0 1-.8-.8V3A1.4 1.4 0 0 1 9 1.6Z"
      fill="currentColor"
    />
    <path d="M7.4 10.2h9.2M7.4 13.8h9.2M7.4 17.4h5.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
  </NavIcon>
);

/** Offers / requests — the reverse-auction lightning bolt. */
export const UiNavOffersIcon = (props: Readonly<UiNavIconProps>) => (
  <NavIcon {...props}>
    <path
      d="M13.6 1.8 4.4 13.1a.7.7 0 0 0 .54 1.15h5.02l-1.6 8.06a.7.7 0 0 0 1.25.55l9.2-11.3a.7.7 0 0 0-.54-1.14h-5.02l1.6-8.07a.7.7 0 0 0-1.25-.55Z"
      fill="currentColor"
    />
  </NavIcon>
);

/** Leaderboard — a trophy. */
export const UiNavLeadersIcon = (props: Readonly<UiNavIconProps>) => (
  <NavIcon {...props}>
    <path d="M6.6 2.6h10.8v7.2a5.4 5.4 0 0 1-10.8 0V2.6Z" fill="currentColor" />
    <path
      d="M6.6 4.4H4.2a1 1 0 0 0-1 1v1.4a3.6 3.6 0 0 0 3.6 3.6h.4M17.4 4.4h2.4a1 1 0 0 1 1 1v1.4a3.6 3.6 0 0 1-3.6 3.6h-.4"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="M10.4 14.6h3.2l.5 3.4h2.3a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1H7.6a1 1 0 0 1-1-1V19a1 1 0 0 1 1-1h2.3l.5-3.4Z"
      fill="currentColor"
      opacity="0.75"
    />
  </NavIcon>
);

/** Profile — a person. */
export const UiNavProfileIcon = (props: Readonly<UiNavIconProps>) => (
  <NavIcon {...props}>
    <circle cx="12" cy="7.4" fill="currentColor" r="4.6" />
    <path d="M3.6 21.2a8.4 8.4 0 0 1 16.8 0 1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1Z" fill="currentColor" opacity="0.75" />
  </NavIcon>
);
