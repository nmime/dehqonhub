/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type ReactNode } from 'react';
import { ArtworkFrame, artworkPalette, bodyGradient, sheenGradient, type UiArtworkProps } from './artwork-base';

/**
 * Trade-state badges.
 *
 * These are the states the platform actually underwrites — a delivery verified
 * by a field agent, a contract on file, a settled obligation. They are hue-coded
 * but never hue-only: each carries a distinct glyph, so the state survives
 * greyscale and the common red-green deficiencies.
 */

const Badge = ({
  children,
  from,
  to,
  ...props
}: Readonly<UiArtworkProps & { children: ReactNode; from: string; to: string }>) => {
  const id = useId();
  const body = `${id}-body`;
  const sheen = `${id}-sheen`;

  return (
    <ArtworkFrame {...props} defaultSize={44} viewBox="0 0 44 44">
      <defs>
        {bodyGradient(body, from, to)}
        {sheenGradient(sheen)}
      </defs>
      <circle cx="22" cy="22" fill={`url(#${body})`} r="21" />
      <circle cx="22" cy="22" fill={`url(#${sheen})`} r="21" />
      {children}
    </ArtworkFrame>
  );
};

/** Field-agent verified. */
export const UiVerifiedBadge = (props: Readonly<UiArtworkProps>) => (
  <Badge {...props} from={artworkPalette.green[0]} to={artworkPalette.green[1]}>
    <path d="m14.5 22.5 5 5 10-11" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.6" />
  </Badge>
);

/** A signed contract backs this deal. */
export const UiContractBadge = (props: Readonly<UiArtworkProps>) => (
  <Badge {...props} from={artworkPalette.blue[0]} to={artworkPalette.blue[1]}>
    <path
      d="M15 11h11l5 5v17a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 14 33V12.5A1.5 1.5 0 0 1 15.5 11Z"
      fill="#ffffff"
    />
    <path d="M26 11l5 5h-5v-5Z" fill="#ffffff" opacity="0.6" />
    <path d="M18 21h8M18 25h8M18 29h5" stroke="#1e5bd8" strokeLinecap="round" strokeWidth="1.8" />
  </Badge>
);

/** Free test batch available. */
export const UiSampleBadge = (props: Readonly<UiArtworkProps>) => (
  <Badge {...props} from={artworkPalette.violet[0]} to={artworkPalette.violet[1]}>
    <path d="M19 11h6v8.6l5.9 10.2A2.4 2.4 0 0 1 28.8 33.5H15.2a2.4 2.4 0 0 1-2.08-3.7L19 19.6V11Z" fill="#ffffff" />
    <path
      d="M16.4 26.5h11.2l2.3 4a1.4 1.4 0 0 1-1.2 2.1H15.3a1.4 1.4 0 0 1-1.2-2.1l2.3-4Z"
      fill="#5b45c9"
      opacity="0.55"
    />
    <path d="M17.5 10h9" stroke="#ffffff" strokeLinecap="round" strokeWidth="2.6" />
  </Badge>
);

/** Repayment history in good standing — the platform's core asset. */
export const UiCreditGoodBadge = (props: Readonly<UiArtworkProps>) => (
  <Badge {...props} from={artworkPalette.gold[0]} to={artworkPalette.gold[1]}>
    <circle cx="22" cy="22" fill="#ffffff" r="11" />
    <path
      d="M22 15v14M18.6 18.2h4.9a2.6 2.6 0 0 1 0 5.2h-3.6a2.6 2.6 0 0 0 0 5.2h5"
      stroke="#e08a15"
      strokeLinecap="round"
      strokeWidth="2.2"
    />
  </Badge>
);

/** Physically delivered and signed for. */
export const UiDeliveredBadge = (props: Readonly<UiArtworkProps>) => (
  <Badge {...props} from={artworkPalette.blue[0]} to={artworkPalette.blue[1]}>
    <path d="M11 16.5h11v10H11z" fill="#ffffff" />
    <path d="M22 19.5h5.4l4.1 4.2v2.8H22v-7Z" fill="#ffffff" opacity="0.8" />
    <circle cx="16" cy="29" fill="#0a2a63" r="3.2" />
    <circle cx="28" cy="29" fill="#0a2a63" r="3.2" />
    <path d="M13.6 21h5.8" stroke="#1e5bd8" strokeLinecap="round" strokeWidth="1.8" />
  </Badge>
);

/** Awaiting review — the only badge that is not yet a fact. */
export const UiPendingBadge = (props: Readonly<UiArtworkProps>) => (
  <Badge {...props} from={artworkPalette.slate[0]} to={artworkPalette.slate[1]}>
    <circle cx="22" cy="22" r="10.5" stroke="#ffffff" strokeWidth="2.6" />
    <path d="M22 15.5V22l4.5 3" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" />
  </Badge>
);
