/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { ReactNode } from 'react';

export interface UiArtworkProps {
  /** Edge length in px. Artwork is square. */
  size?: number;
  className?: string;
  /**
   * Accessible name. Omit for decorative use — the artwork then renders
   * `aria-hidden` and stays out of the accessibility tree, which is correct
   * whenever adjacent text already names the thing.
   */
  title?: string;
}

interface ArtworkFrameProps extends UiArtworkProps {
  viewBox: string;
  children: ReactNode;
  defaultSize: number;
}

const classNames = (...values: Array<string | undefined>): string => values.filter(Boolean).join(' ');

/**
 * Shared SVG frame.
 *
 * Every mark in this pack is a flat vector styled to read as glossy — a
 * vertical gradient body plus a low-opacity white specular highlight. No raster
 * assets, no external requests, and both themes are handled because the stops
 * are fixed hues chosen to sit on either canvas.
 */
export const ArtworkFrame = ({
  children,
  className,
  defaultSize,
  size,
  title,
  viewBox,
}: Readonly<ArtworkFrameProps>) => {
  const edge = size ?? defaultSize;

  return (
    <svg
      aria-hidden={title === undefined ? 'true' : undefined}
      className={classNames('xr-illustration', className)}
      fill="none"
      focusable="false"
      height={edge}
      role={title === undefined ? undefined : 'img'}
      viewBox={viewBox}
      width={edge}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title === undefined ? null : <title>{title}</title>}
      {children}
    </svg>
  );
};

/** Vertical two-stop body gradient. */
export const bodyGradient = (id: string, from: string, to: string): ReactNode => (
  <linearGradient gradientUnits="objectBoundingBox" id={id} x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stopColor={from} />
    <stop offset="1" stopColor={to} />
  </linearGradient>
);

/** Top-left specular sheen laid over a body fill. */
export const sheenGradient = (id: string): ReactNode => (
  <linearGradient gradientUnits="objectBoundingBox" id={id} x1="0" x2="0.6" y1="0" y2="1">
    <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
    <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.06" />
    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
  </linearGradient>
);

/** Palette shared by the pack, matching the mini-app token hues. */
export const artworkPalette = {
  blue: ['#4f8bff', '#1e5bd8'],
  gold: ['#ffcf6b', '#e08a15'],
  green: ['#4ade80', '#16a34a'],
  violet: ['#8b7bf0', '#5b45c9'],
  slate: ['#3b3766', '#252148'],
  red: ['#f87171', '#dc2626'],
} as const;
