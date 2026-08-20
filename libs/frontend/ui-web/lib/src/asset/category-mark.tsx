/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId } from 'react';
import { ArtworkFrame, artworkPalette, bodyGradient, sheenGradient, type UiArtworkProps } from './artwork-base';

/**
 * The three catalogue sections. These are non-overlapping by product rule, so
 * each gets one unmistakable silhouette rather than a variation on a theme.
 */

/** Equipment — a tractor in profile. */
export const UiEquipmentMark = (props: Readonly<UiArtworkProps>) => {
  const id = useId();
  const body = `${id}-body`;
  const sheen = `${id}-sheen`;

  return (
    <ArtworkFrame {...props} defaultSize={56} viewBox="0 0 56 56">
      <defs>
        {bodyGradient(body, artworkPalette.gold[0], artworkPalette.gold[1])}
        {sheenGradient(sheen)}
      </defs>
      <rect fill={`url(#${body})`} height="52" rx="16" width="52" x="2" y="2" />
      <rect fill={`url(#${sheen})`} height="52" rx="16" width="52" x="2" y="2" />
      <path d="M20 20h9.5l3.4 7.2H38a3 3 0 0 1 3 3v5.3H17.5V23A3 3 0 0 1 20.5 20Z" fill="#3d2200" opacity="0.28" />
      <path d="M19.5 19h9.5l3.4 7.2H37a3 3 0 0 1 3 3v5.3H16.5V22a3 3 0 0 1 3-3Z" fill="#ffffff" opacity="0.92" />
      <circle cx="21.5" cy="38" fill="#2a1800" r="6.5" />
      <circle cx="21.5" cy="38" fill="#ffffff" opacity="0.9" r="2.6" />
      <circle cx="37.5" cy="39.5" fill="#2a1800" r="4.5" />
      <circle cx="37.5" cy="39.5" fill="#ffffff" opacity="0.9" r="1.8" />
    </ArtworkFrame>
  );
};

/** Seeds — a sprout breaking out of a seed. */
export const UiSeedsMark = (props: Readonly<UiArtworkProps>) => {
  const id = useId();
  const body = `${id}-body`;
  const sheen = `${id}-sheen`;

  return (
    <ArtworkFrame {...props} defaultSize={56} viewBox="0 0 56 56">
      <defs>
        {bodyGradient(body, artworkPalette.green[0], artworkPalette.green[1])}
        {sheenGradient(sheen)}
      </defs>
      <rect fill={`url(#${body})`} height="52" rx="16" width="52" x="2" y="2" />
      <rect fill={`url(#${sheen})`} height="52" rx="16" width="52" x="2" y="2" />
      <path d="M28 42V26" stroke="#ffffff" strokeLinecap="round" strokeWidth="3.4" />
      <path d="M27.4 27.4c-6.4.6-9.8-2.6-10.2-9 6.4-.6 9.8 2.6 10.2 9Z" fill="#ffffff" opacity="0.95" />
      <path d="M28.6 24.6c.4-6.4 3.8-9.6 10.2-9-.4 6.4-3.8 9.6-10.2 9Z" fill="#ffffff" opacity="0.78" />
      <rect fill="#0d3b1e" height="5" opacity="0.35" rx="2.5" width="18" x="19" y="39.5" />
    </ArtworkFrame>
  );
};

/** Produce — a crate of harvested goods. */
export const UiProduceMark = (props: Readonly<UiArtworkProps>) => {
  const id = useId();
  const body = `${id}-body`;
  const sheen = `${id}-sheen`;

  return (
    <ArtworkFrame {...props} defaultSize={56} viewBox="0 0 56 56">
      <defs>
        {bodyGradient(body, artworkPalette.blue[0], artworkPalette.blue[1])}
        {sheenGradient(sheen)}
      </defs>
      <rect fill={`url(#${body})`} height="52" rx="16" width="52" x="2" y="2" />
      <rect fill={`url(#${sheen})`} height="52" rx="16" width="52" x="2" y="2" />
      <circle cx="22" cy="25" fill="#ffffff" opacity="0.95" r="6" />
      <circle cx="33.5" cy="23" fill="#ffffff" opacity="0.72" r="4.8" />
      <circle cx="29" cy="30" fill="#ffffff" opacity="0.85" r="4.2" />
      <path d="M15 32h26l-2.2 9.4a2 2 0 0 1-1.95 1.6H19.15a2 2 0 0 1-1.95-1.6L15 32Z" fill="#0a2a63" opacity="0.4" />
      <path d="M14 31h28a1.5 1.5 0 0 1 0 3H14a1.5 1.5 0 0 1 0-3Z" fill="#ffffff" opacity="0.95" />
    </ArtworkFrame>
  );
};
