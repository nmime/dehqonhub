import type { MarketplaceRoleDashboardDto } from '@app/frontend-api-client';
import type { Locale } from '@app/frontend-runtime';
import { formatMonth, formatMoney, type MarketplaceTranslate } from './marketplace-ui';

/**
 * One month of the dashboard's activity window. Projected off the dashboard DTO
 * rather than imported on its own, because the generated client re-exports the
 * dashboard but not its nested members.
 */
type MonthlyActivity = MarketplaceRoleDashboardDto['monthlyActivity'][number];

/**
 * The cabinet's month chart.
 *
 * Every figure here comes from `monthlyActivity` on `/marketplace/dashboard`,
 * which the repository derives from completed contracts bucketed by the month of
 * `updated_at` over the six months ending now. The series are not inferred from
 * the numbers: a spend series is drawn only when the dashboard carries a `buyer`
 * scope and a revenue series only when it carries a `seller` scope, so a month
 * that genuinely settled nothing renders as an absent bar rather than as a
 * guess, and a role that cannot buy is never given a purchase axis at all.
 *
 * No charting library is available and the deployment's CSP forbids a remote
 * one, so the plot is CSS bars whose heights are percentages of the window's
 * peak. Bars beat inline SVG here for one concrete reason: an SVG scaled down to
 * the 320 px floor scales its text with it, while these labels stay real DOM
 * text at a real font size and simply reflow.
 *
 * The plot itself is `aria-hidden`. The accessible equivalent is the table
 * underneath, which carries the same values with a caption and column headers —
 * visible in the finance section, screen-reader-only beside the overview.
 */

export type MarketplaceCabinetChartSeries = 'spend' | 'revenue';

export interface MarketplaceCabinetChartProps {
  readonly activity: readonly MonthlyActivity[];
  readonly locale: Locale;
  readonly series: readonly MarketplaceCabinetChartSeries[];
  readonly t: MarketplaceTranslate;
  /** `full` shows the value table and the window totals; `compact` keeps the table for assistive technology only. */
  readonly variant: 'compact' | 'full';
}

const seriesValue = (month: MonthlyActivity, series: MarketplaceCabinetChartSeries): number =>
  series === 'spend' ? month.purchaseSpendUzs : month.salesRevenueUzs;

const seriesCount = (month: MonthlyActivity, series: MarketplaceCabinetChartSeries): number =>
  series === 'spend' ? month.completedPurchases : month.completedSales;

const seriesLabelKey: Record<MarketplaceCabinetChartSeries, string> = {
  revenue: 'agritech.marketplace.cabinet.chart.revenue',
  spend: 'agritech.marketplace.cabinet.chart.spend',
};

const seriesCountLabelKey: Record<MarketplaceCabinetChartSeries, string> = {
  revenue: 'agritech.marketplace.cabinet.chart.sales',
  spend: 'agritech.marketplace.cabinet.chart.purchases',
};

/**
 * A bar's share of the plot. A real but tiny amount keeps a visible stub so it
 * is not mistaken for a month that settled nothing; an actual zero draws no bar.
 */
const barShare = (value: number, peak: number): number => {
  if (value <= 0 || peak <= 0) {
    return 0;
  }
  return Math.max(4, Math.round((value / peak) * 100));
};

export function MarketplaceCabinetChart({
  activity,
  locale,
  series,
  t,
  variant,
}: Readonly<MarketplaceCabinetChartProps>) {
  const peak = activity.reduce(
    (highest, month) => series.reduce((current, key) => Math.max(current, seriesValue(month, key)), highest),
    0,
  );
  const totals = series.map((key) => ({
    count: activity.reduce((sum, month) => sum + seriesCount(month, key), 0),
    key,
    value: activity.reduce((sum, month) => sum + seriesValue(month, key), 0),
  }));

  return (
    <figure className="dh-cabinet-chart">
      <figcaption className="dh-cabinet-chart__caption">
        <span className="dh-eyebrow">{t('agritech.marketplace.cabinet.chart.window')}</span>
        <strong>{t('agritech.marketplace.cabinet.chart.title')}</strong>
        <span className="dh-fine-print">{t('agritech.marketplace.cabinet.chart.description')}</span>
      </figcaption>
      {peak === 0 ? <p className="dh-cabinet-chart__empty">{t('agritech.marketplace.cabinet.chart.empty')}</p> : null}
      <div aria-hidden="true" className="dh-cabinet-chart__plot">
        <ol className="dh-cabinet-chart__months">
          {activity.map((month) => (
            <li className="dh-cabinet-chart__month" key={month.month}>
              <span className="dh-cabinet-chart__bars">
                {series.map((key) => (
                  <span
                    className={`dh-cabinet-chart__bar dh-cabinet-chart__bar--${key}`}
                    key={key}
                    style={{ ['--dh-bar-share' as string]: `${barShare(seriesValue(month, key), peak)}%` }}
                  />
                ))}
              </span>
              <span className="dh-cabinet-chart__month-label">{formatMonth(month.month, locale)}</span>
            </li>
          ))}
        </ol>
        <p className="dh-cabinet-chart__peak">
          {t('agritech.marketplace.cabinet.chart.peak')} <b>{formatMoney(peak, locale)}</b>
        </p>
      </div>
      <ul className="dh-cabinet-chart__legend">
        {series.map((key) => (
          <li className={`dh-cabinet-chart__key dh-cabinet-chart__key--${key}`} key={key}>
            {t(seriesLabelKey[key])}
          </li>
        ))}
      </ul>
      <table className={variant === 'full' ? 'dh-cabinet-table' : 'dh-cabinet-table dh-sr-only'}>
        <caption>{t('agritech.marketplace.cabinet.chart.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('agritech.marketplace.cabinet.chart.month')}</th>
            {series.map((key) => (
              <th key={`count-${key}`} scope="col">
                {t(seriesCountLabelKey[key])}
              </th>
            ))}
            {series.map((key) => (
              <th key={`value-${key}`} scope="col">
                {t(seriesLabelKey[key])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activity.map((month) => (
            <tr key={month.month}>
              <th scope="row">{formatMonth(month.month, locale)}</th>
              {series.map((key) => (
                <td key={`count-${key}`}>{seriesCount(month, key)}</td>
              ))}
              {series.map((key) => (
                <td key={`value-${key}`}>{formatMoney(seriesValue(month, key), locale)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t('agritech.marketplace.cabinet.chart.total')}</th>
            {totals.map((total) => (
              <td key={`count-${total.key}`}>{total.count}</td>
            ))}
            {totals.map((total) => (
              <td key={`value-${total.key}`}>{formatMoney(total.value, locale)}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </figure>
  );
}
