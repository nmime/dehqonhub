import type { ReactNode } from 'react';
import type {
  BuyerRequestViewDto,
  ContractViewDto,
  MarketplaceOwnedListingPublicationDto,
  MarketplaceOwnedRequestPublicationDto,
  MarketplaceOwnReviewDto,
  MarketplaceOwnReviewsDto,
  MarketplaceRoleDashboardDto,
  MarketplaceSampleDto,
  OfferViewDto,
  VerificationViewDto,
} from '@app/frontend-api-client';
import type { Locale } from '@app/frontend-runtime';
import { useMarketplaceCabinetReviews } from '../model/use-cabinet-reviews';
import type { Resource } from '../model/use-marketplace-data';
import { MarketplaceSkeleton } from './marketplace-discovery';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceBusyButton } from './marketplace-loading';
import { MarketplaceCabinetChart, type MarketplaceCabinetChartSeries } from './marketplace-cabinet-chart';
import { MarketplaceCabinetReviewInvitations, MarketplaceCabinetReviewList } from './marketplace-cabinet-reviews';
import {
  formatDate,
  formatMoney,
  formatPercent,
  type MarketplaceNavigate,
  type MarketplaceRequestFeedItem,
  type MarketplaceTranslate,
} from './marketplace-ui';

/**
 * The personal cabinet behind `/account`.
 *
 * The previous screen was a single stack of three panels, which put a buyer's
 * purchase requests, a seller's fulfilment work, the publication queue and the
 * verification state on top of one another with no way to address any of them.
 * This is the same data as a left navigation rail beside one large content
 * panel, with every section on its own deep link so a reviewer can land inside
 * `/account/finance` directly.
 *
 * Every section renders only what the generated client actually returns:
 * `/marketplace/dashboard` for the role scope, its buyer/seller metrics, the
 * six-month `monthlyActivity` window and `recentDeals`; `/marketplace/contracts`
 * for the deals, split on the `actorParty` the API stamps per contract rather
 * than on a client-side guess; `/marketplace/requests/mine` for owned purchase
 * requests with their publication and moderation state; and
 * `/marketplace/publications/mine` for the publication queue. Nothing is
 * derived, padded or defaulted — a resource that failed says so and offers a
 * retry instead of showing a zero.
 *
 * The reviews section reads `/marketplace/reviews/mine` itself rather than
 * taking a prop, because it is the one section whose data only one screen wants
 * and which has to be re-read after a published reply rather than at the next
 * shell refresh. It accepts an injected resource so a test can render either
 * direction without a request.
 *
 * All seven sections stay listed for every role. A seller who has never bought
 * still owns the buying capability, and hiding a section until the dashboard
 * resolves would make its deep link work only after a round trip.
 */

export const marketplaceCabinetSections = [
  'overview',
  'buying',
  'selling',
  'reviews',
  'finance',
  'publications',
  'account',
] as const;

export type MarketplaceCabinetSection = (typeof marketplaceCabinetSections)[number];

const cabinetSectionIcons: Record<
  MarketplaceCabinetSection,
  'account' | 'cart' | 'contract' | 'orders' | 'produce' | 'shield' | 'star'
> = {
  account: 'shield',
  buying: 'cart',
  finance: 'contract',
  overview: 'account',
  publications: 'produce',
  reviews: 'star',
  selling: 'orders',
};

/** `/account` is the overview; every other section is one path segment below it. */
export const marketplaceCabinetPath = (section: MarketplaceCabinetSection): string =>
  section === 'overview' ? '/account' : `/account/${section}`;

/**
 * The section the current location addresses. An unknown segment resolves to the
 * overview rather than to an empty frame, so a stale or mistyped deep link still
 * lands the reviewer somewhere real.
 */
export const marketplaceCabinetSectionFromLocation = (pathname?: string): MarketplaceCabinetSection => {
  const raw = pathname ?? (typeof globalThis.location === 'undefined' ? '/account' : globalThis.location.pathname);
  const path = raw.endsWith('/') && raw.length > 1 ? raw.slice(0, -1) : raw;
  const segment = path.startsWith('/account/') ? decodeURIComponent(path.slice('/account/'.length)) : '';
  return marketplaceCabinetSections.find((section) => section === segment) ?? 'overview';
};

