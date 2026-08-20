import type { MarketplaceTranslate } from './marketplace-ui';

/**
 * The DehqonHub emblem at header and footer scale: a transparent raster with no
 * plate, so it sits directly on the cream shell beside the text wordmark. The
 * 96 px asset covers the 2.75rem header box through 2x density; the 512 px
 * master is offered for denser screens instead of being downloaded for every
 * 44 px mark.
 */
export function MarketplaceBrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      decoding="async"
      height={96}
      sizes="3rem"
      src="/dehqonhub-emblem-96.png"
      srcSet="/dehqonhub-emblem-96.png 96w, /dehqonhub-emblem.png 512w"
      width={96}
    />
  );
}

/**
 * The same emblem where the brand gets room — the account entry and the empty
 * states. It renders the 512 px master because the artwork is displayed large
 * enough to resolve the ornamented leaves and the harvest motif along the top
 * edge.
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
