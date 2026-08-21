import type { MarketplaceTranslate } from './marketplace-ui';

/**
 * The DehqonHub emblem at header and footer scale: a transparent raster with no
 * plate, so it sits directly on the cream shell beside the text wordmark. The
 * small asset covers the 2.75rem header box at 1x; the master is offered for
 * denser screens instead of being downloaded for every 44 px mark.
 *
 * The width descriptors and the intrinsic size are the artwork's real
 * dimensions. They matter: the source was recropped tighter than square, and
 * descriptors that still claimed 96w and 512w told the browser the small file
 * was twice its actual width, so a 2x screen picked it and rendered the mark
 * soft.
 */
export function MarketplaceBrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      decoding="async"
      height={54}
      sizes="3rem"
      src="/dehqonhub-emblem-96.png"
      srcSet="/dehqonhub-emblem-96.png 52w, /dehqonhub-emblem.png 272w"
      width={52}
    />
  );
}

/**
 * The same emblem where the brand gets room — the account entry and the empty
 * states. It renders the master because the artwork is displayed large enough to
 * resolve the ornamented leaves and the harvest motif along the top edge.
 */
export function MarketplaceEmblem({ className }: Readonly<{ className?: string }>) {
  return <img alt="" aria-hidden="true" className={className} src="/dehqonhub-emblem.png" />;
}

export function MarketplaceBrandLockup({ t }: Readonly<{ t: MarketplaceTranslate }>) {
  const brand = t('agritech.marketplace.brand');
  const accentStart = Math.max(0, brand.length - 3);

  return (
    <>
      <MarketplaceBrandMark className="dh-brand__mark" />
      <span className="dh-brand__wordmark">
        <span>{brand.slice(0, accentStart)}</span>
        <strong>{brand.slice(accentStart)}</strong>
      </span>
    </>
  );
}

/** Flat silhouette from the design reference: decorative, never load-bearing. */
export function MarketplaceTractorSilhouette({ className }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 200 130">
      <g fill="var(--dh-green-strong)">
        <circle cx="52" cy="102" r="26" />
        <circle cx="150" cy="108" r="17" />
        <path d="M30 76h60V38h28l22 38h20v26h-14a17 17 0 0 0-34 0H78a26 26 0 0 0-48-12z" />
      </g>
      <g fill="var(--dh-lime)">
        <circle cx="52" cy="102" r="11" />
        <circle cx="150" cy="108" r="7" />
        <rect height="24" width="18" x="96" y="44" />
      </g>
    </svg>
  );
}
