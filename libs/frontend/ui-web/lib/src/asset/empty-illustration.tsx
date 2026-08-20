/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type ReactNode } from 'react';
import { ArtworkFrame, artworkPalette, bodyGradient, sheenGradient, type UiArtworkProps } from './artwork-base';

/**
 * Empty-state artwork.
 *
 * Each sits on the same dark rounded plate so a screen with two empty regions
 * still reads as one page. They are decorative by default: the empty state's
 * own heading and description carry the meaning, and duplicating it in an
 * `alt` just makes a screen reader say it twice.
 */

const Plate = ({ children, ...props }: Readonly<UiArtworkProps & { children: ReactNode }>) => {
  const id = useId();
  const body = `${id}-body`;
  const sheen = `${id}-sheen`;

  return (
    <ArtworkFrame {...props} defaultSize={112} viewBox="0 0 112 112">
      <defs>
        {bodyGradient(body, artworkPalette.slate[0], artworkPalette.slate[1])}
        {sheenGradient(sheen)}
      </defs>
      <rect fill={`url(#${body})`} height="104" rx="32" width="104" x="4" y="4" />
      <rect fill={`url(#${sheen})`} height="104" rx="32" width="104" x="4" y="4" />
      {children}
    </ArtworkFrame>
  );
};

const OUTLINE = '#a9a4d8';

/** Nothing in the cart yet. */
export const UiEmptyCartArt = (props: Readonly<UiArtworkProps>) => (
  <Plate {...props}>
    <path
      d="M30 34h6.5l6 30h30l6-21H41"
      stroke={OUTLINE}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="4.5"
    />
    <circle cx="47" cy="76" fill={OUTLINE} r="5" />
    <circle cx="70" cy="76" fill={OUTLINE} r="5" />
  </Plate>
);

/** No orders placed. */
export const UiEmptyOrdersArt = (props: Readonly<UiArtworkProps>) => (
  <Plate {...props}>
    <rect height="52" rx="7" stroke={OUTLINE} strokeWidth="4.5" width="42" x="35" y="30" />
    <path d="M46 45h20M46 55h20M46 65h12" stroke={OUTLINE} strokeLinecap="round" strokeWidth="4.5" />
  </Plate>
);

/** No offers received on a request. */
export const UiEmptyOffersArt = (props: Readonly<UiArtworkProps>) => (
  <Plate {...props}>
    <path d="M56 28 34 62h18l-4 22 22-34H52l4-22Z" stroke={OUTLINE} strokeLinejoin="round" strokeWidth="4.5" />
  </Plate>
);

/** A search or filter matched nothing. */
export const UiEmptyResultsArt = (props: Readonly<UiArtworkProps>) => (
  <Plate {...props}>
    <circle cx="51" cy="50" r="19" stroke={OUTLINE} strokeWidth="4.5" />
    <path d="m65 64 15 15" stroke={OUTLINE} strokeLinecap="round" strokeWidth="5.5" />
  </Plate>
);

/** No saved favourites. */
export const UiEmptyFavoritesArt = (props: Readonly<UiArtworkProps>) => (
  <Plate {...props}>
    <path
      d="M56 79S32 65.5 32 49.5a13.5 13.5 0 0 1 24-8.4 13.5 13.5 0 0 1 24 8.4C80 65.5 56 79 56 79Z"
      stroke={OUTLINE}
      strokeLinejoin="round"
      strokeWidth="4.5"
    />
  </Plate>
);
