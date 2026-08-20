import { useState } from 'react';
import { demoAccounts } from '../model/demo-accounts';
import { MarketplaceIcon } from './marketplace-icon';
import type { MarketplaceNavigate, MarketplaceTranslate } from './marketplace-ui';

/**
 * Reviewer entry for the MVP review build. The identities are public demo-seed
 * accounts, so the banner has to say that in visible copy, not only in a
 * tooltip: the badge, the notice and the per-account role lines carry it.
 *
 * Gated by the `reviewerAccessEnabled` deployment flag, never by catalog
 * provenance — the catalog now serves real transactional listings.
 */
export function MarketplaceDemoBanner({
  navigate,
  t,
}: Readonly<{ navigate: MarketplaceNavigate; t: MarketplaceTranslate }>) {
  const [copied, setCopied] = useState<string>();

  const copy = (email: string, password: string) => {
    const clipboard = (navigator as Partial<Navigator>).clipboard;
    if (!clipboard) {
      return;
    }
    void clipboard
      .writeText(`${email} / ${password}`)
      .then(() => {
        setCopied(email);
      })
      .catch(() => {
        setCopied(undefined);
      });
  };

  return (
    <section aria-labelledby="dh-demo-title" className="dh-demo-banner">
      <div className="dh-demo-banner__intro">
        <span className="dh-seal dh-seal--small">
          <MarketplaceIcon name="spark" />
        </span>
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.demo.eyebrow')}</p>
          <h2 id="dh-demo-title">{t('agritech.marketplace.demo.title')}</h2>
          <p className="dh-demo-banner__tags">
            <span className="dh-badge dh-badge--warning">{t('agritech.marketplace.demo.reviewerLabel')}</span>
          </p>
          <p>{t('agritech.marketplace.demo.reviewerNotice')}</p>
        </div>
        <button
          className="dh-button dh-button--primary"
          onClick={() => {
            navigate('/auth');
          }}
          type="button"
        >
          {t('agritech.marketplace.demo.signIn')}
          <MarketplaceIcon name="arrow" />
        </button>
      </div>
      <ul className="dh-demo-banner__accounts">
        {demoAccounts.map((account) => (
          <li key={account.email}>
            <div>
              <strong>{account.email}</strong>
              <code>{account.password}</code>
              <small>{t(account.roleKey)}</small>
              <small className="dh-demo-banner__purpose">{t(account.purposeKey)}</small>
            </div>
            <button
              aria-label={`${t('agritech.marketplace.demo.copy')}: ${account.email}`}
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
      <p className="dh-demo-banner__prepared">
        <MarketplaceIcon name="contract" />
        <span>{t('agritech.marketplace.demo.prepared')}</span>
      </p>
    </section>
  );
}
