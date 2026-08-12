import { useState } from 'react';
import { demoAccounts } from '../model/demo-accounts';
import type { DemoReason } from '../model/use-marketplace-data';
import { MarketplaceIcon } from './marketplace-icon';
import type { MarketplaceNavigate, MarketplaceTranslate } from './marketplace-ui';

/** What the banner says, per reason for showing it. */
const messageKey = (reason: Exclude<DemoReason, 'none'>): string => {
  if (reason === 'unavailable') {
    return 'agritech.marketplace.demo.unavailable';
  }
  return reason === 'guest' ? 'agritech.marketplace.demo.guest' : 'agritech.marketplace.demo.description';
};

/**
 * Banner listing the review sign-in credentials.
 *
 * It renders whenever the page has something to disclose: nobody is signed in,
 * the API answered with its demo assortment because the tenant has published
 * nothing, or the catalog request failed. The last case also keeps the retry
 * within reach, because it is the only one a visitor can act on.
 *
 * The home page gets the full card with the credential list; every other surface
 * gets a one-line strip, because a reviewer reading a cart or a product does not
 * need the credentials repeated above the content they opened.
 */
export function MarketplaceDemoBanner({
  navigate,
  onRetry,
  reason,
  t,
  variant = 'full',
}: Readonly<{
  navigate: MarketplaceNavigate;
  onRetry: () => void;
  reason: Exclude<DemoReason, 'none'>;
  t: MarketplaceTranslate;
  variant?: 'compact' | 'full';
}>) {
  const [copied, setCopied] = useState<string | undefined>();
  const returnUrl =
    typeof globalThis.location === 'undefined' ? '/' : `${globalThis.location.pathname}${globalThis.location.search}`;

  const copy = (email: string, password: string) => {
    // Typed as always present, but absent over plain HTTP and in test DOMs, where
    // the credentials stay on screen to copy by hand.
    const { clipboard } = navigator as Partial<Navigator>;

    if (!clipboard) {
      return;
    }

    void clipboard
      .writeText(`${email} / ${password}`)
      .then(() => {
        setCopied(email);
      })
      /* v8 ignore next 3 -- clipboard denial leaves the credentials on screen to copy by hand. */
      .catch(() => {
        setCopied(undefined);
      });
  };

  if (variant === 'compact') {
    return (
      <section aria-label={t('agritech.marketplace.demo.eyebrow')} className="dh-demo dh-demo--compact">
        <p className={`dh-demo__strip${reason === 'unavailable' ? ' dh-demo__strip--warning' : ''}`}>
          <MarketplaceIcon name={reason === 'unavailable' ? 'alert' : 'spark'} />
          <span>{t(messageKey(reason))}</span>
        </p>
        <div className="dh-demo__actions">
          <button
            className="dh-button dh-button--secondary"
            onClick={() => {
              navigate('/');
            }}
            type="button"
          >
            {t('agritech.marketplace.demo.title')}
          </button>
          {reason === 'unavailable' && (
            <button className="dh-button dh-button--secondary" onClick={onRetry} type="button">
              {t('ui.runtime.retry')}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="dh-demo-title" className="dh-demo">
      <div className="dh-demo__intro">
        <p className="dh-eyebrow">{t('agritech.marketplace.demo.eyebrow')}</p>
        <h2 id="dh-demo-title">{t('agritech.marketplace.demo.title')}</h2>
        {reason === 'unavailable' ? (
          <p className="dh-demo__warning">
            <MarketplaceIcon name="alert" />
            {t('agritech.marketplace.demo.unavailable')}
          </p>
        ) : (
          <p>{t(messageKey(reason))}</p>
        )}
        <div className="dh-demo__actions">
          <button
            className="dh-button dh-button--primary"
            onClick={() => {
              navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
            }}
            type="button"
          >
            {t('agritech.marketplace.demo.signIn')}
            <MarketplaceIcon name="arrow" />
          </button>
          {reason === 'unavailable' && (
            <button className="dh-button dh-button--secondary" onClick={onRetry} type="button">
              {t('ui.runtime.retry')}
            </button>
          )}
        </div>
      </div>
      <ul className="dh-demo__accounts">
        {demoAccounts.map((account) => (
          <li key={account.email}>
            <div className="dh-demo__account">
              <strong>{account.email}</strong>
              <code>{account.password}</code>
              <small>{t(account.roleKey)}</small>
            </div>
            <button
              className="dh-button dh-button--secondary"
              onClick={() => {
                copy(account.email, account.password);
              }}
              type="button"
            >
              <MarketplaceIcon name={copied === account.email ? 'check' : 'copy'} />
              {copied === account.email ? t('agritech.marketplace.demo.copied') : t('agritech.marketplace.demo.copy')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