export interface MarketplaceCabinetProps {
  readonly contracts: Resource<ContractViewDto[]>;
  readonly dashboard: Resource<MarketplaceRoleDashboardDto | null>;
  readonly listingPublications: Resource<MarketplaceOwnedListingPublicationDto[]>;
  readonly locale: Locale;
  readonly management?: ReactNode;
  readonly myRequests: Resource<BuyerRequestViewDto[]>;
  readonly navigate: MarketplaceNavigate;
  readonly offersByRequest: Resource<Record<string, OfferViewDto[]>>;
  readonly onRetry: () => void;
  /** Wired by the route, which lives inside the app providers the session needs. */
  readonly onSignOut?: () => void;
  readonly publicRequests: Resource<MarketplaceRequestFeedItem[]>;
  readonly requestPublications: Resource<MarketplaceOwnedRequestPublicationDto[]>;
  /**
   * The caller's own review record. Left out in the app, where the section reads
   * it; supplied by tests so both directions render without a request.
   */
  readonly reviews?: Resource<MarketplaceOwnReviewsDto | null>;
  /** Replaces the section's own reply command when `reviews` is injected. */
  readonly onReplyToReview?: (entry: MarketplaceOwnReviewDto, comment: string) => Promise<boolean>;
  readonly reviewsPendingAction?: string;
  readonly samples: Resource<MarketplaceSampleDto[]>;
  readonly section: MarketplaceCabinetSection;
  readonly signOutPending?: boolean;
  readonly t: MarketplaceTranslate;
  readonly verification: Resource<VerificationViewDto | null>;
}

interface CabinetResourceProps<T> {
  readonly children: (data: T) => ReactNode;
  readonly emptyMessage: string;
  readonly errorMessage: string;
  readonly isEmpty?: (data: T) => boolean;
  readonly onRetry: () => void;
  readonly resource: Resource<T>;
  readonly t: MarketplaceTranslate;
}

/**
 * The four states every panel body has to be able to say out loud. Collapsing
 * them into "render whatever is in `data`" is how a failed read turns into a
 * confident zero on screen.
 */
function CabinetResource<T>({
  children,
  emptyMessage,
  errorMessage,
  isEmpty,
  onRetry,
  resource,
  t,
}: Readonly<CabinetResourceProps<T>>) {
  if (resource.status === 'idle' || resource.status === 'loading') {
    return <MarketplaceSkeleton count={2} />;
  }
  if (resource.status === 'error') {
    return (
      <div className="dh-cabinet-state">
        <p className="dh-state-inline dh-state-inline--error">{errorMessage}</p>
        <button className="dh-text-button" onClick={onRetry} type="button">
          {t('ui.runtime.retry')}
        </button>
      </div>
    );
  }
  if (resource.status === 'empty' || isEmpty?.(resource.data)) {
    return <p className="dh-muted">{emptyMessage}</p>;
  }
  // Wrapped, so every branch of this component returns one element type.
  return <>{children(resource.data)}</>;
}

