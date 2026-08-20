// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016
import type { Locale } from '@app/frontend-runtime';
import type { ContractViewDto } from '@app/frontend-api-client';
import type { ActiveDeal, ActiveDealLane, ActiveDealsModel } from '../model/use-active-deals';
import { activeDealLanes } from '../model/use-active-deals';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceBusyButton, MarketplaceListSkeleton } from './marketplace-loading';
import { marketplacePartyProfileHref } from './marketplace-public-profile';
import { formatDate, formatMoney, type MarketplaceNavigate, type MarketplaceTranslate } from './marketplace-ui';

/**
 * Deals in flight, as a working surface.
 *
 * The cabinet lists deals as a ledger; this screen answers a different question:
 * what is waiting on me, what is waiting on the other party, and what is stuck.
 * Every card carries the stage the contract API reports and exactly one next
 * action — and when the only honest action is to open the contract, that is the
 * action it offers.
 */

export interface MarketplaceDealsProps {
  deals: ActiveDealsModel;
  locale: Locale;
  navigate: MarketplaceNavigate;
  /** Runs the one lifecycle action a card offers. */
  onAct: (deal: ActiveDeal) => void;
  onRetry: () => void;
  pendingAction?: string;
  t: MarketplaceTranslate;
}

const laneTitleKeys: Record<ActiveDealLane, string> = {
  counterparty: 'agritech.marketplace.deals.lane.counterparty',
  stalled: 'agritech.marketplace.deals.lane.stalled',
  you: 'agritech.marketplace.deals.lane.you',
};

const laneDescriptionKeys: Record<ActiveDealLane, string> = {
  counterparty: 'agritech.marketplace.deals.lane.counterparty.description',
  stalled: 'agritech.marketplace.deals.lane.stalled.description',
  you: 'agritech.marketplace.deals.lane.you.description',
};

const laneToneClass: Record<ActiveDealLane, string> = {
  counterparty: 'dh-deals-lane--counterparty',
  stalled: 'dh-deals-lane--stalled',
  you: 'dh-deals-lane--you',
};

const statusBadgeClass = (status: ContractViewDto['status']): string => {
  if (status === 'active') {
    return 'dh-badge dh-badge--soft';
  }
  if (status === 'legacy_review_required') {
    return 'dh-badge dh-badge--warning';
  }
  return 'dh-badge dh-badge--neutral';
};

