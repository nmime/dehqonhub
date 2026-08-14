import type { MarketplaceTranslate } from './marketplace-ui';

/** Transparent vector emblem; it has no raster plate on cream or dark surfaces. */
export function MarketplaceBrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 48 48">
      <path d="M23.4 21.2C15.6 22 9.7 17.3 8.6 9.6c7.5-1.1 13.7 3.9 14.8 11.6Z" fill="var(--dh-green-strong)" />
      <path d="M24.6 21.2C32.4 22 38.3 17.3 39.4 9.6c-7.5-1.1-13.7 3.9-14.8 11.6Z" fill="var(--dh-lime)" />
      <path d="M24 3.6c6 5.1 6 13.6 0 19.4-6-5.8-6-14.3 0-19.4Z" fill="var(--dh-green)" />
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3">
        <path d="M24 41.4V22.6" />
        <path d="M13.8 39.6c4 3.4 16.4 3.4 20.4 0" />
      </g>
    </svg>
  );
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