interface CabinetStat {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function CabinetStats({ label, stats }: Readonly<{ label: string; stats: readonly CabinetStat[] }>) {
  return (
    <section aria-label={label} className="dh-cabinet-stats">
      {stats.map((stat) => (
        <div key={stat.key}>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      ))}
    </section>
  );
}

/**
 * The verification label for a status. A user who is signed in but has never
 * started verification carries the status `none`, which has no catalog entry of
 * its own — the not-started copy is exactly what it means, and mapping it here
 * keeps a raw key off the screen.
 */
const verificationStatusKey = (verification: VerificationViewDto | null): string => {
  if (!verification || verification.status === 'none') {
    return 'agritech.marketplace.verify.notStarted';
  }
  return `agritech.marketplace.verify.${verification.status}`;
};

const contractStatusTone = (status: ContractViewDto['status']): string => {
  if (status === 'completed') {
    return 'dh-badge--strong';
  }
  if (status === 'cancelled' || status === 'legacy_review_required') {
    return 'dh-badge--danger';
  }
  if (status === 'active' || status === 'signed') {
    return 'dh-badge--accent';
  }
  return 'dh-badge--neutral';
};

const requestStatusKeys: Record<BuyerRequestViewDto['status'], string> = {
  closed: 'agritech.marketplace.orders.closed',
  expired: 'agritech.marketplace.orders.expired',
  offering: 'agritech.marketplace.orders.stage.collecting',
  open: 'agritech.marketplace.orders.open',
  selected: 'agritech.marketplace.orders.selected',
};

interface ContractListProps {
  readonly contracts: readonly ContractViewDto[];
  readonly counterparty: (contract: ContractViewDto) => string;
  readonly locale: Locale;
  readonly navigate: MarketplaceNavigate;
  readonly t: MarketplaceTranslate;
}

function CabinetContractList({ contracts, counterparty, locale, navigate, t }: Readonly<ContractListProps>) {
  return (
    <ul className="dh-cabinet-rows">
      {contracts.map((contract) => (
        <li key={contract.id}>
          <button
            onClick={() => {
              navigate(`/contracts/${contract.id}`);
            }}
            type="button"
          >
            <span className="dh-cabinet-rows__main">
              <strong>{contract.subject}</strong>
              <small>
                {counterparty(contract)} · {formatDate(contract.updatedAt, locale)}
              </small>
            </span>
            <span className="dh-cabinet-rows__side">
              <b>{formatMoney(contract.amountUzs, locale)}</b>
              <span className={`dh-badge ${contractStatusTone(contract.status)}`}>
                {t(`agritech.marketplace.contract.status.${contract.status}`)}
              </span>
            </span>
            <MarketplaceIcon name="arrow" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CabinetPanel({
  children,
  description,
  eyebrow,
  title,
}: Readonly<{ children: ReactNode; description?: string; eyebrow: string; title: string }>) {
  return (
    <section className="dh-panel dh-cabinet-panel">
      <div className="dh-cabinet-panel__head">
        <div>
          <p className="dh-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function CabinetGroup({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <div className="dh-cabinet-group">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/**
 * Which money series the chart may draw, taken from the dashboard's own role
 * scope. A buyer-scoped dashboard reports no sales, so drawing a revenue axis
 * for it would present the absence of a capability as a run of zero months.
 */
const chartSeriesFor = (dashboard: MarketplaceRoleDashboardDto): readonly MarketplaceCabinetChartSeries[] => {
  const series: MarketplaceCabinetChartSeries[] = [];
  if (dashboard.buyer) {
    series.push('spend');
  }
  if (dashboard.seller) {
    series.push('revenue');
  }
  return series;
};

const buyerStats = (dashboard: MarketplaceRoleDashboardDto, locale: Locale, t: MarketplaceTranslate): CabinetStat[] =>
  dashboard.buyer
    ? [
        {
          key: 'openRequests',
          label: t('agritech.marketplace.cabinet.stat.openRequests'),
          value: String(dashboard.buyer.openPurchaseRequests),
        },
        {
          key: 'openCarts',
          label: t('agritech.marketplace.cabinet.stat.openCarts'),
          value: String(dashboard.buyer.openCarts),
        },
        {
          key: 'buyerActive',
          label: t('agritech.marketplace.cabinet.stat.activeDeals'),
          value: String(dashboard.buyer.activeDeals),
        },
        {
          key: 'buyerCompleted',
          label: t('agritech.marketplace.cabinet.stat.completedDeals'),
          value: String(dashboard.buyer.completedDeals),
        },
        {
          key: 'spend',
          label: t('agritech.marketplace.cabinet.stat.spend'),
          value: formatMoney(dashboard.buyer.completedSpendUzs, locale),
        },
      ]
    : [];

const sellerStats = (dashboard: MarketplaceRoleDashboardDto, locale: Locale, t: MarketplaceTranslate): CabinetStat[] =>
  dashboard.seller
    ? [
        {
          key: 'activeListings',
          label: t('agritech.marketplace.cabinet.stat.activeListings'),
          value: String(dashboard.seller.activeListings),
        },
        {
          key: 'pendingOffers',
          label: t('agritech.marketplace.cabinet.stat.pendingOffers'),
          value: String(dashboard.seller.pendingOffers),
        },
        {
          key: 'conversion',
          label: t('agritech.marketplace.cabinet.stat.conversion'),
          value: formatPercent(dashboard.seller.offerConversionBps / 10_000, locale),
        },
        {
          key: 'sellerActive',
          label: t('agritech.marketplace.cabinet.stat.activeDeals'),
          value: String(dashboard.seller.activeDeals),
        },
        {
          key: 'sellerCompleted',
          label: t('agritech.marketplace.cabinet.stat.completedDeals'),
          value: String(dashboard.seller.completedDeals),
        },
        {
          key: 'revenue',
          label: t('agritech.marketplace.cabinet.stat.revenue'),
          value: formatMoney(dashboard.seller.completedRevenueUzs, locale),
        },
      ]
    : [];

function OverviewSection({
  dashboard,
  locale,
  navigate,
  onRetry,
  t,
}: Readonly<Pick<MarketplaceCabinetProps, 'dashboard' | 'locale' | 'navigate' | 'onRetry' | 't'>>) {
  return (
    <CabinetPanel
      description={t('agritech.marketplace.cabinet.overview.description')}
      eyebrow={t('agritech.marketplace.account.dashboard')}
      title={t('agritech.marketplace.cabinet.section.overview')}
    >
      <CabinetResource
        emptyMessage={t('agritech.marketplace.account.dashboardEmpty')}
        errorMessage={t('agritech.marketplace.account.dashboardUnavailable')}
        isEmpty={(data) => data === null}
        onRetry={onRetry}
        resource={dashboard}
        t={t}
      >
        {(data) =>
          data === null ? null : (
            <>
              <CabinetStats
                label={t('agritech.marketplace.account.dashboard')}
                stats={[...buyerStats(data, locale, t), ...sellerStats(data, locale, t)]}
              />
              <MarketplaceCabinetChart
                activity={data.monthlyActivity}
                locale={locale}
                series={chartSeriesFor(data)}
                t={t}
                variant="compact"
              />
              <CabinetGroup title={t('agritech.marketplace.cabinet.deals.title')}>
                {data.recentDeals.length === 0 ? (
                  <p className="dh-muted">{t('agritech.marketplace.cabinet.deals.empty')}</p>
                ) : (
                  <ul className="dh-cabinet-rows">
                    {data.recentDeals.map((deal) => (
                      <li key={deal.contractId}>
                        <button
                          onClick={() => {
                            navigate(`/contracts/${deal.contractId}`);
                          }}
                          type="button"
                        >
                          <span className="dh-cabinet-rows__main">
                            <strong>{deal.counterpartyName ?? t('agritech.marketplace.cabinet.deals.title')}</strong>
                            <small>
                              {t(`agritech.marketplace.cabinet.side.${deal.side}`)} ·{' '}
                              {formatDate(deal.updatedAt, locale)}
                            </small>
                          </span>
                          <span className="dh-cabinet-rows__side">
                            <b>{formatMoney(deal.amountUzs, locale)}</b>
                            <span className={`dh-badge ${contractStatusTone(deal.status)}`}>
                              {t(`agritech.marketplace.contract.status.${deal.status}`)}
                            </span>
                          </span>
                          <MarketplaceIcon name="arrow" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CabinetGroup>
            </>
          )
        }
      </CabinetResource>
    </CabinetPanel>
  );
}

function BuyingSection({
  contracts,
  locale,
  myRequests,
  navigate,
  offersByRequest,
  onRetry,
  t,
}: Readonly<
  Pick<
    MarketplaceCabinetProps,
    'contracts' | 'locale' | 'myRequests' | 'navigate' | 'offersByRequest' | 'onRetry' | 't'
  >
>) {
  const buyerContracts = contracts.data.filter((contract) => contract.actorParty === 'buyer');
  return (
    <CabinetPanel
      description={t('agritech.marketplace.cabinet.buying.description')}
      eyebrow={t('agritech.marketplace.orders')}
      title={t('agritech.marketplace.cabinet.section.buying')}
    >
      <CabinetGroup title={t('agritech.marketplace.cabinet.buying.requests')}>
        <CabinetResource
          emptyMessage={t('agritech.marketplace.orders.empty')}
          errorMessage={t('agritech.marketplace.orders.unavailable')}
          isEmpty={(data) => data.length === 0}
          onRetry={onRetry}
          resource={myRequests}
          t={t}
        >
          {(requests) => (
            <ul className="dh-cabinet-rows">
              {requests.map((request) => {
                const offers = offersByRequest.data[request.id];
                return (
                  <li key={request.id}>
                    <button
                      onClick={() => {
                        navigate(`/requests/${request.id}`);
                      }}
                      type="button"
                    >
                      <span className="dh-cabinet-rows__main">
                        <strong>{request.title}</strong>
                        <small>
                          {request.region}
                          {request.deadline ? ` · ${formatDate(request.deadline, locale)}` : ''}
                          {offers === undefined
                            ? ''
                            : ` · ${t('agritech.marketplace.cabinet.buying.offers', { count: offers.length })}`}
                        </small>
                      </span>
                      <span className="dh-cabinet-rows__side">
                        {request.budgetUzs === undefined ? null : <b>{formatMoney(request.budgetUzs, locale)}</b>}
                        <span className="dh-badge dh-badge--neutral">{t(requestStatusKeys[request.status])}</span>
                        {request.moderationStatus === undefined ? null : (
                          <span className="dh-badge dh-badge--outline">
                            {t(`agritech.marketplace.publication.moderation.${request.moderationStatus}`)}
                          </span>
                        )}
                      </span>
                      <MarketplaceIcon name="arrow" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CabinetResource>
      </CabinetGroup>
      <CabinetGroup title={t('agritech.marketplace.cabinet.buying.contracts')}>
        <CabinetResource
          emptyMessage={t('agritech.marketplace.cabinet.buying.noContracts')}
          errorMessage={t('agritech.marketplace.account.contractsUnavailable')}
          isEmpty={() => buyerContracts.length === 0}
          onRetry={onRetry}
          resource={contracts}
          t={t}
        >
          {() => (
            <CabinetContractList
              contracts={buyerContracts}
              counterparty={(contract) => contract.sellerPartySnapshot.legalName}
              locale={locale}
              navigate={navigate}
              t={t}
            />
          )}
        </CabinetResource>
      </CabinetGroup>
    </CabinetPanel>
  );
}

function SellingSection({
  contracts,
  dashboard,
  locale,
  navigate,
  onRetry,
  publicRequests,
  t,
}: Readonly<
  Pick<MarketplaceCabinetProps, 'contracts' | 'dashboard' | 'locale' | 'navigate' | 'onRetry' | 'publicRequests' | 't'>
>) {
  const sellerContracts = contracts.data.filter((contract) => contract.actorParty === 'seller');
  const seller = dashboard.data?.seller;
  return (
    <CabinetPanel
      description={t('agritech.marketplace.cabinet.selling.description')}
      eyebrow={t('agritech.marketplace.management.seller')}
      title={t('agritech.marketplace.cabinet.section.selling')}
    >
      <CabinetResource
        emptyMessage={t('agritech.marketplace.account.dashboardEmpty')}
        errorMessage={t('agritech.marketplace.account.dashboardUnavailable')}
        isEmpty={(data) => data === null || data.seller === undefined}
        onRetry={onRetry}
        resource={dashboard}
        t={t}
      >
        {(data) =>
          data === null ? null : (
            <CabinetStats
              label={t('agritech.marketplace.cabinet.section.selling')}
              stats={sellerStats(data, locale, t)}
            />
          )
        }
      </CabinetResource>
      <CabinetGroup title={t('agritech.marketplace.cabinet.selling.contracts')}>
        <CabinetResource
          emptyMessage={t('agritech.marketplace.cabinet.selling.noContracts')}
          errorMessage={t('agritech.marketplace.account.contractsUnavailable')}
          isEmpty={() => sellerContracts.length === 0}
          onRetry={onRetry}
          resource={contracts}
          t={t}
        >
          {() => (
            <CabinetContractList
              contracts={sellerContracts}
              counterparty={(contract) => contract.buyerPartySnapshot.legalName}
              locale={locale}
              navigate={navigate}
              t={t}
            />
          )}
        </CabinetResource>
      </CabinetGroup>
      {seller === undefined || seller.topListings.length === 0 ? null : (
        <CabinetGroup title={t('agritech.marketplace.cabinet.selling.topListings')}>
          <ul className="dh-cabinet-rows">
            {seller.topListings.map((listing) => (
              <li key={listing.listingPublicationId}>
                <button
                  onClick={() => {
                    navigate(`/products/${listing.listingPublicationId}`);
                  }}
                  type="button"
                >
                  <span className="dh-cabinet-rows__main">
                    <strong>{listing.title}</strong>
                    <small>
                      {t('agritech.marketplace.cabinet.selling.completedQuantity', {
                        count: listing.completedQuantity,
                      })}
                    </small>
                  </span>
                  <span className="dh-cabinet-rows__side">
                    <b>{formatMoney(listing.revenueUzs, locale)}</b>
                  </span>
                  <MarketplaceIcon name="arrow" />
                </button>
              </li>
            ))}
          </ul>
        </CabinetGroup>
      )}
      <CabinetGroup title={t('agritech.marketplace.cabinet.selling.incoming')}>
        <CabinetResource
          emptyMessage={t('agritech.marketplace.orders.feedEmpty')}
          errorMessage={t('agritech.marketplace.orders.unavailable')}
          isEmpty={(data) => data.length === 0}
          onRetry={onRetry}
          resource={publicRequests}
          t={t}
        >
          {(requests) => (
            <>
              <ul className="dh-cabinet-rows">
                {requests.slice(0, 5).map((request) => (
                  <li key={request.id}>
                    <button
                      onClick={() => {
                        navigate('/requests/incoming');
                      }}
                      type="button"
                    >
                      <span className="dh-cabinet-rows__main">
                        <strong>{request.title}</strong>
                        <small>
                          {request.buyerDisplayName} · {request.region}
                        </small>
                      </span>
                      <span className="dh-cabinet-rows__side">
                        {request.budgetUzs === undefined ? null : <b>{formatMoney(request.budgetUzs, locale)}</b>}
                      </span>
                      <MarketplaceIcon name="arrow" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="dh-button dh-button--secondary"
                onClick={() => {
                  navigate('/requests/incoming');
                }}
                type="button"
              >
                {t('agritech.marketplace.orders.feed')}
              </button>
            </>
          )}
        </CabinetResource>
      </CabinetGroup>
    </CabinetPanel>
  );
}

function FinanceSection({
  dashboard,
  locale,
  onRetry,
  t,
}: Readonly<Pick<MarketplaceCabinetProps, 'dashboard' | 'locale' | 'onRetry' | 't'>>) {
  return (
    <CabinetPanel
      description={t('agritech.marketplace.cabinet.finance.description')}
      eyebrow={t('agritech.marketplace.cabinet.chart.window')}
      title={t('agritech.marketplace.cabinet.section.finance')}
    >
      <CabinetResource
        emptyMessage={t('agritech.marketplace.account.dashboardEmpty')}
        errorMessage={t('agritech.marketplace.account.dashboardUnavailable')}
        isEmpty={(data) => data === null}
        onRetry={onRetry}
        resource={dashboard}
        t={t}
      >
        {(data) =>
          data === null ? null : (
            <MarketplaceCabinetChart
              activity={data.monthlyActivity}
              locale={locale}
              series={chartSeriesFor(data)}
              t={t}
              variant="full"
            />
          )
        }
      </CabinetResource>
    </CabinetPanel>
  );
}

interface ReviewsPanelProps {
  readonly locale: Locale;
  readonly navigate: MarketplaceNavigate;
  readonly onReply: (entry: MarketplaceOwnReviewDto, comment: string) => Promise<boolean>;
  readonly onRetry: () => void;
  readonly replyPending?: string;
  readonly resource: Resource<MarketplaceOwnReviewsDto | null>;
  readonly t: MarketplaceTranslate;
}

/**
 * The account's own review record, in both directions.
 *
 * `written` and `received` are two groups, never one merged feed: what this
 * account said about its sellers and what its buyers said about it mean opposite
 * things for reputation, and a single list ordered by date would put them beside
 * one another with nothing but a per-row label between them.
 *
 * Each group states its own absence, because "you have not reviewed anything
 * yet" and "nobody has reviewed you yet" are different facts about the same
 * account and only one of them is ever actionable. A failed read still replaces
 * both groups with a failure and a retry, so an unavailable record can never
 * read as an account with no reviews.
 */
function ReviewsPanel({ locale, navigate, onReply, onRetry, replyPending, resource, t }: Readonly<ReviewsPanelProps>) {
  // Hoisted out of the JSX: the busy key is only passed when there is one, and an
  // `exactOptionalPropertyTypes` build cannot express that as `replyPending={x}`.
  const busy = replyPending === undefined ? {} : { replyPending };
  return (
    <CabinetPanel
      description={t('agritech.marketplace.cabinet.reviews.description')}
      eyebrow={t('agritech.marketplace.product.reviewsTab')}
      title={t('agritech.marketplace.cabinet.section.reviews')}
    >
      {/* No panel-level empty state: an account with nothing on either side still
          has to be told which side is empty, and one "no reviews at all" line
          would answer neither question. Only a failed read replaces the groups. */}
      <CabinetResource
        emptyMessage={t('agritech.marketplace.reviews.mine.unavailable')}
        errorMessage={t('agritech.marketplace.reviews.mine.unavailable')}
        onRetry={onRetry}
        resource={resource}
        t={t}
      >
        {(record) =>
          record === null ? null : (
            <>
              <MarketplaceCabinetReviewInvitations
                invitations={record.awaitingReview}
                locale={locale}
                navigate={navigate}
                t={t}
              />
              <CabinetGroup title={t('agritech.marketplace.reviews.mine.written')}>
                <MarketplaceCabinetReviewList
                  direction="written"
                  entries={record.written}
                  locale={locale}
                  navigate={navigate}
                  t={t}
                />
              </CabinetGroup>
              <CabinetGroup title={t('agritech.marketplace.reviews.mine.received')}>
                <MarketplaceCabinetReviewList
                  direction="received"
                  entries={record.received}
                  locale={locale}
                  navigate={navigate}
                  onReply={onReply}
                  {...busy}
                  t={t}
                />
              </CabinetGroup>
            </>
          )
        }
      </CabinetResource>
    </CabinetPanel>
  );
}

/**
 * The same panel over its own read of `/marketplace/reviews/mine`, plus the
 * reply command.
 *
 * The read and the reply live in this wrapper rather than in `ReviewsPanel` so
 * the panel stays a function of its props: a caller that already holds the
 * record renders `ReviewsPanel` and issues no request and needs no API client in
 * context, which is what makes both directions and both empty states testable
 * without a network stub.
 */
function ConnectedReviewsSection({
  locale,
  navigate,
  t,
}: Readonly<Pick<MarketplaceCabinetProps, 'locale' | 'navigate' | 't'>>) {
  const own = useMarketplaceCabinetReviews(true);
  return (
    <ReviewsPanel
      locale={locale}
      navigate={navigate}
      onReply={(entry, comment) => own.replyToReview(entry.review, comment)}
      onRetry={own.reload}
      {...(own.replyPending === undefined ? {} : { replyPending: own.replyPending })}
      resource={own.resource}
      t={t}
    />
  );
}

/**
 * Which of the two the cabinet renders. The choice is made by the caller's props
 * and never changes for a given caller, so the connected form owns the hook and
 * the plain form has none at all.
 */
function ReviewsSection({
  locale,
  navigate,
  onReplyToReview,
  onRetry,
  reviews,
  reviewsPendingAction,
  t,
}: Readonly<
  Pick<
    MarketplaceCabinetProps,
    'locale' | 'navigate' | 'onReplyToReview' | 'onRetry' | 'reviews' | 'reviewsPendingAction' | 't'
  >
>) {
  if (reviews === undefined) {
    return <ConnectedReviewsSection locale={locale} navigate={navigate} t={t} />;
  }
  return (
    <ReviewsPanel
      locale={locale}
      navigate={navigate}
      onReply={onReplyToReview ?? (() => Promise.resolve(false))}
      onRetry={onRetry}
      {...(reviewsPendingAction === undefined ? {} : { replyPending: reviewsPendingAction })}
      resource={reviews}
      t={t}
    />
  );
}

function PublicationsSection({
  listingPublications,
  locale,
  management,
  onRetry,
  requestPublications,
  t,
}: Readonly<
  Pick<
    MarketplaceCabinetProps,
    'listingPublications' | 'locale' | 'management' | 'onRetry' | 'requestPublications' | 't'
  >
>) {
  return (
    <>
      <CabinetPanel
        description={t('agritech.marketplace.cabinet.publications.description')}
        eyebrow={t('agritech.marketplace.publication.title')}
        title={t('agritech.marketplace.cabinet.section.publications')}
      >
        <CabinetGroup title={t('agritech.marketplace.cabinet.publications.listings')}>
          <CabinetResource
            emptyMessage={t('agritech.marketplace.cabinet.publications.empty')}
            errorMessage={t('agritech.marketplace.publication.historyUnavailable')}
            isEmpty={(data) => data.length === 0}
            onRetry={onRetry}
            resource={listingPublications}
            t={t}
          >
            {(publications) => (
              <ul className="dh-cabinet-rows dh-cabinet-rows--static">
                {publications.map((publication) => (
                  <li key={publication.id}>
                    <span className="dh-cabinet-rows__main">
                      <strong>{publication.title}</strong>
                      <small>{formatDate(publication.publishedAt ?? publication.updatedAt, locale)}</small>
                    </span>
                    <span className="dh-cabinet-rows__side">
                      <span className="dh-badge dh-badge--neutral">
                        {t(`agritech.marketplace.publication.status.${publication.status}`)}
                      </span>
                      <span className="dh-badge dh-badge--outline">
                        {t(`agritech.marketplace.publication.moderation.${publication.moderationStatus}`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CabinetResource>
        </CabinetGroup>
        <CabinetGroup title={t('agritech.marketplace.cabinet.publications.requests')}>
          <CabinetResource
            emptyMessage={t('agritech.marketplace.cabinet.publications.empty')}
            errorMessage={t('agritech.marketplace.publication.historyUnavailable')}
            isEmpty={(data) => data.length === 0}
            onRetry={onRetry}
            resource={requestPublications}
            t={t}
          >
            {(publications) => (
              <ul className="dh-cabinet-rows dh-cabinet-rows--static">
                {publications.map((publication) => (
                  <li key={publication.id}>
                    <span className="dh-cabinet-rows__main">
                      <strong>{publication.title}</strong>
                      <small>{formatDate(publication.publishedAt ?? publication.updatedAt, locale)}</small>
                    </span>
                    <span className="dh-cabinet-rows__side">
                      <span className="dh-badge dh-badge--neutral">
                        {t(`agritech.marketplace.publication.status.${publication.status}`)}
                      </span>
                      <span className="dh-badge dh-badge--outline">
                        {t(`agritech.marketplace.publication.moderation.${publication.moderationStatus}`)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CabinetResource>
        </CabinetGroup>
      </CabinetPanel>
      {management}
    </>
  );
}

/**
 * Sign-out lives here because the marketplace owns its whole chrome: a signed-in
 * visitor never reaches the settings page that used to hold the only control, so
 * without this there was no way out of the account at all.
 */
function CabinetSignOut({
  onSignOut,
  pending,
  t,
}: Readonly<{ onSignOut: () => void; pending: boolean; t: MarketplaceTranslate }>) {
  return (
    <MarketplaceBusyButton
      busy={pending}
      busyLabel={t('user.action.signingOut')}
      className="dh-button dh-button--secondary"
      icon="arrow"
      onClick={onSignOut}
      type="button"
    >
      {t('user.action.signOut')}
    </MarketplaceBusyButton>
  );
}

function AccountSection({
  locale,
  navigate,
  onRetry,
  onSignOut,
  samples,
  signOutPending,
  t,
  verification,
}: Readonly<
  Pick<
    MarketplaceCabinetProps,
    'locale' | 'navigate' | 'onRetry' | 'onSignOut' | 'samples' | 'signOutPending' | 't' | 'verification'
  >
>) {
  const current = verification.data;
  return (
    <CabinetPanel
      description={t('agritech.marketplace.cabinet.account.description')}
      eyebrow={t('agritech.marketplace.verify.identity')}
      title={t('agritech.marketplace.cabinet.section.account')}
    >
      <dl className="dh-facts">
        <div>
          <dt>{t('agritech.marketplace.verification')}</dt>
          <dd>{t(verificationStatusKey(current))}</dd>
        </div>
        <div>
          <dt>{t('agritech.marketplace.verify.step.role')}</dt>
          <dd>{t(`agritech.marketplace.account.role.${current?.role ?? 'none'}`)}</dd>
        </div>
        {current ? (
          <div>
            <dt>{t('agritech.marketplace.cabinet.account.level')}</dt>
            <dd>{t(`agritech.marketplace.cabinet.account.level.${current.level}`)}</dd>
          </div>
        ) : null}
        {current ? (
          <div>
            <dt>{t('agritech.marketplace.verify.identity')}</dt>
            <dd>
              {current.oneIdLinked
                ? t('agritech.marketplace.verify.identityLinked')
                : t('agritech.marketplace.verify.linkIdentity')}
            </dd>
          </div>
        ) : null}
      </dl>
      <button
        className="dh-button dh-button--secondary"
        onClick={() => {
          navigate('/verification');
        }}
        type="button"
      >
        {t('agritech.marketplace.verification')}
      </button>
      <CabinetGroup title={t('agritech.marketplace.account.samples')}>
        <CabinetResource
          emptyMessage={t('agritech.marketplace.samples.empty')}
          errorMessage={t('agritech.marketplace.samples.unavailable')}
          isEmpty={(data) => data.length === 0}
          onRetry={onRetry}
          resource={samples}
          t={t}
        >
          {(data) => (
            <ul className="dh-cabinet-rows dh-cabinet-rows--static">
              {data.map((sample) => (
                <li key={sample.id}>
                  <span className="dh-cabinet-rows__main">
                    <strong>{sample.listing.title}</strong>
                    <small>{formatDate(sample.createdAt, locale)}</small>
                  </span>
                  <span className="dh-cabinet-rows__side">
                    <span className="dh-badge dh-badge--neutral">
                      {t(`agritech.marketplace.samples.status.${sample.status}`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CabinetResource>
        <p className="dh-fine-print">{t('agritech.marketplace.samples.deliveryDisclaimer')}</p>
      </CabinetGroup>
      {onSignOut ? (
        <CabinetGroup title={t('agritech.marketplace.cabinet.session')}>
          <CabinetSignOut onSignOut={onSignOut} pending={signOutPending === true} t={t} />
        </CabinetGroup>
      ) : null}
    </CabinetPanel>
  );
}

export function MarketplaceCabinet(props: Readonly<MarketplaceCabinetProps>) {
  const { navigate, section, t, verification } = props;
  const current = verification.data;
  const roleDashboard = props.dashboard.data;
  const role = roleDashboard?.role ?? current?.role;

  let panel: ReactNode;
  switch (section) {
    case 'buying':
      panel = <BuyingSection {...props} />;
      break;
    case 'selling':
      panel = <SellingSection {...props} />;
      break;
    case 'finance':
      panel = <FinanceSection {...props} />;
      break;
    case 'reviews':
      panel = <ReviewsSection {...props} />;
      break;
    case 'publications':
      panel = <PublicationsSection {...props} />;
      break;
    case 'account':
      panel = <AccountSection {...props} />;
      break;
    default:
      panel = <OverviewSection {...props} />;
  }

  return (
    <div className="dh-page-stack dh-cabinet">
      <div className="dh-account-hero">
        <div>
          <p className="dh-eyebrow">{t('agritech.marketplace.account.dashboard')}</p>
          <h1>{t('agritech.marketplace.account.title')}</h1>
          <p>{t(`agritech.marketplace.account.role.${role ?? 'none'}`)}</p>
        </div>
        <div className={`dh-verification-chip dh-verification-chip--${current?.status ?? 'none'}`}>
          <MarketplaceIcon name="shield" />
          <span>{t(verificationStatusKey(current))}</span>
        </div>
      </div>
      {!current || current.status !== 'verified' ? (
        <div className="dh-callout">
          <div>
            <MarketplaceIcon name="shield" />
            <span>
              <strong>{t('agritech.marketplace.verify.title')}</strong>
              <p>{t('agritech.marketplace.verify.reason')}</p>
            </span>
          </div>
          <button
            className="dh-button dh-button--secondary"
            onClick={() => {
              navigate('/verification');
            }}
            type="button"
          >
            {t('agritech.marketplace.verification')}
          </button>
        </div>
      ) : null}
      <div className="dh-cabinet-layout">
        <nav aria-label={t('agritech.marketplace.cabinet.nav')} className="dh-cabinet-rail">
          <ul>
            {marketplaceCabinetSections.map((candidate) => (
              <li key={candidate}>
                <button
                  {...(candidate === section ? { 'aria-current': 'page' as const } : {})}
                  className={candidate === section ? 'dh-cabinet-rail__link is-active' : 'dh-cabinet-rail__link'}
                  onClick={() => {
                    navigate(marketplaceCabinetPath(candidate));
                  }}
                  type="button"
                >
                  <MarketplaceIcon name={cabinetSectionIcons[candidate]} />
                  <span>{t(`agritech.marketplace.cabinet.section.${candidate}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="dh-cabinet-content">{panel}</div>
      </div>
    </div>
  );
}