function DealCard({
  deal,
  locale,
  navigate,
  onAct,
  pendingAction,
  t,
}: Readonly<{
  deal: ActiveDeal;
  locale: Locale;
  navigate: MarketplaceNavigate;
  onAct: (deal: ActiveDeal) => void;
  pendingAction?: string;
  t: MarketplaceTranslate;
}>) {
  const { contract } = deal;
  const contractPath = `/contracts/${encodeURIComponent(contract.id)}`;
  const busy = pendingAction === `sign:${contract.id}` || pendingAction === `lifecycle:${contract.id}`;
  const openContract = () => {
    navigate(contractPath);
  };
  return (
    <article className="dh-deal-card" data-deal-lane={deal.lane} data-deal-status={contract.status}>
      <div className="dh-deal-card__head">
        <div>
          <p className="dh-eyebrow">
            {t(
              contract.actorParty === 'buyer'
                ? 'agritech.marketplace.deals.party.buyer'
                : 'agritech.marketplace.deals.party.seller',
            )}
          </p>
          <h3>{contract.subject}</h3>
        </div>
        <span className={statusBadgeClass(contract.status)}>
          {t(`agritech.marketplace.contract.status.${contract.status}`)}
        </span>
      </div>
      <dl className="dh-deal-card__facts">
        <div>
          <dt>{t('agritech.marketplace.contract.amount')}</dt>
          <dd>{formatMoney(contract.amountUzs, locale)}</dd>
        </div>
        <div>
          <dt>
            {t(
              contract.actorParty === 'buyer'
                ? 'agritech.marketplace.contract.seller'
                : 'agritech.marketplace.contract.buyer',
            )}
          </dt>
          <dd>
            {deal.counterparty ? (
              <button
                className="dh-text-button"
                onClick={() => {
                  navigate(
                    marketplacePartyProfileHref(
                      contract.actorParty === 'buyer' ? contract.sellerProfileId : contract.buyerProfileId,
                    ),
                  );
                }}
                type="button"
              >
                {deal.counterparty}
              </button>
            ) : (
              t('agritech.marketplace.contract.partyUnnamed')
            )}
          </dd>
        </div>
        <div>
          <dt>{t('agritech.marketplace.deals.updated')}</dt>
          <dd>{formatDate(contract.updatedAt, locale)}</dd>
        </div>
      </dl>
      <p className="dh-deal-card__stage">{t(deal.stageKey)}</p>
      <div className="dh-deal-card__actions">
        {deal.action.kind === 'open' ? (
          <button className="dh-button dh-button--primary" onClick={openContract} type="button">
            {t(deal.action.labelKey)}
          </button>
        ) : (
          <>
            <MarketplaceBusyButton
              busy={busy}
              busyLabel={t('agritech.marketplace.loading')}
              className="dh-button dh-button--primary"
              icon="check"
              onClick={() => {
                onAct(deal);
              }}
              type="button"
            >
              {t(deal.action.labelKey)}
            </MarketplaceBusyButton>
            <button className="dh-text-button" onClick={openContract} type="button">
              {t('agritech.marketplace.deals.action.open')}
              <MarketplaceIcon name="arrow" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function DealLane({
  cards,
  lane,
  locale,
  navigate,
  onAct,
  pendingAction,
  t,
}: Readonly<{
  cards: ActiveDeal[];
  lane: ActiveDealLane;
  locale: Locale;
  navigate: MarketplaceNavigate;
  onAct: (deal: ActiveDeal) => void;
  pendingAction?: string;
  t: MarketplaceTranslate;
}>) {
  // A lane that holds nothing is only worth a heading when its emptiness is the
  // answer the reader came for: "nothing needs you right now".
  if (cards.length === 0 && lane !== 'you') {
    return null;
  }
  return (
    <section className={`dh-panel dh-deals-lane ${laneToneClass[lane]}`} data-deal-lane={lane}>
      <div className="dh-panel__head">
        <div>
          <h2>{t(laneTitleKeys[lane])}</h2>
          <p className="dh-fine-print">{t(laneDescriptionKeys[lane])}</p>
        </div>
        <span className="dh-badge dh-badge--neutral" data-deal-lane-count={lane}>
          {cards.length}
        </span>
      </div>
      {cards.length === 0 ? (
        <p className="dh-state-inline">
          <MarketplaceIcon name="check" />
          {t('agritech.marketplace.deals.lane.you.clear')}
        </p>
      ) : (
        <div className="dh-deal-cards">
          {cards.map((deal) => (
            <DealCard
              deal={deal}
              key={deal.contract.id}
              locale={locale}
              navigate={navigate}
              onAct={onAct}
              {...(pendingAction === undefined ? {} : { pendingAction })}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function MarketplaceDeals({
  deals,
  locale,
  navigate,
  onAct,
  onRetry,
  pendingAction,
  t,
}: Readonly<MarketplaceDealsProps>) {
  const heading = (
    <div className="dh-page-heading">
      <div>
        <p className="dh-eyebrow">{t('agritech.marketplace.deals.nav')}</p>
        <h1>{t('agritech.marketplace.deals.title')}</h1>
        <p>{t('agritech.marketplace.deals.description')}</p>
      </div>
      {deals.status === 'ready' ? (
        <span className="dh-badge dh-badge--accent" data-deals-waiting={deals.lanes.you.length}>
          {t('agritech.marketplace.deals.waitingCount', { count: deals.lanes.you.length })}
        </span>
      ) : null}
    </div>
  );

  if (deals.status === 'loading' || deals.status === 'idle') {
    return (
      <div className="dh-page-stack dh-deals-page">
        {heading}
        <section className="dh-panel" aria-busy="true">
          <MarketplaceListSkeleton count={3} lines={3} />
        </section>
      </div>
    );
  }

  if (deals.status === 'error') {
    return (
      <div className="dh-page-stack dh-deals-page">
        {heading}
        <section className="dh-panel">
          <p className="dh-state-inline dh-state-inline--error">
            <MarketplaceIcon name="alert" />
            {t('agritech.marketplace.error')}
          </p>
          <button className="dh-button dh-button--secondary" onClick={onRetry} type="button">
            {t('ui.runtime.retry')}
          </button>
        </section>
      </div>
    );
  }

  if (deals.status === 'empty') {
    return (
      <div className="dh-page-stack dh-deals-page">
        {heading}
        <div className="dh-empty">
          <span>
            <MarketplaceIcon name="contract" />
          </span>
          <h2>{t('agritech.marketplace.deals.empty.title')}</h2>
          <p>{t('agritech.marketplace.deals.empty.description')}</p>
          <button
            className="dh-button dh-button--secondary"
            onClick={() => {
              navigate('/catalog');
            }}
            type="button"
          >
            {t('agritech.marketplace.deals.empty.action')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dh-page-stack dh-deals-page">
      {heading}
      {activeDealLanes.map((lane) => (
        <DealLane
          cards={deals.lanes[lane]}
          key={lane}
          lane={lane}
          locale={locale}
          navigate={navigate}
          onAct={onAct}
          {...(pendingAction === undefined ? {} : { pendingAction })}
          t={t}
        />
      ))}
    </div>
  );
}
