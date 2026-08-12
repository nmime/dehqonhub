import type { MarketplaceTranslate } from './marketplace-ui';

/**
 * The DehqonHub emblem, drawn inline so it inherits the surrounding type scale
 * and stays crisp at every size. It carries no plate or backing shape: the
 * artwork is transparent by construction, so it sits directly on cream, white,
 * and full-green surfaces without a white box around it.
 */
export function MarketplaceBrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 48 48">
      <path d="M23.4 21.2C15.6 22 9.7 17.3 8.6 9.6c7.5-1.1 13.7 3.9 14.8 11.6Z" fill="var(--green-deep)" />
      <path d="M24.6 21.2C32.4 22 38.3 17.3 39.4 9.6c-7.5-1.1-13.7 3.9-14.8 11.6Z" fill="var(--green-accent)" />
      <path d="M24 3.6c6 5.1 6 13.6 0 19.4-6-5.8-6-14.3 0-19.4Z" fill="var(--green-primary)" />
      <g fill="none" stroke="var(--brand-gold)" strokeLinecap="round" strokeWidth="3">
        <path d="M24 41.4V22.6" />
        <path d="M13.8 39.6c4 3.4 16.4 3.4 20.4 0" />
      </g>
    </svg>
  );
}

/**
 * Emblem plus wordmark. The wordmark's trailing syllable takes the brand green
 * so the lockup still reads as one mark when the emblem is clipped on narrow
 * viewports.
 */
export function MarketplaceBrandLockup({ t }: Readonly<{ t: MarketplaceTranslate }>) {
  const brand = t('agritech.marketplace.brand');
  const accentStart = Math.max(0, brand.length - 3);

  return (
    <>
      <MarketplaceBrandMark className="dh-brand__mark" />
      <span className="dh-brand__word">
        <span>{brand.slice(0, accentStart)}</span>
        <strong>{brand.slice(accentStart)}</strong>
      </span>
    </>
  );
}
